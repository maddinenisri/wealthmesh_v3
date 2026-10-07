package com.mdstech.wealthmesh.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.regex.Pattern;

/** Money on the wire is a string with at most two decimals; in memory it is a BigDecimal of scale 2. */
public final class Money {

    private static final Pattern AMOUNT = Pattern.compile("-?\\d{1,17}(\\.\\d{1,2})?");

    private Money() {
    }

    /** Parses {@code "5000"}, {@code "5000.5"} or {@code "-5.00"}; empty if it is anything else. */
    public static Optional<BigDecimal> parse(String text) {
        if (text == null || !AMOUNT.matcher(text.strip()).matches()) {
            return Optional.empty();
        }
        return Optional.of(new BigDecimal(text.strip()).setScale(2, RoundingMode.HALF_EVEN));
    }

    /** Formats for a sentence: "$1,234.50", with a leading minus when negative. */
    public static String dollars(BigDecimal amount) {
        return (amount.signum() < 0 ? "-" : "") + String.format(java.util.Locale.US, "$%,.2f", amount.abs());
    }

    /** Formats for JSON: always two decimals, no exponent. */
    public static String format(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.HALF_EVEN).toPlainString();
    }
}
