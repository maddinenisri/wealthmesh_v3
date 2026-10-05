package com.mdstech.wealthmesh.activity.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.activity.dto.HistoryEntry;
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
                   a.category_id, c.name AS category_name, a.entered_by_member_id, a.created_at, a.reason,
                   a.movement_id, cp.account_id AS counter_account_id, cpa.name AS counter_account_name
            FROM activity a JOIN account ac ON ac.id = a.account_id
            LEFT JOIN category c ON c.id = a.category_id
            LEFT JOIN activity cp ON cp.movement_id = a.movement_id AND cp.id <> a.id
            LEFT JOIN account cpa ON cpa.id = cp.account_id
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

    /** The date of the account's earliest entry that still counts; empty when it has none. */
    public Mono<LocalDate> earliestOf(UUID accountId) {
        return client.sql("SELECT MIN(occurred_on) AS earliest FROM activity "
                        + "WHERE removed_at IS NULL AND account_id = :account")
                .bind("account", accountId)
                .map((row, meta) -> java.util.Optional.ofNullable(row.get("earliest", LocalDate.class)))
                .one().flatMap(Mono::justOrEmpty);
    }

    /** Signed activity up to and including a date, leaving out one row (the correction being corrected). */
    public Mono<BigDecimal> changeUpTo(UUID accountId, LocalDate asOn, UUID excluding) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("SELECT COALESCE(SUM(" + SIGNED + "), 0) AS delta "
                        + "FROM activity WHERE removed_at IS NULL AND account_id = :account AND occurred_on <= :on"
                        + (excluding == null ? "" : " AND id <> :excluding"))
                .bind("account", accountId).bind("on", asOn);
        if (excluding != null) {
            spec = spec.bind("excluding", excluding);
        }
        return spec.map((row, meta) -> row.get("delta", BigDecimal.class)).one();
    }

    /** Locks the account row until the transaction ends, so corrections of one account run one at a time. */
    public Mono<UUID> lockAccount(UUID accountId) {
        return client.sql("SELECT id FROM account WHERE id = :id FOR UPDATE").bind("id", accountId)
                .map((row, meta) -> row.get("id", UUID.class)).one();
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

    /**
     * What counts toward one month figure, defined once so every reader agrees (decision 3): spending is expenses
     * minus refunds, income is income. `filter` selects the rows, `value` is each row's effect on the figure, and
     * `prefix` is the table alias ("a." or ""). Transfers, payments and corrections are in neither.
     */
    public record Counted(String filter, String value) {
        public static Counted of(String kind, String prefix) {
            return "income".equals(kind)
                    ? new Counted(prefix + "kind = 'income'", prefix + "amount")
                    : new Counted(prefix + "kind IN ('expense', 'refund')",
                            "CASE WHEN " + prefix + "kind = 'refund' THEN -" + prefix + "amount ELSE " + prefix
                                    + "amount END");
        }
    }

    /** Entries of one kind (expense or income) in a month, optionally one category. */
    public Flux<ActivityResponse> monthEntries(String kind, LocalDate from, LocalDate to, UUID categoryId,
            UUID accountId) {
        String sql = ENTRY_COLUMNS + " AND " + Counted.of(kind, "a.").filter()
                + " AND a.occurred_on >= :from AND a.occurred_on < :to"
                + (categoryId == null ? "" : " AND a.category_id = :category")
                + (accountId == null ? "" : " AND a.account_id = :account")
                + " ORDER BY a.occurred_on, a.created_at";
        DatabaseClient.GenericExecuteSpec spec = client.sql(sql).bind("from", from).bind("to", to);
        if (categoryId != null) {
            spec = spec.bind("category", categoryId);
        }
        if (accountId != null) {
            spec = spec.bind("account", accountId);
        }
        return spec.map(ActivityStore::entry).all();
    }

    /** Total of one kind (expense or income) in a month; removed rows never count. */
    public Mono<BigDecimal> monthTotal(String kind, LocalDate from, LocalDate to) {
        Counted counted = Counted.of(kind, "");
        return client.sql("SELECT COALESCE(SUM(" + counted.value() + "), 0) AS total FROM activity "
                        + "WHERE removed_at IS NULL AND " + counted.filter()
                        + " AND occurred_on >= :from AND occurred_on < :to")
                .bind("from", from).bind("to", to)
                .map((row, meta) -> row.get("total", BigDecimal.class)).one();
    }

    public record CategoryTotal(UUID categoryId, String name, BigDecimal total, long count) {
    }

    /** Totals of one kind (expense or income) in a month, one row per category. */
    public Flux<CategoryTotal> totalsByCategory(String kind, LocalDate from, LocalDate to, UUID accountId) {
        Counted counted = Counted.of(kind, "a.");
        DatabaseClient.GenericExecuteSpec spec = client.sql("SELECT a.category_id, "
                + "COALESCE(c.name, 'Uncategorized') AS name, SUM(" + counted.value() + ") AS total, COUNT(*) AS n "
                + "FROM activity a LEFT JOIN category c ON c.id = a.category_id "
                + "WHERE a.removed_at IS NULL AND " + counted.filter()
                + " AND a.occurred_on >= :from AND a.occurred_on < :to"
                + (accountId == null ? "" : " AND a.account_id = :account")
                + " GROUP BY a.category_id, c.name ORDER BY SUM(" + counted.value() + ") DESC, name")
                .bind("from", from).bind("to", to);
        if (accountId != null) {
            spec = spec.bind("account", accountId);
        }
        return spec
                .map((row, meta) -> new CategoryTotal(row.get("category_id", UUID.class), row.get("name", String.class),
                        row.get("total", BigDecimal.class), row.get("n", Long.class)))
                .all();
    }

    public record MonthTotal(String month, BigDecimal total) {
    }

    /** Spending per calendar month that has at least one expense or refund, oldest first. */
    public Flux<MonthTotal> spendingByMonth() {
        Counted counted = Counted.of("expense", "");
        return client.sql("SELECT to_char(occurred_on, 'YYYY-MM') AS month, SUM(" + counted.value() + ") AS total "
                + "FROM activity WHERE removed_at IS NULL AND " + counted.filter() + " GROUP BY 1 ORDER BY 1")
                .map((row, meta) -> new MonthTotal(row.get("month", String.class), row.get("total", BigDecimal.class)))
                .all();
    }

    /** Brings back a removed entry that nothing replaced. Zero rows means it was not removable. */
    public Mono<Long> clearRemoved(UUID id) {
        return client.sql("UPDATE activity SET removed_at = NULL, removed_by_member_id = NULL WHERE id = :id "
                        + "AND removed_at IS NOT NULL AND NOT EXISTS "
                        + "(SELECT 1 FROM activity r WHERE r.replaces_id = :id)")
                .bind("id", id).fetch().rowsUpdated();
    }

    /** Marks an entry as removed or replaced: it leaves Balance and totals but stays in history. */
    public Mono<Long> markRemoved(UUID id, UUID byMemberId, Instant at) {
        return client.sql("UPDATE activity SET removed_at = :at, removed_by_member_id = :by WHERE id = :id "
                        + "AND removed_at IS NULL")
                .bind("at", at).bind("by", byMemberId).bind("id", id).fetch().rowsUpdated();
    }

    /** Records who replaced, removed or restored an entry, and when. */
    public Mono<Long> recordEvent(UUID activityId, String action, UUID memberId, Instant at) {
        return client.sql("INSERT INTO activity_event (activity_id, action, member_id, occurred_at) "
                        + "VALUES (:activity, :action, :member, :at)")
                .bind("activity", activityId).bind("action", action).bind("member", memberId).bind("at", at)
                .fetch().rowsUpdated();
    }

    private Mono<Map<UUID, List<HistoryEntry.Event>>> eventsOf(UUID accountId) {
        return client.sql("""
                SELECT e.activity_id, e.action, m.name, e.occurred_at
                FROM activity_event e JOIN activity a ON a.id = e.activity_id
                JOIN household_member m ON m.id = e.member_id
                WHERE a.account_id = :account ORDER BY e.seq""")
                .bind("account", accountId)
                .map((row, meta) -> Map.entry(row.get("activity_id", UUID.class),
                        new HistoryEntry.Event(row.get("action", String.class), row.get("name", String.class),
                                instant(row, "occurred_at"))))
                .all().collect(Collectors.groupingBy(Map.Entry::getKey,
                        Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
    }

    /** All rows of an account, including replaced and removed ones, newest first. */
    public Flux<HistoryEntry> history(UUID accountId) {
        return eventsOf(accountId).flatMapMany(events -> historyRows(accountId, events));
    }

    private Flux<HistoryEntry> historyRows(UUID accountId, Map<UUID, List<HistoryEntry.Event>> events) {
        return client.sql("""
                SELECT a.id, a.kind, a.amount, a.occurred_on, a.description, c.name AS category_name,
                       a.entered_by_member_id, m.name AS entered_by_name, a.created_at, a.reason, a.replaces_id,
                       r.id AS replaced_by_id,
                       CASE WHEN r.id IS NOT NULL THEN 'replaced' WHEN a.removed_at IS NOT NULL THEN 'removed'
                            ELSE 'effective' END AS status,
                       p.account_id AS p_account_id, pa.name AS p_account_name, p.kind AS p_kind,
                       p.amount AS p_amount, p.occurred_on AS p_on, pc.name AS p_category,
                       pm.name AS p_by, p.created_at AS p_at,
                       r.account_id AS r_account_id, ra.name AS r_account_name, r.kind AS r_kind,
                       r.amount AS r_amount, r.occurred_on AS r_on, rc.name AS r_category,
                       rm.name AS r_by, r.created_at AS r_at,
                       a.movement_id, cp.account_id AS counter_account_id, cpa.name AS counter_account_name
                FROM activity a LEFT JOIN category c ON c.id = a.category_id
                LEFT JOIN household_member m ON m.id = a.entered_by_member_id
                LEFT JOIN activity r ON r.replaces_id = a.id
                LEFT JOIN account ra ON ra.id = r.account_id
                LEFT JOIN category rc ON rc.id = r.category_id
                LEFT JOIN household_member rm ON rm.id = r.entered_by_member_id
                LEFT JOIN activity p ON p.id = a.replaces_id
                LEFT JOIN account pa ON pa.id = p.account_id
                LEFT JOIN category pc ON pc.id = p.category_id
                LEFT JOIN household_member pm ON pm.id = p.entered_by_member_id
                LEFT JOIN activity cp ON cp.movement_id = a.movement_id AND cp.id <> a.id
                LEFT JOIN account cpa ON cpa.id = cp.account_id
                WHERE a.account_id = :account
                  AND a.kind IN ('expense', 'income', 'refund', 'correction', 'transfer_in', 'transfer_out')
                ORDER BY a.created_at DESC, a.occurred_on DESC""")
                .bind("account", accountId)
                .map((row, meta) -> new HistoryEntry(row.get("id", UUID.class), row.get("kind", String.class),
                        Money.format(row.get("amount", BigDecimal.class)), row.get("occurred_on", LocalDate.class),
                        row.get("description", String.class), row.get("category_name", String.class),
                        row.get("entered_by_member_id", UUID.class), row.get("entered_by_name", String.class),
                        instant(row, "created_at"), row.get("reason", String.class),
                        row.get("replaces_id", UUID.class), row.get("replaced_by_id", UUID.class),
                        row.get("status", String.class),
                        events.getOrDefault(row.get("id", UUID.class), List.of()),
                        origin(row, "replaces_id", "p_"), origin(row, "replaced_by_id", "r_"),
                        row.get("movement_id", UUID.class), row.get("counter_account_id", UUID.class),
                        row.get("counter_account_name", String.class)))
                .all();
    }

    /** The row on the other side of a replacement, read from the columns that start with the prefix. */
    private static HistoryEntry.Origin origin(io.r2dbc.spi.Readable row, String idColumn, String prefix) {
        UUID id = row.get(idColumn, UUID.class);
        if (id == null) {
            return null;
        }
        return new HistoryEntry.Origin(id, row.get(prefix + "account_id", UUID.class),
                row.get(prefix + "account_name", String.class), row.get(prefix + "kind", String.class),
                Money.format(row.get(prefix + "amount", BigDecimal.class)),
                row.get(prefix + "on", LocalDate.class),
                row.get(prefix + "category", String.class), row.get(prefix + "by", String.class),
                instant(row, prefix + "at"));
    }

    private static Instant instant(io.r2dbc.spi.Readable row, String column) {
        java.time.OffsetDateTime value = row.get(column, java.time.OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static ActivityResponse entry(io.r2dbc.spi.Readable row, io.r2dbc.spi.RowMetadata meta) {
        return new ActivityResponse(row.get("id", UUID.class), row.get("account_id", UUID.class),
                row.get("account_name", String.class), row.get("kind", String.class),
                Money.format(row.get("amount", BigDecimal.class)), row.get("occurred_on", LocalDate.class),
                row.get("description", String.class), row.get("category_id", UUID.class),
                row.get("category_name", String.class), row.get("entered_by_member_id", UUID.class),
                row.get("created_at", java.time.OffsetDateTime.class).toInstant(), row.get("reason", String.class),
                row.get("movement_id", UUID.class), row.get("counter_account_id", UUID.class),
                row.get("counter_account_name", String.class));
    }
}
