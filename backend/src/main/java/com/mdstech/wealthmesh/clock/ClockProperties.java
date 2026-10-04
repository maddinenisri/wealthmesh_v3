package com.mdstech.wealthmesh.clock;

import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Clock settings. {@code fixedToday} is unset in production; tests and e2e set it so "today" matches the scenarios.
 */
@ConfigurationProperties("wealthmesh.clock")
public record ClockProperties(@DefaultValue("America/New_York") ZoneId zone, LocalDate fixedToday) {
}
