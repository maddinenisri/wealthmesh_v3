package com.mdstech.wealthmesh.wealth.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.activity.repository.ActivityStore;

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
     * tracking by the date are returned.
     */
    public record Balance(UUID id, String name, String type, String status, LocalDate openedOn, BigDecimal opening,
            BigDecimal delta, BigDecimal valueAmount, LocalDate valueOn) {
    }

    /** What moved wealth in a period: the sums of the rows dated after `from` and up to `to`. */
    public record Flows(BigDecimal income, BigDecimal spending, BigDecimal corrections, BigDecimal transfers) {
    }

    private final DatabaseClient client;

    public WealthStore(DatabaseClient client) {
        this.client = client;
    }

    public Flux<Balance> balancesAsOf(LocalDate asOf) {
        return client.sql("""
                        SELECT a.id, a.name, a.type, a.status, a.opened_on, a.opening_amount,
                               COALESCE((SELECT SUM(%s) FROM activity WHERE account_id = a.id AND removed_at IS NULL
                                         AND occurred_on <= :on), 0) AS delta,
                               v.amount AS value_amount, v.value_on AS value_on
                        FROM account a
                        LEFT JOIN LATERAL (SELECT amount, value_on FROM account_value
                                           WHERE account_id = a.id AND removed_at IS NULL AND replaced_at IS NULL
                                           AND NOT planned AND value_on <= :on
                                           ORDER BY value_on DESC, created_at DESC LIMIT 1) v ON TRUE
                        WHERE a.deleted_at IS NULL AND a.status <> 'draft' AND a.opened_on <= :on
                        ORDER BY a.name, a.created_at""".formatted(ActivityStore.SIGNED))
                .bind("on", asOf)
                .map((row, meta) -> new Balance(row.get("id", UUID.class), row.get("name", String.class),
                        row.get("type", String.class), row.get("status", String.class),
                        row.get("opened_on", LocalDate.class), row.get("opening_amount", BigDecimal.class),
                        row.get("delta", BigDecimal.class), row.get("value_amount", BigDecimal.class),
                        row.get("value_on", LocalDate.class)))
                .all();
    }

    /** Accounts that had not begun tracking by the date: named, never counted as zero. */
    public Flux<Balance> notYetTracked(LocalDate asOf) {
        return client.sql("""
                        SELECT id, name, type, status, opened_on, opening_amount FROM account
                        WHERE deleted_at IS NULL AND status <> 'draft' AND opened_on > :on ORDER BY name, created_at""")
                .bind("on", asOf)
                .map((row, meta) -> new Balance(row.get("id", UUID.class), row.get("name", String.class),
                        row.get("type", String.class), row.get("status", String.class),
                        row.get("opened_on", LocalDate.class), row.get("opening_amount", BigDecimal.class),
                        BigDecimal.ZERO, null, null))
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
