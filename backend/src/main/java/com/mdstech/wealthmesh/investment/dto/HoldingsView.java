package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * The holdings of one investment account (slice 19a): its cash, the value of its holdings, the one Balance (the same
 * the list, the detail and wealth show) and each security with what is known of its purchase cost.
 *
 * <p>Cost is "not available" (null) unless every share has a known cost; the figures of the shares whose cost is known
 * are always given beside it (`known*`) so a partly known cost is shown as what it is. `cost` and `gain` of the
 * account are null unless every share of every security has a known cost.
 */
public record HoldingsView(String cash, String holdingsValue, String balance, LocalDate balanceOn,
        List<Security> securities, String cost, String gain) {

    /**
     * One security in the account (its lines added together). `price` is null when its lines carry different prices;
     * `priceOn` is the latest price date. `coverage` is known-cost shares over shares, as "14.29%".
     * `shareOfBalance` is the security's value over the account's one Balance ("25.58%"), a different measure from
     * coverage; null when the Balance is not above zero.
     */
    public record Security(String symbol, String shares, String price, LocalDate priceOn, String value,
            String knownShares, String knownValue, String knownCost, String knownGain, String coverage, String cost,
            String gain, String shareOfBalance) {
    }
}
