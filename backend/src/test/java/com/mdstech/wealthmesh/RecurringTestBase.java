package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;

/** Helpers for the recurring bill tests (slice 14): save, review and read schedules, and a month's figures. */
abstract class RecurringTestBase extends LifecycleTestBase {

    protected static final String RECURRING = "/api/v1/recurring";

    protected String schedule(String description, String amount, String frequency, String dueOn, String account,
            String category) {
        return schedule(mayaId, description, amount, frequency, dueOn, account, category);
    }

    protected String schedule(String memberId, String description, String amount, String frequency, String dueOn,
            String account, String category) {
        return """
                {"description": "%s", "amount": "%s", "frequency": "%s", "nextDueOn": "%s", "accountId": "%s",
                 "category": "%s", "enteredByMemberId": "%s"}""".formatted(description, amount, frequency, dueOn,
                account, category, memberId);
    }

    protected WebTestClient.ResponseSpec createSchedule(String key, String body) {
        return webTestClient.post().uri(RECURRING).contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec reviewSchedule(String body) {
        return webTestClient.post().uri(RECURRING + "/review").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body).exchange();
    }

    /** Saves a schedule (expects 201) and returns its id. */
    protected String created(String key, String body) {
        AtomicReference<String> id = new AtomicReference<>();
        createSchedule(key, body).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec overview() {
        return webTestClient.get().uri(RECURRING).exchange().expectStatus().isOk();
    }

    /** A schedule action with only who entered it, and optionally a date the action names. */
    protected WebTestClient.ResponseSpec act(String id, String action, String dueOn) {
        String date = dueOn == null ? "" : ", \"dueOn\": \"" + dueOn + "\"";
        return webTestClient.post().uri(RECURRING + "/{id}/{action}", id, action)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"%s}".formatted(mayaId, date)).exchange();
    }

    protected WebTestClient.ResponseSpec change(String id, String key, String body) {
        return webTestClient.put().uri(RECURRING + "/{id}", id).contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    protected String recordBody(String dueOn, String amount, String paidOn) {
        return recordBody(mayaId, dueOn, amount, paidOn, null);
    }

    protected String recordBody(String memberId, String dueOn, String amount, String paidOn, String category) {
        String named = category == null ? "" : ", \"category\": \"" + category + "\"";
        return """
                {"dueOn": "%s", "amount": "%s", "paidOn": "%s", "enteredByMemberId": "%s"%s}"""
                .formatted(dueOn, amount, paidOn, memberId, named);
    }

    protected WebTestClient.ResponseSpec record(String id, String key, String body) {
        return webTestClient.post().uri(RECURRING + "/{id}/record", id).contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec reviewRecord(String id, String body) {
        return webTestClient.post().uri(RECURRING + "/{id}/record/review", id)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec scheduleOf(String id) {
        return webTestClient.get().uri(RECURRING + "/{id}", id).exchange();
    }

    protected void assertSpending(String month, String total) {
        webTestClient.get().uri("/api/v1/spending?month=" + month).exchange().expectBody()
                .jsonPath("$.total").isEqualTo(total);
    }

    /** The saved schedules in the overview, as JSON paths a test reads. */
    protected WebTestClient.BodyContentSpec schedules() {
        return overview().expectBody();
    }

    /** Saves an expense with a description of its own (the bills a suggestion is found in) and returns its id. */
    protected String bill(String account, String key, String description, String category, String amount,
            String date) {
        AtomicReference<String> id = new AtomicReference<>();
        post(account, "expenses", key, entry(mayaId, description, amount, date, category)).expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    protected void removeEntry(String account, String id) {
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", account, id)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
    }

    protected WebTestClient.ResponseSpec dismissSuggestion(String account, String categoryId, String description) {
        return webTestClient.post().uri(RECURRING + "/suggestions/dismiss").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"accountId": "%s", "categoryId": "%s", "description": "%s", "enteredByMemberId": "%s"}"""
                        .formatted(account, categoryId, description, mayaId)).exchange();
    }

    protected void createCategory(String name, String kind) {
        webTestClient.post().uri("/api/v1/categories").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"kind\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(name, kind, mayaId)).exchange().expectStatus().isCreated();
    }

    protected String categoryId(String kind, String name) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/categories?kind=" + kind).exchange().expectBody()
                .jsonPath("$[?(@.name=='" + name + "')].id")
                .value(List.class, ids -> id.set((String) ids.getFirst()));
        return id.get();
    }

    protected String categoryId(String name) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectBody()
                .jsonPath("$[?(@.name=='" + name + "')].id")
                .value(List.class, ids -> id.set((String) ids.getFirst()));
        return id.get();
    }

    /** The household row lock every schedule write takes first. */
    protected static final String HOUSEHOLD_LOCK = "SELECT id FROM wealthmesh.household WHERE id = $1 FOR UPDATE";

    protected String householdId() {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/household").exchange().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    /**
     * Holds `sql` uncommitted (with the row lock it takes), runs each call, checks every one waits, then commits and
     * returns the statuses. A race test must go red when the lock it claims is taken out of the service.
     */
    @SafeVarargs
    protected final List<Integer> afterHeld(String sql, String id, Supplier<WebTestClient.ResponseSpec>... calls)
            throws Exception {
        Connection other = holdUncommitted(sql, id);
        List<CompletableFuture<Integer>> running = new ArrayList<>();
        try {
            for (Supplier<WebTestClient.ResponseSpec> call : calls) {
                running.add(CompletableFuture.supplyAsync(() -> call.get().returnResult(String.class).getStatus()
                        .value()));
            }
            Thread.sleep(700);
            running.forEach(call -> assertThat(call).as("the request waits for the lock").isNotDone());
            commit(other);
        } finally {
            close(other);
        }
        List<Integer> statuses = new ArrayList<>();
        for (CompletableFuture<Integer> call : running) {
            statuses.add(call.get(15, TimeUnit.SECONDS));
        }
        return statuses;
    }

    protected void setToday(String date) {
        clock.setToday(LocalDate.parse(date));
    }

    protected static List<String> days(String... dates) {
        return List.of(dates);
    }
}
