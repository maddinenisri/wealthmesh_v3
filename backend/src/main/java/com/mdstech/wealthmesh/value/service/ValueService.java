package com.mdstech.wealthmesh.value.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
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
import com.mdstech.wealthmesh.value.dto.ExtensionReview;
import com.mdstech.wealthmesh.value.dto.ValueHistory;
import com.mdstech.wealthmesh.value.dto.ValueRequest;
import com.mdstech.wealthmesh.value.dto.ValueResult;
import com.mdstech.wealthmesh.value.dto.ValueReview;
import com.mdstech.wealthmesh.value.dto.ValueRow;
import com.mdstech.wealthmesh.value.repository.ValueStore;
import com.mdstech.wealthmesh.value.repository.ValueStore.Point;
import com.mdstech.wealthmesh.value.repository.ValueStore.Row;
import com.mdstech.wealthmesh.wealth.service.WealthService;

import reactor.core.publisher.Mono;

/**
 * Dated values of a property or other asset (T3, DATED_VALUE, PROPERTY, OTHER_ASSET). A value is an estimate on a date,
 * never income, spending or a transfer. A correction is a replacement (the old row stays in history); removal is soft
 * and Undo restores. A value dated after today is refused unless it is saved as a plan, which never counts anywhere.
 * Every writer takes the account row first, reads its save key under that lock, then judges the state, the person
 * (under a share lock) and the rules (D-034, D-045, D-049).
 */
@Service
public class ValueService {

    /** How long a save key stays alive (D-024), the same as every other keyed save. */
    static final Duration KEY_LIFETIME = Duration.ofHours(24);
    private static final LocalDate FAR = LocalDate.of(9999, 12, 31);

    /** What a save returns: the result, and whether it was created now (false for a replayed key). */
    public record Saved(ValueResult result, boolean created) {
    }

    private final AccountRepository accounts;
    private final ValueStore values;
    private final ActivityStore activity;
    private final EntryValidator validator;
    private final TransactionalOperator transactions;
    private final WealthService wealth;
    private final Clock clock;

    public ValueService(AccountRepository accounts, ValueStore values, ActivityStore activity,
            EntryValidator validator, TransactionalOperator transactions, WealthService wealth, Clock clock) {
        this.wealth = wealth;
        this.accounts = accounts;
        this.values = values;
        this.activity = activity;
        this.validator = validator;
        this.transactions = transactions;
        this.clock = clock;
    }

    // ---- reads ----

    /** Every value of the account, the setup value first among equals, and what was done to them. */
    public Mono<ValueHistory> history(UUID accountId) {
        return loadPlannable(accountId).flatMap(account -> Mono.zip(values.rowsOf(accountId).collectList(),
                values.eventsOf(accountId).collectList()).map(both -> {
                    List<Row> rows = both.getT1();
                    Row current = rows.stream().filter(Row::effective)
                            .max(Comparator.comparing(Row::valueOn).thenComparing(Row::createdAt)).orElse(null);
                    boolean initialIsCurrent = current == null || current.valueOn().isBefore(account.openedOn());
                    List<ValueRow> shown = new java.util.ArrayList<>(rows.stream()
                            .map(r -> view(r, current == null ? null : current.id())).toList());
                    if (!AccountType.isDebt(account.type())) {
                        shown.add(new ValueRow(null, account.openedOn(), Money.format(account.openingAmount()),
                                "Initial value", initialIsCurrent ? "current" : "earlier", null, account.createdAt(),
                                null, null, null, false, true, null, null));
                    }
                    shown.sort(Comparator.comparing(ValueRow::valueOn).reversed()
                            .thenComparing(ValueRow::initial));
                    return new ValueHistory(shown, both.getT2());
                }));
    }

    /** What saving, or correcting when `replacesId` is given, would do. Nothing is written. */
    public Mono<ValueReview> review(UUID accountId, UUID replacesId, ValueRequest request) {
        return loadPlannable(accountId).flatMap(account -> {
            Mono<Row> replaced = replacesId == null ? Mono.empty() : correctable(account, replacesId);
            return replaced.map(java.util.Optional::of).defaultIfEmpty(java.util.Optional.empty())
                    .flatMap(old -> Mono.fromCallable(() -> parse(account, request, old.orElse(null)))
                            .flatMap(typed -> resolve(account, typed, old.map(Row::id).orElse(null)))
                            .flatMap(parsed -> Mono.zip(figures(account, parsed, old.map(Row::id).orElse(null)),
                                    totals(account)).map(both -> reviewOf(account, parsed, old.orElse(null),
                                            both.getT1(), both.getT2()))));
        });
    }

    private static ValueReview reviewOf(Account account, Parsed parsed, Row old, Figures f, Totals t) {
        BigDecimal moved = f.after().amount().subtract(f.nowBalance().amount());
        boolean noEarlier = f.earlier() == null || parsed.plan();
        return new ValueReview(account.name(), account.type(), parsed.valueOn(), Money.format(parsed.amount()),
                parsed.reason(), parsed.plan(), noEarlier ? null : Money.format(f.earlier().amount()),
                noEarlier ? null : f.earlier().on(),
                noEarlier ? null : Money.format(parsed.amount().subtract(f.earlier().amount())),
                Money.format(f.nowBalance().amount()), f.nowBalance().on(), Money.format(f.after().amount()),
                f.after().on(), old == null ? null : Money.format(old.amount()), old == null ? null : old.valueOn(),
                money(parsed.payCredit()), money(parsed.interestCredit()), money(t.netWorth()),
                t.netWorth() == null ? null : money(t.netWorth().add(moved)), money(t.retirement()),
                t.retirement() == null ? null : money(t.retirement().add(moved)));
    }

    /** What removing a value would do: the Balance returns to the effective value before it. */
    public Mono<ValueResult> reviewRemoval(UUID accountId, UUID valueId) {
        return loadPlannable(accountId).flatMap(account -> values.byId(valueId)
                .filter(row -> account.id().equals(row.accountId()))
                .switchIfEmpty(Mono.error(notFound("Value not found: " + valueId)))
                .flatMap(row -> Mono.zip(afterWithout(account, row), shown(account.id(), row)).map(both ->
                        new ValueResult(both.getT2(), Money.format(both.getT1().before().amount()),
                                Money.format(both.getT1().after().amount()), both.getT1().after().on()))));
    }

    // ---- writers ----

    /** Saves a value or a plan. 201 when created, 200 for a repeat of the same key (D-024). */
    public Mono<Saved> save(UUID accountId, String key, ValueRequest request) {
        return keyed(accountId, key, null, request);
    }

    /** Corrects a value: a new row replaces it, the old one stays in history with its reason. */
    public Mono<Saved> correct(UUID accountId, UUID valueId, String key, ValueRequest request) {
        return keyed(accountId, key, valueId, request);
    }

    private Mono<Saved> keyed(UUID accountId, String key, UUID replacesId, ValueRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> transactions.transactional(lockedPlannable(accountId)
                        // The key is read under the lock, before any state or date rule: a retry is judged on what
                        // was saved (D-049), never on the account as it is now.
                        .flatMap(account -> values.expireKey(key, cutoff)
                                .then(Mono.defer(() -> values.byKey(key, cutoff)))
                                .flatMap(existing -> replay(account, existing, replacesId, request))
                                .switchIfEmpty(Mono.defer(() -> write(account, key, replacesId, request, now)))))))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This save was already used. Start a new entry."));
    }

    private Mono<Saved> write(Account account, String key, UUID replacesId, ValueRequest request, Instant now) {
        // A new value needs an active account; correcting one is a change of history (archived is fine).
        Account checked = replacesId == null ? AccountState.requireOpen(account)
                : AccountState.requireNotClosed(account);
        Mono<Row> replaced = replacesId == null ? Mono.empty() : correctable(checked, replacesId);
        return replaced.map(java.util.Optional::of).defaultIfEmpty(java.util.Optional.empty())
                .flatMap(old -> Mono.fromCallable(() -> parse(checked, request, old.orElse(null)))
                        .flatMap(typed -> validator.memberLocked(checked, request.enteredByMemberId())
                                .flatMap(member -> resolve(checked, typed, old.map(Row::id).orElse(null))
                                .flatMap(parsed -> figures(checked, parsed, old.map(Row::id).orElse(null))
                                        .flatMap(f -> insert(checked, key, parsed, member, old.orElse(null), f,
                                                now))))));
    }

    private Mono<Saved> insert(Account account, String key, Parsed parsed, UUID member, Row old, Figures f,
            Instant now) {
        Mono<Long> mark = old == null ? Mono.just(1L) : values.markReplaced(old.id(), now);
        return mark.filter(updated -> updated > 0)
                .switchIfEmpty(Mono.error(conflict("This value was already changed.")))
                .then(Mono.defer(() -> values.insert(account.id(), parsed.valueOn(), parsed.amount(), parsed.reason(),
                        parsed.plan(), member, old == null ? null : old.id(), key, fingerprint(parsed, member,
                                old == null ? null : old.id()), now, parsed.payCredit(), parsed.interestCredit())))
                .flatMap(id -> values.recordEvent(account.id(), id, old != null ? "corrected"
                                : parsed.plan() ? "planned" : "saved", member, now, detail(parsed, old))
                        .then(Mono.defer(() -> values.byId(id))))
                .flatMap(row -> shown(account.id(), row).map(v -> new Saved(new ValueResult(v,
                        Money.format(f.nowBalance().amount()), Money.format(f.after().amount()), f.after().on()),
                        true)));
    }

    /** A retry is judged on what was saved: the same figures replay, anything else is a different request. */
    private Mono<Saved> replay(Account account, Row existing, UUID replacesId, ValueRequest request) {
        if (request == null || request.enteredByMemberId() == null) {
            return Mono.error(EntryValidator.bad("Choose who entered this"));
        }
        boolean same = account.id().equals(existing.accountId()) && Objects.equals(existing.replacesId(), replacesId)
                && existing.fingerprint() != null
                && existing.fingerprint().equals(replayFingerprint(account, existing, request));
        return same ? Mono.zip(currentBalance(account, null), shown(account.id(), existing)).map(both ->
                new Saved(new ValueResult(both.getT2(), Money.format(both.getT1().amount()),
                        Money.format(both.getT1().amount()), both.getT1().on()), false))
                : Mono.error(conflict("This save was already used with different details. Start a new entry."));
    }

    /** Removes a value (soft). A repeat of Remove is refused (409); Undo brings it back. */
    public Mono<ValueResult> remove(UUID accountId, UUID valueId, ValueWho who) {
        return change(accountId, valueId, who, true);
    }

    /**
     * Restores a removed value. A repeat of Undo returns the same result (D-044); Undo of a value never removed is
     * 409.
     */
    public Mono<ValueResult> undo(UUID accountId, UUID valueId, ValueWho who) {
        return change(accountId, valueId, who, false);
    }

    public record ValueWho(UUID enteredByMemberId) {
    }

    private Mono<ValueResult> change(UUID accountId, UUID valueId, ValueWho who, boolean removing) {
        Instant now = clock.instant();
        return transactions.transactional(lockedPlannable(accountId)
                .map(AccountState::requireNotClosed)
                .flatMap(account -> values.byId(valueId).filter(row -> account.id().equals(row.accountId()))
                        .switchIfEmpty(Mono.error(notFound("Value not found: " + valueId)))
                        .flatMap(row -> validator.memberLocked(account, who == null ? null : who.enteredByMemberId())
                                .flatMap(member -> removing ? doRemove(account, row, member, now)
                                        : doUndo(account, row, member, now)))));
    }

    private Mono<ValueResult> doRemove(Account account, Row row, UUID member, Instant now) {
        if (row.removedAt() != null) {
            return Mono.error(conflict("This value was already removed."));
        }
        if (row.replacedAt() != null) {
            return Mono.error(conflict("This value was replaced by a correction. Remove the correction instead."));
        }
        return afterWithout(account, row).flatMap(after -> values.markRemoved(row.id(), member, now)
                .filter(updated -> updated > 0).switchIfEmpty(Mono.error(conflict("This value was already removed.")))
                .then(Mono.defer(() -> values.recordEvent(account.id(), row.id(), "removed", member, now,
                        row.planned() ? "Plan removed" : "Value returns to " + Money.format(after.after().amount()))))
                .then(Mono.defer(() -> values.byId(row.id())))
                .map(saved -> new ValueResult(view(saved, null), Money.format(after.before().amount()),
                        Money.format(after.after().amount()), after.after().on())));
    }

    private Mono<ValueResult> doUndo(Account account, Row row, UUID member, Instant now) {
        if (row.removedAt() == null) {
            // Never removed: a repeat of an Undo that already ran returns the same result, anything else is refused.
            return values.latestAction(row.id()).filter("restored"::equals)
                    .switchIfEmpty(Mono.error(conflict("This value was not removed.")))
                    .then(Mono.defer(() -> Mono.zip(currentBalance(account, null), shown(account.id(), row))))
                    .map(both -> new ValueResult(both.getT2(), Money.format(both.getT1().amount()),
                            Money.format(both.getT1().amount()), both.getT1().on()));
        }
        return currentBalance(account, null).flatMap(before -> values.markRestored(row.id())
                .then(Mono.defer(() -> values.recordEvent(account.id(), row.id(), "restored", member, now, null)))
                .then(Mono.defer(() -> values.byId(row.id())))
                .flatMap(restored -> Mono.zip(currentBalance(account, null), shown(account.id(), restored)).map(
                        both -> new ValueResult(both.getT2(), Money.format(before.amount()),
                                Money.format(both.getT1().amount()), both.getT1().on()))));
    }

    // ---- moving the start earlier ----

    /** What moving the start earlier would do (DATED_VALUE_002). Nothing is written. */
    public Mono<ExtensionReview> reviewExtension(UUID accountId, ValueRequest request) {
        return loadValued(accountId).flatMap(account -> Mono.fromCallable(() -> parseExtension(account, request, false))
                .flatMap(parsed -> values.rowsOf(accountId).filter(Row::effective).collectList().map(rows -> {
                    List<ExtensionReview.Point> timeline = new java.util.ArrayList<>();
                    timeline.add(new ExtensionReview.Point("opening", parsed.valueOn(), Money.format(parsed.amount())));
                    timeline.add(new ExtensionReview.Point("value", account.openedOn(),
                            Money.format(account.openingAmount())));
                    rows.stream().sorted(Comparator.comparing(Row::valueOn).thenComparing(Row::createdAt))
                            .forEach(r -> timeline.add(new ExtensionReview.Point("value", r.valueOn(),
                                    Money.format(r.amount()))));
                    return timeline;
                }).flatMap(timeline -> currentBalance(account, null).map(now -> new ExtensionReview(account.name(),
                        account.type(), Money.format(parsed.amount()), parsed.valueOn(),
                        Money.format(account.openingAmount()), account.openedOn(), timeline,
                        Money.format(now.amount()), now.on())))));
    }

    /**
     * Moves the start earlier: the new opening is stored on the account, the old opening becomes a dated value on its
     * own date, and what it replaced is kept in `opening_revision`. No income, spending or transfer. A retry of the
     * same key replays (D-024); the account row is locked first and the key read under that lock.
     */
    public Mono<ExtensionReview> extendStart(UUID accountId, String key, ValueRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> transactions.transactional(lockedValued(accountId)
                        .flatMap(account -> values.expireMoveKey(key, cutoff)
                                .then(Mono.defer(() -> values.moveByKey(key, cutoff)))
                                .flatMap(existing -> replayMove(account, existing, request))
                                .switchIfEmpty(Mono.defer(() -> moveStart(account, key, request, now)))))))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This save was already used. Start a new entry."))
                .flatMap(account -> reviewExtensionAfter(account));
    }

    private Mono<ExtensionReview> reviewExtensionAfter(Account account) {
        return values.rowsOf(account.id()).filter(Row::effective).collectList().flatMap(rows -> {
            List<ExtensionReview.Point> timeline = new java.util.ArrayList<>();
            timeline.add(new ExtensionReview.Point("opening", account.openedOn(),
                    Money.format(account.openingAmount())));
            rows.stream().sorted(Comparator.comparing(Row::valueOn).thenComparing(Row::createdAt)).forEach(
                    r -> timeline.add(new ExtensionReview.Point("value", r.valueOn(), Money.format(r.amount()))));
            return currentBalance(account, null).map(now -> new ExtensionReview(account.name(), account.type(),
                    Money.format(account.openingAmount()), account.openedOn(), null, null, timeline,
                    Money.format(now.amount()), now.on()));
        });
    }

    private Mono<Account> moveStart(Account account, String key, ValueRequest request, Instant now) {
        AccountState.requireNotClosed(account);
        Parsed parsed = parseExtension(account, request, true);
        return validator.memberLocked(account, request.enteredByMemberId()).flatMap(member -> values.moveStart(
                        account.id(), account.openingAmount(), account.openedOn(), parsed.amount(), parsed.valueOn(),
                        parsed.reason(), member, key, now)
                // Dated as old as the account, so a value saved on the same date always outranks it (the tie is
                // broken by the time of saving): moving the start never changes the Balance.
                .then(Mono.defer(() -> values.insert(account.id(), account.openedOn(), account.openingAmount(),
                        "Value when tracking began", false, member, null, null,
                        "start|" + account.id(), account.createdAt(), null, null)))
                .flatMap(id -> values.recordEvent(account.id(), id, "start_moved", member, now,
                        "Start moved from " + account.openedOn() + " to " + parsed.valueOn() + ": "
                                + parsed.reason()))
                .then(Mono.defer(() -> accounts.findById(account.id()))));
    }

    private Mono<Account> replayMove(Account account, ValueStore.Move existing, ValueRequest request) {
        boolean same = account.id().equals(existing.accountId()) && request != null
                && request.amount() instanceof String text && Money.parse(text)
                        .filter(a -> a.compareTo(existing.amount()) == 0).isPresent()
                && existing.openedOn().equals(request.valueOn())
                && Objects.equals(existing.reason(), request.reason() == null ? null : request.reason().strip())
                && existing.memberId().equals(request.enteredByMemberId());
        return same ? Mono.just(account)
                : Mono.error(conflict("This save was already used with different details. Start a new entry."));
    }

    /** The new start must be earlier than the current one; a reason is required to save it. */
    private Parsed parseExtension(Account account, ValueRequest request, boolean saving) {
        if (request == null) {
            throw EntryValidator.bad("Enter a value");
        }
        BigDecimal amount = amountOf(account, request);
        if (request.valueOn() == null) {
            throw EntryValidator.bad("Enter a date");
        }
        if (!request.valueOn().isBefore(account.openedOn())) {
            throw EntryValidator.bad("The new start must be before the current start (" + account.openedOn() + ")");
        }
        return new Parsed(amount, request.valueOn(), reasonOf(request, saving), false);
    }

    // ---- rules ----

    /** A parsed request. */
    private record Parsed(BigDecimal amount, LocalDate valueOn, String reason, boolean plan, BigDecimal payCredit,
            BigDecimal interestCredit) {

        Parsed(BigDecimal amount, LocalDate valueOn, String reason, boolean plan) {
            this(amount, valueOn, reason, plan, null, null);
        }

        static Parsed of(BigDecimal amount, LocalDate valueOn, String reason, boolean plan,
                PlanStatements.Credits credits) {
            return credits == null ? new Parsed(amount, valueOn, reason, plan)
                    : new Parsed(amount, valueOn, reason, plan, credits.pay(), credits.interest());
        }

        boolean credited() {
            return payCredit != null;
        }

        Parsed withAmount(BigDecimal resolved) {
            return new Parsed(resolved, valueOn, reason, plan, payCredit, interestCredit);
        }
    }

    /** The household and Retirement totals now, for a defined benefit's review; both null for any other account. */
    private record Totals(BigDecimal netWorth, BigDecimal retirement) {
    }

    private static final Totals NO_TOTALS = new Totals(null, null);

    private Mono<Totals> totals(Account account) {
        if (!AccountType.DEFINED_BENEFIT.wire().equals(account.type())) {
            return Mono.just(NO_TOTALS);
        }
        return wealth.summary(null).map(summary -> new Totals(new BigDecimal(summary.netWorth()),
                new BigDecimal(summary.retirement().total())));
    }

    private static String money(BigDecimal amount) {
        return amount == null ? null : Money.format(amount);
    }

    /**
     * A statement with credits has no typed amount: the plan value is the value in force on its date (leaving out
     * the value it corrects) plus both credits. Any other request is already complete.
     */
    private Mono<Parsed> resolve(Account account, Parsed parsed, UUID excluding) {
        if (!parsed.credited()) {
            return Mono.just(parsed);
        }
        return effectiveOn(account, parsed.valueOn(), excluding).map(base -> parsed.withAmount(
                base.amount().add(parsed.payCredit()).add(parsed.interestCredit())));
    }

    private Parsed parse(Account account, ValueRequest request, Row replaced) {
        if (request == null) {
            throw EntryValidator.bad("Enter a value");
        }
        boolean plan = Boolean.TRUE.equals(request.plan());
        PlanStatements.Credits credits = PlanStatements.credits(account, request, plan, replaced != null);
        BigDecimal amount = credits == null ? amountOf(account, request) : null;
        LocalDate valueOn = dateOf(request, replaced);
        if (plan && replaced != null) {
            throw EntryValidator.bad("A plan is changed by removing it and saving a new one");
        }
        checkDate(account, valueOn, plan);
        if (AccountType.isDebt(account.type()) && !plan) {
            throw EntryValidator.bad("What is owed changes by a payment or Update balance owed. A future amount can "
                    + "be saved as a plan.");
        }
        return Parsed.of(amount, valueOn, reasonOf(request, replaced != null), plan, credits);
    }

    /** The date typed, else the date of the value being corrected. */
    private static LocalDate dateOf(ValueRequest request, Row replaced) {
        LocalDate valueOn = request.valueOn() != null ? request.valueOn()
                : replaced == null ? null : replaced.valueOn();
        if (valueOn == null) {
            throw EntryValidator.bad("Enter a date");
        }
        return valueOn;
    }

    /** The reason, trimmed; null when blank. A correction must give one. */
    private static String reasonOf(ValueRequest request, boolean required) {
        String reason = request.reason() == null ? "" : request.reason().strip();
        if (reason.length() > 200) {
            throw EntryValidator.bad("Reason must be 200 characters or fewer");
        }
        if (reason.isEmpty() && required) {
            throw EntryValidator.bad("Enter a reason");
        }
        return reason.isEmpty() ? null : reason;
    }

    private static BigDecimal amountOf(Account account, ValueRequest request) {
        if (!(request.amount() instanceof String text) || Money.parse(text).isEmpty()) {
            throw EntryValidator.bad("Enter a valid amount");
        }
        BigDecimal amount = Money.parse(text).orElseThrow();
        if (AccountType.isDebt(account.type())) {
            // A debt's figure is typed as an amount owed and kept with the debt's sign, like its Balance (D-053).
            if (amount.signum() < 0) {
                throw EntryValidator.bad("Enter zero or a positive amount owed");
            }
            return amount.negate();
        }
        if (amount.signum() < 0) {
            throw EntryValidator.bad(PlanStatements.negativeMessage(account));
        }
        return amount;
    }

    /** A value is dated today or earlier and not before the account's start; a plan is dated after today. */
    private void checkDate(Account account, LocalDate valueOn, boolean plan) {
        LocalDate today = LocalDate.now(clock);
        PlanStatements.checkDate(account, valueOn, plan, today);
        if (plan && !valueOn.isAfter(today)) {
            throw EntryValidator.bad("A plan is dated after today. Choose a date on or before today to record a "
                    + "value.");
        }
        if (!plan && valueOn.isAfter(today)) {
            throw EntryValidator.bad("Future values are not completed account history. Save it as a future plan, "
                    + "or choose a date on or before today.");
        }
        if (!plan && valueOn.isBefore(account.openedOn())) {
            throw EntryValidator.bad("This date is before the account's start (" + account.openedOn()
                    + "). Review extending its history first.");
        }
    }

    private Mono<Row> correctable(Account account, UUID valueId) {
        return values.byId(valueId).filter(row -> account.id().equals(row.accountId()))
                .switchIfEmpty(Mono.error(notFound("Value not found: " + valueId)))
                .flatMap(row -> row.removedAt() != null ? Mono.<Row>error(conflict("This value was removed."))
                        : row.replacedAt() != null ? Mono.<Row>error(conflict("This value was already corrected."))
                        : row.planned() ? Mono.<Row>error(conflict("A plan is changed by removing it and saving a new "
                                + "one.")) : Mono.just(row));
    }

    /** The figures a save or its review shows. */
    private record Figures(Point earlier, Point nowBalance, Point after) {
    }

    private Mono<Figures> figures(Account account, Parsed parsed, UUID excluding) {
        Mono<Point> earlier = parsed.plan() ? Mono.empty() : effectiveOn(account, parsed.valueOn(), excluding);
        return Mono.zip(earlier.map(java.util.Optional::of).defaultIfEmpty(java.util.Optional.empty()),
                currentBalance(account, null), currentBalance(account, excluding)).map(all -> {
                    Point now = all.getT2();
                    Point rest = all.getT3();
                    // A plan changes nothing. Otherwise the new value is the latest unless a later one exists.
                    Point after = parsed.plan() ? now : parsed.valueOn().isBefore(rest.on()) ? rest
                            : new Point(parsed.amount(), parsed.valueOn());
                    return new Figures(all.getT1().orElse(null), now, after);
                });
    }

    private Mono<Point> effectiveOn(Account account, LocalDate on, UUID excluding) {
        return values.effectiveOn(account.id(), on, excluding)
                .switchIfEmpty(Mono.defer(() -> on.isBefore(account.openedOn()) ? Mono.empty()
                        : Mono.just(new Point(account.openingAmount(), account.openedOn()))));
    }

    /** The account's one Balance: its latest effective value, or the setup value when none. */
    private Mono<Point> currentBalance(Account account, UUID excluding) {
        if (AccountType.isDebt(account.type())) {
            // A debt reads its payments and corrections, never a dated value: a plan changes nothing (D-053).
            return activity.deltaOf(account.id()).map(delta -> new Point(account.openingAmount().add(delta.amount()),
                    LocalDate.now(clock)));
        }
        return values.effectiveOn(account.id(), FAR, excluding)
                .switchIfEmpty(Mono.fromSupplier(() -> new Point(account.openingAmount(), account.openedOn())));
    }

    private record Without(Point before, Point after) {
    }

    private Mono<Without> afterWithout(Account account, Row row) {
        return Mono.zip(currentBalance(account, null), currentBalance(account, row.id()))
                .map(both -> new Without(both.getT1(), both.getT2()));
    }

    // ---- helpers ----

    /** A row as the history shows it, "current" when it is the account's Balance now. */
    private Mono<ValueRow> shown(UUID accountId, Row row) {
        return values.currentId(accountId).map(id -> view(row, id)).defaultIfEmpty(view(row, null));
    }

    private ValueRow view(Row row, UUID currentId) {
        String status = row.removedAt() != null ? "removed" : row.replacedAt() != null ? "replaced"
                : row.planned() ? "planned" : row.id().equals(currentId) ? "current" : "earlier";
        return new ValueRow(row.id(), row.valueOn(), Money.format(row.amount()), row.reason(), status,
                row.enteredBy(), row.createdAt(), row.replacesId(), row.removedBy(), row.removedAt(), row.planned(),
                false, money(row.payCredit()), money(row.interestCredit()));
    }

    private static String detail(Parsed parsed, Row old) {
        if (parsed.credited() && old == null) {
            return "Statement for " + parsed.valueOn() + ": pay credit " + dollars(parsed.payCredit())
                    + " and benefit interest " + dollars(parsed.interestCredit()) + ", plan value "
                    + dollars(parsed.amount());
        }
        return old == null ? (parsed.plan() ? "Plan for " : "Value for ") + parsed.valueOn() + ": "
                + dollars(parsed.amount())
                : "Replaces " + dollars(old.amount()) + " dated " + old.valueOn() + " with "
                + dollars(parsed.amount()) + " dated " + parsed.valueOn();
    }

    /** "$320,000.00": the way a person reads an amount in a sentence. */
    private static String dollars(BigDecimal amount) {
        return String.format(java.util.Locale.US, "$%,.2f", amount);
    }

    private static String fingerprint(Parsed parsed, UUID member, UUID replaces) {
        String figure = parsed.credited() ? "credits:" + Money.format(parsed.payCredit()) + "/"
                + Money.format(parsed.interestCredit()) : Money.format(parsed.amount());
        return String.join("|", String.valueOf(member), String.valueOf(parsed.valueOn()), figure,
                String.valueOf(parsed.reason()), String.valueOf(parsed.plan()), String.valueOf(replaces));
    }

    /** The fingerprint the request would have had, as sent (the date of a correction may be left out). */
    private String replayFingerprint(Account account, Row existing, ValueRequest request) {
        Parsed parsed;
        try {
            LocalDate on = request.valueOn() != null ? request.valueOn()
                    : existing.replacesId() != null ? existing.valueOn() : null;
            if (on == null) {
                throw EntryValidator.bad("Enter a date");
            }
            parsed = replayParsed(account, request, on);
        } catch (ResponseStatusException e) {
            return "";
        }
        return fingerprint(parsed, request.enteredByMemberId(), existing.replacesId());
    }

    private static Parsed replayParsed(Account account, ValueRequest request, LocalDate on) {
        String reason = request.reason() == null || request.reason().isBlank() ? null : request.reason().strip();
        boolean plan = Boolean.TRUE.equals(request.plan());
        if (request.payCredit() != null || request.interestCredit() != null) {
            return new Parsed(null, on, reason, plan, PlanStatements.credit(request.payCredit(), "Pay credit"),
                    PlanStatements.credit(request.interestCredit(), "Benefit interest"));
        }
        if (!(request.amount() instanceof String text) || Money.parse(text).isEmpty()) {
            throw EntryValidator.bad("Enter a valid amount");
        }
        BigDecimal typed = Money.parse(text).orElseThrow();
        // A debt's figure is kept with the debt's sign (see amountOf).
        return new Parsed(AccountType.isDebt(account.type()) ? typed.negate() : typed, on, reason, plan);
    }

    private Mono<Account> lockedValued(UUID accountId) {
        return activity.lockAccount(accountId)
                .switchIfEmpty(Mono.error(notFound("Account not found: " + accountId)))
                .then(Mono.defer(() -> loadValued(accountId)));
    }

    /** A valued account, or a debt (which takes plans only). */
    private Mono<Account> lockedPlannable(UUID accountId) {
        return activity.lockAccount(accountId)
                .switchIfEmpty(Mono.error(notFound("Account not found: " + accountId)))
                .then(Mono.defer(() -> loadPlannable(accountId)));
    }

    private Mono<Account> loadPlannable(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(notFound("Account not found: " + id)))
                .flatMap(account -> AccountType.isValued(account.type()) || AccountType.isDebt(account.type())
                        ? Mono.just(account)
                        : Mono.error(EntryValidator.bad("Only a property or other asset has dated values")));
    }

    private Mono<Account> loadValued(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(notFound("Account not found: " + id)))
                .flatMap(account -> AccountType.isValued(account.type()) ? Mono.just(account)
                        : Mono.error(EntryValidator.bad("Only a property or other asset has dated values")));
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw EntryValidator.bad("Missing save key");
        }
        return key;
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
