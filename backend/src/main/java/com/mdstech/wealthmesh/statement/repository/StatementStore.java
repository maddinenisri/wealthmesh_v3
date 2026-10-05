package com.mdstech.wealthmesh.statement.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.statement.dto.StatementResponse;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** SQL reads over statements: each version with who entered it and what replaced it. */
@Repository
public class StatementStore {

    private static final String COLUMNS = """
            SELECT s.id, s.account_id, s.statement_on, s.balance, s.note, s.reason, s.replaces_id,
                   (SELECT n.id FROM statement n WHERE n.replaces_id = s.id) AS replaced_by_id,
                   s.entered_by_member_id, m.name AS entered_by_name, s.created_at
            FROM statement s JOIN household_member m ON m.id = s.entered_by_member_id""";

    private final DatabaseClient client;

    public StatementStore(DatabaseClient client) {
        this.client = client;
    }

    /** Every version of every statement of the account, newest first. */
    public Flux<StatementResponse> ofAccount(UUID accountId) {
        return client.sql(COLUMNS + " WHERE s.account_id = :id ORDER BY s.seq DESC")
                .bind("id", accountId).map(StatementStore::response).all();
    }

    public Mono<StatementResponse> byId(UUID id) {
        return client.sql(COLUMNS + " WHERE s.id = :id").bind("id", id).map(StatementStore::response).one();
    }

    /** Frees a stored key once it is past its lifetime, so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE statement SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND created_at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    private static StatementResponse response(io.r2dbc.spi.Readable row, io.r2dbc.spi.RowMetadata meta) {
        UUID replacedBy = row.get("replaced_by_id", UUID.class);
        return new StatementResponse(row.get("id", UUID.class), row.get("account_id", UUID.class),
                row.get("statement_on", LocalDate.class), Money.format(row.get("balance", BigDecimal.class)),
                row.get("note", String.class), row.get("reason", String.class), row.get("replaces_id", UUID.class),
                replacedBy, replacedBy == null, row.get("entered_by_member_id", UUID.class),
                row.get("entered_by_name", String.class), row.get("created_at", OffsetDateTime.class).toInstant());
    }
}
