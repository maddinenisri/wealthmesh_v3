package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * The holdings of the whole investment group (slice 19c, V2_HOLDINGS_002): the accounts the wealth "Investments" group
 * counts (archived and closed too, labeled by `status`; D-065, D-067), their one Balances and the Balance `total`
 * (equal to the wealth group's total), and each security added up across the accounts with its per-account
 * positions. Prices belong to a holding, so one security can stand at different prices in different accounts.
 *
 * <p>`coverage` is known-cost shares over shares; `shareOfBalance` is the security's value over the group Balance.
 * They measure different things. Full `cost` and `gain` are null ("Not available") unless every share has a known
 * cost; the `known*` figures cover only the shares whose cost is known.
 */
public record InvestmentHoldings(String total, List<AccountLine> accounts, List<Security> securities) {

    /** One account in the group. Cash and holdings value are null for an account with no recorded components. */
    public record AccountLine(String accountId, String name, String type, String status, String balance,
            LocalDate pricesOn, String cash, String holdingsValue) {
    }

    /** One security across the accounts that hold it. */
    public record Security(String symbol, String shares, String value, int accountCount, String knownShares,
            String knownValue, String knownCost, String knownGain, String coverage, String cost, String gain,
            String shareOfBalance, List<Position> positions) {
    }

    /** One account's holding of the security: its own shares, price and price date. `price` is null if mixed. */
    public record Position(String accountId, String accountName, String accountStatus, String shares, String price,
            LocalDate priceOn, String value, String knownShares, String knownCost, String cost, String gain,
            String coverage) {
    }
}
