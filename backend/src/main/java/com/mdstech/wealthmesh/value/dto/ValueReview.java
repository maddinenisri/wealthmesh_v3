package com.mdstech.wealthmesh.value.dto;

import java.time.LocalDate;

/**
 * What saving a value would do, nothing written. `earlierAmount` is the effective value on the new value's date
 * before it (null for a plan), `change` the difference (an asset value change, never income or spending), and the
 * Balance is the account's one Balance now and after the save.
 */
public record ValueReview(String accountName, String type, LocalDate valueOn, String amount, String reason,
        boolean plan, String earlierAmount, LocalDate earlierOn, String change, String balanceBefore,
        LocalDate balanceBeforeOn, String balanceAfter, LocalDate balanceAfterOn, String replacesAmount,
        LocalDate replacesOn) {
}
