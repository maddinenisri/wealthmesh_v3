package com.mdstech.wealthmesh.money;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MoneyTests {

    @ParameterizedTest
    @ValueSource(strings = {"5000", "5000.0", "5000.00", " 5000.00 "})
    void parsesPlainAmountsToScaleTwo(String text) {
        assertEquals(new BigDecimal("5000.00"), Money.parse(text).orElseThrow());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "five thousand", "$5,000.00", "1.234", "1e3", "--1", "1,000", "."})
    void refusesAnythingElse(String text) {
        assertTrue(Money.parse(text).isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"-5.00", "-5"})
    void allowsNegativeAmounts(String text) {
        assertEquals("-5.00", Money.format(Money.parse(text).orElseThrow()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "0.1", "1234567.5"})
    void formatsWithTwoDecimalsAndNoExponent(String text) {
        String formatted = Money.format(new BigDecimal(text));
        assertTrue(formatted.matches("-?\\d+\\.\\d{2}"), formatted);
    }
}
