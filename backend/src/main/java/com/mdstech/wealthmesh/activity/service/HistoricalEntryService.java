package com.mdstech.wealthmesh.activity.service;

import java.time.Clock;
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
import com.mdstech.wealthmesh.activity.dto.HistoricalEntryRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.opening.service.OpeningRevisionService;

import reactor.core.publisher.Mono;

/**
 * Saves an entry dated before tracking began together with the reviewed move of the tracking start (L8,
 * V2_CHECKING_016). One transaction under the account lock: the start moves, then the entry is checked against the
 * new start and saved, so either both happen or neither. A replayed key returns the stored entry (D-024).
 */
@Service
public class HistoricalEntryService {

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final OpeningRevisionService openings;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public HistoricalEntryService(AccountRepository accounts, EntryValidator validator,
            ActivityRepository activities, ActivityStore store, OpeningRevisionService openings, Clock clock,
            TransactionalOperator transactions) {
        this.accounts = accounts;
        this.validator = validator;
        this.activities = activities;
        this.store = store;
        this.openings = openings;
        this.clock = clock;
        this.transactions = transactions;
    }

    public Mono<EntryService.Saved> save(UUID accountId, String key, HistoricalEntryRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(EntryService.KEY_LIFETIME);
        return Mono.fromCallable(() -> require(key, request))
                .then(Mono.defer(() -> store.expireKey(key, cutoff)))
                .then(Mono.defer(() -> openings.expireKey(key, cutoff)))
                .then(Mono.defer(() -> load(accountId)))
                .flatMap(account -> transactions.transactional(store.lockAccount(account.id())
                        .then(Mono.defer(() -> load(accountId)))
                        .flatMap(fresh -> activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                                .flatMap(existing -> replay(fresh, existing, request, cutoff))
                                .switchIfEmpty(Mono.defer(() -> create(fresh, key, request, now))))))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This save was already used. Start a new entry."));
    }

    private Mono<EntryService.Saved> create(Account locked, String key, HistoricalEntryRequest request,
            Instant now) {
        UUID memberId = request.startRevision().enteredByMemberId();
        return validator.member(locked, memberId)
                .then(Mono.defer(() -> openings.applyLocked(locked, key, request.startRevision(), memberId, now)))
                .then(Mono.defer(() -> load(locked.id())))
                .flatMap(moved -> validator.parse(moved, request.kind(), request.entry()))
                .flatMap(entry -> activities.save(new Activity(null, entry.accountId(), entry.kind(), entry.amount(),
                        entry.occurredOn(), entry.description(), entry.categoryId(), entry.memberId(), key, now,
                        null, null, null, null)))
                .flatMap(saved -> store.byId(saved.id())).map(a -> new EntryService.Saved(a, true));
    }

    /** A retry is judged on what was saved, never on the ledger as it is now. */
    private Mono<EntryService.Saved> replay(Account account, Activity existing, HistoricalEntryRequest request,
            Instant cutoff) {
        return validator.parse(withNoDateCheck(account, request), request.kind(), request.entry())
                .flatMap(entry -> openings.storedMatches(existing.idempotencyKey(), cutoff, request.startRevision())
                        .flatMap(sameStart -> sameStart && entry.matches(existing) && existing.replacesId() == null
                                ? store.byId(existing.id()).map(a -> new EntryService.Saved(a, false))
                                : Mono.error(conflict(
                                        "This save was already used with different details. Start a new entry."))));
    }

    /** The stored entry predates the account's current start no more: compare it on its details only. */
    private static Account withNoDateCheck(Account account, HistoricalEntryRequest request) {
        return new Account(account.id(), account.householdId(), account.type(), account.name(),
                account.institution(), request.entry().occurredOn() == null ? account.openedOn()
                        : request.entry().occurredOn().isBefore(account.openedOn()) ? request.entry().occurredOn()
                        : account.openedOn(), account.openingAmount(), account.status(), account.createdAt(),
                account.updatedAt());
    }

    private static String require(String key, HistoricalEntryRequest request) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw EntryValidator.bad("Missing save key");
        }
        if (request != null && !"expense".equals(request.kind()) && !"income".equals(request.kind())) {
            throw EntryValidator.bad("Choose expense or income");
        }
        if (request == null || request.entry() == null || request.startRevision() == null) {
            throw EntryValidator.bad("The entry and the reviewed starting balance are both needed");
        }
        return key;
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)))
                .flatMap(account -> AccountType.isCard(account.type())
                        ? Mono.error(EntryValidator.bad("Use Update balance"))
                        : AccountType.holdsActivity(account.type()) ? Mono.just(account)
                        : Mono.error(EntryValidator.bad(
                                "Money in and out cannot be recorded on this type of account yet")));
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
