package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Every price recorded on an account, newest first, replaced ones included and marked, and the Balance on each date
 * it changed (the opening date and each date a recorded price counts), oldest first: the older Balance stays visible.
 */
public record PriceHistory(List<PriceView> prices, List<BalancePoint> points) {

    /** The account's one Balance on a date. */
    public record BalancePoint(LocalDate on, String balance) {
    }
}
