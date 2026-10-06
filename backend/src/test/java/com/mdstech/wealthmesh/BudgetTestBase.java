package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;

/** Helpers for the Budget tests (slice 13): save, copy, remove and Undo a month's Budget, read it, merge categories. */
abstract class BudgetTestBase extends SplitTestBase {

    /** A target of a Budget body: a category id and an amount. */
    protected record T(String categoryId, String amount) {
        String json() {
            return "{\"categoryId\": \"%s\", \"amount\": \"%s\"}".formatted(categoryId, amount);
        }
    }

    protected static T t(String categoryId, String amount) {
        return new T(categoryId, amount);
    }

    protected String budgetBody(String total, T... targets) {
        return budgetBody(mayaId, total, targets);
    }

    protected String budgetBody(String memberId, String total, T... targets) {
        return "{\"total\": \"%s\", \"targets\": [%s], \"enteredByMemberId\": \"%s\"}".formatted(total,
                String.join(", ", Arrays.stream(targets).map(T::json).toList()), memberId);
    }

    protected WebTestClient.ResponseSpec saveBudget(String month, String key, String body) {
        return webTestClient.put().uri("/api/v1/budgets/{month}", month).contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec saveBudget(String month, String key, String total, T... targets) {
        return saveBudget(month, key, budgetBody(total, targets));
    }

    protected WebTestClient.ResponseSpec copyBudget(String month, String key, String fromMonth) {
        return webTestClient.post().uri("/api/v1/budgets/{month}/copy", month).contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key)
                .bodyValue("{\"fromMonth\": \"%s\", \"enteredByMemberId\": \"%s\"}".formatted(fromMonth, mayaId))
                .exchange();
    }

    protected WebTestClient.ResponseSpec budgetAction(String month, String action) {
        return webTestClient.post().uri("/api/v1/budgets/{month}/{action}", month, action)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange();
    }

    protected WebTestClient.ResponseSpec budget(String month) {
        return webTestClient.get().uri("/api/v1/budgets/{month}", month).exchange();
    }

    /** Merges the named categories (by id array) into a new category with the given name. */
    protected WebTestClient.ResponseSpec mergeCategories(String sourceIds, String targetId) {
        return webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sourceIds\": %s, \"enteredByMemberId\": \"%s\", \"targetId\": \"%s\"}"
                        .formatted(sourceIds, mayaId, targetId)).exchange();
    }

    /** The household row lock every Budget write takes first. */
    protected static final String HOUSEHOLD_LOCK = "SELECT id FROM wealthmesh.household WHERE id = $1 FOR UPDATE";

    protected String householdId() {
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        webTestClient.get().uri("/api/v1/household").exchange().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    /**
     * Runs the calls while a second connection holds a write uncommitted (so its lock is held): every call must wait,
     * then finish once it commits. Returns each call's status. Fails when the service does not take the lock.
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
}
