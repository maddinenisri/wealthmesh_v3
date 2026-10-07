package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 16a, group 1: a loan is a debt account (D-053): one Balance owed, stored with the asset sign like a card
 * (negative is owed), set up with a lender and owners, and counted once as debt. Raw-API tests of every rule.
 */
class LoanSetupApiTests extends DebtTestBase {

    private static String carLoan;
    private static String personalLoan;

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_LOAN_001 a loan shows one Balance owed, its lender and owners, and counts once as debt")
    void createAndView() {
        String bank = account("Checking", "5000.00");
        carLoan = loan("Car Loan", "20000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", carLoan).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.type").isEqualTo("loan").jsonPath("$.institution").isEqualTo("Maple Credit")
                .jsonPath("$.balance.amount").isEqualTo("-20000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-01").jsonPath("$.ownerMemberIds.length()").isEqualTo(2);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.debts").isEqualTo("20000.00")
                .jsonPath("$.loans.total").isEqualTo("-20000.00")
                .jsonPath("$.loans.accounts.length()").isEqualTo(1)
                .jsonPath("$.loans.accounts[0].name").isEqualTo("Car Loan")
                .jsonPath("$.debtLines.length()").isEqualTo(1)
                .jsonPath("$.netWorth").isEqualTo("-15000.00");
        assertBalance(bank, "5000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_LOAN_001 editing a loan's name leaves its lender, owners, Balance and date alone")
    void editName() {
        webTestClient.put().uri("/api/v1/accounts/{id}", carLoan).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Blue Car Loan", "institution": "Maple Credit",
                         "ownerMemberIds": ["%s", "%s"]}""".formatted(mayaId, samId))
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.name").isEqualTo("Blue Car Loan")
                .jsonPath("$.institution").isEqualTo("Maple Credit").jsonPath("$.balance.amount")
                .isEqualTo("-20000.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.ownerMemberIds.length()").isEqualTo(2);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts")
                .isEqualTo("20000.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_LOAN_002 a blank amount owed starts at $0.00 on its date and adds $0.00 to debt")
    void blankStartsAtZero() {
        personalLoan = createdId(createLoan("Personal Loan", null, null, "2026-09-01"));
        webTestClient.get().uri("/api/v1/accounts/{id}", personalLoan).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.openingAmount").isEqualTo("0.00").jsonPath("$.institution").isEmpty();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts")
                .isEqualTo("20000.00").jsonPath("$.loans.accounts.length()").isEqualTo(2);
    }

    private void assertRefusedAmount(String amount, String message) {
        createLoan("Car Loan", "Maple Credit", amount, "2026-09-01").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo(message);
    }

    @Order(4)
    @Test
    @DisplayName("V2_LOAN_005 a negative or invalid initial amount owed is refused and no loan is created")
    void invalidAmount() {
        int before = accountCount();
        assertRefusedAmount("-1.00", "Enter zero or a positive amount owed");
        assertRefusedAmount("abc", "Enter a valid amount");
        assertRefusedAmount("1.005", "Enter a valid amount");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "loan", "name": "Number", "ownerMemberIds": ["%s"], "openingBalance": 5}"""
                        .formatted(mayaId))
                .exchange().expectStatus().isBadRequest();
        assertThat(accountCount()).isEqualTo(before);
    }

    @Order(8)
    @Test
    @DisplayName("V2_LOAN_001 a lender over 120 characters is refused on create and on edit, in the words of a loan")
    void longLender() {
        String tooLong = "L".repeat(121);
        createLoan("Long Lender", tooLong, "1.00", "2026-09-01").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Lender must be 120 characters or fewer");
        webTestClient.put().uri("/api/v1/accounts/{id}", carLoan).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Blue Car Loan", "institution": "%s", "ownerMemberIds": ["%s"]}"""
                        .formatted(tooLong, mayaId))
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Lender must be 120 characters or fewer");
    }

    @Order(5)
    @Test
    @DisplayName("V2_LOAN_005 a side (owed or credit) is refused for a loan: the amount is always owed")
    void sideRefused() {
        int before = accountCount();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "loan", "name": "Sided", "ownerMemberIds": ["%s"], "openingBalance": "5.00",
                         "balanceSide": "credit"}""".formatted(mayaId))
                .exchange().expectStatus().isBadRequest();
        assertThat(accountCount()).isEqualTo(before);
    }

    @Order(6)
    @Test
    @DisplayName("V2_LOAN_001 a loan holds no activity of its own: every writer of money refuses it")
    void loanHoldsNoOrdinaryActivity() {
        String bank = account("Loan Bank", "1000.00");
        post(carLoan, "expenses", "l-e", entry(mayaId, "Fee", "10.00", "2026-09-07", "Dining")).expectStatus()
                .isBadRequest();
        post(carLoan, "income", "l-i", entry(mayaId, "Back", "10.00", "2026-09-07", "Salary")).expectStatus()
                .isBadRequest();
        post(carLoan, "refunds", "l-f", entry(mayaId, "Back", "10.00", "2026-09-07", "Dining")).expectStatus()
                .isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", carLoan)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "l-b")
                .bodyValue("""
                        {"enteredByMemberId": "%s", "entries": [{"description": "Fee", "amount": "5.00",
                         "occurredOn": "2026-09-07", "category": "Dining"}]}""".formatted(mayaId))
                .exchange().expectStatus().isBadRequest();
        post(carLoan, "reminders", "l-r", """
                {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                 "category": "Dining", "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus()
                .isBadRequest();
        post(carLoan, "historical-entries", "l-h", """
                {"kind": "expense", "entry": {"description": "Old", "amount": "5.00", "occurredOn": "2026-08-20",
                 "category": "Dining", "enteredByMemberId": "%s"},
                 "startRevision": {"openingAmount": "1.00", "openedOn": "2026-08-01", "reason": "Earlier",
                 "enteredByMemberId": "%s"}}""".formatted(mayaId, mayaId)).expectStatus().isBadRequest();
        post(carLoan, "statements", "l-st", """
                {"statementOn": "2026-09-30", "balance": "0.00", "note": "Sep", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isBadRequest();
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", carLoan).exchange().expectStatus()
                .isBadRequest();
        postTransfer("l-t1", bank, carLoan, "5.00", "2026-09-07", mayaId).expectStatus().isBadRequest();
        postTransfer("l-t2", carLoan, bank, "5.00", "2026-09-07", mayaId).expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/card-payments").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "l-cp").bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": "5.00", "occurredOn": "2026-09-07",
                         "enteredByMemberId": "%s"}""".formatted(bank, carLoan, mayaId)).exchange().expectStatus()
                .isBadRequest();
        createSchedule("l-sched", schedule("Bill", "10.00", "monthly", "2026-10-20", carLoan, "Utilities"))
                .expectStatus().isBadRequest();
        // A loan has no dated values either: a debt changes by payments and reviewed corrections (D-053).
        saveValue(carLoan, "l-v", valueBody(mayaId, "1.00", "2026-09-08", "x", false)).expectStatus()
                .isBadRequest();
        reviewValue(carLoan, valueBody(mayaId, "1.00", "2026-09-08", "x", false)).expectStatus().isBadRequest();
        assertBalance(carLoan, "-20000.00");
        assertBalance(bank, "1000.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_LOAN_001 the lifecycle reaches a loan: archive keeps its debt in wealth, close needs zero owed, "
            + "delete is refused while it holds a starting amount")
    void loanLifecycle() {
        String own = loan("Lifecycle Loan", "5000.00", "2026-09-01");
        AtomicInteger before = new AtomicInteger();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts")
                .value(String.class, d -> before.set((int) Double.parseDouble(d)));
        act(own, "archive").expectStatus().isOk();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts")
                .value(String.class, d -> assertThat((int) Double.parseDouble(d)).as("archiving hides nothing")
                        .isEqualTo(before.get()));
        act(own, "restore").expectStatus().isOk();
        assertRefused(act(own, "close"), "needs a zero Balance owed. It has $5,000.00 owed; record a payment first");
        assertRefused(act(own, "delete"), "a starting amount owed of $5,000.00");
        String empty = loan("Empty Loan", null, "2026-09-01");
        act(empty, "delete").expectStatus().isOk();
        act(empty, "undo-delete").expectStatus().isOk();
        act(empty, "close").expectStatus().isOk();
        act(empty, "reopen").expectStatus().isOk();
    }

    private String createdId(org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec spec) {
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        spec.expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private int accountCount() {
        AtomicInteger n = new AtomicInteger();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()")
                .value(Integer.class, n::set);
        return n.get();
    }
}
