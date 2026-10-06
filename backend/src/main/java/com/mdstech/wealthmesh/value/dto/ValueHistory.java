package com.mdstech.wealthmesh.value.dto;

import java.util.List;

/** The values of an account, newest date first, and what was done to them, newest first. */
public record ValueHistory(List<ValueRow> values, List<ValueEvent> events) {
}
