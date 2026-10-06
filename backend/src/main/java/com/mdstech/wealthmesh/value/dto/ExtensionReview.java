package com.mdstech.wealthmesh.value.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * What moving a property or other asset's start earlier would do, nothing written: the account's values in date
 * order as they will read afterwards (the new opening first), and the Balance, which does not change.
 */
public record ExtensionReview(String accountName, String type, String amount, LocalDate openedOn,
        String previousAmount, LocalDate previousOn, List<Point> timeline, String balance, LocalDate balanceOn) {

    /** One value in the timeline: `kind` is opening (the new start) or value. */
    public record Point(String kind, LocalDate on, String amount) {
    }
}
