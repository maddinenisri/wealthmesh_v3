package com.mdstech.wealthmesh.category.domain;

import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/** A spending or income category. `defaultClass` (essential or discretionary) is null for an income category. */
@Table("category")
public record Category(@Id UUID id, String name, String kind, int sortOrder, String defaultClass) {
}
