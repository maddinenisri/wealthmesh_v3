package com.mdstech.wealthmesh.activity.domain;

import java.math.BigDecimal;
import java.util.UUID;

/** One category portion of a split payment, as validated and as stored (`activity_portion`, kind 'category'). */
public record Portion(UUID categoryId, String classification, BigDecimal amount) {

    /** True when both hold the same category, class and amount (a repeated save). */
    public boolean sameAs(Portion other) {
        return categoryId.equals(other.categoryId) && java.util.Objects.equals(classification, other.classification)
                && amount.compareTo(other.amount) == 0;
    }
}
