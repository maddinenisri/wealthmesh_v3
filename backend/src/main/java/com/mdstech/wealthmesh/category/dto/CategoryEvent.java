package com.mdstech.wealthmesh.category.dto;

import java.time.Instant;

/** One change to a category: what, the names before and after, a note, who and when (CATEGORIES_003). */
public record CategoryEvent(String action, String oldName, String newName, String detail, String byName,
        Instant at) {
}
