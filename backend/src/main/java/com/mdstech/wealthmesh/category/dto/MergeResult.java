package com.mdstech.wealthmesh.category.dto;

import java.util.UUID;

/** The category everything was merged into, and the id that undoes this merge. */
public record MergeResult(UUID mergeId, CategoryResponse target) {
}
