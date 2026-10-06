package com.mdstech.wealthmesh.value.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A dated value of a property or other asset. `amount` is a string (D-024's money rule, checked by the service);
 * `plan` saves a future-dated value as a plan that never counts; `reason` is optional for a new value and required
 * for a correction.
 */
public record ValueRequest(Object amount, LocalDate valueOn, String reason, UUID enteredByMemberId, Boolean plan) {
}
