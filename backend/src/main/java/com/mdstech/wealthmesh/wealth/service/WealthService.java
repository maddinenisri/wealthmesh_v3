package com.mdstech.wealthmesh.wealth.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.wealth.dto.WealthChange;
import com.mdstech.wealthmesh.wealth.dto.WealthChange.ValueMove;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary.Group;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary.Line;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary.NotTracked;
import com.mdstech.wealthmesh.wealth.repository.WealthStore;
import com.mdstech.wealthmesh.wealth.repository.WealthStore.Balance;

import reactor.core.publisher.Mono;

/**
 * Wealth (W1, W2, W4, W5): a positive Balance is a financial asset, a negative one (an overdraft or card debt) is a
 * debt, counted once (D-022). Bank money and cards are shown as groups with their own signed Balances. Drafts and
 * deleted accounts never count (foundations 5); archived and closed accounts do, because hiding an account never makes
 * its money or debt disappear (D-046). The figures can be read as of any date up to today: an account that had not
 * begun tracking then is named, not counted as zero, and a manually valued account shows the date of the value it
 * counts and is flagged when that value is old.
 */
@Service
public class WealthService {

    /** A manually valued account is flagged when its value is dated more than this many days before the wealth date. */
    public static final int STALE_AFTER_DAYS = 30;

    private final WealthStore store;
    private final Clock clock;

    public WealthService(WealthStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** Wealth as of a date (today when none is given). */
    public Mono<WealthSummary> summary(LocalDate asOf) {
        return Mono.fromCallable(() -> requireDate(asOf, "The date")).flatMap(date -> store.balancesAsOf(date)
                .map(balance -> line(balance, date)).collectList()
                .flatMap(lines -> store.notYetTracked(date)
                        .map(b -> new NotTracked(b.id().toString(), b.name(), b.type(), b.openedOn())).collectList()
                        .map(missing -> summarize(date, lines, missing))));
    }

    /** What explains the change in wealth from one date to another (W5). */
    public Mono<WealthChange> change(LocalDate from, LocalDate to) {
        return Mono.fromCallable(() -> {
            LocalDate start = requireDate(from, "The start date");
            LocalDate end = requireDate(to, "The end date");
            if (start.isAfter(end)) {
                throw bad("The start date must be on or before the end date");
            }
            return new LocalDate[] { start, end };
        }).flatMap(dates -> Mono.zip(store.balancesAsOf(dates[0]).collectList(), store.balancesAsOf(dates[1])
                .collectList(), store.flowsBetween(dates[0], dates[1])).map(all -> explain(dates[0], dates[1],
                        all.getT1(), all.getT2(), all.getT3())));
    }

    private static WealthChange explain(LocalDate from, LocalDate to, List<Balance> start, List<Balance> end,
            WealthStore.Flows flows) {
        BigDecimal startWealth = start.stream().map(WealthService::balance).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal endWealth = end.stream().map(WealthService::balance).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal valueChange = BigDecimal.ZERO;
        BigDecimal added = BigDecimal.ZERO;
        java.util.List<ValueMove> moves = new java.util.ArrayList<>();
        for (Balance now : end) {
            Balance before = start.stream().filter(b -> b.id().equals(now.id())).findFirst().orElse(null);
            if (before == null) {
                added = added.add(now.opening());
            }
            if (AccountType.isValued(now.type())) {
                BigDecimal base = before == null ? now.opening() : balance(before);
                BigDecimal moved = balance(now).subtract(base);
                valueChange = valueChange.add(moved);
                if (moved.signum() != 0) {
                    moves.add(new ValueMove(now.id().toString(), now.name(), now.type(), Money.format(base),
                            Money.format(balance(now)), Money.format(moved)));
                }
            }
        }
        BigDecimal change = endWealth.subtract(startWealth);
        BigDecimal explained = flows.income().subtract(flows.spending()).add(flows.corrections())
                .add(flows.transfers()).add(valueChange).add(added);
        return new WealthChange(from, to, Money.format(startWealth), Money.format(endWealth), Money.format(change),
                Money.format(flows.income()), Money.format(flows.spending()), Money.format(valueChange),
                Money.format(flows.corrections()), Money.format(added), Money.format(flows.transfers()),
                Money.format(change.subtract(explained)), moves);
    }

    /** The Balance on the date: a valued account's effective value (else its opening), or opening plus activity. */
    private static BigDecimal balance(Balance b) {
        if (AccountType.isValued(b.type())) {
            return b.valueAmount() == null ? b.opening() : b.valueAmount();
        }
        return b.opening().add(b.delta());
    }

    private static Line line(Balance b, LocalDate asOf) {
        boolean valued = AccountType.isValued(b.type());
        LocalDate valueDate = !valued ? null : b.valueOn() == null ? b.openedOn() : b.valueOn();
        boolean stale = valued && valueDate.isBefore(asOf.minusDays(STALE_AFTER_DAYS));
        return new Line(b.id().toString(), b.name(), b.type(), b.status(), Money.format(balance(b)), valueDate, stale);
    }

    private static WealthSummary summarize(LocalDate asOf, List<Line> lines, List<NotTracked> missing) {
        List<Line> bank = lines.stream().filter(l -> AccountType.paysCards(l.type())).toList();
        List<Line> cards = lines.stream().filter(l -> AccountType.isCard(l.type())).toList();
        List<Line> loans = lines.stream().filter(l -> AccountType.isDebt(l.type())).toList();
        List<Line> valued = lines.stream().filter(l -> AccountType.isValued(l.type())).toList();
        BigDecimal assets = lines.stream().map(WealthService::amount).filter(b -> b.signum() > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<Line> debtLines = lines.stream().filter(l -> amount(l).signum() < 0).toList();
        BigDecimal debts = debtLines.stream().map(l -> amount(l).negate()).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new WealthSummary(asOf, Money.format(assets), Money.format(debts), Money.format(assets.subtract(debts)),
                group(bank), group(cards), group(loans), group(valued), debtLines, missing);
    }

    private static Group group(List<Line> lines) {
        return new Group(Money.format(lines.stream().map(WealthService::amount).reduce(BigDecimal.ZERO,
                BigDecimal::add)), lines);
    }

    private static BigDecimal amount(Line line) {
        return new BigDecimal(line.balance());
    }

    private LocalDate requireDate(LocalDate date, String name) {
        LocalDate today = LocalDate.now(clock);
        if (date == null) {
            return today;
        }
        if (date.isAfter(today)) {
            throw bad(name + " cannot be in the future");
        }
        return date;
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
