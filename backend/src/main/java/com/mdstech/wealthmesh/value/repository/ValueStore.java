package com.mdstech.wealthmesh.value.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.value.dto.ValueEvent;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * SQL for the dated values of a property or other asset (`account_value`, V24). Plain SQL like the other stores; the
 * service runs every write under the account row lock. "Effective" means not removed, not replaced and not a plan.
 */
@Repository
public class ValueStore {

    /** A stored value, with the names the history shows. */
    public record Row(UUID id, UUID accountId, LocalDate valueOn, BigDecimal amount, String reason, boolean planned,
            UUID enteredByMemberId, String enteredBy, UUID replacesId, Instant replacedAt, Instant removedAt,
            String removedBy, String fingerprint, Instant createdAt, BigDecimal payCredit, BigDecimal interestCredit) {

        public boolean effective() {
            return removedAt == null && replacedAt == null && !planned;
        }
    }

    /** A value and the date it is for. */
    public record Point(BigDecimal amount, LocalDate on) {
    }

    private static final String ROWS = """
            SELECT v.id, v.account_id, v.value_on, v.amount, v.reason, v.planned, v.entered_by_member_id,
                   m.name AS entered_by, v.replaces_id, v.replaced_at, v.removed_at, rm.name AS removed_by,
                   v.fingerprint, v.created_at, v.pay_credit, v.interest_credit
            FROM account_value v JOIN household_member m ON m.id = v.entered_by_member_id
            LEFT JOIN household_member rm ON rm.id = v.removed_by_member_id""";

    private final DatabaseClient client;

    public ValueStore(DatabaseClient client) {
        this.client = client;
    }

    private static Row row(io.r2dbc.spi.Readable r) {
        return new Row(r.get("id", UUID.class), r.get("account_id", UUID.class), r.get("value_on", LocalDate.class),
                r.get("amount", BigDecimal.class), r.get("reason", String.class), Boolean.TRUE.equals(
                        r.get("planned", Boolean.class)), r.get("entered_by_member_id", UUID.class),
                r.get("entered_by", String.class), r.get("replaces_id", UUID.class),
                r.get("replaced_at", Instant.class), r.get("removed_at", Instant.class),
                r.get("removed_by", String.class), r.get("fingerprint", String.class),
                r.get("created_at", Instant.class), r.get("pay_credit", BigDecimal.class),
                r.get("interest_credit", BigDecimal.class));
    }

    public Flux<Row> rowsOf(UUID accountId) {
        return client.sql(ROWS + " WHERE v.account_id = :account ORDER BY v.value_on DESC, v.created_at DESC")
                .bind("account", accountId).map((r, meta) -> row(r)).all();
    }

    public Mono<Row> byId(UUID id) {
        return client.sql(ROWS + " WHERE v.id = :id").bind("id", id).map((r, meta) -> row(r)).one();
    }

    /** The value saved under a key that is still alive (a retry), or empty. */
    public Mono<Row> byKey(String key, Instant cutoff) {
        return client.sql(ROWS + " WHERE v.idempotency_key = :key AND v.created_at > :cutoff").bind("key", key)
                .bind("cutoff", cutoff).map((r, meta) -> row(r)).one();
    }

    /** Frees a stored key once it is past its lifetime, so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE account_value SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND created_at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    /** The id of the effective value that is the account's Balance now; empty when the Balance is its setup value. */
    public Mono<UUID> currentId(UUID accountId) {
        return client.sql("SELECT id FROM account_value WHERE account_id = :account AND removed_at IS NULL "
                        + "AND replaced_at IS NULL AND NOT planned ORDER BY value_on DESC, created_at DESC LIMIT 1")
                .bind("account", accountId).map((r, meta) -> r.get("id", UUID.class)).one();
    }

    /** The effective value in force on a date, leaving out one row (the value being corrected or removed). */
    public Mono<Point> effectiveOn(UUID accountId, LocalDate on, UUID excluding) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("SELECT amount, value_on FROM account_value "
                        + "WHERE account_id = :account AND removed_at IS NULL AND replaced_at IS NULL AND NOT planned "
                        + "AND value_on <= :on" + (excluding == null ? "" : " AND id <> :excluding")
                        + " ORDER BY value_on DESC, created_at DESC LIMIT 1")
                .bind("account", accountId).bind("on", on);
        if (excluding != null) {
            spec = spec.bind("excluding", excluding);
        }
        return spec.map((r, meta) -> new Point(r.get("amount", BigDecimal.class), r.get("value_on", LocalDate.class)))
                .one();
    }

    /** Moves the account's start earlier: keeps what it replaced in `opening_revision`, then writes the new opening. */
    public Mono<UUID> moveStart(UUID accountId, BigDecimal previousAmount, LocalDate previousOn, BigDecimal amount,
            LocalDate openedOn, String reason, UUID memberId, String key, Instant now) {
        return client.sql("INSERT INTO opening_revision (account_id, previous_amount, previous_on, opening_amount, "
                        + "opened_on, reason, entered_by_member_id, idempotency_key, created_at) VALUES (:account, "
                        + ":previousAmount, :previousOn, :amount, :on, :reason, :member, :key, :now) RETURNING id")
                .bind("account", accountId).bind("previousAmount", previousAmount).bind("previousOn", previousOn)
                .bind("amount", amount).bind("on", openedOn).bind("reason", reason).bind("member", memberId)
                .bind("key", key).bind("now", now).map((r, meta) -> r.get("id", UUID.class)).one()
                .flatMap(id -> client.sql("UPDATE account SET opening_amount = :amount, opened_on = :on, "
                                + "updated_at = :now WHERE id = :account")
                        .bind("amount", amount).bind("on", openedOn).bind("now", now).bind("account", accountId)
                        .fetch().rowsUpdated().thenReturn(id));
    }

    /** The start move saved under a key that is still alive (a retry), or empty. */
    public Mono<Move> moveByKey(String key, Instant cutoff) {
        return client.sql("SELECT account_id, opening_amount, opened_on, reason, entered_by_member_id "
                        + "FROM opening_revision WHERE idempotency_key = :key AND created_at > :cutoff")
                .bind("key", key).bind("cutoff", cutoff)
                .map((r, meta) -> new Move(r.get("account_id", UUID.class), r.get("opening_amount", BigDecimal.class),
                        r.get("opened_on", LocalDate.class), r.get("reason", String.class),
                        r.get("entered_by_member_id", UUID.class)))
                .one();
    }

    /** The saved figures of a start move. */
    public record Move(UUID accountId, BigDecimal amount, LocalDate openedOn, String reason, UUID memberId) {
    }

    /** Frees the key of a start move once it is past its lifetime. */
    public Mono<Long> expireMoveKey(String key, Instant cutoff) {
        return client.sql("UPDATE opening_revision SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND created_at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    public Mono<UUID> insert(UUID accountId, LocalDate valueOn, BigDecimal amount, String reason, boolean planned,
            UUID memberId, UUID replacesId, String key, String fingerprint, Instant now, BigDecimal payCredit,
            BigDecimal interestCredit) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO account_value (account_id, value_on, amount, "
                        + "reason, planned, entered_by_member_id, replaces_id, idempotency_key, fingerprint, "
                        + "created_at, pay_credit, interest_credit) VALUES (:account, :on, :amount, :reason, "
                        + ":planned, :member, :replaces, :key, :fingerprint, :now, :pay, :interest) RETURNING id")
                .bind("account", accountId).bind("on", valueOn).bind("amount", amount).bind("planned", planned)
                .bind("member", memberId).bind("fingerprint", fingerprint).bind("now", now);
        spec = reason == null ? spec.bindNull("reason", String.class) : spec.bind("reason", reason);
        spec = replacesId == null ? spec.bindNull("replaces", UUID.class) : spec.bind("replaces", replacesId);
        spec = key == null ? spec.bindNull("key", String.class) : spec.bind("key", key);
        spec = payCredit == null ? spec.bindNull("pay", BigDecimal.class) : spec.bind("pay", payCredit);
        spec = interestCredit == null ? spec.bindNull("interest", BigDecimal.class)
                : spec.bind("interest", interestCredit);
        return spec.map((r, meta) -> r.get("id", UUID.class)).one();
    }

    /** Marks a value replaced by a correction; 0 when it was already replaced or removed. */
    public Mono<Long> markReplaced(UUID id, Instant at) {
        return client.sql("UPDATE account_value SET replaced_at = :at "
                        + "WHERE id = :id AND replaced_at IS NULL AND removed_at IS NULL")
                .bind("at", at).bind("id", id).fetch().rowsUpdated();
    }

    public Mono<Long> markRemoved(UUID id, UUID memberId, Instant at) {
        return client.sql("UPDATE account_value SET removed_at = :at, removed_by_member_id = :member "
                        + "WHERE id = :id AND removed_at IS NULL")
                .bind("at", at).bind("member", memberId).bind("id", id).fetch().rowsUpdated();
    }

    public Mono<Long> markRestored(UUID id) {
        return client.sql("UPDATE account_value SET removed_at = NULL, removed_by_member_id = NULL "
                        + "WHERE id = :id AND removed_at IS NOT NULL")
                .bind("id", id).fetch().rowsUpdated();
    }

    public Mono<Void> recordEvent(UUID accountId, UUID valueId, String action, UUID memberId, Instant at,
            String detail) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO account_value_event (account_id, value_id, "
                        + "action, member_id, at, detail) VALUES (:account, :value, :action, :member, :at, :detail)")
                .bind("account", accountId).bind("action", action).bind("member", memberId).bind("at", at);
        spec = valueId == null ? spec.bindNull("value", UUID.class) : spec.bind("value", valueId);
        spec = detail == null ? spec.bindNull("detail", String.class) : spec.bind("detail", detail);
        return spec.then();
    }

    /** The latest action recorded for a value (a repeat of Undo is the same result). */
    public Mono<String> latestAction(UUID valueId) {
        return client.sql("SELECT action FROM account_value_event WHERE value_id = :id ORDER BY seq DESC LIMIT 1")
                .bind("id", valueId).map((r, meta) -> r.get("action", String.class)).one();
    }

    /** What was done to the account's values, newest first. */
    public Flux<ValueEvent> eventsOf(UUID accountId) {
        return client.sql("""
                        SELECT e.action, v.value_on, v.amount, e.detail, m.name AS by_name, e.at
                        FROM account_value_event e JOIN household_member m ON m.id = e.member_id
                        LEFT JOIN account_value v ON v.id = e.value_id
                        WHERE e.account_id = :account ORDER BY e.seq DESC""")
                .bind("account", accountId)
                .map((r, meta) -> new ValueEvent(r.get("action", String.class),
                        r.get("value_on", LocalDate.class) == null ? null
                                : r.get("value_on", LocalDate.class).toString(),
                        r.get("amount", BigDecimal.class) == null ? null
                                : com.mdstech.wealthmesh.money.Money.format(r.get("amount", BigDecimal.class)),
                        r.get("detail", String.class), r.get("by_name", String.class), r.get("at", Instant.class)))
                .all();
    }

    /** True when any effective value exists (used to say whether the Balance is the initial value). */
    public Mono<List<Row>> effectiveRows(UUID accountId) {
        return rowsOf(accountId).filter(Row::effective).collectList();
    }
}
