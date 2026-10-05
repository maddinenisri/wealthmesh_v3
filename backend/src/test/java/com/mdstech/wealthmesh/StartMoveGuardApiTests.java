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

/** Guards found by the validator: no entry may end up before the tracking start, and saved kinds are checked. */
class StartMoveGuardApiTests extends LedgerApiTestBase {

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("a historical entry must be an expense or income; any other kind is 400 and saves nothing")
    void kindIsChecked() {
        String id = accountOpenedOn("Kind Checking", "5000.00", "2026-09-10");
        for (String kind : new String[] { "correction", "transfer_in", "refund", "interest", "fee", "" }) {
            webTestClient.post().uri("/api/v1/accounts/{id}/historical-entries", id)
                    .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k-" + kind)
                    .bodyValue(historical(kind, "6500.00", "2026-09-01")).exchange().expectStatus().isBadRequest();
        }
        webTestClient.post().uri("/api/v1/accounts/{id}/historical-entries", id)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k-missing")
                .bodyValue(historical(null, "6500.00", "2026-09-01")).exchange().expectStatus().isBadRequest();
        assertBalance(id, "5000.00");
        assertActivityCount(id, 0);
    }

    @Order(2)
    @Test
    @DisplayName("undo of an entry dated before the moved start is 409: the entry never counts outside tracking")
    void undoBeforeStart() {
        String id = account("Undo Checking", "1000.00");
        AtomicReference<String> entryId = new AtomicReference<>();
        post(id, "expenses", "k-undo", entry(mayaId, "Groceries", "100.00", "2026-09-05", "Groceries"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, entryId::set);
        webTestClient.post().uri("/api/v1/accounts/{id}/activity/{a}/removal", id, entryId.get())
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"" + mayaId + "\"}")
                .exchange().expectStatus().isOk();
        moveStart(id, "k-move", "900.00", "2026-09-10").expectStatus().isCreated();
        webTestClient.post().uri("/api/v1/accounts/{id}/activity/{a}/undo", id, entryId.get())
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"" + mayaId + "\"}")
                .exchange().expectStatus().isEqualTo(409);
        assertBalance(id, "900.00");
    }

    @Order(3)
    @Test
    @DisplayName("an expense racing a start move: the entry is never left dated before the start")
    void expenseRacesStartMove() {
        for (int i = 0; i < 6; i++) {
            int round = i;
            String id = account("Race Checking " + i, "1000.00");
            Mono<Integer> expense = Mono.fromCallable(() -> post(id, "expenses", "k-e" + round,
                    entry(mayaId, "Groceries", "10.00", "2026-09-05", "Groceries"))
                    .returnResult(String.class).getStatus().value()).subscribeOn(Schedulers.boundedElastic());
            Mono<Integer> move = Mono.fromCallable(() -> moveStart(id, "k-m" + round, "900.00", "2026-09-10")
                    .returnResult(String.class).getStatus().value()).subscribeOn(Schedulers.boundedElastic());
            List<Integer> statuses = Flux.merge(expense, move).collectList().block();
            AtomicReference<String> openedOn = new AtomicReference<>();
            webTestClient.get().uri("/api/v1/accounts/{id}", id).exchange().expectBody()
                    .jsonPath("$.openedOn").value(String.class, openedOn::set);
            AtomicReference<List<String>> dates = new AtomicReference<>();
            webTestClient.get().uri("/api/v1/accounts/{id}/activity", id).exchange().expectBody()
                    .jsonPath("$[*].occurredOn").value(List.class, list -> dates.set(list));
            if (dates.get() != null) {
                Assertions.assertThat(dates.get()).allSatisfy(d -> Assertions.assertThat(d.toString())
                        .isGreaterThanOrEqualTo(openedOn.get()));
            }
            Assertions.assertThat(statuses).as("statuses %s", statuses).doesNotContain(500);
        }
    }

    @Order(4)
    @Test
    @DisplayName("the same attach sent twice at once: one is created, the other replays (D-024)")
    void sameStatementKeyTwice() {
        String id = account("Statement Race", "1000.00");
        List<Integer> statuses = Flux.just(1, 2).flatMap(i -> Mono.fromCallable(
                () -> post(id, "statements", "k-same", """
                        {"statementOn": "2026-09-30", "balance": "1000.00", "note": "n",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)).returnResult(String.class).getStatus()
                        .value()).subscribeOn(Schedulers.boundedElastic())).collectList().block();
        Assertions.assertThat(statuses).containsExactlyInAnyOrder(201, 200);
    }

    private WebTestClient.ResponseSpec moveStart(String id, String key, String amount, String on) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/starting-balance-corrections", id)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue("""
                        {"openingAmount": "%s", "openedOn": "%s", "reason": "Move", "enteredByMemberId": "%s"}"""
                        .formatted(amount, on, mayaId)).exchange();
    }

    private static String historical(String kind, String opening, String openedOn) {
        return """
                {%s "entry": {"description": "Rent", "amount": "1500.00", "occurredOn": "2026-09-03",
                              "category": "Rent", "enteredByMemberId": "%s"},
                 "startRevision": {"openingAmount": "%s", "openedOn": "%s", "reason": "Reviewed",
                                   "enteredByMemberId": "%s"}}""".formatted(
                kind == null ? "" : "\"kind\": \"" + kind + "\",", mayaId, opening, openedOn, mayaId);
    }
}
