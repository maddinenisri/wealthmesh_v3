package com.mdstech.wealthmesh.account.domain;

import java.util.Optional;

/**
 * Account types the app can set up so far (T1: savings has the checking shape; T2: a card keeps one Balance that is
 * owed or Card credit; T3: property and other assets hold dated values, no activity; T4: a loan, and T5: a mortgage,
 * are debts owed, set up with an amount and changed by payments and reviewed corrections; T7: a brokerage, 401(k), IRA
 * or HSA is set up from opening cash and holdings and, until slices 20 to 23, takes no activity). The table allows
 * every type in the foundations; add one per feature. A type's {@link Kind} decides how its Balance is read
 * (foundations 3, 5).
 */
public enum AccountType {
    CHECKING(Kind.LEDGER, WealthGroup.BANK_MONEY),
    SAVINGS(Kind.LEDGER, WealthGroup.BANK_MONEY),
    CREDIT_CARD(Kind.LEDGER, WealthGroup.CARDS),
    PROPERTY(Kind.VALUED, WealthGroup.PROPERTY_AND_OTHER),
    OTHER_ASSET(Kind.VALUED, WealthGroup.PROPERTY_AND_OTHER),
    DEFINED_BENEFIT(Kind.VALUED, WealthGroup.RETIREMENT, true),
    LOAN(Kind.DEBT, WealthGroup.LOANS),
    MORTGAGE(Kind.DEBT, WealthGroup.MORTGAGES),
    BROKERAGE(Kind.INVESTMENT, WealthGroup.INVESTMENTS),
    K401(Kind.INVESTMENT, WealthGroup.RETIREMENT, false, "401k"),
    TRADITIONAL_IRA(Kind.INVESTMENT, WealthGroup.RETIREMENT),
    ROTH_IRA(Kind.INVESTMENT, WealthGroup.RETIREMENT),
    HSA(Kind.INVESTMENT, WealthGroup.HEALTH_SAVINGS);

    /**
     * How a type's Balance is read: opening plus signed activity (ledger), the latest dated value (valued), or the
     * amount owed (debt: opening plus its payments and corrections, stored negative like a card, D-053). Only a ledger
     * type takes ordinary money in and out; a debt takes a payment from a ledger account and a reviewed correction. An
     * investment account (cash plus holdings) is read as its opening amount until prices and activity arrive.
     */
    public enum Kind {
        LEDGER, VALUED, DEBT, INVESTMENT
    }

    private final Kind kind;
    private final WealthGroup baseGroup;
    private final boolean singleOwner;
    private final String wire;

    AccountType(Kind kind, WealthGroup baseGroup) {
        this(kind, baseGroup, false, null);
    }

    AccountType(Kind kind, WealthGroup baseGroup, boolean singleOwner) {
        this(kind, baseGroup, singleOwner, null);
    }

    /** `wire` is the JSON and database name when it is not the lowercase enum name (a name cannot start with 4). */
    AccountType(Kind kind, WealthGroup baseGroup, boolean singleOwner, String wire) {
        this.kind = kind;
        this.baseGroup = baseGroup;
        this.singleOwner = singleOwner;
        this.wire = wire == null ? name().toLowerCase(java.util.Locale.ROOT) : wire;
    }

    /** The one group this type belongs to: a partition tag (D-067), not the only group that lists it. */
    public WealthGroup baseGroup() {
        return baseGroup;
    }

    /**
     * Every group that lists this type, in display order: its base group and the overlapping view. Every investment
     * account is also in Investments (D-067), so a 401(k) is in Investments and Retirement and an HSA in Investments
     * and Health savings; a defined benefit is in Retirement only. A group is a view and is never added to wealth.
     */
    public java.util.Set<WealthGroup> groups() {
        java.util.Set<WealthGroup> groups = java.util.EnumSet.of(baseGroup);
        if (kind == Kind.INVESTMENT) {
            groups.add(WealthGroup.INVESTMENTS);
        }
        return groups;
    }

    /** True when the type is listed in the group: the one place wealth decides group membership. */
    public static boolean inGroup(String wire, WealthGroup group) {
        return fromWire(wire).filter(type -> type.groups().contains(group)).isPresent();
    }

    /** True for a type held by exactly one member (a defined benefit's participant); the rule is enforced on save. */
    public boolean singleOwner() {
        return singleOwner;
    }

    /** True for a type whose setup records the member who entered it (D-062): an investment or a defined benefit. */
    public boolean recordsCreator() {
        return kind == Kind.INVESTMENT || this == DEFINED_BENEFIT;
    }

    /** The refusal when a one-owner type is given several owners. */
    public String singleOwnerMessage() {
        return "A defined benefit has one participant. Choose one member.";
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
        return wire;
    }

    /** True for a type whose money in and out, Balance updates and entries the ledger records: the one gate. */
    public static boolean holdsActivity(String wire) {
        return fromWire(wire).filter(type -> type.kind == Kind.LEDGER).isPresent();
    }

    /** True for a property or other asset: no activity, one Balance that is its latest effective dated value. */
    public static boolean isValued(String wire) {
        return fromWire(wire).filter(type -> type.kind == Kind.VALUED).isPresent();
    }

    /** True for a loan or mortgage: a debt with an amount owed, never an asset (see {@link Kind#DEBT}). */
    public static boolean isDebt(String wire) {
        return fromWire(wire).filter(type -> type.kind == Kind.DEBT).isPresent();
    }

    /** True for an investment account (brokerage, retirement or health savings): set up from cash and holdings. */
    public static boolean isInvestment(String wire) {
        return fromWire(wire).filter(type -> type.kind == Kind.INVESTMENT).isPresent();
    }

    /** True for a type that can carry supporting statements: a ledger account or an investment account. */
    public static boolean takesStatements(String wire) {
        return holdsActivity(wire) || isInvestment(wire);
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
