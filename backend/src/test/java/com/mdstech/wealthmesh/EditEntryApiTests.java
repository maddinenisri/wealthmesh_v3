package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Edit as replacement with history (slice 02, group A). */
class EditEntryApiTests extends LedgerApiTestBase {

    private static String accountId;
    private static String rentId;
    private static String groceriesId;
    private static String currentRentId;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam with Everyday Checking at 5000.00 and Rent 1600.00 and Dining 125.00")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "5000.00");
        AtomicReference<String> rent = new AtomicReference<>();
        post(accountId, "expenses", "k-rent", entry(mayaId, "Rent", "1600.00", "2026-09-03", "Rent"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, rent::set);
        rentId = rent.get();
        AtomicReference<String> dining = new AtomicReference<>();
        post(accountId, "expenses", "k-dining", entry(mayaId, "Supermarket", "125.00", "2026-09-10", "Dining"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, dining::set);
        groceriesId = dining.get();
        assertBalance(accountId, "3275.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CHECKING_008 correct Rent to 1500.00 with a reason: one effective Rent expense and its history")
    void correctAmount() {
        AtomicReference<String> newId = new AtomicReference<>();
        replace(rentId, "k-rent-fix", """
                {"description": "Rent", "amount": "1500.00", "occurredOn": "2026-09-03", "category": "Rent",
                 "enteredByMemberId": "%s", "reason": "Correct the rent amount"}""".formatted(mayaId))
                .expectStatus().isCreated()
                .expectBody().jsonPath("$.amount").isEqualTo("1500.00")
                .jsonPath("$.id").value(String.class, newId::set);

        currentRentId = newId.get();
        assertBalance(accountId, "3375.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.categories[?(@.name=='Rent')].total").isEqualTo("1500.00")
                .jsonPath("$.categories[?(@.name=='Rent')].count").isEqualTo(1);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.categoryName=='Rent')]")
                .value(java.util.List.class, rows -> assertThat(rows).hasSize(1));

        history().expectBody()
                .jsonPath("$.length()").isEqualTo(3)
                .jsonPath("$[?(@.id=='" + rentId + "')].status").isEqualTo("replaced")
                .jsonPath("$[?(@.id=='" + rentId + "')].amount").isEqualTo("1600.00")
                .jsonPath("$[?(@.id=='" + rentId + "')].replacedById").isEqualTo(newId.get())
                .jsonPath("$[?(@.id=='" + rentId + "')].events[0].action").isEqualTo("replaced")
                .jsonPath("$[?(@.id=='" + rentId + "')].events[0].byName").isEqualTo("Maya")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].status").isEqualTo("effective")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].amount").isEqualTo("1500.00")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].replacesId").isEqualTo(rentId)
                .jsonPath("$[?(@.id=='" + newId.get() + "')].reason").isEqualTo("Correct the rent amount")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].enteredByName").isEqualTo("Maya")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].createdAt").isNotEmpty();
    }

    @Order(2)
    @Test
    @DisplayName("V2_EXPENSE_006 change a category only: same account, amount and date, spending moves")
    void correctCategory() {
        replace(groceriesId, "k-cat-fix", """
                {"description": "Supermarket", "amount": "125.00", "occurredOn": "2026-09-10",
                 "category": "Groceries", "enteredByMemberId": "%s"}""".formatted(mayaId))
                .expectStatus().isCreated()
                .expectBody().jsonPath("$.amount").isEqualTo("125.00")
                .jsonPath("$.occurredOn").isEqualTo("2026-09-10")
                .jsonPath("$.accountId").isEqualTo(accountId)
                .jsonPath("$.categoryName").isEqualTo("Groceries");
        assertBalance(accountId, "3375.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.total").isEqualTo("1625.00")
                .jsonPath("$.categories[?(@.name=='Groceries')].total").isEqualTo("125.00")
                .jsonPath("$.categories[?(@.name=='Dining')]").isEmpty();
    }

    @Order(3)
    @Test
    @DisplayName("a replacement is repeat-safe, and a replaced row cannot be replaced again")
    void repeatSafeAndOnlyOnce() {
        replace(rentId, "k-rent-fix", """
                {"description": "Rent", "amount": "1500.00", "occurredOn": "2026-09-03", "category": "Rent",
                 "enteredByMemberId": "%s", "reason": "Correct the rent amount"}""".formatted(mayaId))
                .expectStatus().isOk();
        replace(rentId, "k-rent-again", entry(mayaId, "Rent", "1400.00", "2026-09-03", "Rent"))
                .expectStatus().isEqualTo(409);
        assertBalance(accountId, "3375.00");
        history().expectBody().jsonPath("$.length()").isEqualTo(4);
    }

    @Order(4)
    @Test
    @DisplayName("a replacement follows the entry rules and leaves the original alone when refused")
    void refusedReplacement() {
        replace(currentRentId, "k-zero", entry(mayaId, "Rent", "0.00", "2026-09-03", "Rent"))
                .expectStatus().isBadRequest();
        replace(currentRentId, "k-future", entry(mayaId, "Rent", "10.00", "2026-10-04", "Rent"))
                .expectStatus().isBadRequest();
        replace(currentRentId, "k-income-cat", entry(mayaId, "Rent", "10.00", "2026-09-03", "Salary"))
                .expectStatus().isBadRequest();
        replace("00000000-0000-0000-0000-000000000000", "k-missing",
                entry(mayaId, "Rent", "10.00", "2026-09-03", "Rent"))
                .expectStatus().isNotFound();
        assertBalance(accountId, "3375.00");
    }

    @Order(5)
    @Test
    @DisplayName("income is corrected the same way: Balance and September income follow the replacement")
    void correctIncome() {
        AtomicReference<String> salary = new AtomicReference<>();
        post(accountId, "income", "k-salary", entry(mayaId, "Salary", "6000.00", "2026-09-02", "Salary"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, salary::set);
        assertBalance(accountId, "9375.00");
        replace(salary.get(), "k-salary-fix", entry(mayaId, "Salary", "6500.00", "2026-09-02", "Salary"))
                .expectStatus().isCreated().expectBody().jsonPath("$.kind").isEqualTo("income");
        assertBalance(accountId, "9875.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("6500.00");
    }

    @Order(6)
    @Test
    @DisplayName("two replacements of one entry at once: one wins, the other is refused, and it counts once")
    void concurrentReplacements() {
        AtomicReference<String> bonus = new AtomicReference<>();
        post(accountId, "income", "k-bonus", entry(mayaId, "Bonus", "100.00", "2026-09-04", "Salary"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, bonus::set);
        assertBalance(accountId, "9975.00");
        java.util.List<Integer> statuses = java.util.stream.IntStream.range(0, 2).parallel()
                .mapToObj(i -> replace(bonus.get(), "k-race-" + i,
                        entry(mayaId, "Bonus", "20" + i + ".00", "2026-09-04", "Salary"))
                        .returnResult(String.class).getStatus().value())
                .toList();
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", accountId).exchange()
                .expectBody().jsonPath("$[?(@.description=='Bonus')]")
                .value(java.util.List.class, rows -> assertThat(rows).hasSize(1));
    }

    private WebTestClient.ResponseSpec replace(String id, String key, String json) {
        return webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", accountId, id)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue(json).exchange();
    }

    private WebTestClient.ResponseSpec history() {
        return webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", accountId).exchange()
                .expectStatus().isOk();
    }
}
