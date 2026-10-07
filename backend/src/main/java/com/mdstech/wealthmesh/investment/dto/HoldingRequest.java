package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;

/**
 * One opening holding line as typed. Quantity and price are Objects so a JSON number is seen and refused instead of
 * being turned into text; `valueOn` is the date of the price and defaults to the setup date.
 */
public record HoldingRequest(String symbol, Object quantity, Object price, LocalDate valueOn) {
}
