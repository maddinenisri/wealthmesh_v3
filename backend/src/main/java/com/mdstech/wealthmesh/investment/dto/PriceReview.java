package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;

/**
 * The review of a price before it is saved (writes nothing, judged by the same rules as the save). `shares` is the
 * number of shares of the symbol in the account, `zero` is true for a known price of $0.00 (the review highlights
 * it), and `changesBalance` is false when an older price already counts for the date. The Balance and net worth
 * figures are money strings: now, and after the price counts. `replaces` is the price this one would take the place of
 * (same holding and date), or null. `message` is the sentence the review shows.
 */
public record PriceReview(String symbol, String shares, String price, LocalDate valueOn, boolean zero,
        boolean changesBalance, String holdingBefore, String holdingAfter, String balanceBefore,
        String balanceAfter, String netWorthBefore, String netWorthAfter, PriceView replaces, String message) {
}
