package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 16b, group 1: a mortgage is the second debt type (D-053): the same one Balance owed as a loan, stored
 * negative, with a lender and owners, in its own wealth group. Raw-API tests of every rule, and of the count: a
 * debt is in exactly one of the loans and mortgages groups and in debts once.
 */
class MortgageSetupApiTests extends DebtTestBase {

    private static String home;
    private static String bank;
    private static String mortgage;

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_MORTGAGE_001 a mortgage shows one Balance owed beside the home, and counts once as debt")
    void createAndView() {
        home = property("Family Home", "300000.00", "2026-09-01");
        bank = account("Checking", "5000.00");
        mortgage = mortgage("Home Mortgage", "200000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", mortgage).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.type").isEqualTo("mortgage").jsonPath("$.institution").isEqualTo("Maple Bank")
                .jsonPath("$.balance.amount").isEqualTo("-200000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-01").jsonPath("$.ownerMemberIds.length()").isEqualTo(2);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("305000.00").jsonPath("$.debts").isEqualTo("200000.00")
                .jsonPath("$.netWorth").isEqualTo("105000.00")
                .jsonPath("$.mortgages.total").isEqualTo("-200000.00")
                .jsonPath("$.mortgages.accounts.length()").isEqualTo(1)
                .jsonPath("$.mortgages.accounts[0].name").isEqualTo("Home Mortgage")
                .jsonPath("$.loans.accounts.length()").isEqualTo(0)
                .jsonPath("$.debtLines.length()").isEqualTo(1);
        assertBalance(home, "300000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_MORTGAGE_001 editing the name changes nothing else: not the debt, the dates or the home")
    void editName() {
        webTestClient.put().uri("/api/v1/accounts/{id}", mortgage).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Maple Mortgage", "institution": "Maple Bank",
                         "ownerMemberIds": ["%s", "%s"]}""".formatted(mayaId, samId))
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.name").isEqualTo("Maple Mortgage")
                .jsonPath("$.institution").isEqualTo("Maple Bank").jsonPath("$.balance.amount")
                .isEqualTo("-200000.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts")
                .isEqualTo("200000.00").jsonPath("$.netWorth").isEqualTo("105000.00");
        assertBalance(home, "300000.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_MORTGAGE_002 a blank amount owed starts at $0.00 on its date and adds $0.00 to debt")
    void blankStartsAtZero() {
        AtomicReference<String> id = new AtomicReference<>();
        createMortgage("Future Home Mortgage", null, null, "2026-09-01").expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, id::set);
        webTestClient.get().uri("/api/v1/accounts/{id}", id.get()).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.openingAmount").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts")
                .isEqualTo("200000.00").jsonPath("$.mortgages.accounts.length()").isEqualTo(2);
    }

    private void assertRefusedAmount(String amount, String message) {
        createMortgage("Home Mortgage", "Maple Bank", amount, "2026-09-01").expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo(message);
    }

    @Order(4)
    @Test
    @DisplayName("V2_MORTGAGE_007 a negative or invalid initial amount owed is refused and no mortgage is created")
    void invalidAmount() {
        int before = accountCount();
        assertRefusedAmount("-1.00", "Enter zero or a positive amount owed");
        assertRefusedAmount("abc", "Enter a valid amount");
        assertThat(accountCount()).isEqualTo(before);
    }

    @Order(5)
    @Test
    @DisplayName("V2_MORTGAGE_001 a lender over 120 characters is refused on create and edit, in the words of a debt")
    void longLender() {
        String tooLong = "L".repeat(121);
        createMortgage("Long Lender", tooLong, "1.00", "2026-09-01").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Lender must be 120 characters or fewer");
        webTestClient.put().uri("/api/v1/accounts/{id}", mortgage).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Maple Mortgage", "institution": "%s", "ownerMemberIds": ["%s"]}"""
                        .formatted(tooLong, mayaId))
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Lender must be 120 characters or fewer");
    }

    @Order(6)
    @Test
    @DisplayName("V2_MORTGAGE_001 a mortgage holds no activity of its own: every writer of money refuses it")
    void mortgageHoldsNoOrdinaryActivity() {
        post(mortgage, "expenses", "m-e", entry(mayaId, "Fee", "10.00", "2026-09-07", "Dining")).expectStatus()
                .isBadRequest();
        post(mortgage, "income", "m-i", entry(mayaId, "Back", "10.00", "2026-09-07", "Salary")).expectStatus()
                .isBadRequest();
        post(mortgage, "refunds", "m-f", entry(mayaId, "Back", "10.00", "2026-09-07", "Dining")).expectStatus()
                .isBadRequest();
        post(mortgage, "reminders", "m-r", """
                {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                 "category": "Dining", "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus()
                .isBadRequest();
        postTransfer("m-t1", bank, mortgage, "5.00", "2026-09-07", mayaId).expectStatus().isBadRequest();
        postTransfer("m-t2", mortgage, bank, "5.00", "2026-09-07", mayaId).expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/card-payments").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "m-cp").bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": "5.00", "occurredOn": "2026-09-07",
                         "enteredByMemberId": "%s"}""".formatted(bank, mortgage, mayaId)).exchange().expectStatus()
                .isBadRequest();
        createSchedule("m-sched", schedule("Bill", "10.00", "monthly", "2026-10-20", mortgage, "Utilities"))
                .expectStatus().isBadRequest();
        saveValue(mortgage, "m-v", valueBody(mayaId, "1.00", "2026-09-08", "x", false)).expectStatus()
                .isBadRequest();
        assertBalance(mortgage, "-200000.00");
        assertBalance(bank, "5000.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_MORTGAGE_001 the lifecycle reaches a mortgage: archive keeps its debt, close needs zero owed")
    void mortgageLifecycle() {
        String own = mortgage("Lifecycle Mortgage", "5000.00", "2026-09-01");
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
    }

    @Order(8)
    @Test
    @DisplayName("V2_MORTGAGE_001 with a loan and a mortgage, each debt is in one group and debts, net worth and "
            + "the change explanation count each once")
    void loanAndMortgageCountOnce() {
        loan("Car Loan", "20000.00", "2026-09-01");
        // Debts: 200,000 mortgage + 5,000 lifecycle mortgage + 20,000 loan; the two blank mortgages add nothing.
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.loans.total").isEqualTo("-20000.00").jsonPath("$.loans.accounts.length()").isEqualTo(1)
                .jsonPath("$.mortgages.total").isEqualTo("-205000.00")
                .jsonPath("$.debts").isEqualTo("225000.00").jsonPath("$.financialAssets").isEqualTo("305000.00")
                .jsonPath("$.netWorth").isEqualTo("80000.00")
                .jsonPath("$.debtLines.length()").isEqualTo(3);
        // Added accounts carry their opening amounts into the period; nothing is left unexplained.
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-08-31&to=2026-10-03").exchange().expectBody()
                .jsonPath("$.endWealth").isEqualTo("80000.00").jsonPath("$.change").isEqualTo("80000.00")
                .jsonPath("$.accountsAdded").isEqualTo("80000.00").jsonPath("$.other").isEqualTo("0.00");
    }

    private int accountCount() {
        AtomicInteger n = new AtomicInteger();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()")
                .value(Integer.class, n::set);
        return n.get();
    }
}
