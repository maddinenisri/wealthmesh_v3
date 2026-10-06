package com.mdstech.wealthmesh.account.dto;

import java.util.UUID;

/**
 * Who is making a lifecycle change, a normal body field as for every other write (D-025). Optional for raw API
 * callers.
 */
public record LifecycleRequest(UUID enteredByMemberId) {
}
