package com.mdstech.wealthmesh.activity.dto;

import java.util.List;

/** The saved entries, in the order they were sent, and their total. */
public record BatchResponse(List<ActivityResponse> entries, String total) {
}
