package com.mdstech.wealthmesh.investment.dto;

import java.util.List;

/**
 * The review of an opening before it is saved. `state` is "complete" (saves as an active account), "draft" (cash
 * unanswered, so saving keeps a draft) or "mismatch" (the typed total differs from cash plus holdings, so nothing
 * can be saved). `cash`, `calculatedBalance` and `difference` are null while they cannot be worked out; `missing`
 * names what the draft still needs. `message` is the sentence the review shows for a draft or a mismatch.
 */
public record OpeningPreview(String state, boolean canSave, String cash, String holdingsValue,
        String calculatedBalance, String openingTotal, String difference, List<String> missing, String message,
        List<HoldingLine> holdings) {
}
