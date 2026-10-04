package com.mdstech.wealthmesh.account.domain;

import java.util.Optional;

/** Account types the app can set up so far. The table allows every type in the foundations; add one per feature. */
public enum AccountType {
    CHECKING;

    /** The lowercase name used in JSON and the database. */
    public String wire() {
        return name().toLowerCase(java.util.Locale.ROOT);
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
