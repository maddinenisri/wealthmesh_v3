package com.mdstech.wealthmesh.investment.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.mdstech.wealthmesh.investment.dto.HoldingsView;
import com.mdstech.wealthmesh.investment.dto.HoldingsView.Security;
import com.mdstech.wealthmesh.money.Money;

/**
 * What is known of an account's holdings (V2_HOLDINGS_004): pure arithmetic over the holding lines, so the account
 * page, and later the whole-investment view, derive cost, gain and coverage the same way. Cost is information, never
 * part of a Balance; an unknown cost is null, never zero.
 */
public final class Holdings {

    private Holdings() {
    }

    /** One security's lines added together; the known-cost part is kept apart from the whole. */
    public record Position(String symbol, BigDecimal shares, BigDecimal value, BigDecimal knownShares,
            BigDecimal knownValue, BigDecimal knownCost, BigDecimal price, boolean samePrice, LocalDate priceOn) {

        /** Full cost: only when every share has a known cost. */
        public BigDecimal cost() {
            return knownShares.compareTo(shares) == 0 ? knownCost : null;
        }

        public BigDecimal gain() {
            return cost() == null ? null : value.subtract(cost());
        }
    }

    /** The lines grouped by symbol, in the order each symbol first appears. */
    public static List<Position> positions(List<OpeningComponents.Line> lines) {
        Map<String, List<OpeningComponents.Line>> bySymbol = new LinkedHashMap<>();
        for (OpeningComponents.Line line : lines) {
            bySymbol.computeIfAbsent(line.symbol(), key -> new ArrayList<>()).add(line);
        }
        List<Position> out = new ArrayList<>();
        bySymbol.forEach((symbol, group) -> {
            BigDecimal shares = BigDecimal.ZERO;
            BigDecimal value = BigDecimal.ZERO;
            BigDecimal knownShares = BigDecimal.ZERO;
            BigDecimal knownValue = BigDecimal.ZERO;
            BigDecimal knownCost = BigDecimal.ZERO;
            LocalDate latest = group.get(0).valueOn();
            for (OpeningComponents.Line line : group) {
                shares = shares.add(line.quantity());
                value = value.add(line.value());
                if (line.cost() != null) {
                    knownShares = knownShares.add(line.quantity());
                    knownValue = knownValue.add(line.value());
                    knownCost = knownCost.add(line.cost());
                }
                if (line.valueOn().isAfter(latest)) {
                    latest = line.valueOn();
                }
            }
            BigDecimal first = group.get(0).price();
            boolean same = group.stream().allMatch(line -> line.price().compareTo(first) == 0);
            out.add(new Position(symbol, shares, value, knownShares, knownValue, knownCost, first, same, latest));
        });
        return out;
    }

    /** Known-cost shares over shares as a percent with two decimals: 2 of 14 is "14.29%". */
    public static String coverage(BigDecimal known, BigDecimal shares) {
        if (shares.signum() == 0) {
            return "0.00%";
        }
        return known.multiply(BigDecimal.valueOf(100)).divide(shares, 2, RoundingMode.HALF_UP).toPlainString() + "%";
    }

    private static String shown(BigDecimal quantity) {
        return quantity.stripTrailingZeros().toPlainString();
    }

    private static Security security(Position p, BigDecimal balance) {
        boolean some = p.knownShares().signum() > 0;
        String price = p.samePrice() ? OpeningComponents.priceText(p.price()) : null;
        String knownGain = some ? Money.format(p.knownValue().subtract(p.knownCost())) : null;
        return new Security(p.symbol(), shown(p.shares()), price, p.priceOn(), Money.format(p.value()),
                shown(p.knownShares()), some ? Money.format(p.knownValue()) : null,
                some ? Money.format(p.knownCost()) : null, knownGain, coverage(p.knownShares(), p.shares()),
                p.cost() == null ? null : Money.format(p.cost()), p.gain() == null ? null : Money.format(p.gain()),
                InvestmentHoldingsService.share(p.value(), balance));
    }

    /** The view of an account whose Balance is `balance` on `balanceOn`, opened with `cash` and these lines. */
    public static HoldingsView view(BigDecimal cash, List<OpeningComponents.Line> lines, BigDecimal balance,
            LocalDate balanceOn) {
        List<Position> positions = positions(lines);
        BigDecimal value = positions.stream().map(Position::value).reduce(BigDecimal.ZERO.setScale(2),
                BigDecimal::add);
        // The account's full cost is known only when every security's is.
        boolean allKnown = !positions.isEmpty() && positions.stream().allMatch(p -> p.cost() != null);
        BigDecimal cost = allKnown ? positions.stream().map(Position::cost).reduce(BigDecimal.ZERO, BigDecimal::add)
                : null;
        return new HoldingsView(Money.format(cash), Money.format(value), Money.format(balance), balanceOn,
                positions.stream().map(p -> security(p, balance)).toList(), cost == null ? null : Money.format(cost),
                cost == null ? null : Money.format(value.subtract(cost)));
    }
}
