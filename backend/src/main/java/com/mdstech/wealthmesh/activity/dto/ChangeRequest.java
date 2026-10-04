package com.mdstech.wealthmesh.activity.dto;

import java.util.UUID;

/** Who is removing or restoring an entry (D-025). */
public record ChangeRequest(UUID enteredByMemberId) {
}
