package com.mdstech.wealthmesh.account.domain;

import java.util.Optional;

/**
 * Account types the app can set up so far (T1: savings has the checking shape; T2: a card keeps one Balance that is
 * owed or Card credit). The table allows every type in the foundations; add one per feature.
 */
public enum AccountType {
    CHECKING,
    SAVINGS,
    CREDIT_CARD;

    /** The lowercase name used in JSON and the database. */
    public String wire() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }

    /** True for a type whose money in and out, Balance updates and entries the ledger records: the one gate. */
    public static boolean holdsActivity(String wire) {
        return fromWire(wire).isPresent();
    }

    /** True for a credit card: its Balance is owed (negative) or Card credit (positive), and it takes no income. */
    public static boolean isCard(String wire) {
        return CREDIT_CARD.wire().equals(wire);
    }

    /** True for a type that can be the bank side of a payment to a card: checking and savings. */
    public static boolean paysCards(String wire) {
        return holdsActivity(wire) && !isCard(wire);
    }

    public static Optional<AccountType> fromWire(String value) {
        for (AccountType type : values()) {
            if (type.wire().equals(value)) {
                return Optional.of(type);
            }
        }
        return Optional.empty();
    }
}
