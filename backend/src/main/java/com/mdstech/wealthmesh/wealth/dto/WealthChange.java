package com.mdstech.wealthmesh.wealth.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * What explains the change in wealth between two dates, for the rows dated after `from` and up to `to`:
 * `change = income - spending + valueChange + corrections + accountsAdded + transfers + other`, where `change` is
 * `endWealth - startWealth`. Transfers and card payments cancel (`transfers` is zero), an asset value change is never
 * income, a Balance correction never income or spending, and `other` discloses anything not explained (zero when the
 * parts add up). Every figure is a money string.
 */
public record WealthChange(LocalDate from, LocalDate to, String startWealth, String endWealth, String change,
        String income, String spending, String valueChange, String corrections, String accountsAdded,
        String transfers, String other, List<ValueMove> valueMoves) {

    /** One manually valued account whose value moved in the period. */
    public record ValueMove(String accountId, String name, String type, String start, String end, String change) {
    }
}
