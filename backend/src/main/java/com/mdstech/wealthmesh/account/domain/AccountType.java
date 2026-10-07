package com.mdstech.wealthmesh.account.domain;

import java.util.Optional;

/**
 * Account types the app can set up so far (T1: savings has the checking shape; T2: a card keeps one Balance that is
 * owed or Card credit; T3: property and other assets hold dated values, no activity; T4: a loan is a debt owed, set
 * up with an amount and changed by payments and reviewed corrections). The table allows every type in the
 * foundations; add one per feature. A type's {@link Kind} decides how its Balance is read (foundations 3, 5).
 */
public enum AccountType {
    CHECKING(Kind.LEDGER),
    SAVINGS(Kind.LEDGER),
    CREDIT_CARD(Kind.LEDGER),
    PROPERTY(Kind.VALUED),
    OTHER_ASSET(Kind.VALUED),
    LOAN(Kind.DEBT);

    /**
     * How a type's Balance is read: opening plus signed activity (ledger), the latest dated value (valued), or the
     * amount owed (debt: opening plus its payments and corrections, stored negative like a card, D-053). Only a ledger
     * type takes ordinary money in and out; a debt takes a payment from a ledger account and a reviewed correction.
     */
    public enum Kind {
        LEDGER, VALUED, DEBT
    }

    private final Kind kind;

    AccountType(Kind kind) {
        this.kind = kind;
    }

    /** How this type's Balance is read. */
    public Kind kind() {
        return kind;
    }

    /** True for a property or other asset (see {@link #isValued}). */
    public boolean valued() {
        return kind == Kind.VALUED;
    }

    /** The lowercase name used in JSON and the database. */
    public String wire() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }

    /** True for a type whose money in and out, Balance updates and entries the ledger records: the one gate. */
    public static boolean holdsActivity(String wire) {
        return fromWire(wire).filter(type -> type.kind == Kind.LEDGER).isPresent();
    }

    /** True for a property or other asset: no activity, one Balance that is its latest effective dated value. */
    public static boolean isValued(String wire) {
        return fromWire(wire).filter(type -> type.kind == Kind.VALUED).isPresent();
    }

    /** True for a loan: a debt with an amount owed, never an asset (see {@link Kind#DEBT}). */
    public static boolean isDebt(String wire) {
        return fromWire(wire).filter(type -> type.kind == Kind.DEBT).isPresent();
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
