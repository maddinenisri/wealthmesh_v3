package com.mdstech.wealthmesh.value.dto;

import java.time.Instant;

/** One change to a value: what, the value it was about, who and when. */
public record ValueEvent(String action, String valueOn, String amount, String detail, String byName, Instant at) {
}
