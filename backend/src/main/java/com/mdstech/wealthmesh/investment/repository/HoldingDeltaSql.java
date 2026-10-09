package com.mdstech.wealthmesh.investment.repository;

/**
 * The one place that says which price counts for a holding (slice 19b). A holding is an opening line; its effective
 * price on a date is the latest of the line's own opening price (dated by its value date) and the price recorded on
 * that account and symbol on or before the date, a recorded price winning a tie. Replaced and removed prices never
 * count. The Balance stays `opening + delta`: this gives the price part of the delta, to be added to the activity
 * sum, never substituted for it.
 *
 * <p>Every reader of a Balance takes it through here: `ActivityStore.deltasByAccount`, `deltaOf`, `changeUpTo`, and
 * the two `WealthStore` reads (so the person's view, the Household total and each group total follow).
 */
public final class HoldingDeltaSql {

    private HoldingDeltaSql() {
    }

    /** The newest recorded price of the line's account and symbol dated on or before `dateExpr`. */
    private static String recorded(String dateExpr) {
        return "LEFT JOIN LATERAL (SELECT hp.price, hp.value_on FROM holding_price hp "
                + "WHERE hp.account_id = l.account_id AND hp.symbol = l.symbol AND hp.replaced_at IS NULL "
                + "AND hp.removed_at IS NULL AND hp.value_on <= " + dateExpr
                + " ORDER BY hp.value_on DESC, hp.created_at DESC LIMIT 1) p ON TRUE";
    }

    /** True when the recorded price counts for the line: not older than the line's own price date. */
    private static final String USES_RECORDED = "(p.value_on IS NOT NULL AND p.value_on >= l.value_on)";

    /**
     * One row per account with holdings: `account_id`, `delta` (the price part, each line to the cent), `price_on`
     * (the latest date of any price counted, including an opening price) and `recorded_on` (the latest recorded price
     * that counts, null while none does). `dateExpr` is a SQL date expression, for example `:on`.
     */
    public static String perAccount(String dateExpr) {
        return "SELECT l.account_id, "
                + "SUM(ROUND(l.quantity * CASE WHEN " + USES_RECORDED + " THEN p.price ELSE l.price END, 2) "
                + "- ROUND(l.quantity * l.price, 2)) AS delta, "
                + "MAX(CASE WHEN " + USES_RECORDED + " THEN p.value_on ELSE l.value_on END) AS price_on, "
                + "MAX(CASE WHEN " + USES_RECORDED + " THEN p.value_on END) AS recorded_on "
                + "FROM account_opening_holding l " + recorded(dateExpr) + " GROUP BY l.account_id";
    }

    /** The effective price of each opening line of one account, in line order: `position`, `price`, `price_on`. */
    public static String lines(String dateExpr) {
        return "SELECT l.position, CASE WHEN " + USES_RECORDED + " THEN p.price ELSE l.price END AS price, "
                + "CASE WHEN " + USES_RECORDED + " THEN p.value_on ELSE l.value_on END AS price_on "
                + "FROM account_opening_holding l " + recorded(dateExpr)
                + " WHERE l.account_id = :account ORDER BY l.position";
    }

    /** Far enough ahead that every recorded price counts (a price is never dated after today). */
    public static final String CURRENT = "DATE '9999-12-31'";
}
