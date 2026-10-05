package com.mdstech.wealthmesh.account.domain;

import java.util.Optional;

/**
 * Account types the app can set up so far (T1: savings has the checking shape). The table allows every type in the
 * foundations; add one per feature.
 */
public enum AccountType {
    CHECKING,
    SAVINGS;

    /** The lowercase name used in JSON and the database. */
    public String wire() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }

    /** True for a type whose money in and out, Balance updates and entries the ledger records: the one gate. */
    public static boolean holdsActivity(String wire) {
        return fromWire(wire).isPresent();
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
