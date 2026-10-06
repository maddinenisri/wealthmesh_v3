package com.mdstech.wealthmesh.activity.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.domain.Portion;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.dto.HistoryEntry;
import com.mdstech.wealthmesh.activity.dto.PortionRequest;
import com.mdstech.wealthmesh.activity.dto.ReplacementRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.repository.PortionStore;
import com.mdstech.wealthmesh.money.Money;

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
    private final PortionStore portions;
    private final Clock clock;
    private final TransactionalOperator transactions;
    private final MoveTarget moveTarget;

    public EntryChangeService(AccountRepository accounts, EntryValidator validator, ActivityRepository activities,
            ActivityStore store, PortionStore portions, Clock clock, TransactionalOperator transactions,
            MoveTarget moveTarget) {
        this.portions = portions;
        this.transactions = transactions;
        this.moveTarget = moveTarget;
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
                // The account row is locked so a close (which needs a zero Balance) cannot slip in between.
                .flatMap(original -> store.lockAccount(accountId)
                        .then(Mono.defer(() -> accounts.findById(accountId)))
                        .map(AccountState::requireNotClosed)
                        .then(Mono.defer(() -> actor(accountId, memberId)))
                        .then(Mono.defer(() -> store.markRemoved(activityId, memberId, now))))
                .filter(updated -> updated > 0)
                .switchIfEmpty(Mono.error(conflict("This entry was already changed or removed.")))
                .flatMap(updated -> store.recordEvent(activityId, "removed", memberId, now));
        return transactions.transactional(removed).then(Mono.defer(() -> entry(accountId, activityId)));
    }

    /**
     * Undo of a removal. A replaced entry stays replaced: edit or remove its replacement instead. A second Undo of
     * the same removal changes nothing and returns the restored entry again, never a second restore or a 409 (D-044).
     */
    public Mono<HistoryEntry> undo(UUID accountId, UUID activityId, UUID memberId) {
        Mono<Long> restored = original(accountId, activityId)
                .flatMap(original -> actor(accountId, memberId)
                        .then(Mono.defer(() -> lockedStart(accountId, original.occurredOn(),
                                AccountState::requireNotClosed)))
                        .then(Mono.defer(() -> store.clearRemoved(activityId))))
                .flatMap(updated -> updated > 0
                        ? store.recordEvent(activityId, "restored", memberId, clock.instant())
                        : alreadyRestored(activityId));
        return transactions.transactional(restored).then(Mono.defer(() -> entry(accountId, activityId)));
    }

    /**
     * Locks the account row and checks, on its current row, that a date is not before the tracking start. The start
     * may have moved since the entry was saved or the form was opened.
     */
    private Mono<Void> lockedStart(UUID accountId, LocalDate date,
            java.util.function.UnaryOperator<Account> state) {
        return store.lockAccount(accountId).then(Mono.defer(() -> accounts.findById(accountId)))
                .map(state)
                .filter(account -> !date.isBefore(account.openedOn()))
                .switchIfEmpty(Mono.error(conflict("This entry is dated before the account's tracking start.")))
                .then();
    }

    /** Read under the account lock: the entry counts again and its latest change was a restore (D-044). */
    private Mono<Long> alreadyRestored(UUID activityId) {
        return activities.findById(activityId).filter(a -> a.removedAt() == null)
                .flatMap(a -> store.lastEventAction(activityId)).filter("restored"::equals).map(action -> 0L)
                .switchIfEmpty(Mono.error(conflict("Only a removed entry can be restored.")));
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
                .flatMap(original -> portions.of(original.id()).flatMap(before -> moveTarget
                        .resolve(accountId, request.accountId()).flatMap(account -> validator
                        .parseSplittable(account, replacementKind(original), keepClass(original, request, before),
                                kept(original, before))
                        .doOnNext(entry -> checkFeeMatchesCorrection(original, entry))
                        .doOnNext(entry -> checkStaysPut(original, entry))
                        .flatMap(entry -> activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                                .flatMap(existing -> replay(existing, entry, activityId))
                                .switchIfEmpty(Mono.defer(() -> original.removedAt() != null
                                        ? Mono.error(conflict("This entry was already changed or removed."))
                                        : swap(original, entry, key, request.reason(), now, cutoff, account,
                                                kept(original, before))))))))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This save was already used. Start a new entry."));
    }

    /** One transaction: the original leaves the totals only if the replacement is saved, and only once. */
    Mono<EntryService.Saved> swap(Activity original, EntryValidator.Entry entry, String key, String reason,
            Instant now, Instant cutoff, Account target, Set<UUID> kept) {
        // Under the locks: a request with this key that finished while this one waited is replayed, and the person
        // who entered it is checked again, so a deactivate in between is not missed (D-034).
        Mono<EntryService.Saved> swapped = lockBoth(original.accountId(), entry.accountId())
                .then(Mono.defer(() -> activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> replay(existing, entry, original.id()))
                        .switchIfEmpty(Mono.defer(() -> validator.memberLocked(target, entry.memberId())
                                .then(Mono.defer(() -> validator.checkCategoryLocked(entry.categoryId(),
                                        original.categoryId())))
                                .then(Mono.defer(() -> validator.checkPortionCategoriesLocked(entry.portions(),
                                        kept)))
                                .then(Mono.defer(() -> swapLocked(original, entry, key, reason, now)))))));
        return transactions.transactional(swapped);
    }

    private Mono<EntryService.Saved> swapLocked(Activity original, EntryValidator.Entry entry, String key,
            String reason, Instant now) {
        String note = reason == null || reason.isBlank() ? null : reason.strip();
        // The entry's own account may be archived; a different (target) account must be active; none may be closed.
        boolean moving = !original.accountId().equals(entry.accountId());
        return lockedStart(entry.accountId(), entry.occurredOn(),
                moving ? AccountState::requireOpen : AccountState::requireNotClosed)
                .then(Mono.defer(() -> moving ? accounts.findById(original.accountId())
                        .map(AccountState::requireNotClosed).then() : Mono.<Void>empty()))
                .then(Mono.defer(() -> store.markRemoved(original.id(), entry.memberId(), now)))
                .filter(updated -> updated > 0)
                .switchIfEmpty(Mono.error(conflict("This entry was already changed or removed.")))
                .then(Mono.defer(() -> store.recordEvent(original.id(), "replaced", entry.memberId(), now)))
                .then(Mono.defer(() -> activities.save(new Activity(null, entry.accountId(), entry.kind(),
                        entry.amount(), entry.occurredOn(), entry.description(), entry.categoryId(), entry.memberId(),
                        key, now, note, original.id(), null, null, entry.classification()))))
                .flatMap(saved -> portions.insert(saved.id(), entry.portions()).thenReturn(saved))
                .flatMap(saved -> store.byId(saved.id())).map(a -> new EntryService.Saved(a, true));
    }

    /** A Balance correction is replaced by its fee on the same account; it never moves to another one. */
    private static void checkStaysPut(Activity original, EntryValidator.Entry entry) {
        if ("correction".equals(original.kind()) && !original.accountId().equals(entry.accountId())) {
            throw EntryValidator.bad("A Balance correction can only be replaced on its own account");
        }
    }

    /** Locks both accounts, lowest id first, so two moves in opposite directions cannot wait on each other. */
    private Mono<Void> lockBoth(UUID first, UUID second) {
        return Flux.fromStream(java.util.stream.Stream.of(first, second).distinct().sorted())
                .concatMap(store::lockAccount).then();
    }

    private Mono<EntryService.Saved> replay(Activity existing, EntryValidator.Entry entry, UUID activityId) {
        return portions.of(existing.id()).flatMap(stored -> {
            if (!activityId.equals(existing.replacesId()) || !entry.matches(existing, stored)) {
                return Mono.<EntryService.Saved>error(
                        conflict("This save was already used with different details. Start a new entry."));
            }
            return store.byId(existing.id()).map(a -> new EntryService.Saved(a, false));
        });
    }

    /**
     * An edit that names no class and keeps the category keeps the class the entry was saved with, so an override
     * (an Essential grocery marked Discretionary) is not lost by correcting the date. A split entry's portions are
     * carried when the edit names neither portions nor a category, so moving or re-dating it keeps its split
     * (SPLITS_002); an empty list removes the split.
     */
    private static ExpenseRequest keepClass(Activity original, ReplacementRequest request, List<Portion> before) {
        ExpenseRequest entry = request.asEntry();
        if (entry.portions() == null && !before.isEmpty() && !namesCategory(request)) {
            return new ExpenseRequest(entry.description(), entry.amount(), entry.occurredOn(), null, null,
                    entry.enteredByMemberId(), null, before.stream().map(EntryChangeService::carried).toList());
        }
        boolean sameCategory = Objects.equals(request.categoryId(), original.categoryId())
                && (request.category() == null || request.category().isBlank());
        return entry.classification() == null && sameCategory && original.classification() != null
                ? new ExpenseRequest(entry.description(), entry.amount(), entry.occurredOn(), entry.category(),
                        entry.categoryId(), entry.enteredByMemberId(), original.classification(), entry.portions())
                : entry;
    }

    private static boolean namesCategory(ReplacementRequest request) {
        return request.categoryId() != null || request.category() != null && !request.category().isBlank();
    }

    private static PortionRequest carried(Portion p) {
        return new PortionRequest(null, p.categoryId(), p.classification(), Money.format(p.amount()));
    }

    /** The categories the entry has now (its own, or its portions'), which a correction may keep when archived. */
    private static Set<UUID> kept(Activity original, List<Portion> before) {
        return Stream.concat(Stream.ofNullable(original.categoryId()), before.stream().map(Portion::categoryId))
                .collect(Collectors.toSet());
    }

    /** A correction can only be replaced by the expense that explains it (slice 03, V2_CHECKING_014). */
    static String replacementKind(Activity original) {
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
                .filter(a -> "expense".equals(a.kind()) || "income".equals(a.kind()) || "refund".equals(a.kind())
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
