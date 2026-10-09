package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;

/**
 * A holding line as saved or previewed: money and quantity as strings, `value` is quantity x price to the cent.
 * `cost` and `gain` (value minus cost) are null when the purchase cost is not known; they are never zero then.
 */
public record HoldingLine(String symbol, String quantity, String price, String value, LocalDate valueOn,
        String cost, String gain) {
}
