package com.mdstech.wealthmesh.investment.dto;

import java.util.List;

/**
 * The opening components of an investment account. `total` is a typed check against cash plus holdings and never a
 * Balance; `cash` null means "not answered" (a draft when anything else was entered); everything left out is a blank
 * starting amount. Amounts are Objects so a JSON number is refused.
 */
public record OpeningRequest(Object total, Object cash, List<HoldingRequest> holdings) {
}
