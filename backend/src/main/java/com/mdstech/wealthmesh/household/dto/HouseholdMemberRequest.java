package com.mdstech.wealthmesh.household.dto;

import java.util.UUID;

public record HouseholdMemberRequest(UUID householdId, String name, String label) {
}
