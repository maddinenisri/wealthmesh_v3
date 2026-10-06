package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.mdstech.wealthmesh.recurring.service.Recurrence;

/** The date arithmetic of schedules (slice 14), without a database. */
class RecurrenceTest {

    @Test
    @DisplayName("V2_RECURRING_006 weekly adds seven days, monthly keeps the day, yearly keeps the day and month")
    void followingOccurrence() {
        assertThat(Recurrence.following(LocalDate.of(2026, 10, 9), "weekly", 9)).isEqualTo(LocalDate.of(2026, 10, 16));
        assertThat(Recurrence.following(LocalDate.of(2026, 10, 5), "monthly", 5)).isEqualTo(LocalDate.of(2026, 11, 5));
        assertThat(Recurrence.following(LocalDate.of(2026, 10, 20), "yearly", 20))
                .isEqualTo(LocalDate.of(2027, 10, 20));
    }

    @Test
    @DisplayName("V2_RECURRING_006 a bill due on the 31st falls on the last day of a short month and returns to the "
            + "31st; a Feb 29 bill falls on Feb 28 in a common year")
    void monthEnds() {
        LocalDate feb = Recurrence.following(LocalDate.of(2026, 1, 31), "monthly", 31);
        assertThat(feb).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(Recurrence.following(feb, "monthly", 31)).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(Recurrence.following(LocalDate.of(2028, 2, 29), "yearly", 29)).isEqualTo(LocalDate.of(2029, 2, 28));
        assertThat(Recurrence.following(LocalDate.of(2026, 12, 15), "monthly", 15))
                .isEqualTo(LocalDate.of(2027, 1, 15));
    }

    @Test
    @DisplayName("V2_RECURRING_006 only weekly, monthly and yearly are frequencies")
    void frequencies() {
        assertThat(Recurrence.valid("weekly")).isTrue();
        assertThat(Recurrence.valid("daily")).isFalse();
        assertThat(Recurrence.valid(null)).isFalse();
    }
}
