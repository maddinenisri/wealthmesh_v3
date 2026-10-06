package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.mdstech.wealthmesh.activity.repository.ActivityStore.Candidate;
import com.mdstech.wealthmesh.recurring.service.Suggestions;

/** Which expenses make a monthly suggestion (slice 14), without a database. */
class SuggestionsTest {

    private static final UUID ACCOUNT = UUID.randomUUID();
    private static final UUID CATEGORY = UUID.randomUUID();

    private static Candidate bill(String description, String date, String amount) {
        return new Candidate(UUID.randomUUID(), ACCOUNT, "Checking", CATEGORY, "Utilities", description,
                new BigDecimal(amount), LocalDate.parse(date));
    }

    @Test
    @DisplayName("V2_RECURRING_001 three bills a month apart are one suggestion; two are not")
    void threeMakeOne() {
        List<Candidate> three = List.of(bill("Electricity", "2026-07-05", "180.00"),
                bill("Electricity", "2026-08-05", "180.00"), bill("Electricity", "2026-09-05", "180.00"));
        assertThat(Suggestions.find(three, Set.of())).hasSize(1);
        assertThat(Suggestions.find(three.subList(1, 3), Set.of())).isEmpty();
    }

    @Test
    @DisplayName("V2_RECURRING_001 case and edge spaces do not split a description; another description does")
    void descriptionIsComparedLoosely() {
        List<Candidate> mixed = List.of(bill("Electricity", "2026-07-05", "180.00"),
                bill(" ELECTRICITY ", "2026-08-05", "180.00"), bill("electricity", "2026-09-05", "180.00"));
        assertThat(Suggestions.find(mixed, Set.of())).hasSize(1);
        List<Candidate> other = List.of(bill("Electricity", "2026-07-05", "180.00"),
                bill("Water", "2026-08-05", "180.00"), bill("Electricity", "2026-09-05", "180.00"));
        assertThat(Suggestions.find(other, Set.of())).isEmpty();
    }

    @Test
    @DisplayName("V2_RECURRING_001 bills a week apart, or with a gap of two months, are not monthly; the latest run "
            + "counts")
    void onlyMonthlyRuns() {
        List<Candidate> weekly = List.of(bill("Gym", "2026-09-01", "10.00"), bill("Gym", "2026-09-08", "10.00"),
                bill("Gym", "2026-09-15", "10.00"));
        assertThat(Suggestions.find(weekly, Set.of())).isEmpty();
        List<Candidate> gap = List.of(bill("Gym", "2026-04-05", "10.00"), bill("Gym", "2026-05-05", "10.00"),
                bill("Gym", "2026-08-05", "10.00"), bill("Gym", "2026-09-05", "10.00"));
        assertThat(Suggestions.find(gap, Set.of())).isEmpty();
        List<Candidate> resumed = List.of(bill("Gym", "2026-03-05", "10.00"), bill("Gym", "2026-06-05", "10.00"),
                bill("Gym", "2026-07-06", "10.00"), bill("Gym", "2026-08-05", "10.00"),
                bill("Gym", "2026-09-05", "11.00"));
        List<Suggestions.Found> found = Suggestions.find(resumed, Set.of());
        assertThat(found).hasSize(1);
        assertThat(found.getFirst().bills()).hasSize(4);
        assertThat(found.getFirst().latest().amount()).isEqualByComparingTo("11.00");
    }

    @Test
    @DisplayName("V2_RECURRING_009 a key already scheduled or dismissed is left out")
    void excludedKeys() {
        List<Candidate> three = List.of(bill("Electricity", "2026-07-05", "180.00"),
                bill("Electricity", "2026-08-05", "180.00"), bill("Electricity", "2026-09-05", "180.00"));
        assertThat(Suggestions.find(three, Set.of(Suggestions.key(ACCOUNT, CATEGORY, " electricity")))).isEmpty();
    }
}
