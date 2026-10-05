package com.mdstech.wealthmesh.category.dto;

/** What a category holds today: its effective entries (merged-in ones included) and their total. */
public record CategoryUsage(long entries, String total) {
}
