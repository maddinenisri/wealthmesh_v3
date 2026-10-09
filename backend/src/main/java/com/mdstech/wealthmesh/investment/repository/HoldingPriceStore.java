package com.mdstech.wealthmesh.investment.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.investment.dto.PriceView;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Prices recorded on holdings (V34): plain SQL, run under the account lock by the writer. A price is never updated in
 * place: a later save for the same holding and date marks the earlier one replaced and inserts a new row.
 */
@Repository
public class HoldingPriceStore {

    private static final String COLUMNS = """
            SELECT p.id, p.symbol, p.price, p.value_on, p.entered_by_member_id, m.name AS entered_by_name,
                   p.created_at, p.replaced_at, p.account_id, p.idempotency_key
            FROM holding_price p JOIN household_member m ON m.id = p.entered_by_member_id
            WHERE p.removed_at IS NULL""";

    /** One opening line's effective price on a date (see {@link HoldingDeltaSql}). */
    public record Effective(int position, BigDecimal price, LocalDate priceOn) {
    }

    /** A stored price with the key it was saved under, for the replay comparison. */
    public record Stored(PriceView view, UUID accountId, String key) {
    }

    private final DatabaseClient client;

    public HoldingPriceStore(DatabaseClient client) {
        this.client = client;
    }

    private static Stored stored(io.r2dbc.spi.Readable row) {
        Instant created = row.get("created_at", OffsetDateTime.class).toInstant();
        OffsetDateTime replaced = row.get("replaced_at", OffsetDateTime.class);
        return new Stored(new PriceView(row.get("id", UUID.class).toString(), row.get("symbol", String.class),
                com.mdstech.wealthmesh.investment.service.OpeningComponents.priceText(
                        row.get("price", BigDecimal.class)),
                row.get("value_on", LocalDate.class), row.get("entered_by_member_id", UUID.class).toString(),
                row.get("entered_by_name", String.class), created, replaced != null,
                replaced == null ? null : replaced.toInstant()), row.get("account_id", UUID.class),
                row.get("idempotency_key", String.class));
    }

    /** The effective price of each opening line of the account on a date (a SQL date expression such as `:on`). */
    public Flux<Effective> effective(UUID accountId, String dateExpr, LocalDate on) {
        DatabaseClient.GenericExecuteSpec spec = client.sql(HoldingDeltaSql.lines(dateExpr)).bind("account", accountId);
        if (on != null) {
            spec = spec.bind("on", on);
        }
        return spec.map((row, meta) -> new Effective(row.get("position", Integer.class),
                row.get("price", BigDecimal.class), row.get("price_on", LocalDate.class))).all();
    }

    /** Every price of the account, newest date first then newest save, replaced ones included. */
    public Flux<PriceView> history(UUID accountId) {
        return client.sql(COLUMNS + " AND p.account_id = :account ORDER BY p.value_on DESC, p.created_at DESC")
                .bind("account", accountId).map((row, meta) -> stored(row).view()).all();
    }

    /** The price that counts for the holding on that date, if any (read under the account lock). */
    public Mono<PriceView> counted(UUID accountId, String symbol, LocalDate on) {
        return client.sql(COLUMNS + " AND p.account_id = :account AND p.symbol = :symbol AND p.value_on = :on "
                        + "AND p.replaced_at IS NULL")
                .bind("account", accountId).bind("symbol", symbol).bind("on", on)
                .map((row, meta) -> stored(row).view()).one();
    }

    /** Frees a stored key once it is past its lifetime, so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE holding_price SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND created_at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    public Mono<Stored> byKey(String key, Instant cutoff) {
        return client.sql(COLUMNS + " AND p.idempotency_key = :key AND p.created_at > :cutoff")
                .bind("key", key).bind("cutoff", cutoff).map((row, meta) -> stored(row)).one();
    }

    public Mono<PriceView> byId(UUID id) {
        return client.sql(COLUMNS + " AND p.id = :id").bind("id", id).map((row, meta) -> stored(row).view()).one();
    }

    /**
     * Saves the price. A price already counting for the same holding and date is marked replaced first (so the unique
     * index holds), then the new row is inserted and the replaced one points at it. Returns the new id.
     */
    public Mono<UUID> save(UUID accountId, String symbol, BigDecimal price, LocalDate on, UUID memberId, String key,
            Instant now) {
        Mono<Long> replace = client.sql("UPDATE holding_price SET replaced_at = :now WHERE account_id = :account "
                        + "AND symbol = :symbol AND value_on = :on AND replaced_at IS NULL AND removed_at IS NULL")
                .bind("now", now).bind("account", accountId).bind("symbol", symbol).bind("on", on)
                .fetch().rowsUpdated();
        return replace.then(Mono.defer(() -> client.sql("""
                        INSERT INTO holding_price (account_id, symbol, price, value_on, entered_by_member_id,
                                                   idempotency_key, created_at)
                        VALUES (:account, :symbol, :price, :on, :member, :key, :now) RETURNING id""")
                .bind("account", accountId).bind("symbol", symbol).bind("price", price).bind("on", on)
                .bind("member", memberId).bind("key", key).bind("now", now)
                .map((row, meta) -> row.get("id", UUID.class)).one()))
                .flatMap(id -> client.sql("UPDATE holding_price SET replaced_by_id = :id WHERE account_id = :account "
                                + "AND symbol = :symbol AND value_on = :on AND replaced_at IS NOT NULL "
                                + "AND replaced_by_id IS NULL AND id <> :id")
                        .bind("id", id).bind("account", accountId).bind("symbol", symbol).bind("on", on)
                        .fetch().rowsUpdated().thenReturn(id));
    }
}
