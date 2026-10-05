package com.mdstech.wealthmesh.reminder.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.reminder.dto.ReminderResponse;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** SQL reads over reminders: one row with its account, category and member names. */
@Repository
public class ReminderStore {

    private static final String COLUMNS = """
            SELECT r.id, r.account_id, ac.name AS account_name, r.kind, r.amount, r.due_on, r.description,
                   c.id AS category_id, c.name AS category_name, r.entered_by_member_id, m.name AS entered_by_name,
                   r.created_at
            FROM reminder r JOIN account ac ON ac.id = r.account_id
            JOIN category c0 ON c0.id = r.category_id
            JOIN category c ON c.id = COALESCE(c0.merged_into_id, c0.id)
            JOIN household_member m ON m.id = r.entered_by_member_id""";

    private final DatabaseClient client;

    public ReminderStore(DatabaseClient client) {
        this.client = client;
    }

    /** All reminders, soonest due first. */
    public Flux<ReminderResponse> all() {
        return client.sql(COLUMNS + " ORDER BY r.due_on, r.created_at").map(ReminderStore::response).all();
    }

    public Mono<ReminderResponse> byId(UUID id) {
        return client.sql(COLUMNS + " WHERE r.id = :id").bind("id", id).map(ReminderStore::response).one();
    }

    /** Frees a stored key once it is past its lifetime, so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE reminder SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND created_at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    private static ReminderResponse response(io.r2dbc.spi.Readable row, io.r2dbc.spi.RowMetadata meta) {
        return new ReminderResponse(row.get("id", UUID.class), row.get("account_id", UUID.class),
                row.get("account_name", String.class), row.get("kind", String.class),
                Money.format(row.get("amount", BigDecimal.class)), row.get("due_on", LocalDate.class),
                row.get("description", String.class), row.get("category_id", UUID.class),
                row.get("category_name", String.class), row.get("entered_by_member_id", UUID.class),
                row.get("entered_by_name", String.class),
                row.get("created_at", OffsetDateTime.class).toInstant());
    }
}
