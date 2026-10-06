package com.mdstech.wealthmesh.budget.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.budget.dto.BudgetEventView;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Plain SQL over the budget tables (slice 13). Every write runs under {@link #lockHousehold}. */
@Repository
public class BudgetStore {

    /** A saved Budget of a month; `removedAt` is null while it is active. */
    public record Row(UUID id, LocalDate month, BigDecimal total, Instant removedAt) {
    }

    /** The total of the targets that resolve to one effective category (a merged source counts for its target). */
    public record Target(UUID categoryId, String name, boolean archived, BigDecimal amount) {
    }

    /** A stored save or copy key: what it did and the fingerprint of the request. */
    public record KeyHit(UUID budgetId, String fingerprint) {
    }

    private final DatabaseClient client;

    public BudgetStore(DatabaseClient client) {
        this.client = client;
    }

    /** Every Budget write waits here first, so two first saves of a month cannot race the unique index. */
    public Mono<UUID> lockHousehold() {
        return client.sql("SELECT id FROM household FOR UPDATE").map((row, meta) -> row.get("id", UUID.class)).one();
    }

    public Mono<Row> active(LocalDate month) {
        return client.sql("SELECT id, month, total, removed_at FROM budget WHERE month = :month "
                        + "AND removed_at IS NULL").bind("month", month).map((row, meta) -> row(row)).one();
    }

    /** The most recently removed Budget of a month. */
    public Mono<Row> latestRemoved(LocalDate month) {
        return client.sql("SELECT id, month, total, removed_at FROM budget WHERE month = :month "
                        + "AND removed_at IS NOT NULL ORDER BY removed_at DESC, created_at DESC LIMIT 1")
                .bind("month", month).map((row, meta) -> row(row)).one();
    }

    public Flux<Row> activeBudgets() {
        return client.sql("SELECT id, month, total, removed_at FROM budget WHERE removed_at IS NULL "
                + "ORDER BY month DESC").map((row, meta) -> row(row)).all();
    }

    public Mono<UUID> insert(UUID householdId, LocalDate month, BigDecimal total, Instant now) {
        return client.sql("INSERT INTO budget (household_id, month, total, created_at) "
                        + "VALUES (:household, :month, :total, :now) RETURNING id")
                .bind("household", householdId).bind("month", month).bind("total", total).bind("now", now)
                .map((row, meta) -> row.get("id", UUID.class)).one();
    }

    public Mono<Void> setTotal(UUID budgetId, BigDecimal total) {
        return client.sql("UPDATE budget SET total = :total WHERE id = :id").bind("total", total)
                .bind("id", budgetId).then();
    }

    public Mono<Void> setRemoved(UUID budgetId, Instant removedAt) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("UPDATE budget SET removed_at = :at WHERE id = :id")
                .bind("id", budgetId);
        return (removedAt == null ? spec.bindNull("at", Instant.class) : spec.bind("at", removedAt)).then();
    }

    public Mono<Void> deleteTargets(UUID budgetId) {
        return client.sql("DELETE FROM budget_target WHERE budget_id = :id").bind("id", budgetId).then();
    }

    public Mono<Void> insertTarget(UUID budgetId, UUID categoryId, BigDecimal amount) {
        return client.sql("INSERT INTO budget_target (budget_id, category_id, amount) "
                        + "VALUES (:budget, :category, :amount)")
                .bind("budget", budgetId).bind("category", categoryId).bind("amount", amount).then();
    }

    /** The targets of a Budget, one row per effective category: COALESCE(merged_into_id, id), as every reader does. */
    public Flux<Target> targets(UUID budgetId) {
        return client.sql("SELECT e.id, e.name, (e.archived_at IS NOT NULL) AS archived, SUM(t.amount) AS amount "
                        + "FROM budget_target t JOIN category c ON c.id = t.category_id "
                        + "JOIN category e ON e.id = COALESCE(c.merged_into_id, c.id) "
                        + "WHERE t.budget_id = :id GROUP BY e.id, e.name, e.archived_at")
                .bind("id", budgetId)
                .map((row, meta) -> new Target(row.get("id", UUID.class), row.get("name", String.class),
                        Boolean.TRUE.equals(row.get("archived", Boolean.class)),
                        row.get("amount", BigDecimal.class)))
                .all();
    }

    public Mono<Void> recordEvent(UUID budgetId, String action, UUID memberId, Instant at, String key,
            String fingerprint) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO budget_event "
                        + "(budget_id, action, member_id, at, idempotency_key, fingerprint) "
                        + "VALUES (:budget, :action, :member, :at, :key, :fingerprint)")
                .bind("budget", budgetId).bind("action", action).bind("at", at);
        spec = memberId == null ? spec.bindNull("member", UUID.class) : spec.bind("member", memberId);
        spec = key == null ? spec.bindNull("key", String.class) : spec.bind("key", key);
        spec = fingerprint == null ? spec.bindNull("fingerprint", String.class)
                : spec.bind("fingerprint", fingerprint);
        return spec.then();
    }

    /** Frees a key past its lifetime so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE budget_event SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    public Mono<KeyHit> findKey(String key) {
        return client.sql("SELECT budget_id, fingerprint FROM budget_event WHERE idempotency_key = :key")
                .bind("key", key)
                .map((row, meta) -> new KeyHit(row.get("budget_id", UUID.class), row.get("fingerprint", String.class)))
                .one();
    }

    /** The action of the latest event of a Budget (for a repeat Undo). */
    public Mono<String> latestAction(UUID budgetId) {
        return client.sql("SELECT action FROM budget_event WHERE budget_id = :id ORDER BY at DESC, seq DESC LIMIT 1")
                .bind("id", budgetId).map((row, meta) -> row.get("action", String.class)).one();
    }

    /** Every change to any Budget of the month, newest first. */
    public Flux<BudgetEventView> events(LocalDate month) {
        return client.sql("SELECT e.action, e.member_id, e.at FROM budget_event e JOIN budget b ON b.id = e.budget_id "
                        + "WHERE b.month = :month ORDER BY e.at DESC, e.seq DESC")
                .bind("month", month)
                .map((row, meta) -> new BudgetEventView(row.get("action", String.class),
                        row.get("member_id", UUID.class), row.get("at", Instant.class)))
                .all();
    }

    private static Row row(io.r2dbc.spi.Readable row) {
        return new Row(row.get("id", UUID.class), row.get("month", LocalDate.class),
                row.get("total", BigDecimal.class), row.get("removed_at", Instant.class));
    }
}
