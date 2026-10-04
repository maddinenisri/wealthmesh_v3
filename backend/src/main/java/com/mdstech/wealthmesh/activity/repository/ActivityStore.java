package com.mdstech.wealthmesh.activity.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** SQL reads over the ledger: Balance sums, account activity and entry lists. Removed rows never count. */
@Repository
public class ActivityStore {

    /** Signed effect of one row on a bank Balance (foundations 6). */
    private static final String SIGNED = """
            CASE WHEN kind IN ('income', 'refund', 'transfer_in', 'interest', 'correction') THEN amount
                 ELSE -amount END""";

    private static final String ENTRY_COLUMNS = """
            SELECT a.id, a.account_id, ac.name AS account_name, a.kind, a.amount, a.occurred_on, a.description,
                   a.category_id, c.name AS category_name, a.entered_by_member_id, a.created_at
            FROM activity a JOIN account ac ON ac.id = a.account_id
            LEFT JOIN category c ON c.id = a.category_id
            WHERE a.removed_at IS NULL""";

    private final DatabaseClient client;

    public ActivityStore(DatabaseClient client) {
        this.client = client;
    }

    /** A change to an account's Balance: total effect of its activity and the date of the latest entry. */
    public record Delta(BigDecimal amount, LocalDate latest) {
        public static final Delta NONE = new Delta(BigDecimal.ZERO, null);
    }

    public Mono<Map<UUID, Delta>> deltasByAccount() {
        return client.sql("SELECT account_id, SUM(" + SIGNED + ") AS delta, MAX(occurred_on) AS latest "
                        + "FROM activity WHERE removed_at IS NULL GROUP BY account_id")
                .map((row, meta) -> Map.entry(row.get("account_id", UUID.class),
                        new Delta(row.get("delta", BigDecimal.class), row.get("latest", LocalDate.class))))
                .all().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public Mono<Delta> deltaOf(UUID accountId) {
        return client.sql("SELECT SUM(" + SIGNED + ") AS delta, MAX(occurred_on) AS latest "
                        + "FROM activity WHERE removed_at IS NULL AND account_id = :account")
                .bind("account", accountId)
                .map((row, meta) -> {
                    BigDecimal delta = row.get("delta", BigDecimal.class);
                    return delta == null ? Delta.NONE : new Delta(delta, row.get("latest", LocalDate.class));
                })
                .one().defaultIfEmpty(Delta.NONE);
    }

    /** Frees a stored key once it is past its lifetime, so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE activity SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND created_at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    public Flux<ActivityResponse> forAccount(UUID accountId) {
        return client.sql(ENTRY_COLUMNS + " AND a.account_id = :account ORDER BY a.occurred_on DESC, a.created_at DESC")
                .bind("account", accountId).map(ActivityStore::entry).all();
    }

    public Mono<ActivityResponse> byId(UUID id) {
        return client.sql(ENTRY_COLUMNS + " AND a.id = :id").bind("id", id).map(ActivityStore::entry).one();
    }

    /** Entries of one kind (expense or income) in a month, optionally one category. */
    public Flux<ActivityResponse> monthEntries(String kind, LocalDate from, LocalDate to, UUID categoryId) {
        String sql = ENTRY_COLUMNS + " AND a.kind = :kind AND a.occurred_on >= :from AND a.occurred_on < :to"
                + (categoryId == null ? "" : " AND a.category_id = :category")
                + " ORDER BY a.occurred_on, a.created_at";
        DatabaseClient.GenericExecuteSpec spec = client.sql(sql).bind("kind", kind).bind("from", from).bind("to", to);
        if (categoryId != null) {
            spec = spec.bind("category", categoryId);
        }
        return spec.map(ActivityStore::entry).all();
    }

    public record CategoryTotal(UUID categoryId, String name, BigDecimal total, long count) {
    }

    /** Totals of one kind (expense or income) in a month, one row per category. */
    public Flux<CategoryTotal> totalsByCategory(String kind, LocalDate from, LocalDate to) {
        return client.sql("""
                SELECT a.category_id, COALESCE(c.name, 'Uncategorized') AS name, SUM(a.amount) AS total, COUNT(*) AS n
                FROM activity a LEFT JOIN category c ON c.id = a.category_id
                WHERE a.removed_at IS NULL AND a.kind = :kind AND a.occurred_on >= :from AND a.occurred_on < :to
                GROUP BY a.category_id, c.name ORDER BY SUM(a.amount) DESC, name""")
                .bind("kind", kind).bind("from", from).bind("to", to)
                .map((row, meta) -> new CategoryTotal(row.get("category_id", UUID.class), row.get("name", String.class),
                        row.get("total", BigDecimal.class), row.get("n", Long.class)))
                .all();
    }

    public record MonthTotal(String month, BigDecimal total) {
    }

    /** Spending per calendar month that has at least one expense, oldest first. */
    public Flux<MonthTotal> spendingByMonth() {
        return client.sql("""
                SELECT to_char(occurred_on, 'YYYY-MM') AS month, SUM(amount) AS total
                FROM activity WHERE removed_at IS NULL AND kind = 'expense'
                GROUP BY 1 ORDER BY 1""")
                .map((row, meta) -> new MonthTotal(row.get("month", String.class), row.get("total", BigDecimal.class)))
                .all();
    }

    private static ActivityResponse entry(io.r2dbc.spi.Readable row, io.r2dbc.spi.RowMetadata meta) {
        return new ActivityResponse(row.get("id", UUID.class), row.get("account_id", UUID.class),
                row.get("account_name", String.class), row.get("kind", String.class),
                Money.format(row.get("amount", BigDecimal.class)), row.get("occurred_on", LocalDate.class),
                row.get("description", String.class), row.get("category_id", UUID.class),
                row.get("category_name", String.class), row.get("entered_by_member_id", UUID.class),
                row.get("created_at", java.time.OffsetDateTime.class).toInstant());
    }
}
