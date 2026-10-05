package com.mdstech.wealthmesh;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** Correct an omitted starting balance (V2_JOURNEY_004, group B); never income, spending or a new entry. */
class StartingBalanceApiTests extends LedgerApiTestBase {

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("set up: blank start (0.00 on 2026-09-01), salary 6000.00 on 09-05, rent 1500.00 on 09-06")
    void setUp() {
        household();
        accountId = account("Everyday Checking", null);
        saveIncome(accountId, "k-salary", "6000.00", "2026-09-05");
        saveExpense(accountId, "k-rent", "1500.00", "2026-09-06", "Rent");
        assertBalance(accountId, "4500.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_JOURNEY_004 preview: original 0.00, corrected 5000.00 on 2026-09-01, Balance 4500.00 to 9500.00")
    void preview() {
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections/preview"
                + "?openingAmount=5000.00&openedOn=2026-09-01", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.originalAmount").isEqualTo("0.00")
                .jsonPath("$.originalOn").isEqualTo("2026-09-01")
                .jsonPath("$.openingAmount").isEqualTo("5000.00")
                .jsonPath("$.openedOn").isEqualTo("2026-09-01")
                .jsonPath("$.currentBalance").isEqualTo("4500.00")
                .jsonPath("$.currentBalanceAfter").isEqualTo("9500.00")
                .jsonPath("$.overdraft").isEqualTo(false);
        assertBalance(accountId, "4500.00");
        assertRevisionCount(0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_JOURNEY_004 confirm: Balance 9500.00, original zero kept, income and spending unchanged")
    void confirm() {
        correct("k-start", "5000.00", "2026-09-01", "Starting amount was omitted during setup")
                .expectStatus().isCreated().expectBody()
                .jsonPath("$.previousAmount").isEqualTo("0.00").jsonPath("$.previousOn").isEqualTo("2026-09-01")
                .jsonPath("$.openingAmount").isEqualTo("5000.00").jsonPath("$.openedOn").isEqualTo("2026-09-01")
                .jsonPath("$.reason").isEqualTo("Starting amount was omitted during setup")
                .jsonPath("$.enteredByName").isEqualTo("Maya");
        correct("k-start", "5000.00", "2026-09-01", "Starting amount was omitted during setup")
                .expectStatus().isOk();

        assertBalance(accountId, "9500.00");
        assertActivityCount(accountId, 2);
        assertRevisionCount(1);
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectBody()
                .jsonPath("$.openingAmount").isEqualTo("5000.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.income").isEqualTo("6000.00").jsonPath("$.spending").isEqualTo("1500.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("9500.00");
    }

    @Order(3)
    @Test
    @DisplayName("retry after the ledger changed: the repeated key returns the stored correction; new details are 409")
    void retryAfterLedgerChanged() {
        saveExpense(accountId, "k-later", "100.00", "2026-09-20", "Groceries");
        correct("k-start", "5000.00", "2026-09-01", "Starting amount was omitted during setup")
                .expectStatus().isOk().expectBody().jsonPath("$.previousAmount").isEqualTo("0.00");
        correct("k-start", "6000.00", "2026-09-01", "Starting amount was omitted during setup")
                .expectStatus().isEqualTo(409);
        assertBalance(accountId, "9400.00");
        assertRevisionCount(1);
    }

    @Order(4)
    @Test
    @DisplayName("validation: reason, amount, no change, future date, date after the first entry, key, member")
    void validation() {
        correct("k-v1", "6000.00", "2026-09-01", " ").expectStatus().isBadRequest();
        correct("k-v2", "abc", "2026-09-01", "x").expectStatus().isBadRequest();
        correct("k-v3", "5000.00", "2026-09-01", "x").expectStatus().isBadRequest();
        correct("k-v4", "5000.00", "2026-10-04", "x").expectStatus().isBadRequest();
        correct("k-v5", "5000.00", "2026-09-06", "x").expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{id}/starting-balance-corrections", accountId)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body("6000.00", "2026-09-01", "x", mayaId))
                .exchange().expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{id}/starting-balance-corrections", accountId)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k-v6")
                .bodyValue(body("6000.00", "2026-09-01", "x", "00000000-0000-4000-8000-000000000000"))
                .exchange().expectStatus().isBadRequest();
        assertRevisionCount(1);
        assertBalance(accountId, "9400.00");
    }

    @Order(5)
    @Test
    @DisplayName("concurrent: the same key applies once; two keys apply one after the other with a clean chain")
    void concurrent() {
        List<Integer> same = Flux.just(1, 2).flatMap(i -> Mono.fromCallable(
                () -> correct("k-same", "7000.00", "2026-09-01", "Same save twice").returnResult(String.class)
                        .getStatus().value()).subscribeOn(Schedulers.boundedElastic())).collectList().block();
        Assertions.assertThat(same).containsExactlyInAnyOrder(201, 200);
        assertRevisionCount(2);

        List<Integer> two = Flux.just("8000.00", "9000.00").flatMap(amount -> Mono.fromCallable(
                () -> correct("k-" + amount, amount, "2026-09-01", "Race " + amount).returnResult(String.class)
                        .getStatus().value()).subscribeOn(Schedulers.boundedElastic())).collectList().block();
        Assertions.assertThat(two).containsExactly(201, 201);
        AtomicReference<List<String>> chain = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections", accountId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.length()").isEqualTo(4)
                .jsonPath("$[2].previousAmount").value(String.class, previous -> chain.set(List.of(previous)));
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectBody()
                .jsonPath("$.openingAmount").value(String.class, last -> Assertions.assertThat(last)
                        .isIn("8000.00", "9000.00"));
        // 7000 was current before the race, so the first of the two raced saves had it as its previous amount.
        Assertions.assertThat(chain.get()).containsExactly("7000.00");
    }

    private WebTestClient.ResponseSpec correct(String key, String amount, String date, String reason) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/starting-balance-corrections", accountId)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(body(amount, date, reason, mayaId)).exchange();
    }

    private static String body(String amount, String date, String reason, String memberId) {
        return """
                {"openingAmount": "%s", "openedOn": "%s", "reason": "%s", "enteredByMemberId": "%s"}"""
                .formatted(amount, date, reason, memberId);
    }

    private void assertRevisionCount(int count) {
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections", accountId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.length()").isEqualTo(count);
    }
}
