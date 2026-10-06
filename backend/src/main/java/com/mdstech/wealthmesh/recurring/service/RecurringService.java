package com.mdstech.wealthmesh.recurring.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.household.repository.HouseholdLock;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.recurring.dto.RecurringOverview;
import com.mdstech.wealthmesh.recurring.dto.ScheduleRequest;
import com.mdstech.wealthmesh.recurring.dto.ScheduleView;
import com.mdstech.wealthmesh.recurring.repository.RecurringStore;

import reactor.core.publisher.Mono;

/**
 * Recurring bills (slice 14): a schedule is an expected amount and a next due date, never money. It writes no
 * `activity` row and no `reminder` row (Q-045), so Balance, spending, the month review and Budgets cannot count it.
 * Every write takes the household row `FOR UPDATE` first, reads its key under that lock (D-024), then the account
 * row, then the category and the member under share locks (D-034): the lock order of {@link HouseholdLock}. The
 * server reads the date from the one clock.
 */
@Service
public class RecurringService {

    private static final Duration KEY_LIFETIME = Duration.ofHours(24);

    /** A view and whether this call applied a change (false on a replay of a saved key). */
    public record Saved(ScheduleView view, boolean created) {
    }

    private final RecurringStore store;
    private final HouseholdLock householdLock;
    private final ActivityStore activity;
    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public RecurringService(RecurringStore store, HouseholdLock householdLock, ActivityStore activity,
            AccountRepository accounts, EntryValidator validator, TransactionalOperator transactions, Clock clock) {
        this.store = store;
        this.householdLock = householdLock;
        this.activity = activity;
        this.accounts = accounts;
        this.validator = validator;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** Today, the suggestions awaiting review and the saved schedules. */
    public Mono<RecurringOverview> overview() {
        return store.schedules().concatMap(this::view).collectList()
                .map(schedules -> new RecurringOverview(LocalDate.now(clock), List.of(), schedules));
    }

    /** One saved schedule with its supporting bills, occurrences and history. */
    public Mono<ScheduleView> view(UUID id) {
        return store.schedule(id).switchIfEmpty(Mono.error(notFound("Recurring bill not found: " + id)))
                .flatMap(this::view);
    }

    private Mono<ScheduleView> view(RecurringStore.Schedule s) {
        return Mono.zip(activity.billsOf(s.accountId(), s.categoryId(), descriptionKey(s.description())).collectList(),
                store.occurrences(s.id()).collectList(), store.events(s.id()).collectList())
                .map(parts -> shown(s, s.id(), parts.getT3(), parts.getT2(), parts.getT1()));
    }

    private ScheduleView shown(RecurringStore.Schedule s, UUID id,
            List<com.mdstech.wealthmesh.recurring.dto.EventView> history,
            List<com.mdstech.wealthmesh.recurring.dto.OccurrenceView> occurrences,
            List<com.mdstech.wealthmesh.activity.dto.ActivityResponse> bills) {
        LocalDate today = LocalDate.now(clock);
        boolean active = "active".equals(s.status());
        Integer overdue = active && s.nextDueOn().isBefore(today)
                ? (int) ChronoUnit.DAYS.between(s.nextDueOn(), today) : null;
        return new ScheduleView(id, s.accountId(), s.accountName(), s.accountStatus(), s.description(), s.categoryId(),
                s.categoryName(), s.categoryArchived(), Money.format(s.amount()), s.frequency(), s.status(),
                s.nextDueOn(), Recurrence.following(s.nextDueOn(), s.frequency(), s.anchorDay()), overdue,
                occurrences, history, bills);
    }

    /** The review before Confirm: the schedule as it would be saved, the same checks, nothing written. */
    public Mono<ScheduleView> review(ScheduleRequest request) {
        return Mono.fromCallable(() -> parse(request)).flatMap(parsed -> accounts.findById(parsed.accountId)
                .switchIfEmpty(Mono.error(notFound("Account not found: " + parsed.accountId)))
                .flatMap(account -> Mono.fromCallable(() -> requireScheduleAccount(account)))
                .then(Mono.defer(() -> validator.scheduleCategory(parsed.category, parsed.categoryId)))
                .flatMap(category -> accounts.findById(parsed.accountId)
                        .map(account -> preview(parsed, account, category))));
    }

    private ScheduleView preview(Parsed p, Account account, Category category) {
        RecurringStore.Schedule s = new RecurringStore.Schedule(null, account.id(), account.name(), account.status(),
                account.type(), p.description, category.id(), category.name(), category.archived(), p.amount,
                p.frequency, "active", p.nextDueOn, p.nextDueOn.getDayOfMonth(), null);
        return shown(s, null, List.of(), List.of(), List.of());
    }

    /** Saves a new schedule. A retry of a saved key replays it (200); the same key with other details is 409. */
    public Mono<Saved> create(String key, ScheduleRequest request) {
        return Mono.fromCallable(() -> {
            requireKey(key);
            return parse(request);
        }).flatMap(parsed -> {
            Instant now = clock.instant();
            Instant cutoff = now.minus(KEY_LIFETIME);
            String fingerprint = "create|" + parsed.accountId + "|" + parsed.description + "|" + parsed.amount + "|"
                    + parsed.frequency + "|" + parsed.nextDueOn + "|" + parsed.categoryId + "|" + parsed.category;
            return transactions.transactional(householdLock.lock()
                    .flatMap(householdId -> replayed(key, cutoff, fingerprint)
                            .switchIfEmpty(Mono.defer(() -> insert(householdId, key, parsed, fingerprint, now)))));
        });
    }

    /** The saved result of a key already used: the same request again replays, another is a conflict. */
    private Mono<Saved> replayed(String key, Instant cutoff, String fingerprint) {
        return store.expireKey(key, cutoff).then(Mono.defer(() -> store.findKey(key)))
                .flatMap(hit -> hit.fingerprint().equals(fingerprint)
                        ? store.scheduleAnyState(hit.scheduleId()).flatMap(this::view).map(v -> new Saved(v, false))
                        : Mono.<Saved>error(conflict(
                                "This save was already used with different details. Start a new entry.")));
    }

    private Mono<Saved> insert(UUID householdId, String key, Parsed p, String fingerprint, Instant now) {
        return accounts.findById(p.accountId)
                .switchIfEmpty(Mono.error(notFound("Account not found: " + p.accountId)))
                .flatMap(first -> activity.lockAccount(first.id())
                        .then(Mono.defer(() -> accounts.findById(first.id()))))
                .switchIfEmpty(Mono.error(notFound("Account not found: " + p.accountId)))
                .flatMap(account -> Mono.fromCallable(() -> AccountState.requireOpen(requireScheduleAccount(account))))
                .then(Mono.defer(() -> validator.scheduleCategory(p.category, p.categoryId)))
                .flatMap(category -> validator.memberLocked(householdId, p.memberId)
                        .flatMap(memberId -> store.insert(householdId, p.accountId, p.description, category.id(),
                                p.amount, p.frequency, p.nextDueOn, memberId, now)
                                .flatMap(id -> store.recordEvent(id, "created", memberId, now, key, fingerprint,
                                        "Expected " + dollars(p.amount) + " " + p.frequency + ", first due "
                                                + p.nextDueOn).thenReturn(id))))
                .flatMap(id -> store.schedule(id).flatMap(this::view)).map(v -> new Saved(v, true));
    }

    /** What a schedule request must be: a name, an amount above zero, a frequency, a first due date and an account. */
    private record Parsed(String description, BigDecimal amount, String frequency, LocalDate nextDueOn,
            UUID accountId, String category, UUID categoryId, UUID memberId) {
    }

    private static Parsed parse(ScheduleRequest request) {
        if (request == null) {
            throw bad("Enter the bill to save");
        }
        String description = request.description() == null ? "" : request.description().strip();
        if (description.isEmpty()) {
            throw bad("Enter what this bill is");
        }
        if (description.length() > 200) {
            throw bad("Description must be 200 characters or fewer");
        }
        BigDecimal amount = EntryValidator.amount(request.amount());
        if (!Recurrence.valid(request.frequency())) {
            throw bad("Choose Weekly, Monthly or Yearly");
        }
        if (request.nextDueOn() == null) {
            throw bad("Enter the next due date");
        }
        if (request.accountId() == null) {
            throw bad("Choose the account it is paid from");
        }
        return new Parsed(description, amount, request.frequency(), request.nextDueOn(), request.accountId(),
                request.category(), request.categoryId(), request.enteredByMemberId());
    }

    /** A schedule is paid from a checking or savings account (the accounts that take an expense, not a card). */
    private static Account requireScheduleAccount(Account account) {
        if (!AccountType.holdsActivity(account.type()) || AccountType.isCard(account.type())) {
            throw bad("A recurring bill is paid from a checking or savings account");
        }
        return account;
    }

    static String descriptionKey(String description) {
        return description == null ? "" : description.strip().toLowerCase(Locale.ROOT);
    }

    private static String dollars(BigDecimal amount) {
        return String.format(Locale.US, "$%,.2f", amount);
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw bad("Missing save key");
        }
        return key;
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
