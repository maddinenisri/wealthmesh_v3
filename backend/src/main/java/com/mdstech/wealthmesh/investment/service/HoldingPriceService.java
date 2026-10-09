package com.mdstech.wealthmesh.investment.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.account.service.AccountService;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.investment.dto.PriceHistory;
import com.mdstech.wealthmesh.investment.dto.PriceHistory.BalancePoint;
import com.mdstech.wealthmesh.investment.dto.PriceRequest;
import com.mdstech.wealthmesh.investment.dto.PriceResult;
import com.mdstech.wealthmesh.investment.dto.PriceReview;
import com.mdstech.wealthmesh.investment.dto.PriceView;
import com.mdstech.wealthmesh.investment.repository.HoldingDeltaSql;
import com.mdstech.wealthmesh.investment.repository.HoldingPriceStore;
import com.mdstech.wealthmesh.investment.repository.OpeningStore;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.wealth.service.WealthService;

import reactor.core.publisher.Mono;

/**
 * Prices recorded on holdings after setup (slice 19b, V2_HOLDINGS_008, V2_WEALTH_004). A price is a dated observation
 * on one holding (account and symbol). It moves the account's one Balance through the price term every Balance reader
 * takes ({@link HoldingDeltaSql}); it is never income and creates no entry. The review and the save judge the same
 * rules: an active account, a held symbol, a valid price (zero is a known price), a date that is not in the future,
 * not before the tracking start and not before the symbol's opening price date, and an active member. The save takes
 * the account lock first, reads its key under that lock and only then the state gate (D-049), so a retry replays what
 * was saved even after the account was archived.
 */
@Service
public class HoldingPriceService {

    private static final Duration KEY_LIFETIME = Duration.ofHours(24);
    private static final String DIFFERENT = "This save was already used with different details. Start a new entry.";

    /** A price request after its shape is checked: no state of the account or member is read yet. */
    private record Shape(String symbol, BigDecimal price, LocalDate valueOn, UUID memberId) {
    }

    /** What the rules allow for one request: the account, its lines of the symbol and where each price now stands. */
    private record Judged(Account account, Shape shape, List<OpeningComponents.Line> lines,
            List<HoldingPriceStore.Effective> effective) {
    }

    private final AccountRepository accounts;
    private final AccountService accountService;
    private final OpeningStore openings;
    private final HoldingPriceStore prices;
    private final ActivityStore lock;
    private final EntryValidator validator;
    private final WealthService wealth;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public HoldingPriceService(AccountRepository accounts, AccountService accountService, OpeningStore openings,
            HoldingPriceStore prices, ActivityStore lock, EntryValidator validator, WealthService wealth, Clock clock,
            TransactionalOperator transactions) {
        this.accounts = accounts;
        this.accountService = accountService;
        this.openings = openings;
        this.prices = prices;
        this.lock = lock;
        this.validator = validator;
        this.wealth = wealth;
        this.clock = clock;
        this.transactions = transactions;
    }

    // ---- the review ---------------------------------------------------------------------------------------------

    /** The review of a price: the same checks as the save, writing nothing. */
    public Mono<PriceReview> review(UUID accountId, PriceRequest request) {
        return Mono.fromCallable(() -> shape(request)).flatMap(shape -> account(accountId)
                .flatMap(account -> judge(account, shape, false))
                .flatMap(judged -> arithmetic(judged)));
    }

    private Mono<PriceReview> arithmetic(Judged judged) {
        Shape shape = judged.shape();
        BigDecimal before = BigDecimal.ZERO;
        BigDecimal after = BigDecimal.ZERO;
        BigDecimal shares = BigDecimal.ZERO;
        for (int i = 0; i < judged.lines().size(); i++) {
            OpeningComponents.Line line = judged.lines().get(i);
            if (!line.symbol().equals(shape.symbol())) {
                continue;
            }
            HoldingPriceStore.Effective now = judged.effective().get(i);
            // The new price counts when it is dated on or after the one now counted (a tie replaces it).
            BigDecimal next = shape.valueOn().isBefore(now.priceOn()) ? now.price() : shape.price();
            before = before.add(value(line.quantity(), now.price()));
            after = after.add(value(line.quantity(), next));
            shares = shares.add(line.quantity());
        }
        BigDecimal moved = after.subtract(before);
        BigDecimal held = shares;
        BigDecimal b4 = before;
        BigDecimal af = after;
        return Mono.zip(accountService.findById(judged.account().id()), wealth.summary(null),
                prices.counted(judged.account().id(), shape.symbol(), shape.valueOn()).map(java.util.Optional::of)
                        .defaultIfEmpty(java.util.Optional.empty()))
                .map(all -> {
                    BigDecimal balance = new BigDecimal(all.getT1().balance().amount());
                    BigDecimal netWorth = new BigDecimal(all.getT2().netWorth());
                    PriceView replaces = all.getT3().orElse(null);
                    return new PriceReview(shape.symbol(), shown(held), OpeningComponents.priceText(shape.price()),
                            shape.valueOn(), shape.price().signum() == 0, moved.signum() != 0, Money.format(b4),
                            Money.format(af), Money.format(balance), Money.format(balance.add(moved)),
                            Money.format(netWorth), Money.format(netWorth.add(moved)), replaces,
                            reviewMessage(judged, held, moved, replaces));
                });
    }

    private static String reviewMessage(Judged judged, BigDecimal shares, BigDecimal moved, PriceView replaces) {
        Shape shape = judged.shape();
        StringBuilder text = new StringBuilder();
        if (shape.price().signum() == 0) {
            text.append(shape.symbol()).append(" will be worth $0.00 on ").append(shape.valueOn()).append(". Your ")
                    .append(shown(shares))
                    .append(shares.compareTo(BigDecimal.ONE) == 0 ? " share stays" : " shares stay")
                    .append(" recorded; only their value becomes $0.00.");
        } else {
            text.append(shape.symbol()).append(" will be priced at ")
                    .append(OpeningComponents.priceText(shape.price()))
                    .append(" on ").append(shape.valueOn()).append('.');
        }
        if (moved.signum() == 0) {
            text.append(" The Balance does not change: a later price already counts, or this is the same price.");
        }
        if (replaces != null) {
            text.append(" It replaces the ").append(replaces.price()).append(" price for this date that ")
                    .append(replaces.enteredByName()).append(" recorded; that one stays in the history.");
        }
        return text.toString();
    }

    // ---- the save -----------------------------------------------------------------------------------------------

    /** The saved price and whether this call created it (false for a replay of the same key). */
    public record Saved(PriceResult result, boolean created) {
    }

    /** Saves a reviewed price: lock, key first, then the rules, replace a same-date price, insert. */
    public Mono<Saved> save(UUID accountId, String key, PriceRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key)).then(Mono.fromCallable(() -> shape(request)))
                .flatMap(shape -> account(accountId).then(transactions.transactional(lock.lockAccount(accountId)
                        // The account row is locked, so the same key sent twice at once replays instead of failing.
                        .then(Mono.defer(() -> account(accountId)))
                        .flatMap(locked -> prices.expireKey(key, cutoff)
                                .then(Mono.defer(() -> prices.byKey(key, cutoff)))
                                .flatMap(existing -> replay(existing, accountId, shape))
                                .switchIfEmpty(Mono.defer(() -> judge(locked, shape, true)
                                        .flatMap(judged -> insert(judged, key, now))))))))
                .onErrorMap(DuplicateKeyException.class,
                        e -> conflict("This price was saved at the same time by someone else. Review it again."));
    }

    private Mono<Saved> insert(Judged judged, String key, Instant now) {
        Shape shape = judged.shape();
        return prices.save(judged.account().id(), shape.symbol(), shape.price(), shape.valueOn(), shape.memberId(),
                key, now).flatMap(id -> result(judged.account().id(), id, true));
    }

    private Mono<Saved> replay(HoldingPriceStore.Stored existing, UUID accountId, Shape shape) {
        PriceView view = existing.view();
        boolean same = existing.accountId().equals(accountId) && view.symbol().equals(shape.symbol())
                && new BigDecimal(view.price()).compareTo(shape.price()) == 0
                && view.valueOn().equals(shape.valueOn())
                && view.enteredByMemberId().equals(shape.memberId().toString());
        if (!same) {
            return Mono.error(conflict(DIFFERENT));
        }
        return result(accountId, UUID.fromString(view.id()), false);
    }

    private Mono<Saved> result(UUID accountId, UUID priceId, boolean created) {
        return Mono.zip(prices.byId(priceId), accountService.findById(accountId), openings.of(accountId)
                        .switchIfEmpty(Mono.error(notFound("This account has no holdings"))),
                prices.effective(accountId, HoldingDeltaSql.CURRENT, null).collectList())
                .map(all -> {
                    PriceView view = all.getT1();
                    AccountResponse account = all.getT2();
                    List<OpeningComponents.Line> lines = all.getT3().components().lines();
                    BigDecimal shares = BigDecimal.ZERO;
                    BigDecimal held = BigDecimal.ZERO;
                    for (int i = 0; i < lines.size(); i++) {
                        if (lines.get(i).symbol().equals(view.symbol())) {
                            shares = shares.add(lines.get(i).quantity());
                            held = held.add(value(lines.get(i).quantity(), all.getT4().get(i).price()));
                        }
                    }
                    String message = view.symbol() + " is priced at " + view.price() + " on " + view.valueOn() + ". "
                            + account.name() + "'s Balance is " + Money.dollars(new BigDecimal(
                                    account.balance().amount())) + " as of " + account.balance().asOf() + ".";
                    return new Saved(new PriceResult(view, shown(shares), Money.format(held),
                            account.balance().amount(), account.balance().asOf(), message), created);
                });
    }

    // ---- the history --------------------------------------------------------------------------------------------

    /** Every price on the account with who and when, and the Balance on each date it changed. */
    public Mono<PriceHistory> history(UUID accountId) {
        return account(accountId).flatMap(account -> {
            if (!AccountType.isInvestment(account.type())) {
                return Mono.<PriceHistory>error(EntryValidator.bad("Prices are recorded for investment accounts only"));
            }
            return prices.history(accountId).collectList().flatMap(all -> {
                List<LocalDate> dates = new ArrayList<>();
                dates.add(account.openedOn());
                all.stream().filter(p -> !p.replaced() && !p.valueOn().isBefore(account.openedOn()))
                        .map(PriceView::valueOn).distinct().sorted().filter(d -> !dates.contains(d))
                        .forEach(dates::add);
                return Mono.zip(dates.stream().map(date -> lock.changeUpTo(accountId, date, null)
                        .map(change -> new BalancePoint(date, Money.format(account.openingAmount().add(change)))))
                        .toList(), parts -> {
                            List<BalancePoint> points = new ArrayList<>();
                            for (Object part : parts) {
                                points.add((BalancePoint) part);
                            }
                            return new PriceHistory(all, points);
                        });
            });
        });
    }

    // ---- the rules ----------------------------------------------------------------------------------------------

    private static Shape shape(PriceRequest request) {
        if (request == null) {
            throw EntryValidator.bad("Enter the holding, the price and its date");
        }
        String symbol = request.symbol() == null ? "" : request.symbol().strip();
        if (symbol.isEmpty()) {
            throw EntryValidator.bad("Choose the holding");
        }
        BigDecimal price = OpeningComponents.price(request.price());
        if (request.valueOn() == null) {
            throw EntryValidator.bad("Enter the price date");
        }
        if (request.enteredByMemberId() == null) {
            throw EntryValidator.bad("Choose who entered this");
        }
        return new Shape(symbol, price, request.valueOn(), request.enteredByMemberId());
    }

    /**
     * The rules a new price meets: the investment type, an active account, a held symbol, the dates, and an active
     * member. `locked` reads the member under a share lock (the save); the review reads it plainly.
     */
    private Mono<Judged> judge(Account account, Shape shape, boolean locked) {
        return Mono.fromCallable(() -> {
            if (!AccountType.isInvestment(account.type())) {
                throw EntryValidator.bad("Prices are recorded for investment accounts only");
            }
            return AccountState.requireOpen(account);
        }).then(Mono.defer(() -> openings.of(account.id())))
                .switchIfEmpty(Mono.error(EntryValidator.bad(account.name() + " has no holdings to price")))
                .flatMap(stored -> Mono.fromCallable(() -> {
                    List<OpeningComponents.Line> lines = stored.components().lines();
                    List<OpeningComponents.Line> held = lines.stream()
                            .filter(l -> l.symbol().equals(shape.symbol())).toList();
                    if (held.isEmpty()) {
                        throw EntryValidator.bad(shape.symbol() + " is not held in " + account.name());
                    }
                    LocalDate today = LocalDate.now(clock);
                    OpeningComponents.valueDate(shape.valueOn(), account.openedOn(), today);
                    LocalDate earliest = held.stream().map(OpeningComponents.Line::valueOn)
                            .min(LocalDate::compareTo).orElseThrow();
                    if (shape.valueOn().isBefore(earliest)) {
                        throw EntryValidator.bad(shape.symbol() + "'s opening price is dated " + earliest
                                + "; record a price on or after it");
                    }
                    return lines;
                })).flatMap(lines -> (locked ? validator.memberLocked(account, shape.memberId())
                        : validator.member(account, shape.memberId()))
                        .then(prices.effective(account.id(), HoldingDeltaSql.CURRENT, null).collectList())
                        .map(effective -> new Judged(account, shape, lines, effective)));
    }

    private Mono<Account> account(UUID accountId) {
        return accounts.findById(accountId).switchIfEmpty(Mono.error(notFound("Account not found: " + accountId)));
    }

    private static BigDecimal value(BigDecimal quantity, BigDecimal price) {
        return quantity.multiply(price).setScale(2, RoundingMode.HALF_UP);
    }

    private static String shown(BigDecimal quantity) {
        return quantity.stripTrailingZeros().toPlainString();
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
