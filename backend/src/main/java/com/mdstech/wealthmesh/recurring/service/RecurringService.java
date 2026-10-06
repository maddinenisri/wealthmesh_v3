package com.mdstech.wealthmesh.recurring.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.repository.ActivityStore.Candidate;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.service.EntryService;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.household.repository.HouseholdLock;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.recurring.dto.DismissSuggestionRequest;
import com.mdstech.wealthmesh.recurring.dto.RecordRequest;
import com.mdstech.wealthmesh.recurring.dto.RecordReview;
import com.mdstech.wealthmesh.recurring.dto.RecurringOverview;
import com.mdstech.wealthmesh.recurring.dto.ScheduleRequest;
import com.mdstech.wealthmesh.recurring.dto.ScheduleView;
import com.mdstech.wealthmesh.recurring.dto.SuggestionView;
import com.mdstech.wealthmesh.recurring.repository.RecurringStore;

import reactor.core.publisher.Flux;
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
    private final EntryService entries;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public RecurringService(RecurringStore store, HouseholdLock householdLock, ActivityStore activity,
            AccountRepository accounts, EntryValidator validator, EntryService entries,
            TransactionalOperator transactions, Clock clock) {
        this.store = store;
        this.householdLock = householdLock;
        this.activity = activity;
        this.accounts = accounts;
        this.validator = validator;
        this.entries = entries;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** Today, the suggestions awaiting review and the saved schedules. */
    public Mono<RecurringOverview> overview() {
        return Mono.zip(suggestions(), store.schedules().concatMap(this::view).collectList())
                .map(parts -> new RecurringOverview(LocalDate.now(clock), parts.getT1(), parts.getT2()));
    }

    /**
     * The monthly suggestions awaiting review: found in recorded expenses, not yet scheduled (an active or paused
     * schedule with the same account, category and description) and not dismissed (RECURRING_001, 009).
     */
    private Mono<List<SuggestionView>> suggestions() {
        return Mono.zip(activity.expenseCandidates().collectList(), store.schedules().collectList(),
                        store.dismissedKeys().collectList())
                .flatMap(parts -> {
                    Set<String> excluded = new HashSet<>(parts.getT3());
                    parts.getT2().forEach(s -> excluded.add(Suggestions.key(s.accountId(), s.categoryId(),
                            s.description())));
                    return Flux.fromIterable(Suggestions.find(parts.getT1(), excluded)).concatMap(this::shown)
                            .collectList();
                });
    }

    private Mono<SuggestionView> shown(Suggestions.Found found) {
        Set<UUID> ids = found.bills().stream().map(Candidate::id).collect(Collectors.toSet());
        return activity.billsOf(found.accountId(), found.categoryId(), descriptionKey(found.description()))
                .filter(bill -> ids.contains(bill.id())).collectList().map(bills -> {
                    Candidate latest = found.latest();
                    return new SuggestionView(found.accountId(), latest.accountName(), found.categoryId(),
                            latest.categoryName(), found.description(), Money.format(latest.amount()),
                            Recurrence.MONTHLY, latest.occurredOn(),
                            Recurrence.following(latest.occurredOn(), Recurrence.MONTHLY,
                                    latest.occurredOn().getDayOfMonth()), bills);
                });
    }

    /** Dismisses a suggestion: it leaves the list and no bill changes. A repeat is the same result (200). */
    public Mono<RecurringOverview> dismissSuggestion(DismissSuggestionRequest request) {
        return Mono.fromCallable(() -> {
            if (request == null || request.accountId() == null || request.categoryId() == null
                    || request.description() == null || request.description().isBlank()) {
                throw bad("Choose the suggestion to dismiss");
            }
            return request;
        }).flatMap(r -> transactions.transactional(householdLock.lock()
                .flatMap(householdId -> validator.memberLocked(householdId, r.enteredByMemberId()))
                .flatMap(memberId -> accounts.findById(r.accountId())
                        .switchIfEmpty(Mono.error(notFound("Account not found: " + r.accountId())))
                        .then(Mono.defer(() -> store.dismiss(r.accountId(), r.categoryId(),
                                descriptionKey(r.description()), memberId, clock.instant()))))))
                .onErrorMap(org.springframework.dao.DataIntegrityViolationException.class,
                        e -> bad("Choose the suggestion to dismiss"))
                .then(Mono.defer(this::overview));
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

    /**
     * Changes the amount, frequency and next due date of a schedule: its future only. Paid bills are entries and are
     * never touched (RECURRING_007). A retry replays; the account must be open, as for any change that sets money
     * to be paid (Q-048).
     */
    public Mono<Saved> change(UUID id, String key, ScheduleRequest request) {
        return Mono.fromCallable(() -> {
            requireKey(key);
            return parseChange(request);
        }).flatMap(parsed -> {
            Instant now = clock.instant();
            Instant cutoff = now.minus(KEY_LIFETIME);
            String fingerprint = "change|" + id + "|" + parsed.amount + "|" + parsed.frequency + "|"
                    + parsed.nextDueOn;
            return transactions.transactional(householdLock.lock()
                    .flatMap(householdId -> replayed(key, cutoff, fingerprint)
                            .switchIfEmpty(Mono.defer(() -> validator.memberLocked(householdId, parsed.memberId)
                                    .then(Mono.defer(() -> current(id)))
                                    .flatMap(this::openAccount)
                                    .flatMap(s -> store.update(id, parsed.amount, parsed.frequency, parsed.nextDueOn)
                                            .then(Mono.defer(() -> store.recordEvent(id, "changed", parsed.memberId,
                                                    now, key, fingerprint, changes(s, parsed))))
                                            .then(Mono.defer(() -> view(id))))
                                    .map(v -> new Saved(v, true))))));
        });
    }

    private static String changes(RecurringStore.Schedule was, Parsed now) {
        List<String> parts = new ArrayList<>();
        parts.add(was.amount().compareTo(now.amount) == 0 ? "Amount " + dollars(now.amount) + " unchanged"
                : "Amount " + dollars(was.amount()) + " to " + dollars(now.amount));
        parts.add(was.frequency().equals(now.frequency) ? "Frequency " + now.frequency + " unchanged"
                : "Frequency " + was.frequency() + " to " + now.frequency);
        parts.add(was.nextDueOn().equals(now.nextDueOn) ? "Next due " + now.nextDueOn + " unchanged"
                : "Next due " + was.nextDueOn() + " to " + now.nextDueOn);
        return String.join("; ", parts);
    }

    /** Pauses a schedule: no occurrence is expected, none is overdue, nothing is recorded. A repeat is the same. */
    public Mono<ScheduleView> pause(UUID id, UUID memberId) {
        return acting(id, memberId, false, s -> "paused".equals(s.status()) ? Mono.empty()
                : store.setStatus(id, "paused").then(Mono.defer(() -> store.recordEvent(id, "paused", memberId,
                        clock.instant(), null, null, "Next due " + s.nextDueOn() + " is not expected while paused"))));
    }

    /**
     * Resumes a paused schedule at an explicit, reviewed next due date; missed occurrences are not invented
     * (RECURRING_008). The account must be open. A repeat of the same Resume returns the same result.
     */
    public Mono<ScheduleView> resume(UUID id, UUID memberId, LocalDate dueOn) {
        return Mono.fromCallable(() -> {
            if (dueOn == null) {
                throw bad("Enter the next due date");
            }
            return dueOn;
        }).flatMap(date -> acting(id, memberId, true, s -> {
            if ("active".equals(s.status())) {
                return store.latestAction(id).filter("resumed"::equals).filter(a -> s.nextDueOn().equals(date))
                        .switchIfEmpty(Mono.error(conflict("This bill is not paused"))).then();
            }
            return store.setNextDue(id, date, "active").then(Mono.defer(() -> store.recordEvent(id, "resumed",
                    memberId, clock.instant(), null, null, "Next due " + date + ", expected "
                            + dollars(s.amount()))));
        }));
    }

    /**
     * Moves the next occurrence to another due date without recording anything (RECURRING_010): no expense, no
     * Balance change. The account must be open, since the new date sets when money is expected to leave. The same
     * date again is the same result.
     */
    public Mono<ScheduleView> reschedule(UUID id, UUID memberId, LocalDate dueOn) {
        return Mono.fromCallable(() -> {
            if (dueOn == null) {
                throw bad("Enter the new due date");
            }
            return dueOn;
        }).flatMap(date -> acting(id, memberId, true, s -> {
            if (!"active".equals(s.status())) {
                return Mono.error(conflict(s.description() + " is paused. Resume it first."));
            }
            if (s.nextDueOn().equals(date)) {
                return Mono.empty();
            }
            return store.setNextDue(id, date, "active").then(Mono.defer(() -> store.recordEvent(id, "rescheduled",
                    memberId, clock.instant(), null, null, "Next due " + s.nextDueOn() + " to " + date)));
        }));
    }

    /**
     * Dismisses one occurrence: no expense is created and the schedule moves on to the occurrence after it
     * (RECURRING_010). Only the next occurrence can be dismissed; a repeat of the same dismissal is the same result.
     */
    public Mono<ScheduleView> dismissOccurrence(UUID id, UUID memberId, LocalDate dueOn) {
        return Mono.fromCallable(() -> {
            if (dueOn == null) {
                throw bad("Choose the occurrence to dismiss");
            }
            return dueOn;
        }).flatMap(date -> acting(id, memberId, false, s -> {
            if (!s.nextDueOn().equals(date)) {
                return store.hasOccurrence(id, date, "dismissed").flatMap(done -> done ? Mono.<Void>empty()
                        : Mono.<Void>error(conflict("The next occurrence of " + s.description() + " is "
                                + s.nextDueOn() + ", not " + date)));
            }
            if (!"active".equals(s.status())) {
                return Mono.error(conflict(s.description() + " is paused. Resume it first."));
            }
            LocalDate next = Recurrence.following(date, s.frequency(), s.anchorDay());
            Instant now = clock.instant();
            return store.addOccurrence(id, date, "dismissed", null, null, memberId, now)
                    .then(Mono.defer(() -> store.advance(id, next)))
                    .then(Mono.defer(() -> store.recordEvent(id, "dismissed", memberId, now, null, null,
                            "The " + date + " occurrence is dismissed, no expense recorded; next due " + next)));
        }));
    }

    /**
     * Deletes a schedule softly: no future reminder or expense comes from it and every paid bill stays. The bills that
     * supported it are not offered again as a suggestion: the household said it does not want this estimate.
     */
    public Mono<ScheduleView> delete(UUID id, UUID memberId) {
        return acting(id, memberId, false, s -> s.removedAt() != null ? Mono.empty()
                : store.softDelete(id, clock.instant())
                        .then(Mono.defer(() -> store.dismiss(s.accountId(), s.categoryId(),
                                descriptionKey(s.description()), memberId, clock.instant())))
                        .then(Mono.defer(() -> store.recordEvent(id, "deleted", memberId, clock.instant(), null,
                                null, "Deleted " + s.description() + ", expected " + dollars(s.amount())))), true);
    }

    private Mono<ScheduleView> acting(UUID id, UUID memberId, boolean needsOpenAccount,
            java.util.function.Function<RecurringStore.Schedule, Mono<Void>> apply) {
        return acting(id, memberId, needsOpenAccount, apply, false);
    }

    /**
     * One action on a saved schedule, under the lock order of {@link HouseholdLock}: household, the member under a
     * share lock, the schedule, the account when money would follow, then the change and its event. A deleted
     * schedule is gone to every action but a repeat of Delete.
     */
    private Mono<ScheduleView> acting(UUID id, UUID memberId, boolean needsOpenAccount,
            java.util.function.Function<RecurringStore.Schedule, Mono<Void>> apply, boolean allowDeleted) {
        return transactions.transactional(householdLock.lock()
                .flatMap(householdId -> validator.memberLocked(householdId, memberId))
                .then(Mono.defer(() -> store.scheduleAnyState(id)))
                .switchIfEmpty(Mono.error(notFound("Recurring bill not found: " + id)))
                .filter(s -> allowDeleted || s.removedAt() == null)
                .switchIfEmpty(Mono.error(notFound("Recurring bill not found: " + id)))
                .flatMap(s -> needsOpenAccount ? openAccount(s) : Mono.just(s))
                .flatMap(apply)
                .then(Mono.defer(() -> store.scheduleAnyState(id)))
                .flatMap(this::view));
    }

    /**
     * What recording the actual expense of the next occurrence would do: the same checks as the save (the schedule is
     * active and `dueOn` is its next occurrence, the account is open, the entry rules for amount, date, category),
     * nothing written (RECURRING_003, 004).
     */
    public Mono<RecordReview> reviewRecord(UUID id, RecordRequest request) {
        return Mono.fromCallable(() -> requireRecord(request)).flatMap(r -> current(id)
                .flatMap(s -> checkRecordable(s, r.dueOn()))
                .flatMap(s -> accounts.findById(s.accountId())
                        .flatMap(account -> Mono.fromCallable(() -> AccountState.requireOpen(account)))
                        .flatMap(account -> validator.parse(account, "expense", entryOf(s, r), null)
                                .flatMap(entry -> validator.scheduleCategory(null, entry.categoryId()))
                                .map(category -> new RecordReview(s.description(), s.accountName(), category.name(),
                                        Money.format(EntryValidator.amount(r.amount())), r.paidOn(), r.dueOn(),
                                        r.paidOn().isBefore(r.dueOn()),
                                        Recurrence.following(r.dueOn(), s.frequency(), s.anchorDay()),
                                        Recurrence.following(Recurrence.following(r.dueOn(), s.frequency(),
                                                s.anchorDay()), s.frequency(), s.anchorDay()))))));
    }

    /**
     * Records the actual expense of the schedule's next occurrence: one transaction saves the entry through the entry
     * rules (so its date, category, member and the account's state apply, and Balance and spending count it on its
     * own date) and marks the occurrence paid. The next occurrence follows the due date, not the paid date
     * (RECURRING_003). A retry of a saved key replays (D-024); a second Record of the same occurrence is refused.
     */
    public Mono<Saved> record(UUID id, String key, RecordRequest request) {
        return Mono.fromCallable(() -> {
            requireKey(key);
            return requireRecord(request);
        }).flatMap(r -> {
            Instant now = clock.instant();
            Instant cutoff = now.minus(KEY_LIFETIME);
            String fingerprint = "record|" + id + "|" + r.dueOn() + "|" + EntryValidator.amount(r.amount()) + "|"
                    + r.paidOn() + "|" + r.categoryId() + "|" + r.category();
            return transactions.transactional(householdLock.lock()
                    .flatMap(householdId -> replayed(key, cutoff, fingerprint)
                            .switchIfEmpty(Mono.defer(() -> recordNew(id, key, r, fingerprint, now)))));
        });
    }

    private Mono<Saved> recordNew(UUID id, String key, RecordRequest r, String fingerprint, Instant now) {
        return current(id).flatMap(s -> checkRecordable(s, r.dueOn()))
                .flatMap(s -> entries.record(s.accountId(), key, "expense", entryOf(s, r))
                        .flatMap(saved -> saved.created()
                                ? paid(s, r, saved.activity().id(), key, fingerprint, now)
                                : Mono.<Saved>error(conflict("This save was already used. Start a new entry."))));
    }

    private Mono<Saved> paid(RecurringStore.Schedule s, RecordRequest r, UUID activityId, String key,
            String fingerprint, Instant now) {
        LocalDate next = Recurrence.following(r.dueOn(), s.frequency(), s.anchorDay());
        String detail = "Paid " + dollars(EntryValidator.amount(r.amount())) + " on " + r.paidOn()
                + " for the " + r.dueOn() + " occurrence; next due " + next;
        return store.addOccurrence(s.id(), r.dueOn(), "paid", r.paidOn(), activityId, r.enteredByMemberId(), now)
                .then(Mono.defer(() -> store.advance(s.id(), next)))
                .then(Mono.defer(() -> store.recordEvent(s.id(), "paid", r.enteredByMemberId(), now, key,
                        fingerprint, detail)))
                .then(Mono.defer(() -> view(s.id()))).map(v -> new Saved(v, true));
    }

    private static RecordRequest requireRecord(RecordRequest request) {
        if (request == null || request.dueOn() == null) {
            throw bad("Choose the occurrence to record");
        }
        EntryValidator.amount(request.amount());
        if (request.paidOn() == null) {
            throw bad("Enter the date it was paid");
        }
        return request;
    }

    /** The schedule must be active and the occurrence its next one: only that one can be paid or dismissed. */
    private Mono<RecurringStore.Schedule> checkRecordable(RecurringStore.Schedule s, LocalDate dueOn) {
        if (!"active".equals(s.status())) {
            return Mono.error(conflict(s.description() + " is paused. Resume it first."));
        }
        if (!s.nextDueOn().equals(dueOn)) {
            return Mono.error(conflict("The next occurrence of " + s.description() + " is " + s.nextDueOn()
                    + ", not " + dueOn));
        }
        return Mono.just(s);
    }

    private static ExpenseRequest entryOf(RecurringStore.Schedule s, RecordRequest r) {
        boolean named = r.categoryId() != null || r.category() != null && !r.category().isBlank();
        return new ExpenseRequest(s.description(), r.amount(), r.paidOn(), named ? r.category() : null,
                named ? r.categoryId() : s.categoryId(), r.enteredByMemberId(), null, null);
    }

    /** The saved, not deleted schedule; 404 when there is none. */
    private Mono<RecurringStore.Schedule> current(UUID id) {
        return store.schedule(id).switchIfEmpty(Mono.error(notFound("Recurring bill not found: " + id)));
    }

    /** Locks the schedule's account row and refuses it when it is archived or closed (new money needs an open one). */
    private Mono<RecurringStore.Schedule> openAccount(RecurringStore.Schedule s) {
        return activity.lockAccount(s.accountId()).then(Mono.defer(() -> accounts.findById(s.accountId())))
                .switchIfEmpty(Mono.error(notFound("Account not found: " + s.accountId())))
                .flatMap(account -> Mono.fromCallable(() -> AccountState.requireOpen(account)))
                .thenReturn(s);
    }

    /** What a schedule request must be: a name, an amount above zero, a frequency, a first due date and an account. */
    private record Parsed(String description, BigDecimal amount, String frequency, LocalDate nextDueOn,
            UUID accountId, String category, UUID categoryId, UUID memberId) {
    }

    /** A change names the amount, the frequency and the next due date; the rest of the schedule stays. */
    private static Parsed parseChange(ScheduleRequest request) {
        if (request == null) {
            throw bad("Enter the change to save");
        }
        BigDecimal amount = EntryValidator.amount(request.amount());
        if (!Recurrence.valid(request.frequency())) {
            throw bad("Choose Weekly, Monthly or Yearly");
        }
        if (request.nextDueOn() == null) {
            throw bad("Enter the next due date");
        }
        return new Parsed(null, amount, request.frequency(), request.nextDueOn(), null, null, null,
                request.enteredByMemberId());
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
