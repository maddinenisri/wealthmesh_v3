package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 16a, group 3: races on a loan's Balance. Each test holds the loan's row lock on a second connection, starts
 * both requests, asserts they wait, releases, and asserts that exactly one change is saved and the loan never ends
 * above zero (the debt rule is read under the lock, D-053).
 */
class LoanCorrectionRaceApiTests extends DebtTestBase {

    @Order(0)
    @Test
    @DisplayName("set up a household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_LOAN_006 a payment and a correction that cannot both stand, at once: exactly one is saved and the "
            + "loan is never an asset")
    void paymentAndCorrection() throws Exception {
        String bank = account("Race Checking", "5000.00");
        String own = loan("Race Loan", "1000.00", "2026-09-01");
        List<Integer> statuses = both(own,
                () -> postLoanPayment(key(), bank, own, "600.00", "600.00", "0.00", "2026-09-20", mayaId),
                () -> correctOn(own, key(), "100.00", "2026-09-10", "Lender statement"));
        assertThat(statuses.stream().filter(s -> s >= 200 && s < 300).count()).as("exactly one saved").isEqualTo(1);
        assertThat(balanceOf(own)).isIn("-400.00", "-100.00");
        assertActivityCount(own, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_LOAN_006 a payment and a lower initial amount at once: exactly one is saved")
    void paymentAndInitialAmount() throws Exception {
        String bank = account("Open Checking", "5000.00");
        String own = loan("Open Loan", "1000.00", "2026-09-01");
        List<Integer> statuses = both(own,
                () -> postLoanPayment(key(), bank, own, "800.00", "800.00", "0.00", "2026-09-20", mayaId),
                () -> correctInitial(own, key(), "500.00", "Lender statement"));
        assertThat(statuses.stream().filter(s -> s >= 200 && s < 300).count()).as("exactly one saved").isEqualTo(1);
        assertThat(balanceOf(own)).isIn("-200.00", "-500.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_DATED_VALUE_003 removing a correction at once with a payment that relies on it: exactly one is "
            + "saved")
    void removalAndPayment() throws Exception {
        String bank = account("Rem Checking", "5000.00");
        String own = loan("Rem Loan", "1000.00", "2026-09-01");
        correctOn(own, key(), "1500.00", "2026-09-10", "Lender raised it").expectStatus().isCreated();
        AtomicReference<String> row = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", own).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, row::set);
        List<Integer> statuses = both(own,
                () -> webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", own, row.get())
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange(),
                () -> postLoanPayment(key(), bank, own, "1200.00", "1200.00", "0.00", "2026-09-20", mayaId));
        assertThat(statuses.stream().filter(s -> s >= 200 && s < 300).count()).as("exactly one saved").isEqualTo(1);
        assertThat(balanceOf(own)).isIn("-1000.00", "-300.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_DATED_VALUE_003 the same correction sent twice at once saves one and replays: 201 and 200; two "
            + "different corrections both apply, one after the other")
    void sameKeyAndTwoCorrections() throws Exception {
        String own = loan("Twice Loan", "1000.00", "2026-09-01");
        String k = key();
        assertThat(both(own, () -> correctOn(own, k, "900.00", "2026-09-10", "Statement"),
                () -> correctOn(own, k, "900.00", "2026-09-10", "Statement")))
                .containsExactlyInAnyOrder(200, 201);
        assertBalance(own, "-900.00");
        assertActivityCount(own, 1);
        List<Integer> two = both(own, () -> correctOn(own, key(), "800.00", "2026-09-11", "Second"),
                () -> correctOn(own, key(), "700.00", "2026-09-12", "Third"));
        assertThat(two).containsExactlyInAnyOrder(201, 201);
        assertActivityCount(own, 3);
        // Each difference is read under the lock, against the Balance on its own date, so the order decides the end.
        assertThat(balanceOf(own)).isIn("-700.00", "-600.00");
    }
}
