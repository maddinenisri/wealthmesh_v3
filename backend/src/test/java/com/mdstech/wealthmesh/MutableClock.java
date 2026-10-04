package com.mdstech.wealthmesh;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

/** A test clock whose "today" a test can set; time of day is noon so the date is stable. */
public class MutableClock extends Clock {

    public static final LocalDate DEFAULT_TODAY = LocalDate.of(2026, 10, 3);

    private final ZoneId zone;
    private volatile Instant instant;

    public MutableClock(ZoneId zone) {
        this.zone = zone;
        setToday(DEFAULT_TODAY);
    }

    public void setToday(LocalDate today) {
        this.instant = today.atTime(LocalTime.NOON).atZone(zone).toInstant();
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId newZone) {
        MutableClock copy = new MutableClock(newZone);
        copy.instant = instant;
        return copy;
    }

    @Override
    public Instant instant() {
        return instant;
    }
}
