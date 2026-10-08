package com.mdstech.wealthmesh.account.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One change of an account's state: what happened ("archived", "restored", ...), who entered it (null when
 * unknown) and when. `detail` says more when the action needs it: a rename names the name it replaced.
 */
public record AccountEvent(String action, UUID memberId, Instant at, String detail) {
}
