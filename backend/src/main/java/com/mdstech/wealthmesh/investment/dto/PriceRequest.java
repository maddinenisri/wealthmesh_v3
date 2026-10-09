package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A price recorded on one holding of an investment account (slice 19b): the symbol as an opening line names it, the
 * market price of one share (an Object so a JSON number is refused, as an opening price is), the date it is for, and
 * the member who entered it.
 */
public record PriceRequest(String symbol, Object price, LocalDate valueOn, UUID enteredByMemberId) {
}
