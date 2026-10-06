package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiFunction;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ConversionRequest;
import com.mdstech.wealthmesh.activity.dto.Transfer;
import com.mdstech.wealthmesh.activity.dto.TransferRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.repository.MovementStore;
import com.mdstech.wealthmesh.activity.repository.MovementStore.Leg;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/**
 * Linked movements (foundations 7): a transfer is two ledger rows sharing one movement id, created, replaced,
 * removed and restored together in one transaction. Every writer locks every account it touches, lowest id first,
 * then judges the rows, the dates and the person again under those locks (D-034, D-035). A replayed save key returns
 * the stored movement (D-024). Card payments (slice 08) add a {@link MovementKind} and reuse all of it.
 */
public class MovementService {

    /**
     * The two row kinds of a movement: the side that gives money and the side that receives it, what the person calls
     * it, and the rule for which two accounts it may join (an error message, or null when the pair is allowed).
     */
    public record MovementKind(String outKind, String inKind, String noun,
            BiFunction<Account, Account, String> refusal) {
        public static final MovementKind TRANSFER = new MovementKind("transfer_out", "transfer_in", "transfer",
                (from, to) -> AccountType.isCard(from.type()) || AccountType.isCard(to.type()) ? CARD_TYPE : null);
        /** A payment: a checking or savings account pays a card (CARD_006, CARD_007). */
        public static final MovementKind CARD_PAYMENT = new MovementKind("card_payment", "card_payment_in", "payment",
                (from, to) -> !AccountType.paysCards(from.type()) ? "Pay a card from a checking or savings account"
                        : !AccountType.isCard(to.type()) ? "Choose a card to pay" : null);
    }

    /** The saved movement and whether this call created it (false for a replay). */
    public record Saved(Transfer transfer, boolean created) {
    }

    private record Pair(Account from, Account to) {
    }

    private record Parsed(UUID fromId, UUID toId, BigDecimal amount, LocalDate on, String description, UUID memberId,
            String reason) {
    }

    private static final Duration KEY_LIFETIME = EntryService.KEY_LIFETIME;
    static final String WRONG_TYPE = "Money cannot be moved to or from this type of account yet";
    static final String CARD_TYPE = "Use Record payment to pay a card";
    private static final String USED = "This save was already used. Start a new entry.";
    private static final String USED_DIFFERENTLY =
            "This save was already used with different details. Start a new entry.";

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final MovementStore movements;
    private final MovementKind kind;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public MovementService(AccountRepository accounts, EntryValidator validator, ActivityRepository activities,
            ActivityStore store, MovementStore movements, MovementKind kind, Clock clock,
            TransactionalOperator transactions) {
        this.accounts = accounts;
        this.validator = validator;
        this.activities = activities;
        this.store = store;
        this.movements = movements;
        this.kind = kind;
        this.clock = clock;
        this.transactions = transactions;
    }

    public Mono<Transfer> get(UUID movementId) {
        return legs(movementId).map(this::toTransfer);
    }

    /** A new transfer. 201 for the first save of a key, a replay of the same details returns the stored transfer. */
    public Mono<Saved> create(String key, TransferRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key)).then(Mono.defer(() -> parse(request)))
                .flatMap(parsed -> loadPair(parsed.fromId(), parsed.toId()).flatMap(pair -> {
                    Mono<Saved> work = movements.lockAccounts(List.of(parsed.fromId(), parsed.toId()))
                            .then(Mono.defer(() -> replayOf(key, cutoff, parsed, null)
                                    .switchIfEmpty(Mono.defer(() -> loadPair(parsed.fromId(), parsed.toId())
                                            .flatMap(fresh -> writeNew(fresh, parsed, key, now, null, null))))));
                    return transactions.transactional(work);
                }))
                .onErrorMap(DuplicateKeyException.class, e -> conflict(USED));
    }

    /** Corrects a transfer as a pair: the old rows are replaced, history keeps them. */
    public Mono<Saved> replace(UUID movementId, String key, TransferRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key)).then(Mono.defer(() -> parse(request)))
                .flatMap(parsed -> loadPair(parsed.fromId(), parsed.toId()).zipWith(legs(movementId)))
                .flatMap(both -> {
                    Parsed parsed = request(both.getT1(), request);
                    List<Leg> old = both.getT2();
                    Mono<Saved> work = movements.lockAccounts(accountsOf(old, both.getT1()))
                            .then(Mono.defer(() -> replayOf(key, cutoff, parsed, old)
                                    .switchIfEmpty(Mono.defer(() -> replaceLocked(movementId, parsed, key, now)))));
                    return transactions.transactional(work);
                })
                .onErrorMap(DuplicateKeyException.class, e -> conflict(USED));
    }

    /** Removes both rows of the transfer; they stay in history until Undo. */
    public Mono<Transfer> remove(UUID movementId, UUID memberId) {
        Instant now = clock.instant();
        return legs(movementId).flatMap(old -> {
            Mono<Void> work = movements.lockAccounts(accountsOf(old, null))
                    .then(Mono.defer(() -> legs(movementId)))
                    .flatMap(fresh -> requireLive(fresh)
                            .then(Mono.defer(() -> requireNotClosed(fresh)))
                            .then(Mono.defer(() -> actor(fresh, memberId)))
                            .then(Mono.defer(() -> movements.removePair(movementId, memberId, now)))
                            .flatMap(n -> n == 2 ? events(fresh, "removed", memberId, now)
                                    : Mono.error(changed())));
            return transactions.transactional(work);
        }).then(Mono.defer(() -> get(movementId)));
    }

    /**
     * Brings back a removed transfer unless it was replaced; both dates must still be inside tracking. A second Undo
     * of the same removal changes nothing and returns the restored movement again (D-044).
     */
    public Mono<Transfer> undo(UUID movementId, UUID memberId) {
        Instant now = clock.instant();
        return legs(movementId).flatMap(old -> {
            Mono<Void> work = movements.lockAccounts(accountsOf(old, null))
                    .then(Mono.defer(() -> legs(movementId)))
                    .flatMap(fresh -> alreadyRestored(fresh).flatMap(already -> already ? Mono.<Void>empty()
                            : requireRemoved(fresh)
                            .then(Mono.defer(() -> requireNotClosed(fresh)))
                            .then(Mono.defer(() -> actor(fresh, memberId)))
                            .then(Mono.defer(() -> startsStillCover(fresh)))
                            .then(Mono.defer(() -> movements.restorePair(movementId)))
                            .flatMap(n -> n == 2 ? events(fresh, "restored", memberId, now)
                                    : Mono.error(notRemoved()))));
            return transactions.transactional(work);
        }).then(Mono.defer(() -> get(movementId)));
    }

    /** An expense that was really a transfer: it is replaced by a transfer out of the same account (EXPENSE_008). */
    public Mono<Saved> convert(UUID accountId, UUID activityId, String key, ConversionRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key)).then(Mono.defer(() -> {
            if (request.toAccountId() == null) {
                return Mono.error(EntryValidator.bad("Choose the account the money went to"));
            }
            if (accountId.equals(request.toAccountId())) {
                return Mono.error(EntryValidator.bad("Choose a different account"));
            }
            if (request.reason() == null || request.reason().isBlank()) {
                return Mono.error(EntryValidator.bad("Give a reason for the change"));
            }
            return activities.findById(activityId).filter(a -> accountId.equals(a.accountId()))
                    .switchIfEmpty(Mono.error(notFound("Entry not found: " + activityId)));
        })).flatMap(original -> {
            if (!"expense".equals(original.kind())) {
                return Mono.error(EntryValidator.bad("Only an expense can change to a transfer"));
            }
            return loadPair(accountId, request.toAccountId()).flatMap(pair -> {
                Mono<Saved> work = movements.lockAccounts(List.of(accountId, request.toAccountId()))
                        .then(Mono.defer(() -> convertedBy(key, cutoff, original, request)
                                .switchIfEmpty(Mono.defer(() -> convertLocked(activityId, request, key, now)))));
                return transactions.transactional(work);
            });
        }).onErrorMap(DuplicateKeyException.class, e -> conflict("This save was already used. Start a new entry."));
    }

    // ---- the locked parts: everything below runs with every account of the movement locked ----

    private Mono<Saved> writeNew(Pair pair, Parsed parsed, String key, Instant now, UUID replacesOut, UUID replacesIn) {
        return requireStates(pair, Set.of()).then(Mono.defer(() -> checkDate(pair, parsed.on())))
                .then(Mono.defer(() -> validator.memberLocked(pair.from(), parsed.memberId())))
                .then(Mono.defer(() -> insertPair(pair, parsed, key, now, replacesOut, replacesIn)))
                .flatMap(movement -> get(movement)).map(t -> new Saved(t, true));
    }

    private Mono<Saved> replaceLocked(UUID movementId, Parsed parsed, String key, Instant now) {
        return legs(movementId).flatMap(fresh -> requireLive(fresh)
                .then(Mono.defer(() -> loadPair(parsed.fromId(), parsed.toId())))
                .flatMap(pair -> requireStates(pair, fresh.stream().map(Leg::accountId).collect(
                                java.util.stream.Collectors.toSet()))
                        .then(Mono.defer(() -> checkDate(pair, parsed.on())))
                        .then(Mono.defer(() -> validator.memberLocked(pair.from(), parsed.memberId())))
                        .then(Mono.defer(() -> movements.removePair(movementId, parsed.memberId(), now)))
                        .flatMap(n -> n == 2 ? events(fresh, "replaced", parsed.memberId(), now)
                                : Mono.error(changed()))
                        .then(Mono.defer(() -> insertPair(pair, parsed, key, now, leg(fresh, kind.outKind()).id(),
                                leg(fresh, kind.inKind()).id())))
                        .flatMap(this::get).map(t -> new Saved(t, true))));
    }

    private Mono<Saved> convertLocked(UUID activityId, ConversionRequest request, String key, Instant now) {
        return activities.findById(activityId).filter(a -> a.removedAt() == null)
                .switchIfEmpty(Mono.error(conflict("This entry was already changed or removed.")))
                .flatMap(original -> loadPair(original.accountId(), request.toAccountId()).flatMap(pair -> {
                    Parsed parsed = new Parsed(original.accountId(), request.toAccountId(), original.amount(),
                            original.occurredOn(), null, request.enteredByMemberId(), request.reason().strip());
                    return requireStates(pair, Set.of(original.accountId()))
                            .then(Mono.defer(() -> checkDate(pair, original.occurredOn())))
                            .then(Mono.defer(() -> validator.memberLocked(pair.from(), parsed.memberId())))
                            .then(Mono.defer(() -> store.markRemoved(original.id(), parsed.memberId(), now)))
                            .filter(n -> n > 0)
                            .switchIfEmpty(Mono.error(conflict("This entry was already changed or removed.")))
                            .then(Mono.defer(() -> store.recordEvent(original.id(), "replaced",
                                    parsed.memberId(), now)))
                            .then(Mono.defer(() -> insertPair(pair, parsed, key, now, original.id(), null)))
                            .flatMap(this::get).map(t -> new Saved(t, true));
                }));
    }

    /** A request with this key that finished while this one waited for the locks is replayed, not repeated. */
    private Mono<Saved> replayOf(String key, Instant cutoff, Parsed parsed, List<Leg> replacing) {
        return store.expireKey(key, cutoff).then(Mono.defer(() -> movements.movementOfKey(key, cutoff)))
                .flatMap(movement -> legs(movement).flatMap(existing -> {
                    Leg out = leg(existing, kind.outKind());
                    boolean replaced = replacing == null ? out.replacesId() == null
                            : out.replacesId() != null && out.replacesId().equals(leg(replacing, kind.outKind()).id());
                    if (!replaced || !matches(existing, parsed)) {
                        return Mono.error(conflict(USED_DIFFERENTLY));
                    }
                    return Mono.just(new Saved(toTransfer(existing), false));
                }));
    }

    private Mono<Saved> convertedBy(String key, Instant cutoff, Activity original, ConversionRequest request) {
        return store.expireKey(key, cutoff).then(Mono.defer(() -> movements.movementOfKey(key, cutoff)))
                .flatMap(movement -> legs(movement).flatMap(existing -> {
                    Leg out = leg(existing, kind.outKind());
                    boolean same = original.id().equals(out.replacesId())
                            && leg(existing, kind.inKind()).accountId().equals(request.toAccountId())
                            && java.util.Objects.equals(out.memberId(), request.enteredByMemberId())
                            && java.util.Objects.equals(out.reason(), request.reason().strip());
                    return same ? Mono.just(new Saved(toTransfer(existing), false))
                            : Mono.error(conflict(USED_DIFFERENTLY));
                }));
    }

    private Mono<UUID> insertPair(Pair pair, Parsed parsed, String key, Instant now, UUID replacesOut,
            UUID replacesIn) {
        UUID movement = UUID.randomUUID();
        return movements.insertLeg(movement, pair.from().id(), kind.outKind(), parsed.amount(), parsed.on(),
                        parsed.description(), parsed.memberId(), key, now, parsed.reason(), replacesOut)
                .then(Mono.defer(() -> movements.insertLeg(movement, pair.to().id(), kind.inKind(), parsed.amount(),
                        parsed.on(), parsed.description(), parsed.memberId(), null, now, parsed.reason(), replacesIn)))
                .thenReturn(movement);
    }

    // ---- checks ----

    /** Amount and accounts as the person typed them; the message for the same account is the scenarios' wording. */
    private Mono<Parsed> parse(TransferRequest request) {
        return Mono.fromCallable(() -> {
            if (request.fromAccountId() == null || request.toAccountId() == null) {
                throw EntryValidator.bad("Choose both accounts");
            }
            if (request.fromAccountId().equals(request.toAccountId())) {
                throw EntryValidator.bad("Choose a different account");
            }
            BigDecimal amount = EntryValidator.amount(request.amount());
            String reason = request.reason() == null || request.reason().isBlank() ? null : request.reason().strip();
            return new Parsed(request.fromAccountId(), request.toAccountId(), amount, request.occurredOn(),
                    EntryValidator.description(request.description()), request.enteredByMemberId(), reason);
        });
    }

    private static Parsed request(Pair pair, TransferRequest request) {
        BigDecimal amount = EntryValidator.amount(request.amount());
        String reason = request.reason() == null || request.reason().isBlank() ? null : request.reason().strip();
        return new Parsed(pair.from().id(), pair.to().id(), amount, request.occurredOn(),
                EntryValidator.description(request.description()), request.enteredByMemberId(), reason);
    }

    /** Both accounts exist, belong to one household (another household's is not found) and hold activity. */
    private Mono<Pair> loadPair(UUID fromId, UUID toId) {
        return accounts.findById(fromId).switchIfEmpty(Mono.error(notFound("Account not found: " + fromId)))
                .zipWith(accounts.findById(toId).switchIfEmpty(Mono.error(notFound("Account not found: " + toId))))
                .flatMap(both -> {
                    if (!both.getT1().householdId().equals(both.getT2().householdId())) {
                        return Mono.error(notFound("Account not found: " + toId));
                    }
                    if (!AccountType.holdsActivity(both.getT1().type())
                            || !AccountType.holdsActivity(both.getT2().type())) {
                        return Mono.error(EntryValidator.bad(WRONG_TYPE));
                    }
                    String refusal = kind.refusal().apply(both.getT1(), both.getT2());
                    if (refusal != null) {
                        return Mono.error(EntryValidator.bad(refusal));
                    }
                    return Mono.just(new Pair(both.getT1(), both.getT2()));
                });
    }

    /**
     * Read under the locks: an account already holding this movement (an edit, a conversion) may be archived, never
     * closed; any other account must be active, so new money never reaches an archived or closed one.
     */
    private Mono<Void> requireStates(Pair pair, Set<UUID> holding) {
        return Mono.fromRunnable(() -> {
            for (Account account : List.of(pair.from(), pair.to())) {
                if (holding.contains(account.id())) {
                    AccountState.requireNotClosed(account);
                } else {
                    AccountState.requireOpen(account);
                }
            }
        });
    }

    /** Removing or restoring a movement changes the Balance of both accounts, so neither may be closed. */
    private Mono<Void> requireNotClosed(List<Leg> legs) {
        return Mono.when(legs.stream().map(leg -> accounts.findById(leg.accountId())
                .map(AccountState::requireNotClosed)).toList());
    }

    private Mono<Void> checkDate(Pair pair, LocalDate on) {
        return Mono.fromRunnable(() -> {
            if (on == null) {
                throw EntryValidator.bad("Enter a date");
            }
            if (on.isAfter(LocalDate.now(clock))) {
                throw EntryValidator.bad("Future activity is not saved as completed history yet");
            }
            for (Account account : List.of(pair.from(), pair.to())) {
                if (on.isBefore(account.openedOn())) {
                    throw EntryValidator.bad("This date is before the opening date of " + account.name());
                }
            }
        });
    }

    /** Undo puts the rows back on their dates, so each account's tracking start must still be on or before them. */
    private Mono<Void> startsStillCover(List<Leg> legs) {
        return Mono.when(legs.stream().map(leg -> accounts.findById(leg.accountId())
                .filter(account -> !leg.occurredOn().isBefore(account.openedOn()))
                .switchIfEmpty(Mono.error(conflict("This " + kind.noun() + " is dated before an account's start."))))
                .toList());
    }

    private Mono<UUID> actor(List<Leg> legs, UUID memberId) {
        return accounts.findById(leg(legs, kind.outKind()).accountId())
                .flatMap(account -> validator.memberLocked(account, memberId));
    }

    private Mono<Void> events(List<Leg> legs, String action, UUID memberId, Instant now) {
        return Mono.when(legs.stream().map(leg -> store.recordEvent(leg.id(), action, memberId, now)).toList());
    }

    private Mono<Void> requireLive(List<Leg> legs) {
        return legs.stream().allMatch(l -> l.removedAt() == null) ? Mono.empty()
                : Mono.error(changed());
    }

    /** Both rows count again and the latest change to them was a restore: this Undo has already happened. */
    private Mono<Boolean> alreadyRestored(List<Leg> legs) {
        if (!legs.stream().allMatch(l -> l.removedAt() == null)) {
            return Mono.just(false);
        }
        return store.lastEventAction(legs.getFirst().id()).map("restored"::equals).defaultIfEmpty(false);
    }

    private Mono<Void> requireRemoved(List<Leg> legs) {
        return legs.stream().allMatch(l -> l.removedAt() != null && l.replacedById() == null) ? Mono.empty()
                : Mono.error(notRemoved());
    }

    private boolean matches(List<Leg> existing, Parsed parsed) {
        Leg out = leg(existing, kind.outKind());
        Leg in = leg(existing, kind.inKind());
        return out.accountId().equals(parsed.fromId()) && in.accountId().equals(parsed.toId())
                && out.amount().compareTo(parsed.amount()) == 0 && out.occurredOn().equals(parsed.on())
                && java.util.Objects.equals(out.description(), parsed.description())
                && java.util.Objects.equals(out.memberId(), parsed.memberId())
                && java.util.Objects.equals(out.reason(), parsed.reason());
    }

    // ---- reading ----

    /** The two rows of a movement, or not found when the id is not a transfer. */
    private Mono<List<Leg>> legs(UUID movementId) {
        return movements.legs(movementId).collectList()
                .filter(list -> list.size() == 2 && list.stream().anyMatch(l -> kind.outKind().equals(l.kind()))
                        && list.stream().anyMatch(l -> kind.inKind().equals(l.kind())))
                .switchIfEmpty(Mono.error(missing(movementId)));
    }

    private static List<UUID> accountsOf(List<Leg> legs, Pair extra) {
        List<UUID> ids = new java.util.ArrayList<>(legs.stream().map(Leg::accountId).toList());
        if (extra != null) {
            ids.add(extra.from().id());
            ids.add(extra.to().id());
        }
        return ids;
    }

    private static Leg leg(List<Leg> legs, String kind) {
        return legs.stream().filter(l -> l.kind().equals(kind)).findFirst().orElseThrow();
    }

    Transfer toTransfer(List<Leg> legs) {
        Leg out = leg(legs, kind.outKind());
        Leg in = leg(legs, kind.inKind());
        String status = legs.stream().anyMatch(l -> l.replacedById() != null) ? "replaced"
                : out.removedAt() != null ? "removed" : "effective";
        return new Transfer(out.movementId(), new Transfer.Leg(out.id(), out.accountId(), out.accountName()),
                new Transfer.Leg(in.id(), in.accountId(), in.accountName()), Money.format(out.amount()),
                out.occurredOn(), out.description(), out.memberId(), out.memberName(), out.createdAt(), out.reason(),
                status);
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw EntryValidator.bad("Missing save key");
        }
        return key;
    }

    private ResponseStatusException changed() {
        return conflict("This " + kind.noun() + " was already changed or removed.");
    }

    private ResponseStatusException notRemoved() {
        return conflict("Only a removed " + kind.noun() + " can be restored.");
    }

    private ResponseStatusException missing(UUID movementId) {
        String noun = kind.noun();
        return notFound(Character.toUpperCase(noun.charAt(0)) + noun.substring(1) + " not found: " + movementId);
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
