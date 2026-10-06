package com.mdstech.wealthmesh.activity.dto;

import java.util.UUID;

/** One portion of a split payment as it is shown: the category it counts under now (a merge is followed). */
public record PortionResponse(UUID categoryId, String categoryName, boolean categoryArchived, String classification,
        String amount) {
}
