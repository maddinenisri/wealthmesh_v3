package com.mdstech.wealthmesh.opening.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.opening.dto.OpeningRevisionResponse;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** SQL reads over starting-balance corrections, oldest first, with the member's name. */
@Repository
public class OpeningRevisionStore {

    private static final String COLUMNS = """
            SELECT r.id, r.previous_amount, r.previous_on, r.opening_amount, r.opened_on, r.reason,
                   r.entered_by_member_id, m.name AS entered_by_name, r.created_at
            FROM opening_revision r JOIN household_member m ON m.id = r.entered_by_member_id""";

    private final DatabaseClient client;

    public OpeningRevisionStore(DatabaseClient client) {
        this.client = client;
    }

    public Flux<OpeningRevisionResponse> ofAccount(UUID accountId) {
        return client.sql(COLUMNS + " WHERE r.account_id = :id ORDER BY r.seq").bind("id", accountId)
                .map(OpeningRevisionStore::response).all();
    }

    public Mono<OpeningRevisionResponse> byId(UUID id) {
        return client.sql(COLUMNS + " WHERE r.id = :id").bind("id", id).map(OpeningRevisionStore::response).one();
    }

    /** Frees a stored key once it is past its lifetime, so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE opening_revision SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND created_at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    private static OpeningRevisionResponse response(io.r2dbc.spi.Readable row, io.r2dbc.spi.RowMetadata meta) {
        return new OpeningRevisionResponse(row.get("id", UUID.class),
                Money.format(row.get("previous_amount", BigDecimal.class)), row.get("previous_on", LocalDate.class),
                Money.format(row.get("opening_amount", BigDecimal.class)), row.get("opened_on", LocalDate.class),
                row.get("reason", String.class), row.get("entered_by_member_id", UUID.class),
                row.get("entered_by_name", String.class), row.get("created_at", OffsetDateTime.class).toInstant());
    }
}
