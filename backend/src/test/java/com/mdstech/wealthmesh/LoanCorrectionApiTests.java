package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 16a, group 3: a loan's amount owed changes by payments and by reviewed corrections only. A correction of the
 * initial amount (LOAN_004) and a dated correction (DATED_VALUE_003) are never a payment, income or spending, and a
 * debt never becomes an asset (D-053).
 */
class LoanCorrectionApiTests extends DebtTestBase {

    private static String checking;
    private static String carLoan;
    private static String correction;

    @Order(0)
    @Test
    @DisplayName("set up the household, checking $5,000.00 and Car Loan $20,000.00 owed on 2026-09-01")
    void setUp() {
        household();
        checking = account("Checking", "5000.00");
        carLoan = loan("Car Loan", "20000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_LOAN_004 correcting the initial amount to $19,800.00 owed keeps the original, the reason and the "
            + "member, and creates no payment, income or spending")
    void correctTheInitialAmount() {
        correctInitial(carLoan, "c-1", "19800.00", "Copied the lender amount incorrectly").expectStatus().isCreated()
                .expectBody().jsonPath("$.previousAmount").isEqualTo("-20000.00")
                .jsonPath("$.openingAmount").isEqualTo("-19800.00")
                .jsonPath("$.reason").isEqualTo("Copied the lender amount incorrectly")
                .jsonPath("$.enteredByName").isEqualTo("Sam");
        assertBalance(carLoan, "-19800.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", carLoan).exchange().expectBody()
                .jsonPath("$.openingAmount").isEqualTo("-19800.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts").isEqualTo("19800.00")
                .jsonPath("$.loans.accounts[0].balance").isEqualTo("-19800.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections", carLoan).exchange()
                .expectBody().jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].previousAmount")
                .isEqualTo("-20000.00");
        assertBalance(checking, "5000.00");
        assertActivityCount(checking, 0);
        assertActivityCount(carLoan, 0);
        noIncomeOrSpending("2026-09");
    }

    @Order(2)
    @Test
    @DisplayName("V2_LOAN_004 the wealth explanation names the $200.00 debt correction and the identity still holds")
    void wealthExplanationNamesTheCorrection() {
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-10-03").exchange().expectBody()
                .jsonPath("$.restatements.length()").isEqualTo(1)
                .jsonPath("$.restatements[0].name").isEqualTo("Car Loan")
                .jsonPath("$.restatements[0].type").isEqualTo("loan")
                .jsonPath("$.restatements[0].previousAmount").isEqualTo("-20000.00")
                .jsonPath("$.restatements[0].amount").isEqualTo("-19800.00")
                .jsonPath("$.restatements[0].change").isEqualTo("200.00")
                .jsonPath("$.restatements[0].reason").isEqualTo("Copied the lender amount incorrectly")
                .jsonPath("$.other").isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00")
                .jsonPath("$.income").isEqualTo("0.00");
        // A period before the correction was made does not list it.
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-08-01&to=2026-08-31").exchange().expectBody()
                .jsonPath("$.restatements.length()").isEqualTo(0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_LOAN_004 a negative or invalid corrected amount owed is refused in the review and on save, and "
            + "the same figure is refused as a correction")
    void invalidCorrectedAmount() {
        for (String amount : List.of("-1.00", "abc")) {
            String message = amount.startsWith("-") ? "Enter zero or a positive amount owed" : "Enter a valid amount";
            webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections/preview?openingAmount={a}"
                    + "&openedOn=2026-09-01", carLoan, amount).exchange().expectStatus().isBadRequest()
                    .expectBody().jsonPath("$.message").isEqualTo(message);
            correctInitial(carLoan, "c-bad-" + amount, amount, "Typo").expectStatus().isBadRequest().expectBody()
                    .jsonPath("$.message").isEqualTo(message);
        }
        correctInitial(carLoan, "c-same", "19800.00", "Same figure").expectStatus().isBadRequest();
        assertBalance(carLoan, "-19800.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_LOAN_004 the review of the corrected initial amount shows the owed figure now and after")
    void reviewOfTheCorrectedInitialAmount() {
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections/preview?openingAmount=19000.00"
                + "&openedOn=2026-09-01", carLoan).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.openingAmount").isEqualTo("-19000.00").jsonPath("$.currentBalance")
                .isEqualTo("-19800.00").jsonPath("$.currentBalanceAfter").isEqualTo("-19000.00")
                .jsonPath("$.overdraft").isEqualTo(false);
        assertBalance(carLoan, "-19800.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_DATED_VALUE_003 a reviewed September 30 correction lowers the debt to $19,800.00 owed without a "
            + "payment; the review says what changes")
    void datedCorrection() {
        String own = loan("Dated Loan", "20000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance-corrections/preview?requested=19800.00&asOn=2026-09-30",
                own).exchange().expectStatus().isOk().expectBody().jsonPath("$.balanceOnDate").isEqualTo("-20000.00")
                .jsonPath("$.requested").isEqualTo("-19800.00").jsonPath("$.difference").isEqualTo("200.00")
                .jsonPath("$.currentBalance").isEqualTo("-20000.00")
                .jsonPath("$.currentBalanceAfter").isEqualTo("-19800.00").jsonPath("$.overdraft").isEqualTo(false);
        AtomicReference<String> id = new AtomicReference<>();
        correctOn(own, "d-1", "19800.00", "2026-09-30", "Lender statement").expectStatus().isCreated().expectBody()
                .jsonPath("$.kind").isEqualTo("correction").jsonPath("$.amount").isEqualTo("200.00")
                .jsonPath("$.id").value(String.class, id::set);
        correction = id.get();
        assertBalance(own, "-19800.00");
        assertBalance(checking, "5000.00");
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectBody()
                .jsonPath("$.correctionLines[?(@.name=='Dated Loan')].amount").isEqualTo("200.00")
                .jsonPath("$.correctionLines[?(@.name=='Dated Loan')].reason").isEqualTo("Lender statement")
                .jsonPath("$.correctionLines[?(@.name=='Dated Loan')].type").isEqualTo("loan")
                .jsonPath("$.other").isEqualTo("0.00");
        datedLoan = own;
    }

    private static String datedLoan;

    @Order(6)
    @Test
    @DisplayName("V2_DATED_VALUE_003 removing the September 30 correction returns $20,000.00 owed with its September 1 "
            + "date, keeps the correction and reason in history, and changes no cash or spending; Undo twice brings "
            + "back one correction")
    void removeAndRestoreTheCorrection() {
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", datedLoan, correction)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.status").isEqualTo("removed");
        webTestClient.get().uri("/api/v1/accounts/{id}", datedLoan).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("-20000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", datedLoan).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].status").isEqualTo("removed")
                .jsonPath("$[0].reason").isEqualTo("Lender statement").jsonPath("$[0].amount").isEqualTo("200.00");
        assertBalance(checking, "5000.00");
        noIncomeOrSpending("2026-09");
        for (int i = 0; i < 2; i++) {
            webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/undo", datedLoan, correction)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        }
        assertBalance(datedLoan, "-19800.00");
        assertActivityCount(datedLoan, 1);
    }

    @Order(7)
    @Test
    @DisplayName("V2_DATED_VALUE_003 a correction asks for an owed amount of zero or more, a date inside tracking and "
            + "not in the future, a reason and a figure that differs; nothing is saved when refused")
    void correctionRules() {
        String own = loan("Rules Loan", "1000.00", "2026-09-01");
        correctOn(own, "r-1", "-5.00", "2026-09-10", "Typo").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter zero or a positive amount owed");
        correctOn(own, "r-2", "abc", "2026-09-10", "Typo").expectStatus().isBadRequest();
        correctOn(own, "r-3", "900.00", "2026-08-30", "Early").expectStatus().isBadRequest();
        correctOn(own, "r-4", "900.00", "2026-10-30", "Late").expectStatus().isBadRequest();
        correctOn(own, "r-5", "1000.00", "2026-09-10", "Same").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("The Balance already matches this amount");
        post(own, "balance-corrections", "r-6", """
                {"requestedBalance": "900.00", "asOn": "2026-09-10", "reason": " ", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isBadRequest();
        post(own, "balance-corrections", "r-7", """
                {"requestedBalance": "900.00", "asOn": "2026-09-10", "reason": "Side", "balanceSide": "credit",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isBadRequest();
        assertBalance(own, "-1000.00");
        assertActivityCount(own, 0);
        // Zero owed is allowed: the loan is paid off by the lender.
        correctOn(own, "r-8", "0.00", "2026-09-10", "Paid off by the lender").expectStatus().isCreated();
        assertBalance(own, "0.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_DATED_VALUE_003 a retried correction replays; the same key with another amount is refused")
    void correctionReplay() {
        String own = loan("Replay Loan", "1000.00", "2026-09-01");
        correctOn(own, "y-1", "900.00", "2026-09-10", "Lender statement").expectStatus().isCreated();
        correctOn(own, "y-1", "900.00", "2026-09-10", "Lender statement").expectStatus().isOk();
        correctOn(own, "y-1", "800.00", "2026-09-10", "Lender statement").expectStatus().isEqualTo(409);
        assertBalance(own, "-900.00");
        assertActivityCount(own, 1);
        correctInitial(own, "y-2", "950.00", "Initial typo").expectStatus().isCreated();
        correctInitial(own, "y-2", "950.00", "Initial typo").expectStatus().isOk();
        correctInitial(own, "y-2", "960.00", "Initial typo").expectStatus().isEqualTo(409);
        assertBalance(own, "-850.00");
    }

    @Order(9)
    @Test
    @DisplayName("V2_LOAN_006 a correction, a removal, an Undo or a new initial amount that would leave the loan "
            + "with a credit is refused: a debt never becomes an asset")
    void aDebtNeverBecomesAnAsset() {
        String bank = account("Credit Checking", "5000.00");
        String own = loan("Credit Loan", "1000.00", "2026-09-01");
        loanPayment("k-1", bank, own, "600.00", "0.00", "2026-09-20");
        // An initial amount below what was already paid.
        correctInitial(own, "k-2", "500.00", "Too low").expectStatus().is4xxClientError().expectBody()
                .jsonPath("$.message").value(String.class, m -> assertThat(m).contains("credit"));
        // A correction dated before the payment that lowers the debt below it.
        correctOn(own, "k-3", "100.00", "2026-09-10", "Too low").expectStatus().is4xxClientError();
        assertBalance(own, "-400.00");
        // A correction that raised the debt cannot be removed once a payment relies on it.
        correctOn(own, "k-4", "1500.00", "2026-09-10", "Lender raised it").expectStatus().isCreated();
        AtomicReference<String> raised = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", own).exchange().expectBody()
                .jsonPath("$[?(@.kind=='correction')].id").value(List.class, ids -> raised.set((String) ids.get(0)));
        String again = loanPayment("k-5", bank, own, "800.00", "0.00", "2026-09-21");
        assertBalance(own, "-100.00");
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", own, raised.get())
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus()
                .is4xxClientError();
        assertBalance(own, "-100.00");
        // A payment removed, a correction lowering the debt, then the payment brought back: refused.
        removeLoanPayment(again, mayaId).expectStatus().isOk();
        correctOn(own, "k-6", "50.00", "2026-09-22", "Lender statement").expectStatus().isCreated();
        undoLoanPayment(again, mayaId).expectStatus().is4xxClientError();
        assertBalance(own, "-50.00");
    }

    @Order(10)
    @Test
    @DisplayName("V2_DATED_VALUE_003 an archived loan keeps its history changeable, takes no new correction, and a "
            + "closed one takes neither")
    void archivedAndClosedLoans() {
        String own = loan("State Loan", "1000.00", "2026-09-01");
        correctOn(own, "s-1", "900.00", "2026-09-10", "Statement").expectStatus().isCreated();
        AtomicReference<String> row = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", own).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, row::set);
        act(own, "archive").expectStatus().isOk();
        correctOn(own, "s-2", "800.00", "2026-09-11", "Another").expectStatus().is4xxClientError();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", own, row.get())
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        assertBalance(own, "-1000.00");
        act(own, "restore").expectStatus().isOk();
        correctOn(own, "s-3", "0.00", "2026-09-12", "Paid off").expectStatus().isCreated();
        act(own, "close").expectStatus().isOk();
        correctOn(own, "s-4", "10.00", "2026-09-13", "After close").expectStatus().is4xxClientError();
        correctInitial(own, "s-5", "10.00", "After close").expectStatus().is4xxClientError();
        act(own, "reopen").expectStatus().isOk();
    }
}
