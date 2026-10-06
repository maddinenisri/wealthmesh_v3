package com.mdstech.wealthmesh.account.dto;

import java.util.UUID;

/**
 * Who is making a lifecycle change, a normal body field as for every other write (D-025). Required: the
 * controller answers 400 without it.
 */
public record LifecycleRequest(UUID enteredByMemberId) {
}
