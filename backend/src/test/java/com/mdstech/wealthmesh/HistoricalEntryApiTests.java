package com.mdstech.wealthmesh;

import java.util.List;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** An expense dated before tracking began: reviewed setup and entry saved together (V2_CHECKING_016, group C). */
class HistoricalEntryApiTests extends LedgerApiTestBase {

    private static final String PREVIEW = "/api/v1/accounts/{id}/starting-balance-corrections/preview"
            + "?openingAmount=6500.00&openedOn=2026-09-01&entryKind=expense&entryAmount=1500.00&entryOn=2026-09-03";

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("set up checking 5000.00 starting 2026-09-10 with no activity")
    void setUp() {
        household();
        accountId = accountOpenedOn("Everyday Checking", "5000.00", "2026-09-10");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CHECKING_016 a Rent expense dated 09-03 is not saved silently: historical review is needed")
    void refusedWithoutReview() {
        post(accountId, "expenses", "k-plain", entry(mayaId, "Rent", "1500.00", "2026-09-03", "Rent"))
                .expectStatus().isBadRequest();
        assertActivityCount(accountId, 0);
        assertBalance(accountId, "5000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_CHECKING_016 preview: start 6500.00 on 09-01, Rent, Balance 5000.00, September spending 1500.00")
    void preview() {
        webTestClient.get().uri(PREVIEW, accountId).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.originalAmount").isEqualTo("5000.00")
                .jsonPath("$.originalOn").isEqualTo("2026-09-10")
                .jsonPath("$.openingAmount").isEqualTo("6500.00")
                .jsonPath("$.openedOn").isEqualTo("2026-09-01")
                .jsonPath("$.balanceWithEntry").isEqualTo("5000.00")
                .jsonPath("$.monthSpendingAfter").isEqualTo("1500.00");
        assertBalance(accountId, "5000.00");
        assertActivityCount(accountId, 0);
        assertRevisionCount(accountId, 0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_CHECKING_016 confirm saves start and expense together: Balance 5000.00, expense once")
    void confirm() {
        save(accountId, "k-hist", "6500.00", "2026-09-01", "Rent", "2026-09-03").expectStatus().isCreated()
                .expectBody().jsonPath("$.amount").isEqualTo("1500.00").jsonPath("$.kind").isEqualTo("expense");
        save(accountId, "k-hist", "6500.00", "2026-09-01", "Rent", "2026-09-03").expectStatus().isOk();

        assertBalance(accountId, "5000.00");
        assertActivityCount(accountId, 1);
        assertRevisionCount(accountId, 1);
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections", accountId).exchange()
                .expectBody().jsonPath("$[0].previousAmount").isEqualTo("5000.00")
                .jsonPath("$[0].previousOn").isEqualTo("2026-09-10")
                .jsonPath("$[0].openingAmount").isEqualTo("6500.00")
                .jsonPath("$[0].openedOn").isEqualTo("2026-09-01")
                .jsonPath("$[0].enteredByName").isEqualTo("Maya");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("1500.00").jsonPath("$.income").isEqualTo("0.00");
    }

    @Order(4)
    @Test
    @DisplayName("retry after the ledger changed: the repeated key returns the stored entry and applies nothing again")
    void retryAfterLedgerChanged() {
        saveExpense(accountId, "k-later", "100.00", "2026-09-20", "Groceries");
        save(accountId, "k-hist", "6500.00", "2026-09-01", "Rent", "2026-09-03").expectStatus().isOk()
                .expectBody().jsonPath("$.amount").isEqualTo("1500.00");
        save(accountId, "k-hist", "7000.00", "2026-09-01", "Rent", "2026-09-03").expectStatus().isEqualTo(409);
        assertBalance(accountId, "4900.00");
        assertActivityCount(accountId, 2);
        assertRevisionCount(accountId, 1);
    }

    @Order(5)
    @Test
    @DisplayName("all or nothing: an invalid expense or a start after the entry saves neither")
    void atomic() {
        String other = accountOpenedOn("Other Checking", "5000.00", "2026-09-10");
        webTestClient.post().uri("/api/v1/accounts/{id}/historical-entries", other)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k-bad-category")
                .bodyValue(body("expense", "6500.00", "2026-09-01", "Salary", "2026-09-03", "Rent", mayaId))
                .exchange().expectStatus().isBadRequest();
        // The new start is after the entry's date, so the entry would still be before tracking.
        save(other, "k-late-start", "6500.00", "2026-09-05", "Rent", "2026-09-03").expectStatus().isBadRequest();
        save(other, "k-zero", "0.00", "2026-09-01", "", "2026-09-03").expectStatus().isBadRequest();
        assertRevisionCount(other, 0);
        assertActivityCount(other, 0);
        assertBalance(other, "5000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", other).exchange().expectBody()
                .jsonPath("$.openedOn").isEqualTo("2026-09-10").jsonPath("$.openingAmount").isEqualTo("5000.00");
    }

    @Order(6)
    @Test
    @DisplayName("concurrent: the same save twice applies the start and the expense once")
    void concurrent() {
        String race = accountOpenedOn("Race Checking", "5000.00", "2026-09-10");
        List<Integer> statuses = Flux.just(1, 2).flatMap(i -> Mono.fromCallable(
                () -> save(race, "k-race", "6500.00", "2026-09-01", "Rent", "2026-09-03")
                        .returnResult(String.class).getStatus().value()).subscribeOn(Schedulers.boundedElastic()))
                .collectList().block();
        Assertions.assertThat(statuses).containsExactlyInAnyOrder(201, 200);
        assertActivityCount(race, 1);
        assertRevisionCount(race, 1);
        assertBalance(race, "5000.00");
    }

    private WebTestClient.ResponseSpec save(String account, String key, String opening, String openedOn,
            String category, String entryDate) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/historical-entries", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(body("expense", opening, openedOn, category, entryDate, "Rent", mayaId)).exchange();
    }

    private static String body(String kind, String opening, String openedOn, String category, String entryDate,
            String description, String memberId) {
        return """
                {"kind": "%s",
                 "entry": {"description": "%s", "amount": "1500.00", "occurredOn": "%s", "category": "%s",
                           "enteredByMemberId": "%s"},
                 "startRevision": {"openingAmount": "%s", "openedOn": "%s", "reason": "Reviewed historical setup",
                                   "enteredByMemberId": "%s"}}"""
                .formatted(kind, description, entryDate, category, memberId, opening, openedOn, memberId);
    }

    private void assertRevisionCount(String account, int count) {
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections", account).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.length()").isEqualTo(count);
    }
}
