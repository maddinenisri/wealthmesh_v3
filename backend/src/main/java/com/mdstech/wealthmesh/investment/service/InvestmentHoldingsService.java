package com.mdstech.wealthmesh.investment.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.mdstech.wealthmesh.investment.dto.InvestmentHoldings;
import com.mdstech.wealthmesh.investment.dto.InvestmentHoldings.AccountLine;
import com.mdstech.wealthmesh.investment.dto.InvestmentHoldings.Position;
import com.mdstech.wealthmesh.investment.dto.InvestmentHoldings.Security;
import com.mdstech.wealthmesh.investment.repository.HoldingDeltaSql;
import com.mdstech.wealthmesh.investment.repository.HoldingPriceStore;
import com.mdstech.wealthmesh.investment.repository.OpeningStore;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary.Line;
import com.mdstech.wealthmesh.wealth.service.WealthService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * The whole-investment view (slice 19c, V2_HOLDINGS_002). The accounts and their Balances come from the wealth
 * "Investments" group, so each account is counted once and the total is the wealth group's total; the holdings of each
 * come from its opening lines at the prices that count now (a recorded price, else the opening one). Reads only.
 */
@Service
public class InvestmentHoldingsService {

    private final WealthService wealth;
    private final OpeningStore openings;
    private final HoldingPriceStore prices;

    public InvestmentHoldingsService(WealthService wealth, OpeningStore openings, HoldingPriceStore prices) {
        this.wealth = wealth;
        this.openings = openings;
        this.prices = prices;
    }

    /** One account of the group with its lines at the prices that count now (empty when it has no components). */
    private record Detail(Line line, Optional<OpeningStore.Stored> stored, List<OpeningComponents.Line> lines) {
    }

    public Mono<InvestmentHoldings> view() {
        return wealth.summary(null).flatMap(summary -> Flux.fromIterable(summary.investments().accounts())
                .concatMap(this::detail).collectList()
                .map(details -> assemble(summary.investments().total(), details)));
    }

    private Mono<Detail> detail(Line line) {
        UUID id = UUID.fromString(line.accountId());
        return openings.of(id).map(Optional::of).defaultIfEmpty(Optional.empty()).flatMap(stored -> stored.isEmpty()
                ? Mono.just(new Detail(line, stored, List.of()))
                : prices.effective(id, HoldingDeltaSql.CURRENT, null).collectList().map(effective -> new Detail(line,
                        stored, InvestmentSetupService.atEffectivePrices(stored.get().components().lines(),
                                effective))));
    }

    private static InvestmentHoldings assemble(String total, List<Detail> details) {
        BigDecimal groupBalance = new BigDecimal(total);
        List<AccountLine> accounts = new ArrayList<>();
        Map<String, List<OpeningComponents.Line>> all = new LinkedHashMap<>();
        Map<String, List<Position>> positions = new LinkedHashMap<>();
        for (Detail d : details) {
            BigDecimal held = d.lines().stream().map(OpeningComponents.Line::value).reduce(BigDecimal.ZERO,
                    BigDecimal::add);
            Line l = d.line();
            accounts.add(new AccountLine(l.accountId(), l.name(), l.type(), l.status(), l.balance(), l.valueDate(),
                    d.stored().map(s -> Money.format(s.components().cash())).orElse(null),
                    d.stored().isPresent() ? Money.format(held) : null));
            for (Holdings.Position p : Holdings.positions(d.lines())) {
                positions.computeIfAbsent(p.symbol(), k -> new ArrayList<>()).add(position(l, p));
            }
            d.lines().forEach(line -> all.computeIfAbsent(line.symbol(), k -> new ArrayList<>()).add(line));
        }
        List<Security> securities = new ArrayList<>();
        for (Holdings.Position p : Holdings.positions(all.values().stream().flatMap(List::stream).toList())) {
            List<Position> mine = positions.get(p.symbol());
            boolean some = p.knownShares().signum() > 0;
            securities.add(new Security(p.symbol(), shown(p.shares()), Money.format(p.value()), mine.size(),
                    shown(p.knownShares()), some ? Money.format(p.knownValue()) : null,
                    some ? Money.format(p.knownCost()) : null,
                    some ? Money.format(p.knownValue().subtract(p.knownCost())) : null,
                    Holdings.coverage(p.knownShares(), p.shares()), p.cost() == null ? null : Money.format(p.cost()),
                    p.gain() == null ? null : Money.format(p.gain()), share(p.value(), groupBalance), mine));
        }
        return new InvestmentHoldings(total, accounts, securities);
    }

    private static Position position(Line account, Holdings.Position p) {
        return new Position(account.accountId(), account.name(), account.status(), shown(p.shares()),
                p.samePrice() ? OpeningComponents.priceText(p.price()) : null, p.priceOn(), Money.format(p.value()),
                shown(p.knownShares()), p.knownShares().signum() > 0 ? Money.format(p.knownCost()) : null,
                p.cost() == null ? null : Money.format(p.cost()), p.gain() == null ? null : Money.format(p.gain()),
                Holdings.coverage(p.knownShares(), p.shares()));
    }

    /** A value as a percent of a Balance, two decimals: 5,500 of 21,500 is "25.58%". Null when the Balance is zero. */
    static String share(BigDecimal value, BigDecimal balance) {
        if (balance.signum() <= 0) {
            return null;
        }
        return value.multiply(BigDecimal.valueOf(100)).divide(balance, 2, RoundingMode.HALF_UP).toPlainString() + "%";
    }

    private static String shown(BigDecimal quantity) {
        return quantity.stripTrailingZeros().toPlainString();
    }
}
