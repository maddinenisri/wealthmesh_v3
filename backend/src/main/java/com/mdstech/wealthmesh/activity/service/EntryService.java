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
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> load(accountId)))
                .flatMap(account -> transactions.transactional(store.lockAccount(account.id())
                        .then(Mono.defer(() -> load(accountId)))
                        .flatMap(fresh -> validator.parseSplittable(fresh, kind, request, java.util.Set.of())
                                // The member is read again under a share lock, so a deactivate cannot slip in (D-034).
                                .flatMap(entry -> validator.memberLocked(fresh, entry.memberId()).thenReturn(entry)))
                        .flatMap(entry -> save(entry, key))));
    }

    private Mono<Saved> save(EntryValidator.Entry entry, String key) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        Mono<Saved> insert = activities.save(new Activity(null, entry.accountId(), entry.kind(), entry.amount(),
                        entry.occurredOn(), entry.description(), entry.categoryId(), entry.memberId(), key, now,
                        null, null, null, null, entry.classification()))
                .flatMap(saved -> portions.insert(saved.id(), entry.portions()).thenReturn(saved))
                .flatMap(saved -> store.byId(saved.id())).map(a -> new Saved(a, true));
        return store.expireKey(key, cutoff)
                .then(activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> replay(existing, entry))
                        .switchIfEmpty(Mono.defer(() -> insert)))
                // Unreachable while record() holds the account lock; in its transaction this recovery could not run.
                .onErrorResume(DuplicateKeyException.class, e -> activities
                        .findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> replay(existing, entry)));
    }

    private Mono<Saved> replay(Activity existing, EntryValidator.Entry entry) {
        return portions.of(existing.id()).flatMap(stored -> {
            boolean same = entry.matches(existing, stored) && existing.replacesId() == null;
            if (!same) {
                return Mono.<Saved>error(new ResponseStatusException(HttpStatus.CONFLICT,
                        "This save was already used with different details. Start a new entry."));
            }
            return store.byId(existing.id()).map(a -> new Saved(a, false));
        });
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
