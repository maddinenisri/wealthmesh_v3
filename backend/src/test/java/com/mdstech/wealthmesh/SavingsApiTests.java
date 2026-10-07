package com.mdstech.wealthmesh;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Savings is the checking shape (T1): setup, edit, Balance review and interest as income (slice 06). */
class SavingsApiTests extends LedgerApiTestBase {

    private static String savingsId;

    @Order(0)
    @Test
    @DisplayName("V2_SAVINGS_001 add savings with a starting Balance: list and detail agree, no activity, not income")
    void addSavings() {
        household();
        savingsId = savings("Emergency Savings", "10000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", savingsId).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.type").isEqualTo("savings")
                .jsonPath("$.institution").isEqualTo("Harbor Bank")
                .jsonPath("$.balance.amount").isEqualTo("10000.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        assertActivityCount(savingsId, 0);
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("10000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_SAVINGS_011 an unreadable Balance is refused with the amount message and nothing is added")
    void invalidBalance() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "savings", "name": "Other", "ownerMemberIds": ["%s"], "openedOn": "2026-09-01",
                         "openingBalance": "ten thousand"}""".formatted(mayaId))
                .exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()").isEqualTo(1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_HOUSEHOLD_SETUP_004 a missing date starts on today's date from the clock, not a fixed one")
    void defaultDateIsToday() {
        LocalDate today = LocalDate.of(2026, 9, 5);
        clock.setToday(today);
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "savings", "name": "Dated Today", "ownerMemberIds": ["%s"],
                         "openingBalance": "10000.00"}""".formatted(mayaId))
                .exchange().expectStatus().isCreated().expectBody()
                .jsonPath("$.balance.asOf").isEqualTo(today.toString())
                .jsonPath("$.id").value(String.class, id::set);
        webTestClient.get().uri("/api/v1/today").exchange().expectBody().jsonPath("$.today")
                .isEqualTo(today.toString());
        // V2_HOUSEHOLD_SETUP_004 the chosen date is kept and the opening is not income
        String chosen = savings("Emergency Fund", "10000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", chosen).exchange().expectBody()
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.balance.amount").isEqualTo("10000.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_SAVINGS_003 edit renames, changes owner and bank, and never the Balance or its date")
    void editDetails() {
        webTestClient.put().uri("/api/v1/accounts/{id}", savingsId).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Household Emergency Fund", "institution": "Harbor Credit Union",
                         "ownerMemberIds": ["%s"]}""".formatted(samId))
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.name").isEqualTo("Household Emergency Fund")
                .jsonPath("$.institution").isEqualTo("Harbor Credit Union")
                .jsonPath("$.balance.amount").isEqualTo("10000.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        webTestClient.put().uri("/api/v1/accounts/{id}", savingsId).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "X", "ownerMemberIds": ["%s"], "openingBalance": "1.00"}""".formatted(samId))
                .exchange().expectStatus().isBadRequest();
        assertBalance(savingsId, "10000.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_SAVINGS_008 review shows a 2000.00 increase; with no save the Balance stays 10000.00 everywhere")
    void cancelledBalanceUpdate() {
        webTestClient.get().uri("/api/v1/accounts/{id}/balance-corrections/preview?requested=12000.00&asOn=2026-09-30",
                savingsId).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.difference").isEqualTo("2000.00");
        assertBalance(savingsId, "10000.00");
        assertActivityCount(savingsId, 0);
        // three savings accounts of 10000.00 each exist by now; the review added nothing to wealth
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.financialAssets")
                .isEqualTo("30000.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_INCOME_002 savings interest is Interest income, not a correction or spending, and is findable")
    void savingsInterest() {
        post(savingsId, "income", "k-interest", entry(samId, "Interest", "25.00", "2026-09-15", "Interest"))
                .expectStatus().isCreated();
        assertBalance(savingsId, "10025.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("25.00")
                .jsonPath("$.categories[0].name").isEqualTo("Interest");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", savingsId).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].kind").isEqualTo("income")
                .jsonPath("$[0].categoryName").isEqualTo("Interest");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
    }

    @Order(6)
    @Test
    @DisplayName("an account type the app cannot set up yet is still refused")
    void unsupportedType() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "defined_benefit", "name": "Pension", "ownerMemberIds": ["%s"]}""".formatted(mayaId))
                .exchange().expectStatus().isBadRequest();
    }
}
