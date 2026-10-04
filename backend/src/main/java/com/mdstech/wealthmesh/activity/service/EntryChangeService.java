package com.mdstech.wealthmesh.activity.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.HistoryEntry;
import com.mdstech.wealthmesh.activity.dto.ReplacementRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Corrects an entry by replacing it: the original stays in history, the new row is what counts (foundations 6). */
@Service
public class EntryChangeService {

    private static final Duration KEY_LIFETIME = EntryService.KEY_LIFETIME;

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public EntryChangeService(AccountRepository accounts, EntryValidator validator, ActivityRepository activities,
            ActivityStore store, Clock clock, TransactionalOperator transactions) {
        this.transactions = transactions;
        this.accounts = accounts;
        this.validator = validator;
        this.activities = activities;
        this.store = store;
        this.clock = clock;
    }

    /** Every row of the account, effective, replaced and removed, newest first. */
    public Flux<HistoryEntry> history(UUID accountId) {
        return accounts.findById(accountId).switchIfEmpty(Mono.error(notFound("Account not found: " + accountId)))
                .thenMany(Flux.defer(() -> store.history(accountId)));
    }

    /** Soft removal: the entry leaves Balance and totals but stays in history until it is undone. */
    public Mono<HistoryEntry> remove(UUID accountId, UUID activityId, UUID memberId) {
        Instant now = clock.instant();
        Mono<Long> removed = original(accountId, activityId)
                .flatMap(original -> actor(accountId, memberId)
                        .then(Mono.defer(() -> store.markRemoved(activityId, memberId, now))))
                .filter(updated -> updated > 0)
                .switchIfEmpty(Mono.error(conflict("This entry was already changed or removed.")))
                .flatMap(updated -> store.recordEvent(activityId, "removed", memberId, now));
        return transactions.transactional(removed).then(Mono.defer(() -> entry(accountId, activityId)));
    }

    /** Undo of a removal. A replaced entry stays replaced: edit or remove its replacement instead. */
    public Mono<HistoryEntry> undo(UUID accountId, UUID activityId, UUID memberId) {
        Mono<Long> restored = original(accountId, activityId)
                .flatMap(original -> actor(accountId, memberId).then(Mono.defer(() -> store.clearRemoved(activityId))))
                .filter(updated -> updated > 0)
                .switchIfEmpty(Mono.error(conflict("Only a removed entry can be restored.")))
                .flatMap(updated -> store.recordEvent(activityId, "restored", memberId, clock.instant()));
        return transactions.transactional(restored).then(Mono.defer(() -> entry(accountId, activityId)));
    }

    private Mono<UUID> actor(UUID accountId, UUID memberId) {
        return accounts.findById(accountId).flatMap(account -> validator.member(account, memberId));
    }

    private Mono<HistoryEntry> entry(UUID accountId, UUID activityId) {
        return store.history(accountId).filter(h -> h.id().equals(activityId)).next();
    }

    /** A replayed key returns the stored replacement (D-024); only an effective entry can be replaced. */
    public Mono<EntryService.Saved> replace(UUID accountId, UUID activityId, String key, ReplacementRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> store.expireKey(key, cutoff)))
                .then(Mono.defer(() -> original(accountId, activityId, true)))
                .flatMap(original -> accounts.findById(accountId).flatMap(account -> validator
                        .parse(account, replacementKind(original), request.asEntry())
                        .doOnNext(entry -> checkFeeMatchesCorrection(original, entry))
                        .flatMap(entry -> activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                                .flatMap(existing -> replay(existing, entry, activityId))
                                .switchIfEmpty(Mono.defer(() -> original.removedAt() != null
                                        ? Mono.error(conflict("This entry was already changed or removed."))
                                        : swap(original, entry, key, request.reason(), now))))))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This save was already used. Start a new entry."));
    }

    /** One transaction: the original leaves the totals only if the replacement is saved, and only once. */
    Mono<EntryService.Saved> swap(Activity original, EntryValidator.Entry entry, String key, String reason,
            Instant now) {
        String note = reason == null || reason.isBlank() ? null : reason.strip();
        Mono<EntryService.Saved> swapped = store.markRemoved(original.id(), entry.memberId(), now)
                .filter(updated -> updated > 0)
                .switchIfEmpty(Mono.error(conflict("This entry was already changed or removed.")))
                .then(Mono.defer(() -> store.recordEvent(original.id(), "replaced", entry.memberId(), now)))
                .then(Mono.defer(() -> activities.save(new Activity(null, entry.accountId(), entry.kind(),
                        entry.amount(), entry.occurredOn(), entry.description(), entry.categoryId(), entry.memberId(),
                        key, now, note, original.id(), null, null))))
                .flatMap(saved -> store.byId(saved.id())).map(a -> new EntryService.Saved(a, true));
        return transactions.transactional(swapped);
    }

    private Mono<EntryService.Saved> replay(Activity existing, EntryValidator.Entry entry, UUID activityId) {
        if (!activityId.equals(existing.replacesId()) || !entry.matches(existing)) {
            return Mono.error(conflict("This save was already used with different details. Start a new entry."));
        }
        return store.byId(existing.id()).map(a -> new EntryService.Saved(a, false));
    }

    /** A correction can only be replaced by the expense that explains it (slice 03, V2_CHECKING_014). */
    private static String replacementKind(Activity original) {
        return "correction".equals(original.kind()) ? "expense" : original.kind();
    }

    /** The fee must explain exactly the correction's decrease on the same date, so the Balance does not move. */
    private static void checkFeeMatchesCorrection(Activity original, EntryValidator.Entry entry) {
        if (!"correction".equals(original.kind())) {
            return;
        }
        if (original.amount().signum() >= 0 || original.amount().negate().compareTo(entry.amount()) != 0) {
            throw EntryValidator.bad("The fee must equal the correction's decrease so the Balance stays the same");
        }
        if (!original.occurredOn().equals(entry.occurredOn())) {
            throw EntryValidator.bad("The fee must be dated the same day as the correction");
        }
    }

    private Mono<Activity> original(UUID accountId, UUID activityId) {
        return original(accountId, activityId, false);
    }

    private Mono<Activity> original(UUID accountId, UUID activityId, boolean allowCorrection) {
        return accounts.findById(accountId).switchIfEmpty(Mono.error(notFound("Account not found: " + accountId)))
                .then(Mono.defer(() -> activities.findById(activityId)))
                .filter(a -> accountId.equals(a.accountId()))
                .filter(a -> "expense".equals(a.kind()) || "income".equals(a.kind())
                        || allowCorrection && "correction".equals(a.kind()))
                .switchIfEmpty(Mono.error(notFound("Entry not found: " + activityId)));
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw EntryValidator.bad("Missing save key");
        }
        return key;
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
