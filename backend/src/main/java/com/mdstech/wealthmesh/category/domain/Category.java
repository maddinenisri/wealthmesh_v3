package com.mdstech.wealthmesh.category.domain;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/**
 * A spending or income category. `defaultClass` (essential or discretionary) is null for an income category. An
 * archived one has `archivedAt`; a merged one is archived and points at `mergedIntoId` (one `mergeId` per merge).
 */
@Table("category")
public record Category(
        @Id UUID id,
        String name,
        String kind,
        int sortOrder,
        String defaultClass,
        Instant archivedAt,
        UUID mergedIntoId,
        UUID mergeId) {

    public boolean archived() {
        return archivedAt != null;
    }
}
