package com.mdstech.wealthmesh.investment.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.investment.service.OpeningComponents;

import reactor.core.publisher.Mono;

/**
 * Opening components of an investment account (V27): cash, the typed total and the holding lines. Plain SQL, run
 * under the account lock by the caller. The account row's opening_amount is written by the service, not here.
 */
@Repository
public class OpeningStore {

    /** The stored components, the supporting statement the opening used and whether that statement is removed. */
    public record Stored(OpeningComponents components, UUID statementId, boolean statementRemoved) {
    }

    private final DatabaseClient client;

    public OpeningStore(DatabaseClient client) {
        this.client = client;
    }

    /** Writes the components, replacing any earlier ones (a draft is completed or re-saved). */
    public Mono<Void> save(UUID accountId, OpeningComponents components, Instant now) {
        DatabaseClient.GenericExecuteSpec upsert = client.sql("""
                        INSERT INTO account_opening (account_id, typed_total, cash, blank, updated_at)
                        VALUES (:id, :total, :cash, :blank, :now)
                        ON CONFLICT (account_id) DO UPDATE SET typed_total = :total, cash = :cash, blank = :blank,
                            updated_at = :now""")
                .bind("id", accountId).bind("blank", components.blank()).bind("now", now);
        upsert = components.total() == null ? upsert.bindNull("total", BigDecimal.class)
                : upsert.bind("total", components.total());
        upsert = components.cash() == null ? upsert.bindNull("cash", BigDecimal.class)
                : upsert.bind("cash", components.cash());
        Mono<Void> clear = client.sql("DELETE FROM account_opening_holding WHERE account_id = :id")
                .bind("id", accountId).then();
        List<OpeningComponents.Line> lines = components.lines();
        Mono<Void> inserts = Mono.defer(() -> {
            Mono<Void> chain = Mono.empty();
            for (int i = 0; i < lines.size(); i++) {
                OpeningComponents.Line line = lines.get(i);
                int position = i;
                DatabaseClient.GenericExecuteSpec insert = client.sql("""
                                INSERT INTO account_opening_holding
                                    (account_id, position, symbol, quantity, price, value_on, cost)
                                VALUES (:id, :position, :symbol, :quantity, :price, :on, :cost)""")
                        .bind("id", accountId).bind("position", position).bind("symbol", line.symbol())
                        .bind("quantity", line.quantity()).bind("price", line.price()).bind("on", line.valueOn());
                insert = line.cost() == null ? insert.bindNull("cost", BigDecimal.class)
                        : insert.bind("cost", line.cost());
                chain = chain.then(insert.then());
            }
            return chain;
        });
        return upsert.then().then(clear).then(inserts);
    }

    /** The stored components of an account, or empty when it has none (not an investment account). */
    public Mono<Stored> of(UUID accountId) {
        return client.sql("""
                        SELECT o.typed_total, o.cash, o.blank, o.statement_id,
                               s.removed_at IS NOT NULL AS statement_removed
                        FROM account_opening o LEFT JOIN statement s ON s.id = o.statement_id
                        WHERE o.account_id = :id""")
                .bind("id", accountId)
                .map((row, meta) -> new Object[] { row.get("typed_total", BigDecimal.class),
                        row.get("cash", BigDecimal.class), row.get("blank", Boolean.class),
                        row.get("statement_id", UUID.class), row.get("statement_removed", Boolean.class) })
                .one()
                .flatMap(head -> client.sql("""
                                SELECT symbol, quantity, price, value_on, cost FROM account_opening_holding
                                WHERE account_id = :id ORDER BY position""")
                        .bind("id", accountId)
                        .map((row, meta) -> new OpeningComponents.Line(row.get("symbol", String.class),
                                row.get("quantity", BigDecimal.class), row.get("price", BigDecimal.class),
                                row.get("value_on", LocalDate.class), row.get("cost", BigDecimal.class)))
                        .all().collectList().map(lines -> new Stored(
                                new OpeningComponents((BigDecimal) head[0], (BigDecimal) head[1],
                                        new ArrayList<>(lines), (Boolean) head[2]),
                                (UUID) head[3], Boolean.TRUE.equals(head[4]))));
    }
}
