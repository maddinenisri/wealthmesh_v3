package com.mdstech.wealthmesh.category.dto;

import java.util.UUID;

/** `defaultClass` is "essential", "discretionary" or null (income categories have none). */
public record CategoryResponse(UUID id, String name, String kind, String defaultClass) {
}
