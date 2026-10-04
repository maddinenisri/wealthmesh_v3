package com.mdstech.wealthmesh.spending.dto;

import java.util.List;

/**
 * Month-by-month spending. The average counts only months that have an expense; the annual estimate is that
 * average times twelve and says how many recorded months it rests on. Both are null with no expenses.
 */
public record SpendingHistory(List<Month> months, int recordedMonths, String averageRecordedMonth,
        String annualEstimate) {

    public record Month(String month, String total, boolean recorded) {
    }
}
