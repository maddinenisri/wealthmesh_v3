package com.mdstech.wealthmesh.investment.dto;

import java.util.UUID;

/** Finish setup of a draft: the components again, and who is finishing it (required, as on every write). */
public record FinishRequest(OpeningRequest opening, UUID enteredByMemberId) {
}
