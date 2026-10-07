package com.mdstech.wealthmesh.statement.dto;

import java.util.UUID;

/**
 * What removing a statement does, before it is confirmed: how many opening breakdowns use it, the Balance that stays,
 * and the sentence the review shows.
 */
public record RemovalReview(UUID statementId, int openingBreakdowns, String balance, String message) {
}
