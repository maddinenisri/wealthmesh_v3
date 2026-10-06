package com.mdstech.wealthmesh;

import java.util.Arrays;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

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
                        .formatted(sourceIds, samId, targetId)).exchange();
    }
}
