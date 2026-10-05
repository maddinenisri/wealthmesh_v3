package com.mdstech.wealthmesh.category.dto;

import java.util.UUID;

/** A change to one category and who made it: `name` for a rename, `defaultClass` for a default change. */
public record CategoryChange(String name, String defaultClass, UUID enteredByMemberId) {
}
