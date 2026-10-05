package com.mdstech.wealthmesh.category.repository;

import java.time.Instant;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.category.domain.Category;

import reactor.core.publisher.Mono;

/** SQL for category writes: the duplicate check, the insert and the change log (`category_event`). */
@Repository
public class CategoryStore {

    private static final String COLUMNS = "id, name, kind, sort_order, default_class";

    private final DatabaseClient client;

    public CategoryStore(DatabaseClient client) {
        this.client = client;
    }

    /** A category of this kind whose name matches ignoring case and surrounding spaces (archived ones included). */
    public Mono<Category> findDuplicate(String kind, String name) {
        return client.sql("SELECT " + COLUMNS + " FROM category WHERE kind = :kind AND lower(btrim(name)) = :name")
                .bind("kind", kind).bind("name", name.toLowerCase(java.util.Locale.ROOT))
                .map((row, meta) -> category(row)).one();
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

    private static Category category(io.r2dbc.spi.Readable row) {
        return new Category(row.get("id", UUID.class), row.get("name", String.class), row.get("kind", String.class),
                row.get("sort_order", Integer.class), row.get("default_class", String.class));
    }
}
