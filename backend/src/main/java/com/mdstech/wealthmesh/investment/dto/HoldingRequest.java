package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;

/**
 * One opening holding line as typed. Quantity, price and cost are Objects so a JSON number is seen and refused instead
 * of being turned into text; `valueOn` is the date of the price and defaults to the setup date. `cost` is the purchase
 * cost of this line's shares; left out it is unknown ("not available"), which is not the same as zero.
 */
public record HoldingRequest(String symbol, Object quantity, Object price, LocalDate valueOn, Object cost) {

    public HoldingRequest(String symbol, Object quantity, Object price, LocalDate valueOn) {
        this(symbol, quantity, price, valueOn, null);
    }
}
