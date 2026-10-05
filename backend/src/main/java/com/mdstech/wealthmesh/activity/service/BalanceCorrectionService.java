package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.account.service.AccountService;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.BalanceView;
import com.mdstech.wealthmesh.activity.dto.CorrectionPreview;
import com.mdstech.wealthmesh.activity.dto.CorrectionRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/**
 * Balance as of a date and dated Balance corrections (foundations 3 and 8). A correction is a signed `correction` row:
 * requested Balance minus the Balance on its date. It never counts as income or spending.
 */
@Service
public class BalanceCorrectionService {

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public BalanceCorrectionService(AccountRepository accounts, EntryValidator validator,
            ActivityRepository activities, ActivityStore store, Clock clock, TransactionalOperator transactions) {
        this.accounts = accounts;
        this.validator = validator;
        this.activities = activities;
        this.store = store;
        this.clock = clock;
        this.transactions = transactions;
    }

    /** Opening amount plus activity up to the date; null (not available) before tracking began. */
    public Mono<BalanceView> balanceAsOf(UUID accountId, LocalDate asOn) {
        return Mono.fromCallable(() -> requireDate(asOn)).then(Mono.defer(() -> load(accountId)))
                .flatMap(account -> asOn.isBefore(account.openedOn()) ? Mono.just(new BalanceView(null, asOn))
                        : balanceOn(account, asOn, null).map(b -> new BalanceView(Money.format(b), asOn)));
    }

    public Mono<CorrectionPreview> preview(UUID accountId, Object requested, String side, LocalDate asOn,
            UUID replacesId) {
        return load(accountId).flatMap(account -> figures(account, requested, side, asOn, replacesId).map(f -> {
            BigDecimal replaced = f.replaced() == null ? BigDecimal.ZERO : f.replaced().amount();
            BigDecimal after = f.current().subtract(replaced).add(f.difference());
            return new CorrectionPreview(asOn, Money.format(f.onDate()), Money.format(f.requested()),
                    Money.format(f.difference()), Money.format(f.current()), Money.format(after),
                    after.signum() < 0 && !AccountType.isCard(account.type()));
        }));
    }

    /** Repeat-safe (D-024): a replayed key returns the stored row when the requested figures match. */
    public Mono<EntryService.Saved> save(UUID accountId, String key, CorrectionRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(EntryService.KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> store.expireKey(key, cutoff)))
                .then(Mono.defer(() -> load(accountId)))
                .flatMap(account -> validator.member(account, request.enteredByMemberId())
                        .flatMap(memberId -> activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                                .flatMap(existing -> replay(account, existing, request, memberId))
                                .switchIfEmpty(Mono.defer(() -> create(account, key, request, memberId, now, cutoff)))))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This save was already used. Start a new entry."));
    }

    private Mono<EntryService.Saved> create(Account account, String key, CorrectionRequest request, UUID memberId,
            Instant now, Instant cutoff) {
        String reason = reason(request.reason());
        // The account row is locked first, so the Balance on the date is read and the row written with no other
        // correction (or replacement) of this account in between.
        // The account is read again under the lock: a starting-balance correction may have changed its opening.
        // A request with this key that finished while this one waited for the lock is replayed, not repeated.
        Mono<EntryService.Saved> locked = store.lockAccount(account.id())
                .then(Mono.defer(() -> activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> replay(account, existing, request, memberId))
                        .switchIfEmpty(Mono.defer(() -> writeLocked(account, key, request, memberId, now, reason)))));
        return transactions.transactional(locked);
    }

    private Mono<EntryService.Saved> writeLocked(Account account, String key, CorrectionRequest request,
            UUID memberId, Instant now, String reason) {
        return load(account.id())
                .flatMap(fresh -> figures(fresh, request.requestedBalance(), request.balanceSide(), request.asOn(),
                        request.replacesId()))
                .flatMap(f -> {
                    if (f.replaced() == null && f.difference().signum() == 0) {
                        return Mono.error(EntryValidator.bad("The Balance already matches this amount"));
                    }
                    Activity row = new Activity(null, account.id(), "correction", f.difference(), request.asOn(),
                            null, null, memberId, key, now, reason, request.replacesId(), null, f.requested(), null);
                    return f.replaced() == null ? insert(row)
                            : store.markRemoved(f.replaced().id(), memberId, now)
                                    .filter(updated -> updated > 0)
                                    .switchIfEmpty(Mono.error(conflict("This correction was already changed.")))
                                    .then(Mono.defer(() -> store.recordEvent(f.replaced().id(), "replaced",
                                            memberId, now)))
                                    .then(Mono.defer(() -> insert(row)));
                });
    }

    private Mono<EntryService.Saved> insert(Activity row) {
        return activities.save(row).flatMap(saved -> store.byId(saved.id())).map(a -> new EntryService.Saved(a, true));
    }

    /** A retry is judged on what was saved, never on the ledger as it is now. */
    private Mono<EntryService.Saved> replay(Account account, Activity existing, CorrectionRequest request,
            UUID memberId) {
        boolean same = "correction".equals(existing.kind()) && account.id().equals(existing.accountId())
                && existing.occurredOn().equals(request.asOn())
                && memberId.equals(existing.enteredByMemberId())
                && java.util.Objects.equals(existing.replacesId(), request.replacesId())
                && java.util.Objects.equals(existing.reason(), reason(request.reason()))
                && request.requestedBalance() instanceof String text
                && Money.parse(text).map(r -> AccountService.signed(account.type(), r, request.balanceSide()))
                        .filter(r -> existing.requestedBalance() != null
                                && r.compareTo(existing.requestedBalance()) == 0).isPresent();
        return same ? store.byId(existing.id()).map(a -> new EntryService.Saved(a, false))
                : Mono.error(conflict("This save was already used with different details. Start a new entry."));
    }

    private record Figures(BigDecimal onDate, BigDecimal requested, BigDecimal difference, BigDecimal current,
            Activity replaced) {
    }

    private Mono<Figures> figures(Account account, Object requestedText, String side, LocalDate asOn,
            UUID replacesId) {
        return Mono.fromCallable(() -> {
            requireDate(asOn);
            if (asOn.isBefore(account.openedOn())) {
                throw EntryValidator.bad("This date is before the account's opening date");
            }
            if (!(requestedText instanceof String text) || Money.parse(text).isEmpty()) {
                throw EntryValidator.bad("Enter a valid amount");
            }
            // A card's amount is typed positive with a side and stored with the asset sign (owed negative).
            return AccountService.signed(account.type(), Money.parse(text).orElseThrow(), side);
        }).flatMap(requested -> replaced(account, replacesId).map(java.util.Optional::of)
                .defaultIfEmpty(java.util.Optional.empty())
                .flatMap(replaced -> balanceOn(account, asOn, replaced.map(Activity::id).orElse(null))
                        .flatMap(onDate -> store.deltaOf(account.id()).map(delta -> new Figures(onDate, requested,
                                requested.subtract(onDate), account.openingAmount().add(delta.amount()),
                                replaced.orElse(null))))));
    }

    private Mono<Activity> replaced(Account account, UUID replacesId) {
        if (replacesId == null) {
            return Mono.empty();
        }
        return activities.findById(replacesId)
                .filter(a -> account.id().equals(a.accountId()) && "correction".equals(a.kind()))
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Correction not found: " + replacesId)))
                .filter(a -> a.removedAt() == null)
                .switchIfEmpty(Mono.error(conflict("This correction was already changed.")));
    }

    private Mono<BigDecimal> balanceOn(Account account, LocalDate asOn, UUID excluding) {
        return store.changeUpTo(account.id(), asOn, excluding).map(change -> account.openingAmount().add(change));
    }

    private LocalDate requireDate(LocalDate asOn) {
        if (asOn == null) {
            throw EntryValidator.bad("Enter a date");
        }
        if (asOn.isAfter(LocalDate.now(clock))) {
            throw EntryValidator.bad("The date cannot be in the future");
        }
        return asOn;
    }

    private static String reason(String text) {
        String reason = text == null ? "" : text.strip();
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
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)))
                .filter(account -> AccountType.holdsActivity(account.type()))
                .switchIfEmpty(Mono.error(EntryValidator.bad(
                        "The Balance of this type of account cannot be corrected yet")));
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
