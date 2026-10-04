package com.mdstech.wealthmesh.clock;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The one clock all "today" logic uses. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ClockProperties.class)
public class ClockConfiguration {

    @Bean
    Clock clock(ClockProperties properties) {
        Clock system = Clock.system(properties.zone());
        if (properties.fixedToday() == null) {
            return system;
        }
        // Start at noon on the fixed day and keep ticking, so audit stamps still differ and the date is stable all day.
        Instant start = properties.fixedToday().atTime(LocalTime.NOON).atZone(properties.zone()).toInstant();
        return Clock.offset(system, Duration.between(system.instant(), start));
    }
}
