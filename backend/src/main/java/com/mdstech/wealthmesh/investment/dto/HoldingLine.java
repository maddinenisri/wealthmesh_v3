package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;

/** A holding line as saved or previewed: money and quantity as strings, `value` is quantity x price to the cent. */
public record HoldingLine(String symbol, String quantity, String price, String value, LocalDate valueOn) {
}
