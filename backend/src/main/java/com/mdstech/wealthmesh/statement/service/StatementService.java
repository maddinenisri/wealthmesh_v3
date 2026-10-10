package com.mdstech.wealthmesh.statement.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.service.AccountService;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.statement.domain.Statement;
import com.mdstech.wealthmesh.statement.dto.RemovalReview;
import com.mdstech.wealthmesh.statement.dto.StatementRequest;
import com.mdstech.wealthmesh.statement.dto.StatementResponse;
import com.mdstech.wealthmesh.statement.dto.StatementReview;
import com.mdstech.wealthmesh.statement.repository.StatementRepository;
import com.mdstech.wealthmesh.statement.repository.StatementStore;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Attaches and revises optional supporting statements. A statement never changes Balance (V2_SUPPORTING_RECORD_003);
 * a revision is a new row linked to the version it replaces, and the database allows only one revision per version.
 */
@Service
public class StatementService {

    private static final Duration KEY_LIFETIME = Duration.ofHours(24);

    /** The saved statement and whether this call created it (false for a replay). */
    public record Saved(StatementResponse statement, boolean created) {
    }

    private record Parsed(LocalDate statementOn, BigDecimal balance, String note, String reason, UUID memberId,
            boolean supportsOpening) {
    }

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final StatementRepository statements;
    private final StatementStore store;
    private final ActivityStore lock;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public StatementService(AccountRepository accounts, EntryValidator validator, StatementRepository statements,
            StatementStore store, ActivityStore lock, Clock clock, TransactionalOperator transactions) {
        this.lock = lock;
        this.transactions = transactions;
        this.accounts = accounts;
        this.validator = validator;
        this.statements = statements;
        this.store = store;
        this.clock = clock;
    }

    public Flux<StatementResponse> ofAccount(UUID accountId) {
        return account(accountId).thenMany(Flux.defer(() -> store.ofAccount(accountId)));
    }

    public Mono<Saved> attach(UUID accountId, String key, StatementRequest request) {
        return save(accountId, null, key, request);
    }

    /** Only the latest version can be revised; the original stays, linked to its replacement. */
    public Mono<Saved> revise(UUID accountId, UUID statementId, String key, StatementRequest request) {
        return save(accountId, statementId, key, request);
    }

    private Mono<Saved> save(UUID accountId, UUID replacesId, String key, StatementRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> account(accountId)))
                .flatMap(account -> parse(account, request, replacesId != null)
                        // The account row is locked, so the same key sent twice at once replays instead of failing.
                        .flatMap(parsed -> transactions.transactional(lock.lockAccount(accountId)
                                // A statement is a record, not money: archived may take one, closed may not.
                                .then(Mono.defer(() -> account(accountId)))
                                // The key is read first; the state gate meets only a new key (Q-040).
                                .flatMap(locked -> store.expireKey(key, cutoff)
                                        .then(Mono.defer(() -> statements
                                                .findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)))
                                        .flatMap(existing -> replay(existing, accountId, replacesId, parsed))
                                        .switchIfEmpty(Mono.defer(() -> Mono
                                                .fromCallable(() -> AccountState.requireNotDraft(
                                                        AccountState.requireNotClosed(locked)))
                                                .then(Mono.defer(() -> requireLinkable(locked, replacesId, parsed)))
                                                .then(Mono.defer(() -> insert(accountId, replacesId, key, parsed,
                                                        now)))))))))
                .onErrorMap(DuplicateKeyException.class, e -> conflict("This statement was already revised."));
    }

    private Mono<Saved> insert(UUID accountId, UUID replacesId, String key, Parsed parsed, Instant now) {
        Mono<Void> original = replacesId == null ? Mono.empty()
                : store.byId(replacesId).filter(s -> accountId.equals(s.accountId()))
                        .switchIfEmpty(Mono.error(notFound("Statement not found: " + replacesId)))
                        .flatMap(s -> s.removedAt() == null ? Mono.<Void>empty()
                                : Mono.error(conflict("This statement was removed, so it cannot be revised.")));
        return original.then(Mono.defer(() -> statements.save(new Statement(null, accountId, parsed.statementOn(),
                        parsed.balance(), parsed.note(), parsed.reason(), replacesId, parsed.memberId(), key, now))))
                .flatMap(saved -> link(accountId, replacesId, saved.id(), parsed)
                        .then(Mono.defer(() -> store.byId(saved.id()))))
                .map(s -> new Saved(s, true));
    }

    /** A new statement backs the opening review when asked; a revision takes over the link of its original. */
    private Mono<Void> link(UUID accountId, UUID replacesId, UUID savedId, Parsed parsed) {
        if (replacesId != null) {
            return store.relink(replacesId, savedId).then();
        }
        return parsed.supportsOpening() ? store.link(accountId, savedId).then() : Mono.empty();
    }

    /** A statement backs the opening of an investment account only, and an opening uses one statement. */
    private Mono<Void> requireLinkable(Account account, UUID replacesId, Parsed parsed) {
        if (replacesId != null || !parsed.supportsOpening()) {
            return Mono.empty();
        }
        if (!AccountType.isInvestment(account.type())) {
            return Mono.error(EntryValidator.bad("A statement can back the opening of an investment account only"));
        }
        return store.openingStatement(account.id()).flatMap(existing -> Mono.<Void>error(
                conflict(account.name() + "'s opening already uses a statement, even if it was removed. "
                        + "Undo the removal to use it again, or revise the active one.")));
    }

    private Mono<Saved> replay(Statement existing, UUID accountId, UUID replacesId, Parsed parsed) {
        boolean same = existing.accountId().equals(accountId) && Objects.equals(existing.replacesId(), replacesId)
                && existing.statementOn().equals(parsed.statementOn())
                && existing.balance().compareTo(parsed.balance()) == 0
                && Objects.equals(existing.note(), parsed.note()) && Objects.equals(existing.reason(), parsed.reason())
                && existing.enteredByMemberId().equals(parsed.memberId());
        if (!same) {
            return Mono.error(conflict("This save was already used with different details. Start a new entry."));
        }
        return store.byId(existing.id()).flatMap(s -> differentLink(s, replacesId, parsed)
                ? Mono.<Saved>error(conflict("This save was already used with different details. Start a new entry."))
                : Mono.just(new Saved(s, false)));
    }

    /** A latest original asked to back the opening differently from how it was saved is a different save. */
    private static boolean differentLink(StatementResponse saved, UUID replacesId, Parsed parsed) {
        return saved.latest() && replacesId == null && saved.usedByOpening() != parsed.supportsOpening();
    }

    private Mono<Parsed> parse(Account account, StatementRequest request, boolean revision) {
        return Mono.fromCallable(() -> {
            requireCorrection(account, request.proposedCorrection());
            if (request.statementOn() == null) {
                throw EntryValidator.bad("Enter the statement date");
            }
            if (request.statementOn().isAfter(LocalDate.now(clock))) {
                throw EntryValidator.bad("A statement cannot be dated in the future");
            }
            if (!(request.balance() instanceof String text) || Money.parse(text).isEmpty()) {
                throw EntryValidator.bad("Enter a valid amount");
            }
            String reason = text(request.reason(), 500, "Reason");
            if (revision && reason == null) {
                throw EntryValidator.bad("Enter a reason for the corrected statement");
            }
            BigDecimal shown = AccountService.signed(account.type(), Money.parse(text).orElseThrow(),
                    request.balanceSide());
            return new Object[] { shown, text(request.note(), 200, "Note"), reason };
        }).flatMap(parts -> validator.member(account, request.enteredByMemberId())
                .map(memberId -> new Parsed(request.statementOn(), (BigDecimal) parts[0], (String) parts[1],
                        (String) parts[2], memberId, Boolean.TRUE.equals(request.supportsOpening()))));
    }

    private static final String LATER = "Cash and quantity corrections are not available yet. "
            + "Only a price can be recorded now.";

    /** The same rule for the review and the save: only a price may be proposed, and only for an investment account. */
    private static void requireCorrection(Account account, String proposed) {
        if (proposed == null || proposed.isBlank()) {
            return;
        }
        if (!AccountType.isInvestment(account.type())) {
            throw EntryValidator.bad("A correction is proposed for an investment account's statement only");
        }
        switch (proposed.strip()) {
            case "price" -> {
            }
            case "cash", "quantity" -> throw EntryValidator.bad(LATER);
            default -> throw EntryValidator.bad("Choose a price correction");
        }
    }

    /**
     * The review of a statement for an investment account (V2_HOLDINGS_005): the statement total against the calculated
     * Balance on its date, computed here and shown as it is. Writes nothing; the same checks as the save.
     */
    public Mono<StatementReview> review(UUID accountId, StatementRequest request) {
        return account(accountId).flatMap(account -> {
            if (!AccountType.isInvestment(account.type())) {
                return Mono.<StatementReview>error(EntryValidator.bad(
                        "A difference is reviewed for an investment account's statement only"));
            }
            // The save's state gate, told before Confirm: a closed account or a draft takes no statement.
            return Mono.fromCallable(() -> AccountState.requireNotDraft(AccountState.requireNotClosed(account)))
                    .then(Mono.defer(() -> parse(account, request, false)))
                    .flatMap(parsed -> lock.changeUpTo(accountId, parsed.statementOn(), null)
                            .map(change -> reviewOf(account, parsed, change)));
        });
    }

    private static StatementReview reviewOf(Account account, Parsed parsed, BigDecimal change) {
        BigDecimal total = parsed.balance();
        if (parsed.statementOn().isBefore(account.openedOn())) {
            return new StatementReview(parsed.statementOn(), Money.format(total), null, null, false, List.of(),
                    account.name() + " began tracking on " + account.openedOn() + ", so there is no calculated "
                            + "Balance on " + parsed.statementOn() + " to compare. Saving the statement changes "
                            + "no Balance.", "Statement saved. A statement never changes the Balance.");
        }
        BigDecimal calculated = account.openingAmount().add(change);
        BigDecimal difference = total.subtract(calculated);
        if (difference.signum() == 0) {
            return new StatementReview(parsed.statementOn(), Money.format(total), Money.format(calculated),
                    Money.format(difference), false, List.of(), "The statement total " + Money.dollars(total)
                            + " matches the calculated Balance on " + parsed.statementOn() + ". Nothing needs "
                            + "correcting, and saving the statement changes no Balance.",
                    "Statement saved. It matches the calculated Balance on " + parsed.statementOn()
                            + ". A statement never changes the Balance.");
        }
        String message = "The statement total is " + Money.dollars(total) + " and the calculated Balance on "
                + parsed.statementOn() + " is " + Money.dollars(calculated) + ": a difference of "
                + Money.dollars(difference.abs()) + ". Which cash, quantity or price needs correction? " + LATER
                + " Saving the statement changes no Balance.";
        return new StatementReview(parsed.statementOn(), Money.format(total), Money.format(calculated),
                Money.format(difference), true, List.of("price"), message,
                "Statement saved. The statement total is " + Money.dollars(total) + " and the calculated Balance on "
                        + parsed.statementOn() + " is " + Money.dollars(calculated) + ": a difference of "
                        + Money.dollars(difference.abs()) + ". The Balance stays " + Money.dollars(calculated)
                        + "; a statement never changes it. To correct the difference, record a price.");
    }

    /** What removing a statement does: who uses it, and that the recorded cash, shares, price and Balance stay. */
    public Mono<RemovalReview> removalReview(UUID accountId, UUID statementId) {
        return investmentAccount(accountId).flatMap(account -> ownStatement(accountId, statementId)
                .flatMap(statement -> Mono.zip(store.openingUses(statementId), lock.deltaOf(accountId))
                        .map(known -> review(account, statement, known.getT1().intValue(),
                                account.openingAmount().add(known.getT2().amount())))));
    }

    private static RemovalReview review(Account account, StatementResponse statement, int uses, BigDecimal balance) {
        String used = uses == 0 ? "No opening breakdown uses this statement."
                : uses + " opening breakdown" + (uses == 1 ? " uses" : "s use") + " this statement.";
        String message = used + " Removing it keeps the recorded cash, shares and price, and the Balance stays "
                + Money.dollars(balance) + ". The removal stays in history.";
        return new RemovalReview(statement.id(), uses, Money.format(balance), message);
    }

    /**
     * Removes a statement from the active records without touching money: the opening breakdown, cash, holdings and
     * Balance stay, and the removal (who and when) stays in history. A repeat returns the removed statement unchanged.
     */
    public Mono<StatementResponse> remove(UUID accountId, UUID statementId, UUID memberId) {
        return investmentAccount(accountId).then(Mono.defer(() -> transactions.transactional(lock.lockAccount(accountId)
                .then(Mono.defer(() -> investmentAccount(accountId)))
                .flatMap(locked -> ownStatement(accountId, statementId)
                        .flatMap(statement -> statement.removedAt() != null ? Mono.just(statement)
                                : Mono.fromCallable(() -> AccountState.requireNotClosed(locked))
                                        .then(Mono.defer(() -> validator.memberLocked(locked, memberId)))
                                        .flatMap(member -> {
                                            Instant at = clock.instant();
                                            return store.markRemoved(statementId, member, at)
                                                    .then(store.addEvent(statementId, "removed", member, at));
                                        })
                                        .then(Mono.defer(() -> store.byId(statementId))))))));
    }

    /**
     * Undo of a removal (SUPPORTING_RECORD_002): the statement is an active supporting record again, once, with the
     * same opening link; no money moves. It takes the account lock first, so it waits for a racing lifecycle change
     * and then sees what committed. Undoing a statement that is not removed changes nothing and returns it (D-044).
     * The removal and the Undo both stay in `events`, with who did each.
     */
    public Mono<StatementResponse> restore(UUID accountId, UUID statementId, UUID memberId) {
        return investmentAccount(accountId).then(Mono.defer(() -> transactions.transactional(lock.lockAccount(accountId)
                .then(Mono.defer(() -> investmentAccount(accountId)))
                .flatMap(locked -> ownStatement(accountId, statementId)
                        .flatMap(statement -> statement.removedAt() == null ? Mono.just(statement)
                                : Mono.fromCallable(() -> AccountState.requireNotClosed(locked))
                                        .then(Mono.defer(() -> validator.memberLocked(locked, memberId)))
                                        .flatMap(member -> store.markRestored(statementId)
                                                .then(store.addEvent(statementId, "restored", member,
                                                        clock.instant())))
                                        .then(Mono.defer(() -> store.byId(statementId))))))));
    }

    /** Removing a statement belongs to an investment account's opening (D-059); other types keep theirs. */
    private Mono<Account> investmentAccount(UUID accountId) {
        return account(accountId).filter(account -> AccountType.isInvestment(account.type()))
                .switchIfEmpty(Mono.error(EntryValidator.bad(
                        "Only an investment account's statement can be removed or restored")));
    }

    private Mono<StatementResponse> ownStatement(UUID accountId, UUID statementId) {
        return store.byId(statementId).filter(s -> accountId.equals(s.accountId()))
                .switchIfEmpty(Mono.error(notFound("Statement not found: " + statementId)));
    }

    private static String text(String value, int max, String label) {
        String text = value == null || value.isBlank() ? null : value.strip();
        if (text != null && text.length() > max) {
            throw EntryValidator.bad(label + " must be " + max + " characters or fewer");
        }
        return text;
    }

    private Mono<Account> account(UUID accountId) {
        return accounts.findById(accountId).switchIfEmpty(Mono.error(notFound("Account not found: " + accountId)))
                .filter(account -> AccountType.takesStatements(account.type()))
                .switchIfEmpty(Mono.error(EntryValidator.bad(
                        "Supporting statements belong to an account that holds money or investments")));
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
