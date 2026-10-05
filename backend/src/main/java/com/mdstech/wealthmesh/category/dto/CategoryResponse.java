package com.mdstech.wealthmesh.category.dto;

import java.util.UUID;

/**
 * `defaultClass` is "essential", "discretionary" or null (income categories have none). An archived category is
 * hidden from new choices; a merged one also names the category it was merged into and the merge (for Undo).
 */
public record CategoryResponse(
        UUID id,
        String name,
        String kind,
        String defaultClass,
        boolean archived,
        UUID mergedIntoId,
        UUID mergeId) {
}
