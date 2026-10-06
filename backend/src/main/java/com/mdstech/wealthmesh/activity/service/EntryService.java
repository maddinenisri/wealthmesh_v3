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

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.repository.PortionStore;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Records expenses and income on a checking account. A replayed save key returns the stored entry (D-024). */
@Service
public class EntryService {

    /** How long a save key is remembered. */
    static final Duration KEY_LIFETIME = Duration.ofHours(24);

    /** The saved entry and whether this call created it (false for a replay). */
    public record Saved(ActivityResponse activity, boolean created) {
    }

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final PortionStore portions;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public EntryService(AccountRepository accounts, EntryValidator validator, ActivityRepository activities,
            ActivityStore store, PortionStore portions, Clock clock, TransactionalOperator transactions) {
        this.portions = portions;
        this.transactions = transactions;
        this.accounts = accounts;
        this.validator = validator;
        this.activities = activities;
        this.store = store;
        this.clock = clock;
    }

    public Flux<ActivityResponse> activityOf(UUID accountId) {
        return load(accountId).thenMany(Flux.defer(() -> store.forAccount(accountId)));
    }

    /** `kind` is "expense" (money out) or "income" (money in): it fixes the category kind and Balance direction. */
    public Mono<Saved> record(UUID accountId, String key, String kind, ExpenseRequest request) {
        // The account row is locked and read again, so a tracking-start move cannot slip in between the date check
        // and the insert (an entry would be left dated before the start).
        // A retry of a save that already succeeded replays it even if the account was archived or closed since (D-024,
        // Q-040): under the lock the key is read first, and only a new key meets the state gate.
        Instant cutoff = clock.instant().minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> load(accountId)))
                .flatMap(account -> transactions.transactional(store.lockAccount(account.id())
                        .then(Mono.defer(() -> load(accountId)))
                        .flatMap(fresh -> store.expireKey(key, cutoff)
                                .then(Mono.defer(() -> activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)))
                                // A retry is judged on what was saved, not on today's rules (Q-044).
                                .flatMap(existing -> portions.of(existing.id())
                                        .flatMap(stored -> validator.parseForReplay(fresh, kind, request,
                                                new EntryValidator.Stored(existing.categoryId(),
                                                        existing.classification(), stored))
                                                .flatMap(entry -> replay(existing, stored, entry))))
                                .switchIfEmpty(Mono.defer(() -> Mono.fromCallable(() -> AccountState.requireOpen(fresh))
                                        .flatMap(open -> validator.parseSplittable(open, kind, request,
                                                java.util.Set.of()))
                                        // The member is read again under a share lock, so a deactivate cannot slip
                                        // in (D-034).
                                        .flatMap(entry -> validator.memberLocked(fresh, entry.memberId())
                                                .thenReturn(entry))
                                        .flatMap(entry -> insert(entry, key)))))));
    }

    private Mono<Saved> insert(EntryValidator.Entry entry, String key) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return activities.save(new Activity(null, entry.accountId(), entry.kind(), entry.amount(),
                        entry.occurredOn(), entry.description(), entry.categoryId(), entry.memberId(), key, now,
                        null, null, null, null, entry.classification()))
                .flatMap(saved -> portions.insert(saved.id(), entry.portions()).thenReturn(saved))
                .flatMap(saved -> store.byId(saved.id())).map(a -> new Saved(a, true))
                // Unreachable while record() holds the account lock; in its transaction this recovery could not run.
                .onErrorResume(DuplicateKeyException.class, e -> activities
                        .findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> portions.of(existing.id())
                                .flatMap(stored -> replay(existing, stored, entry))));
    }

    private Mono<Saved> replay(Activity existing, java.util.List<com.mdstech.wealthmesh.activity.domain.Portion> stored,
            EntryValidator.Entry entry) {
        boolean same = entry.matches(existing, stored) && existing.replacesId() == null;
        if (!same) {
            return Mono.<Saved>error(new ResponseStatusException(HttpStatus.CONFLICT,
                    "This save was already used with different details. Start a new entry."));
        }
        return store.byId(existing.id()).map(a -> new Saved(a, false));
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw bad("Missing save key");
        }
        return key;
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)))
                .flatMap(account -> AccountType.holdsActivity(account.type()) ? Mono.just(account)
                        : Mono.error(bad("Money in and out cannot be recorded on this type of account yet")));
    }

    private static ResponseStatusException bad(String message) {
        return EntryValidator.bad(message);
    }
}
