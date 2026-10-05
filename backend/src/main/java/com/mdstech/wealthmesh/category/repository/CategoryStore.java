package com.mdstech.wealthmesh.category.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.activity.repository.ActivityStore.Counted;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.dto.CategoryEvent;
import com.mdstech.wealthmesh.category.dto.CategoryUsage;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** SQL for category writes: duplicate checks, locks, the lifecycle updates and the change log (`category_event`). */
@Repository
public class CategoryStore {

    private static final String COLUMNS =
            "id, name, kind, sort_order, default_class, archived_at, merged_into_id, merge_id";

    private final DatabaseClient client;

    public CategoryStore(DatabaseClient client) {
        this.client = client;
    }

    /** A category of this kind whose name matches ignoring case and spaces (archived included), other than `except`. */
    public Mono<Category> findDuplicate(String kind, String name, UUID except) {
        return client.sql("SELECT " + COLUMNS + " FROM category WHERE kind = :kind AND lower(btrim(name)) = :name "
                        + "AND id <> :except")
                .bind("kind", kind).bind("name", name.toLowerCase(java.util.Locale.ROOT))
                .bind("except", except == null ? new UUID(0, 0) : except)
                .map((row, meta) -> category(row)).one();
    }

    /** Locks the categories, lowest id first, so two writers of the same rows cannot wait on each other. */
    public Flux<Category> lock(List<UUID> ids) {
        return client.sql("SELECT " + COLUMNS + " FROM category WHERE id IN (:ids) ORDER BY id FOR UPDATE")
                .bind("ids", ids).map((row, meta) -> category(row)).all();
    }

    /** True while another category was merged into this one and that merge has not been undone. */
    public Mono<Boolean> isLiveMergeTarget(UUID id) {
        return client.sql("SELECT EXISTS (SELECT 1 FROM category WHERE merged_into_id = :id) AS live")
                .bind("id", id).map((row, meta) -> row.get("live", Boolean.class)).one();
    }

    /** Adds a category after the seeded ones. */
    public Mono<Category> insert(String name, String kind, String defaultClass) {
        DatabaseClient.GenericExecuteSpec spec = client
                .sql("INSERT INTO category (name, kind, sort_order, default_class) "
                + "VALUES (:name, :kind, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM category), "
                + (defaultClass == null ? "NULL" : ":class") + ") RETURNING " + COLUMNS)
                .bind("name", name).bind("kind", kind);
        if (defaultClass != null) {
            spec = spec.bind("class", defaultClass);
        }
        return spec.map((row, meta) -> category(row)).one();
    }

    public Mono<Long> rename(UUID id, String name) {
        return client.sql("UPDATE category SET name = :name WHERE id = :id").bind("name", name).bind("id", id)
                .fetch().rowsUpdated();
    }

    public Mono<Long> setDefaultClass(UUID id, String defaultClass) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("UPDATE category SET default_class = "
                + (defaultClass == null ? "NULL" : ":class") + " WHERE id = :id").bind("id", id);
        if (defaultClass != null) {
            spec = spec.bind("class", defaultClass);
        }
        return spec.fetch().rowsUpdated();
    }

    public Mono<Long> setArchived(UUID id, Instant at) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("UPDATE category SET archived_at = "
                + (at == null ? "NULL" : ":at") + " WHERE id = :id").bind("id", id);
        if (at != null) {
            spec = spec.bind("at", at);
        }
        return spec.fetch().rowsUpdated();
    }

    /** Archives the sources and points them at the target; one merge id ties them together for Undo. */
    public Mono<Long> merge(List<UUID> sources, UUID target, UUID mergeId, Instant at) {
        return client.sql("UPDATE category SET archived_at = :at, merged_into_id = :target, merge_id = :merge "
                        + "WHERE id IN (:sources)")
                .bind("at", at).bind("target", target).bind("merge", mergeId).bind("sources", sources)
                .fetch().rowsUpdated();
    }

    /** The sources of a merge, locked, with the merge id as it stands now (empty once it has been undone). */
    public Flux<Category> lockMerge(UUID mergeId) {
        return client.sql("SELECT " + COLUMNS + " FROM category WHERE merge_id = :merge ORDER BY id FOR UPDATE")
                .bind("merge", mergeId).map((row, meta) -> category(row)).all();
    }

    public Mono<Long> undoMerge(UUID mergeId) {
        return client.sql("UPDATE category SET archived_at = NULL, merged_into_id = NULL, merge_id = NULL "
                        + "WHERE merge_id = :merge")
                .bind("merge", mergeId).fetch().rowsUpdated();
    }

    /** What a category holds: its effective entries (merged-in ones included) and their total. */
    public Mono<CategoryUsage> usage(Category category) {
        Counted counted = Counted.of("spending".equals(category.kind()) ? "expense" : "income", "a.");
        return client.sql("SELECT COUNT(*) AS n, COALESCE(SUM(" + counted.value() + "), 0) AS total "
                        + "FROM activity a JOIN category oc ON oc.id = a.category_id "
                        + "WHERE a.removed_at IS NULL AND " + counted.filter()
                        + " AND COALESCE(oc.merged_into_id, oc.id) = :id")
                .bind("id", category.id())
                .map((row, meta) -> new CategoryUsage(row.get("n", Long.class),
                        Money.format(row.get("total", BigDecimal.class))))
                .one();
    }

    /** Records who changed a category and when; later changes keep the earlier name here (CATEGORIES_003). */
    public Mono<Long> recordEvent(UUID categoryId, String action, String oldName, String newName, String detail,
            UUID memberId, Instant at) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO category_event "
                + "(category_id, action, old_name, new_name, detail, member_id, occurred_at) "
                + "VALUES (:category, :action, :old, :new, :detail, :member, :at)")
                .bind("category", categoryId).bind("action", action).bind("member", memberId).bind("at", at);
        spec = oldName == null ? spec.bindNull("old", String.class) : spec.bind("old", oldName);
        spec = newName == null ? spec.bindNull("new", String.class) : spec.bind("new", newName);
        spec = detail == null ? spec.bindNull("detail", String.class) : spec.bind("detail", detail);
        return spec.fetch().rowsUpdated();
    }

    public Flux<CategoryEvent> history(UUID categoryId) {
        return client.sql("SELECT e.action, e.old_name, e.new_name, e.detail, m.name AS by_name, e.occurred_at "
                        + "FROM category_event e JOIN household_member m ON m.id = e.member_id "
                        + "WHERE e.category_id = :id ORDER BY e.seq")
                .bind("id", categoryId)
                .map((row, meta) -> new CategoryEvent(row.get("action", String.class),
                        row.get("old_name", String.class), row.get("new_name", String.class),
                        row.get("detail", String.class), row.get("by_name", String.class),
                        row.get("occurred_at", OffsetDateTime.class).toInstant()))
                .all();
    }

    private static Category category(io.r2dbc.spi.Readable row) {
        OffsetDateTime archived = row.get("archived_at", OffsetDateTime.class);
        return new Category(row.get("id", UUID.class), row.get("name", String.class), row.get("kind", String.class),
                row.get("sort_order", Integer.class), row.get("default_class", String.class),
                archived == null ? null : archived.toInstant(), row.get("merged_into_id", UUID.class),
                row.get("merge_id", UUID.class));
    }
}
