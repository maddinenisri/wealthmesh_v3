package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Soft removal and Undo of expenses and income (slice 02, group B). */
class RemoveEntryApiTests extends LedgerApiTestBase {

    private static String accountId;
    private static String groceriesId;
    private static String salaryId;

    @Order(0)
    @Test
    @DisplayName("set up Everyday Checking at 5000.00 with Groceries 125.00 and Salary 6000.00")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "5000.00");
        AtomicReference<String> groceries = new AtomicReference<>();
        post(accountId, "expenses", "k-groceries", entry(samId, "Groceries", "125.00", "2026-09-10", "Groceries"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, groceries::set);
        groceriesId = groceries.get();
        AtomicReference<String> salary = new AtomicReference<>();
        post(accountId, "income", "k-salary", entry(mayaId, "Salary", "6000.00", "2026-09-02", "Salary"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, salary::set);
        salaryId = salary.get();
        assertBalance(accountId, "10875.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_EXPENSE_009 remove an expense: Balance and spending drop it, history keeps it, Undo restores it")
    void removeAndUndoExpense() {
        remove(groceriesId, samId).expectStatus().isOk()
                .expectBody().jsonPath("$.status").isEqualTo("removed")
                .jsonPath("$.events[0].action").isEqualTo("removed")
                .jsonPath("$.events[0].byName").isEqualTo("Sam")
                .jsonPath("$.events[0].at").isNotEmpty();

        assertBalance(accountId, "11000.00");
        assertSpending("0.00");
        assertActivityCount(accountId, 1);
        assertWealth("11000.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("0.00");
        history().expectBody().jsonPath("$[?(@.id=='" + groceriesId + "')].status").isEqualTo("removed")
                .jsonPath("$[?(@.id=='" + groceriesId + "')].amount").isEqualTo("125.00");

        undo(groceriesId, samId).expectStatus().isOk()
                .expectBody().jsonPath("$.status").isEqualTo("effective").jsonPath("$.id").isEqualTo(groceriesId)
                .jsonPath("$.events.length()").isEqualTo(2)
                .jsonPath("$.events[1].action").isEqualTo("restored")
                .jsonPath("$.events[1].byName").isEqualTo("Sam");
        assertBalance(accountId, "10875.00");
        assertSpending("125.00");
        assertWealth("10875.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.categories[?(@.name=='Groceries')].total").isEqualTo("125.00");
        assertActivityCount(accountId, 2);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", accountId).exchange()
                .expectBody().jsonPath("$[?(@.id=='" + groceriesId + "')].occurredOn").isEqualTo("2026-09-10");
    }

    @Order(2)
    @Test
    @DisplayName("V2_INCOME_004 remove a salary: Balance and September income drop it, Undo restores it")
    void removeAndUndoIncome() {
        remove(salaryId, mayaId).expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("removed");
        assertBalance(accountId, "4875.00");
        assertIncome("0.00");
        assertActivityCount(accountId, 1);
        history().expectBody().jsonPath("$[?(@.id=='" + salaryId + "')].status").isEqualTo("removed");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectBody()
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.incomeMinusSpending").isEqualTo("-125.00");

        undo(salaryId, mayaId).expectStatus().isOk();
        assertBalance(accountId, "10875.00");
        assertIncome("6000.00");
        assertActivityCount(accountId, 2);
        history().expectBody().jsonPath("$[?(@.id=='" + salaryId + "')].status").isEqualTo("effective");
    }

    @Order(3)
    @Test
    @DisplayName("removing twice, or undoing an entry that is not removed, is refused and changes nothing")
    void wrongState() {
        remove(groceriesId, samId).expectStatus().isOk();
        remove(groceriesId, samId).expectStatus().isEqualTo(409);
        undo(groceriesId, samId).expectStatus().isOk();
        undo(groceriesId, samId).expectStatus().isEqualTo(409);
        assertBalance(accountId, "10875.00");
    }

    @Order(4)
    @Test
    @DisplayName("an entry that was replaced cannot be removed or undone, only its replacement can")
    void replacedRowIsFinal() {
        AtomicReference<String> replacement = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", accountId, groceriesId)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k-fix")
                .bodyValue(entry(samId, "Groceries", "100.00", "2026-09-10", "Groceries")).exchange()
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, replacement::set);
        remove(groceriesId, samId).expectStatus().isEqualTo(409);
        undo(groceriesId, samId).expectStatus().isEqualTo(409);
        assertBalance(accountId, "10900.00");

        remove(replacement.get(), samId).expectStatus().isOk();
        assertBalance(accountId, "11000.00");
        undo(replacement.get(), samId).expectStatus().isOk();
        assertBalance(accountId, "10900.00");
    }

    @Order(5)
    @Test
    @DisplayName("removal needs a known entry and a household member")
    void validation() {
        remove("00000000-0000-0000-0000-000000000000", samId).expectStatus().isNotFound();
        remove(salaryId, null).expectStatus().isBadRequest();
        remove(salaryId, "00000000-0000-0000-0000-000000000000").expectStatus().isBadRequest();
        assertBalance(accountId, "10900.00");
    }

    private WebTestClient.ResponseSpec remove(String id, String memberId) {
        return change(id, "removal", memberId);
    }

    private WebTestClient.ResponseSpec undo(String id, String memberId) {
        return change(id, "undo", memberId);
    }

    private WebTestClient.ResponseSpec change(String id, String action, String memberId) {
        String body = memberId == null ? "{}" : "{\"enteredByMemberId\": \"%s\"}".formatted(memberId);
        return webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/{action}", accountId, id, action)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private WebTestClient.ResponseSpec history() {
        return webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", accountId).exchange()
                .expectStatus().isOk();
    }

    private void assertWealth(String assets) {
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo(assets);
    }

    private void assertSpending(String total) {
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.total").isEqualTo(total);
    }

    private void assertIncome(String total) {
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.total").isEqualTo(total);
    }
}
