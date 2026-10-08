package com.mdstech.wealthmesh.value.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A dated value of a property or other asset. `amount` is a string (D-024's money rule, checked by the service);
 * `plan` saves a future-dated value as a plan that never counts; `reason` is optional for a new value and required
 * for a correction. A defined benefit statement may send `payCredit` and `interestCredit` instead of an amount: the
 * plan value is then the value in force before it plus both credits.
 */
public record ValueRequest(Object amount, LocalDate valueOn, String reason, UUID enteredByMemberId, Boolean plan,
        Object payCredit, Object interestCredit) {
}
