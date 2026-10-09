package com.mdstech.wealthmesh.wealth.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.investment.repository.HoldingDeltaSql;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Wealth on a date and what changed between two dates (W4, W5), read from the accounts, their activity and their dated
 * values. Plain SQL. Deleted accounts and drafts never count (foundations 5); archived and closed ones do.
 */
@Repository
public class WealthStore {

    /**
     * One account as of a date: its opening, its signed activity up to the date, and its effective dated value on
     * or before the date (null for an account with none, and for every ledger account). Only accounts that had begun
     * tracking by the date are returned. `delta` is the activity and the price move together; `priceDelta` is the price
     * part alone (an investment account's holdings at their effective prices against their opening prices, slice
     * 19b) and `priceOn` the date of the latest price counted, null for an account with no holdings.
     */
    public record Balance(UUID id, String name, String type, String status, LocalDate openedOn, BigDecimal opening,
            BigDecimal delta, BigDecimal valueAmount, LocalDate valueOn, BigDecimal priceDelta, LocalDate priceOn) {
    }

    /** What moved wealth in a period: the sums of the rows dated after `from` and up to `to`. */
    public record Flows(BigDecimal income, BigDecimal spending, BigDecimal corrections, BigDecimal transfers) {
    }

    private final DatabaseClient client;

    public WealthStore(DatabaseClient client) {
        this.client = client;
    }

    public Flux<Balance> balancesAsOf(LocalDate asOf) {
        return balancesAsOf(asOf, null);
    }

    /** The same for the accounts one member owns (a joint account is in each owner's list, in full). */
    public Flux<Balance> balancesAsOf(LocalDate asOf, UUID memberId) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("""
                        SELECT a.id, a.name, a.type, a.status, a.opened_on, a.opening_amount,
                               COALESCE((SELECT SUM(%s) FROM activity WHERE account_id = a.id AND removed_at IS NULL
                                         AND occurred_on <= :on), 0) + COALESCE(h.delta, 0) AS delta,
                               v.amount AS value_amount, v.value_on AS value_on,
                               COALESCE(h.delta, 0) AS price_delta, h.price_on AS price_on
                        FROM account a
                        LEFT JOIN (%s) h ON h.account_id = a.id
                        LEFT JOIN LATERAL (SELECT amount, value_on FROM account_value
                                           WHERE account_id = a.id AND removed_at IS NULL AND replaced_at IS NULL
                                           AND NOT planned AND value_on <= :on
                                           ORDER BY value_on DESC, created_at DESC LIMIT 1) v ON TRUE
                        WHERE a.deleted_at IS NULL AND a.status <> 'draft' AND a.opened_on <= :on%s
                        ORDER BY a.name, a.created_at""".formatted(ActivityStore.SIGNED,
                        HoldingDeltaSql.perAccount(":on"), ownedBy(memberId)))
                .bind("on", asOf);
        return (memberId == null ? spec : spec.bind("member", memberId))
                .map((row, meta) -> new Balance(row.get("id", UUID.class), row.get("name", String.class),
                        row.get("type", String.class), row.get("status", String.class),
                        row.get("opened_on", LocalDate.class), row.get("opening_amount", BigDecimal.class),
                        row.get("delta", BigDecimal.class), row.get("value_amount", BigDecimal.class),
                        row.get("value_on", LocalDate.class), row.get("price_delta", BigDecimal.class),
                        row.get("price_on", LocalDate.class)))
                .all();
    }

    /** Accounts that had not begun tracking by the date: named, never counted as zero. */
    public Flux<Balance> notYetTracked(LocalDate asOf, UUID memberId) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("""
                        SELECT a.id, a.name, a.type, a.status, a.opened_on, a.opening_amount FROM account a
                        WHERE a.deleted_at IS NULL AND a.status <> 'draft' AND a.opened_on > :on%s
                        ORDER BY a.name, a.created_at""".formatted(ownedBy(memberId)))
                .bind("on", asOf);
        return (memberId == null ? spec : spec.bind("member", memberId))
                .map((row, meta) -> new Balance(row.get("id", UUID.class), row.get("name", String.class),
                        row.get("type", String.class), row.get("status", String.class),
                        row.get("opened_on", LocalDate.class), row.get("opening_amount", BigDecimal.class),
                        BigDecimal.ZERO, null, null, BigDecimal.ZERO, null))
                .all();
    }

    /** True when the member exists (the per-person view of a member that is not in the household is refused). */
    public Mono<Boolean> memberExists(UUID memberId) {
        return client.sql("SELECT 1 FROM household_member WHERE id = :id").bind("id", memberId)
                .map((row, meta) -> true).one().defaultIfEmpty(false);
    }

    /** The condition that keeps the accounts a member owns; empty for the whole household. */
    private static String ownedBy(UUID memberId) {
        return memberId == null ? "" : " AND EXISTS (SELECT 1 FROM account_owner o WHERE o.account_id = a.id "
                + "AND o.member_id = :member)";
    }

    /** One Balance correction row in a period, as a line of the explanation. */
    public record CorrectionRow(UUID accountId, String name, String type, BigDecimal amount, String reason,
            LocalDate on) {
    }

    /** One corrected starting amount, with the day it was corrected. */
    public record RestatementRow(UUID accountId, String name, String type, BigDecimal previous, BigDecimal amount,
            String reason, LocalDate madeOn) {
    }

    /** One defined benefit statement in a period: the credits it reported and the date they are for. */
    public record CreditRow(UUID accountId, String name, String type, BigDecimal payCredit,
            BigDecimal interestCredit, LocalDate on) {
    }

    /**
     * The pay and interest credits of the statements dated after `from` and up to `to` that still count (not removed,
     * not replaced by a correction), oldest first. A credit is not income: it is part of a plan value.
     */
    public Flux<CreditRow> creditsBetween(LocalDate from, LocalDate to) {
        return client.sql("""
                        SELECT v.account_id, ac.name, ac.type, v.pay_credit, v.interest_credit, v.value_on
                        FROM account_value v
                        JOIN account ac ON ac.id = v.account_id AND ac.deleted_at IS NULL AND ac.status <> 'draft'
                        WHERE v.pay_credit IS NOT NULL AND v.removed_at IS NULL AND v.replaced_at IS NULL
                          AND NOT v.planned AND v.value_on > :from AND v.value_on <= :to
                        ORDER BY v.value_on, v.created_at""")
                .bind("from", from).bind("to", to)
                .map((row, meta) -> new CreditRow(row.get("account_id", UUID.class), row.get("name", String.class),
                        row.get("type", String.class), row.get("pay_credit", BigDecimal.class),
                        row.get("interest_credit", BigDecimal.class), row.get("value_on", LocalDate.class)))
                .all();
    }

    /** The Balance corrections dated after `from` and up to `to` that still count, oldest first. */
    public Flux<CorrectionRow> correctionsBetween(LocalDate from, LocalDate to) {
        return client.sql("""
                        SELECT x.account_id, ac.name, ac.type, x.amount, x.reason, x.occurred_on
                        FROM activity x
                        JOIN account ac ON ac.id = x.account_id AND ac.deleted_at IS NULL AND ac.status <> 'draft'
                        WHERE x.kind = 'correction' AND x.removed_at IS NULL AND x.occurred_on > :from
                          AND x.occurred_on <= :to
                        ORDER BY x.occurred_on, x.created_at""")
                .bind("from", from).bind("to", to)
                .map((row, meta) -> new CorrectionRow(row.get("account_id", UUID.class), row.get("name", String.class),
                        row.get("type", String.class), row.get("amount", BigDecimal.class),
                        row.get("reason", String.class), row.get("occurred_on", LocalDate.class)))
                .all();
    }

    /** The starting amounts corrected after `from` and up to `to` (by the day of the correction), oldest first. */
    public Flux<RestatementRow> restatementsBetween(LocalDate from, LocalDate to, String zone) {
        return client.sql("""
                        SELECT r.account_id, ac.name, ac.type, r.previous_amount, r.opening_amount, r.reason,
                               (r.created_at AT TIME ZONE :zone)::date AS made_on
                        FROM opening_revision r
                        JOIN account ac ON ac.id = r.account_id AND ac.deleted_at IS NULL AND ac.status <> 'draft'
                        WHERE r.opening_amount <> r.previous_amount
                          AND (r.created_at AT TIME ZONE :zone)::date > :from
                          AND (r.created_at AT TIME ZONE :zone)::date <= :to
                        ORDER BY r.seq""")
                .bind("from", from).bind("to", to).bind("zone", zone)
                .map((row, meta) -> new RestatementRow(row.get("account_id", UUID.class), row.get("name", String.class),
                        row.get("type", String.class), row.get("previous_amount", BigDecimal.class),
                        row.get("opening_amount", BigDecimal.class), row.get("reason", String.class),
                        row.get("made_on", LocalDate.class)))
                .all();
    }

    public Mono<Flows> flowsBetween(LocalDate from, LocalDate to) {
        return client.sql("""
                        SELECT COALESCE(SUM(CASE WHEN x.kind = 'income' THEN x.amount END), 0) AS income,
                               COALESCE((SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END)
                                         FROM activity_part p
                                         JOIN account pa ON pa.id = p.account_id AND pa.deleted_at IS NULL
                                              AND pa.status <> 'draft'
                                         WHERE p.removed_at IS NULL AND p.occurred_on > :from
                                           AND p.occurred_on <= :to
                                           AND p.kind IN ('expense', 'refund', 'loan_payment')), 0) AS spending,
                               COALESCE(SUM(CASE WHEN x.kind = 'correction' THEN x.amount END), 0) AS corrections,
                               COALESCE(SUM(CASE WHEN x.kind = 'loan_payment' THEN -(SELECT COALESCE(SUM(pp.amount), 0)
                                                    FROM activity_portion pp
                                                    WHERE pp.activity_id = x.id AND pp.kind = 'principal')
                                                 WHEN x.kind IN ('transfer_in', 'transfer_out', 'card_payment',
                                                                 'card_payment_in', 'loan_payment_in')
                                                 THEN %s END), 0) AS transfers
                        FROM (SELECT * FROM activity WHERE removed_at IS NULL AND occurred_on > :from
                              AND occurred_on <= :to) x
                        JOIN account ac ON ac.id = x.account_id AND ac.deleted_at IS NULL AND ac.status <> 'draft'"""
                        .formatted(ActivityStore.SIGNED.replace("kind", "x.kind").replace("amount", "x.amount")))
                .bind("from", from).bind("to", to)
                .map((row, meta) -> new Flows(row.get("income", BigDecimal.class),
                        row.get("spending", BigDecimal.class), row.get("corrections", BigDecimal.class),
                        row.get("transfers", BigDecimal.class)))
                .one();
    }
}
