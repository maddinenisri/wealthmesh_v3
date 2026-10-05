package com.mdstech.wealthmesh;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** A small household from nothing to a week of money history (slice 07, group E). */
class HouseholdJourneyApiTests extends TransferTestBase {

    @Order(0)
    @Test
    @DisplayName("V2_JOURNEY_002 begin without known balances and build a small money history over September 1 to 7")
    void beginWithoutKnownBalances() {
        household();
        clock.setToday(LocalDate.of(2026, 9, 1));
        AtomicReference<String> checking = new AtomicReference<>();
        AtomicReference<String> savings = new AtomicReference<>();
        for (String[] account : new String[][] { { "checking", "Daily Money" }, { "savings", "Rainy Day" } }) {
            AtomicReference<String> id = "checking".equals(account[0]) ? checking : savings;
            webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("""
                            {"type": "%s", "name": "%s", "ownerMemberIds": ["%s"]}""".formatted(account[0], account[1],
                            mayaId))
                    .exchange().expectStatus().isCreated().expectBody()
                    .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                    .jsonPath("$.id").value(String.class, id::set);
        }
        assertBalance(checking.get(), "0.00");
        assertActivityCount(checking.get(), 0);

        webTestClient.put().uri("/api/v1/accounts/{id}", checking.get()).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Everyday Checking", "ownerMemberIds": ["%s"]}""".formatted(mayaId))
                .exchange().expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.name=='Everyday Checking')].balance.amount").isEqualTo("0.00");

        // She returns on September 7 to record the week.
        clock.setToday(LocalDate.of(2026, 9, 7));
        post(checking.get(), "income", "k-j-salary", entry(mayaId, "Salary", "3000.00", "2026-09-05", "Salary"))
                .expectStatus().isCreated();
        postTransfer("k-j-move", checking.get(), savings.get(), "500.00", "2026-09-06", mayaId).expectStatus()
                .isCreated();
        post(checking.get(), "expenses", "k-j-groceries", entry(mayaId, "Groceries", "125.00", "2026-09-07",
                "Groceries")).expectStatus().isCreated();
        assertBalance(checking.get(), "2375.00");
        assertBalance(savings.get(), "500.00");

        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.income").isEqualTo("3000.00").jsonPath("$.spending").isEqualTo("125.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("2875.00");
        AtomicReference<String> groceries = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.categories.length()").isEqualTo(1)
                .jsonPath("$.categories[0].name").isEqualTo("Groceries")
                .jsonPath("$.categories[0].categoryId").value(String.class, groceries::set);
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&categoryId={c}", groceries.get()).exchange()
                .expectBody().jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].amount").isEqualTo("125.00")
                .jsonPath("$[0].occurredOn").isEqualTo("2026-09-07");
    }
}
