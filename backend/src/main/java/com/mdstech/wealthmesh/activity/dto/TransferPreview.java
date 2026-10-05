package com.mdstech.wealthmesh.activity.dto;

import java.util.List;

/**
 * What a transfer would change, before it is saved: each affected account's Balance after, and for an expense that
 * becomes a transfer the month's spending now and after. Informational; the save recomputes under the account
 * locks (D-028).
 */
public record TransferPreview(List<ReplacementPreview.AccountFigure> accounts,
        ReplacementPreview.MonthFigure spending) {
}
