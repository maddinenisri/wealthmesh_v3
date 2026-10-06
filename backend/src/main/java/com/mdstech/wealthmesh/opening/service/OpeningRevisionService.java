package com.mdstech.wealthmesh.opening.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Objects;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
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
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.opening.domain.OpeningRevision;
import com.mdstech.wealthmesh.opening.dto.OpeningPreview;
import com.mdstech.wealthmesh.opening.dto.OpeningRequest;
import com.mdstech.wealthmesh.opening.dto.OpeningRevisionResponse;
import com.mdstech.wealthmesh.opening.repository.OpeningRevisionRepository;
import com.mdstech.wealthmesh.opening.repository.OpeningRevisionStore;
import com.mdstech.wealthmesh.spending.service.SpendingService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Corrects an account's starting balance and tracking start (V2_JOURNEY_004). The account row holds the current
 * opening (D-017); every correction keeps what it replaced. It is never income or spending, and no entry is added.
 * Each save locks the account row and reads the account again, so concurrent saves apply one after the other.
 */
@Service
public class OpeningRevisionService {

    private static final Duration KEY_LIFETIME = Duration.ofHours(24);

    /** The saved correction and whether this call created it (false for a replay). */
    public record Saved(OpeningRevisionResponse revision, boolean created) {
    }

    private record Counted(BigDecimal amount, boolean income) {
    }

    private record Parsed(BigDecimal amount, LocalDate on, String reason) {
    }

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final OpeningRevisionRepository revisions;
    private final OpeningRevisionStore store;
    private final ActivityStore activityStore;
    private final SpendingService spending;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public OpeningRevisionService(AccountRepository accounts, EntryValidator validator,
            OpeningRevisionRepository revisions, OpeningRevisionStore store, ActivityStore activityStore,
            SpendingService spending, Clock clock, TransactionalOperator transactions) {
        this.accounts = accounts;
        this.validator = validator;
        this.revisions = revisions;
        this.store = store;
        this.activityStore = activityStore;
        this.spending = spending;
        this.clock = clock;
        this.transactions = transactions;
    }

    public Flux<OpeningRevisionResponse> ofAccount(UUID accountId) {
        return load(accountId).thenMany(Flux.defer(() -> store.ofAccount(accountId)));
    }

    /** Informational: the figures a save would produce now. Nothing is stored. */
    public Mono<OpeningPreview> preview(UUID accountId, Object amount, LocalDate on, PendingEntry entry) {
        return loadEditable(accountId).flatMap(account -> check(account, amount, on, null)
                .flatMap(parsed -> activityStore
                .deltaOf(account.id()).flatMap(delta -> {
                    BigDecimal current = account.openingAmount().add(delta.amount());
                    BigDecimal after = parsed.amount().add(delta.amount());
                    OpeningPreview base = new OpeningPreview(Money.format(account.openingAmount()),
                            account.openedOn(), Money.format(parsed.amount()), parsed.on(), Money.format(current),
                            Money.format(after), after.signum() < 0, null, null, null);
                    return entry == null ? Mono.just(base) : withEntry(base, parsed, after, entry);
                })));
    }

    /** An entry dated before the old start, shown as it will count once the start has moved. */
    public record PendingEntry(String kind, Object amount, LocalDate on) {
    }

    private Mono<OpeningPreview> withEntry(OpeningPreview base, Parsed parsed, BigDecimal afterStart,
            PendingEntry entry) {
        return Mono.fromCallable(() -> {
            if (entry.on() == null || entry.on().isBefore(parsed.on())) {
                throw EntryValidator.bad("The starting date must be on or before the entry's date");
            }
            boolean income = "income".equals(entry.kind());
            if (!income && !"expense".equals(entry.kind())) {
                throw EntryValidator.bad("Choose expense or income");
            }
            return new Counted(EntryValidator.amount(entry.amount()), income);
        }).flatMap(parts -> spending.review(YearMonth.from(entry.on()).toString()).map(month -> {
            boolean income = parts.income();
            BigDecimal withEntry = income ? afterStart.add(parts.amount()) : afterStart.subtract(parts.amount());
            BigDecimal monthIncome = Money.parse(month.income()).orElseThrow();
            BigDecimal monthSpending = Money.parse(month.spending()).orElseThrow();
            return new OpeningPreview(base.originalAmount(), base.originalOn(), base.openingAmount(),
                    base.openedOn(), base.currentBalance(), base.currentBalanceAfter(), withEntry.signum() < 0,
                    Money.format(withEntry), Money.format(income ? monthIncome.add(parts.amount()) : monthIncome),
                    Money.format(income ? monthSpending : monthSpending.add(parts.amount())));
        }));
    }

    /** Repeat-safe (D-024): a replayed key returns the stored correction when the requested figures match. */
    public Mono<Saved> save(UUID accountId, String key, OpeningRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> store.expireKey(key, cutoff)))
                .then(Mono.defer(() -> loadEditable(accountId)))
                .flatMap(account -> validator.member(account, request.enteredByMemberId())
                        .flatMap(memberId -> locked(account.id(), key, cutoff, request, memberId, now)))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This save was already used. Start a new entry."));
    }

    /** Lock first, then read the account and the key again: nothing can change between the check and the write. */
    private Mono<Saved> locked(UUID accountId, String key, Instant cutoff, OpeningRequest request, UUID memberId,
            Instant now) {
        Mono<Saved> work = activityStore.lockAccount(accountId).then(Mono.defer(() -> loadEditable(accountId)))
                .map(AccountState::requireNotClosed)
                .flatMap(account -> revisions.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> replay(existing, request, memberId))
                        .switchIfEmpty(Mono.defer(() -> applyLocked(account, key, request, memberId, now))));
        return transactions.transactional(work);
    }

    /** Applies a correction to an account row that the caller has locked and just read. */
    public Mono<Saved> applyLocked(Account account, String key, OpeningRequest request, UUID memberId, Instant now) {
        return check(account, request.openingAmount(), request.openedOn(), request.reason()).flatMap(parsed -> {
            if (parsed.amount().compareTo(account.openingAmount()) == 0 && parsed.on().equals(account.openedOn())) {
                return Mono.error(EntryValidator.bad("The starting balance already matches this amount and date"));
            }
            return revisions.save(new OpeningRevision(null, account.id(), account.openingAmount(),
                            account.openedOn(), parsed.amount(), parsed.on(), parsed.reason(), memberId, key, now))
                    .flatMap(saved -> accounts.save(new Account(account.id(), account.householdId(), account.type(),
                            account.name(), account.institution(), parsed.on(), parsed.amount(), account.status(),
                            account.createdAt(), now)).thenReturn(saved))
                    .flatMap(saved -> store.byId(saved.id())).map(r -> new Saved(r, true));
        });
    }

    /** A retry is judged on what was saved, never on the account as it is now. */
    private Mono<Saved> replay(OpeningRevision existing, OpeningRequest request, UUID memberId) {
        return same(existing, request, memberId) ? store.byId(existing.id()).map(r -> new Saved(r, false))
                : Mono.error(conflict("This save was already used with different details. Start a new entry."));
    }

    private static boolean same(OpeningRevision existing, OpeningRequest request, UUID memberId) {
        return request.openingAmount() instanceof String text
                && Money.parse(text).filter(a -> a.compareTo(existing.openingAmount()) == 0).isPresent()
                && existing.openedOn().equals(request.openedOn())
                && Objects.equals(existing.reason(), request.reason() == null ? null : request.reason().strip())
                && existing.enteredByMemberId().equals(memberId);
    }

    /** Frees a stored key once it is past its lifetime, so a combined save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return store.expireKey(key, cutoff);
    }

    /** True when the correction stored under this key is exactly the one requested (a retry of a combined save). */
    public Mono<Boolean> storedMatches(String key, Instant cutoff, OpeningRequest request) {
        return revisions.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                .map(existing -> same(existing, request, request.enteredByMemberId())).defaultIfEmpty(false);
    }

    /**
     * Validates the requested opening. The date cannot be in the future, and no counted entry may be dated before it:
     * moving the start later than an entry would leave the entry outside tracking.
     */
    private Mono<Parsed> check(Account account, Object amount, LocalDate on, String reason) {
        return Mono.fromCallable(() -> {
            if (on == null) {
                throw EntryValidator.bad("Enter a date");
            }
            if (on.isAfter(LocalDate.now(clock))) {
                throw EntryValidator.bad("The date cannot be in the future");
            }
            if (!(amount instanceof String text) || Money.parse(text).isEmpty()) {
                throw EntryValidator.bad("Enter a valid amount");
            }
            return Money.parse(text).orElseThrow();
        }).flatMap(parsed -> activityStore.earliestOf(account.id()).map(java.util.Optional::of)
                .defaultIfEmpty(java.util.Optional.empty()).map(earliest -> {
                    if (earliest.isPresent() && earliest.get().isBefore(on)) {
                        throw EntryValidator.bad("An entry is dated " + earliest.get()
                                + ", before this starting date");
                    }
                    return new Parsed(parsed, on, reason == null ? null : reason(reason));
                }));
    }

    private static String reason(String text) {
        String reason = text.strip();
        if (reason.isEmpty()) {
            throw EntryValidator.bad("Enter a reason");
        }
        if (reason.length() > 200) {
            throw EntryValidator.bad("Reason must be 200 characters or fewer");
        }
        return reason;
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw EntryValidator.bad("Missing save key");
        }
        return key;
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)));
    }

    /** A card's amount is changed with Update balance, not by moving its starting balance. */
    private Mono<Account> loadEditable(UUID id) {
        return load(id).filter(account -> !AccountType.isCard(account.type()))
                .switchIfEmpty(Mono.error(EntryValidator.bad("Use Update balance")))
                .filter(account -> !AccountType.isValued(account.type()))
                .switchIfEmpty(Mono.error(EntryValidator.bad(
                        "A property or other asset moves its start by recording an earlier value")));
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
