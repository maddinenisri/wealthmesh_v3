package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 16a, group 2: races on the rows a loan payment changes. Each test holds a lock on a second connection, starts
 * the request, asserts it is still waiting, releases, and asserts the outcome; each fails when the lock it claims is
 * taken out of the service (random timing proves nothing).
 */
class LoanPaymentRaceApiTests extends DebtTestBase {

    private static final String DATE = "2026-09-10";

    @Order(0)
    @Test
    @DisplayName("set up a household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_LOAN_003 a new payment waits for the lock on the paying account and on the loan, each on its own")
    void createWaitsForBothAccounts() throws Exception {
        for (int side = 0; side < 2; side++) {
            String bank = account("Create Checking" + side, "1000.00");
            String own = loan("Create Loan" + side, "500.00", "2026-09-01");
            int status = waitsFor(side == 0 ? bank : own,
                    () -> postLoanPayment(key(), bank, own, "110.00", "100.00", "10.00", DATE, mayaId));
            assertThat(status).as("side %d", side).isEqualTo(201);
            assertBalance(bank, "890.00");
            assertBalance(own, "-400.00");
        }
    }

    @Order(2)
    @Test
    @DisplayName("V2_LOAN_006 two payments of $80.00 principal on $100.00 owed at once: one is saved, the other is "
            + "refused under the lock, and the loan is never an asset")
    void twoPaymentsCannotOverpay() throws Exception {
        String bank = account("Over Checking", "1000.00");
        String own = loan("Over Loan", "100.00", "2026-09-01");
        List<Integer> statuses = both(own,
                () -> postLoanPayment(key(), bank, own, "85.00", "80.00", "5.00", DATE, mayaId),
                () -> postLoanPayment(key(), bank, own, "85.00", "80.00", "5.00", DATE, samId));
        assertThat(statuses).containsExactlyInAnyOrder(201, 400);
        assertBalance(own, "-20.00");
        assertBalance(bank, "915.00");
        assertActivityCount(own, 1);
    }

    @Order(3)
    @Test
    @DisplayName("V2_LOAN_003 the same key sent twice at once saves one payment: 201 and 200, never a 409; a retry "
            + "after the ledger changed replays")
    void sameKeyAtOnce() throws Exception {
        String bank = account("Key Checking", "1000.00");
        String own = loan("Key Loan", "500.00", "2026-09-01");
        String k = key();
        List<Integer> statuses = both(bank,
                () -> postLoanPayment(k, bank, own, "110.00", "100.00", "10.00", DATE, mayaId),
                () -> postLoanPayment(k, bank, own, "110.00", "100.00", "10.00", DATE, mayaId));
        assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        assertBalance(bank, "890.00");
        assertBalance(own, "-400.00");
        assertActivityCount(own, 1);
        saveExpense(bank, key(), "5.00", "2026-09-12", "Dining");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", mayaId).exchange().expectStatus().isOk();
        try {
            postLoanPayment(k, bank, own, "110.00", "100.00", "10.00", DATE, mayaId).expectStatus().isOk();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus().isOk();
        }
        assertBalance(bank, "885.00");
        assertBalance(own, "-400.00");
        assertActivityCount(own, 1);
    }

    @Order(4)
    @Test
    @DisplayName("V2_LOAN_003 correcting the portions keeps the money leaving checking, moves the debt, restates the "
            + "interest, and keeps the original in history with its reason")
    void correctThePortions() throws Exception {
        String bank = account("Fix Checking", "5000.00");
        String own = loan("Fix Loan", "20000.00", "2026-09-01");
        String movement = loanPayment(key(), bank, own, "450.00", "50.00", DATE);
        assertThat(waitsFor(own, () -> replaceLoanPayment(movement, key(),
                paymentBody(bank, own, "500.00", "400.00", "100.00", DATE, mayaId, "Use the lender's breakdown"))))
                .isEqualTo(201);
        assertBalance(bank, "4500.00");
        assertBalance(own, "-19600.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + bank).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("100.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", bank).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.status=='replaced')].amount").isEqualTo("500.00")
                .jsonPath("$[?(@.status=='effective')].reason").isEqualTo("Use the lender's breakdown");
        // The correction cannot overpay either: owed is now 19,600.00.
        String again = loanPayment(key(), bank, own, "19000.00", "0.00", "2026-09-11");
        replaceLoanPayment(again, key(), paymentBody(bank, own, "19601.00", "19601.00", "0.00", "2026-09-11",
                mayaId, "Too much")).expectStatus().isBadRequest();
        assertBalance(own, "-600.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_LOAN_003 removal and Undo of a payment each wait for the lock on both accounts, change both "
            + "Balances and the interest together, and a second Undo is the same 200")
    void removeAndUndo() throws Exception {
        for (int side = 0; side < 2; side++) {
            String bank = account("Rm Checking" + side, "5000.00");
            String own = loan("Rm Loan" + side, "20000.00", "2026-09-01");
            String locked = side == 0 ? bank : own;
            String movement = loanPayment(key(), bank, own, "450.00", "50.00", DATE);
            assertThat(waitsFor(locked, () -> removeLoanPayment(movement, mayaId))).as("remove %d", side)
                    .isEqualTo(200);
            assertBalance(bank, "5000.00");
            assertBalance(own, "-20000.00");
            assertThat(waitsFor(locked, () -> undoLoanPayment(movement, mayaId))).as("undo %d", side).isEqualTo(200);
            undoLoanPayment(movement, mayaId).expectStatus().isOk();
            assertBalance(bank, "4500.00");
            assertBalance(own, "-19550.00");
            assertActivityCount(own, 1);
        }
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.categories[?(@.name=='Loan interest')].total")
                .value(List.class, totals -> assertThat(totals).isNotEmpty());
    }

    @Order(6)
    @Test
    @DisplayName("V2_LOAN_003 two removals, and a removal against a change, of one payment at once: one wins and the "
            + "payment is never half changed")
    void onePaymentOneWinner() throws Exception {
        String bank = account("Win Checking", "5000.00");
        String own = loan("Win Loan", "20000.00", "2026-09-01");
        String movement = loanPayment(key(), bank, own, "450.00", "50.00", DATE);
        assertThat(both(bank, () -> removeLoanPayment(movement, mayaId), () -> removeLoanPayment(movement, mayaId)))
                .containsExactlyInAnyOrder(200, 409);
        assertBalance(bank, "5000.00");
        assertBalance(own, "-20000.00");
        undoLoanPayment(movement, mayaId).expectStatus().isOk();
        List<Integer> mixed = both(own, () -> removeLoanPayment(movement, mayaId), () -> replaceLoanPayment(movement,
                key(), paymentBody(bank, own, "600.00", "500.00", "100.00", DATE, mayaId, "Bigger")));
        assertThat(mixed).containsAnyOf(200, 201).contains(409);
        boolean replaced = mixed.contains(201);
        assertActivityCount(bank, replaced ? 1 : 0);
        assertActivityCount(own, replaced ? 1 : 0);
        assertBalance(bank, replaced ? "4400.00" : "5000.00");
        assertBalance(own, replaced ? "-19500.00" : "-20000.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_LOAN_003 a payment and the archiving of the loan at once: either the payment is saved or the "
            + "loan is archived first and the payment is refused, never both")
    void paymentRacesArchive() throws Exception {
        String bank = account("Arch Checking", "5000.00");
        String own = loan("Arch Loan", "1000.00", "2026-09-01");
        List<Integer> statuses = both(own,
                () -> postLoanPayment(key(), bank, own, "110.00", "100.00", "10.00", DATE, mayaId),
                () -> act(own, "archive"));
        assertThat(statuses.stream().filter(s -> s >= 200 && s < 300).count()).isGreaterThanOrEqualTo(1);
        webTestClient.get().uri("/api/v1/accounts/{id}", own).exchange().expectBody().jsonPath("$.status")
                .isEqualTo("archived");
        // When the payment lost, nothing was written; when it won, both Balances moved together.
        boolean saved = statuses.get(0) == 201;
        assertBalance(bank, saved ? "4890.00" : "5000.00");
        assertBalance(own, saved ? "-900.00" : "-1000.00");
    }
}
