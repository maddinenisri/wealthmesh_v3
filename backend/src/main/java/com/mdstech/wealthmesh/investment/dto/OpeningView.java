package com.mdstech.wealthmesh.investment.dto;

import java.util.List;
import java.util.UUID;

/**
 * What an investment account was opened with. `noStartingAmount` is true when the setup left the amount blank;
 * `statementId` is the supporting statement the opening review used, kept when that statement is removed.
 */
public record OpeningView(String total, String cash, String holdingsValue, boolean noStartingAmount,
        List<HoldingLine> holdings, UUID statementId, boolean statementRemoved) {
}
