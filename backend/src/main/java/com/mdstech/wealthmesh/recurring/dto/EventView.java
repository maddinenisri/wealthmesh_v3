package com.mdstech.wealthmesh.recurring.dto;

import java.time.Instant;
import java.util.UUID;

/** One change to a schedule: what, who, when and in words. */
public record EventView(String action, UUID memberId, Instant at, String detail) {
}
