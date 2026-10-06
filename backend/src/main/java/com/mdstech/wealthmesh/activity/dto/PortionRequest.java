package com.mdstech.wealthmesh.activity.dto;

import java.util.UUID;

/**
 * One portion of a split payment: a spending category (by name or id), its class (omitted: the category's default)
 * and its amount as a string (foundations 1).
 */
public record PortionRequest(String category, UUID categoryId, String classification, Object amount) {
}
