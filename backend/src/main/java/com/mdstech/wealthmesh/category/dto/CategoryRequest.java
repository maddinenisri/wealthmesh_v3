package com.mdstech.wealthmesh.category.dto;

import java.util.UUID;

/** A new category: its name, kind ("spending" or "income"), the default class of a spending one, and who made it. */
public record CategoryRequest(String name, String kind, String defaultClass, UUID enteredByMemberId) {
}
