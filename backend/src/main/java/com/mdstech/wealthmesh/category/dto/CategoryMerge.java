package com.mdstech.wealthmesh.category.dto;

import java.util.List;
import java.util.UUID;

/** Merge the sources into an existing `targetId`, or into a new category called `newName` (not both). */
public record CategoryMerge(List<UUID> sourceIds, UUID targetId, String newName, UUID enteredByMemberId) {
}
