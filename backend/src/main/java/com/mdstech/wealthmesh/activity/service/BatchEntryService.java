package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.activity.dto.BatchRequest;
import com.mdstech.wealthmesh.activity.dto.BatchResponse;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Saves several expenses on one account in one transaction (EXPENSE_003 to 005): every entry is valid or none is
 * saved. One batch key covers the whole save: entry `i` is stored under the key `<batch key>:i`, so a repeat of the
 * same batch returns the stored entries (D-024) and the same key with different details is a 409. The key is read
 * after the account row is locked, like every keyed save.
 */
@Service
public class BatchEntryService {

    /** The most entries one batch may hold. */
    public static final int MAX_ENTRIES = 20;

    /** The saved entries and whether this call created them (false for a replay). */
    public record Saved(BatchResponse batch, boolean created) {
    }

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public BatchEntryService(AccountRepository accounts, EntryValidator validator, ActivityRepository activities,
            ActivityStore store, Clock clock, TransactionalOperator transactions) {
        this.accounts = accounts;
        this.validator = validator;
        this.activities = activities;
        this.store = store;
        this.clock = clock;
        this.transactions = transactions;
    }

    public Mono<Saved> record(UUID accountId, String key, BatchRequest request) {
        return Mono.fromCallable(() -> check(key, request))
                .then(Mono.defer(() -> load(accountId)))
                .flatMap(account -> transactions.transactional(store.lockAccount(account.id())
                        .then(Mono.defer(() -> load(accountId)))
                        .flatMap(fresh -> parse(fresh, request)
                                .flatMap(entries -> validator.memberLocked(fresh, request.enteredByMemberId())
                                        .then(Mono.defer(() -> saveOrReplay(key, entries)))))));
    }

    private Mono<List<EntryValidator.Entry>> parse(Account account, BatchRequest request) {
        return Flux.range(0, request.entries().size()).concatMap(i -> {
            ExpenseRequest row = request.entries().get(i);
            ExpenseRequest withMember = new ExpenseRequest(row.description(), row.amount(), row.occurredOn(),
                    row.category(), row.categoryId(), request.enteredByMemberId(), row.classification(),
                    row.portions());
            return validator.parse(account, "expense", withMember, null)
                    .onErrorMap(ResponseStatusException.class, e -> new ResponseStatusException(e.getStatusCode(),
                            "Row " + (i + 1) + ": " + e.getReason()));
        }).collectList();
    }

    private Mono<Saved> saveOrReplay(String key, List<EntryValidator.Entry> entries) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(EntryService.KEY_LIFETIME);
        return Flux.range(0, entries.size()).concatMap(i -> store.expireKey(rowKey(key, i), cutoff)).then()
                .then(Mono.defer(() -> Flux.range(0, entries.size()).concatMap(i -> activities
                        .findByIdempotencyKeyAndCreatedAtAfter(rowKey(key, i), cutoff)
                        .map(existing -> new Stored(i, existing))).collectList()))
                .flatMap(stored -> stored.isEmpty() ? create(key, entries, now) : replay(stored, entries));
    }

    private record Stored(int index, Activity activity) {
    }

    private Mono<Saved> create(String key, List<EntryValidator.Entry> entries, Instant now) {
        return Flux.range(0, entries.size()).concatMap(i -> {
            EntryValidator.Entry entry = entries.get(i);
            return activities.save(new Activity(null, entry.accountId(), entry.kind(), entry.amount(),
                    entry.occurredOn(), entry.description(), entry.categoryId(), entry.memberId(), rowKey(key, i),
                    now, null, null, null, null, entry.classification()));
        }).concatMap(saved -> store.byId(saved.id())).collectList()
                .map(rows -> new Saved(batch(rows), true));
    }

    /** All entries stored and every one identical: the same batch again. Anything else is a different request. */
    private Mono<Saved> replay(List<Stored> stored, List<EntryValidator.Entry> entries) {
        boolean same = stored.size() == entries.size() && stored.stream().allMatch(
                s -> entries.get(s.index()).matches(s.activity(), List.of()) && s.activity().replacesId() == null);
        if (!same) {
            return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT,
                    "This save was already used with different details. Start a new entry."));
        }
        return Flux.fromIterable(stored).concatMap(s -> store.byId(s.activity().id())).collectList()
                .map(rows -> new Saved(batch(rows), false));
    }

    private static BatchResponse batch(List<ActivityResponse> rows) {
        BigDecimal total = rows.stream().map(r -> Money.parse(r.amount()).orElseThrow()).reduce(BigDecimal.ZERO,
                BigDecimal::add);
        return new BatchResponse(rows, Money.format(total));
    }

    private static String rowKey(String key, int index) {
        return key + ":" + index;
    }

    private static Object check(String key, BatchRequest request) {
        if (key == null || key.isBlank() || key.length() > 90) {
            throw EntryValidator.bad("Missing save key");
        }
        if (request == null || request.entries() == null || request.entries().isEmpty()
                || request.entries().size() > MAX_ENTRIES) {
            throw EntryValidator.bad("Enter 1 to " + MAX_ENTRIES + " expenses to save together");
        }
        return key;
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)))
                .flatMap(account -> AccountType.holdsActivity(account.type()) ? Mono.just(account)
                        : Mono.error(EntryValidator.bad("Money in and out cannot be recorded on this type of "
                                + "account yet")));
    }
}
