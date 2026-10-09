package com.mdstech.wealthmesh.investment.dto;

import java.time.LocalDate;

/** A saved price and what it did: the holding's value and the account's one Balance afterwards, and the date of it. */
public record PriceResult(PriceView price, String shares, String holdingValue, String balance, LocalDate balanceOn,
        String message) {
}
