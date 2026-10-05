package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** An expense that was really a transfer (slice 07, group D). */
class TransferConversionApiTests extends TransferTestBase {

    private static String checking;
    private static String savings;
    private static String expense;

    @Order(0)
    @Test
    @DisplayName("set up checking 5000.00 and savings 10000.00 and a 2000.00 expense on 2026-09-04")
    void setUp() {
        household();
        checking = account("Everyday Checking", "5000.00");
        savings = savings("Emergency Savings", "10000.00", "2026-09-01");
        expense = expense(checking, "k-mistake", "Dining", "2000.00", "2026-09-04");
        assertBalance(checking, "3000.00");
        monthIs("spending", "2026-09", "2000.00", null);
    }

    @Order(1)
    @Test
    @DisplayName("V2_EXPENSE_008 the preview shows both Balances and September spending 0.00; confirming leaves one "
            + "transfer that is not spending, and the expense stays in history")
    void changeToTransfer() {
        webTestClient.get().uri("/api/v1/transfers/preview?fromAccountId={c}&toAccountId={s}&activityId={a}",
                checking, savings, expense).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.accounts.length()").isEqualTo(2)
                .jsonPath("$.accounts[0].name").isEqualTo("Everyday Checking")
                .jsonPath("$.accounts[0].balanceAfter").isEqualTo("3000.00")
                .jsonPath("$.accounts[1].name").isEqualTo("Emergency Savings")
                .jsonPath("$.accounts[1].balanceAfter").isEqualTo("12000.00")
                .jsonPath("$.spending.month").isEqualTo("2026-09")
                .jsonPath("$.spending.before").isEqualTo("2000.00")
                .jsonPath("$.spending.after").isEqualTo("0.00");
        // The preview changed nothing.
        monthIs("spending", "2026-09", "2000.00", null);
        assertBalance(savings, "10000.00");

        convert(checking, expense, "k-convert", savings, mayaId, "This money moved to our savings")
                .expectStatus().isCreated().expectBody()
                .jsonPath("$.from.accountName").isEqualTo("Everyday Checking")
                .jsonPath("$.to.accountName").isEqualTo("Emergency Savings")
                .jsonPath("$.amount").isEqualTo("2000.00").jsonPath("$.occurredOn").isEqualTo("2026-09-04")
                .jsonPath("$.reason").isEqualTo("This money moved to our savings");
        assertBalance(checking, "3000.00");
        assertBalance(savings, "12000.00");
        monthIs("spending", "2026-09", "0.00", null);
        monthIs("income", "2026-09", "0.00", null);
        // One effective action, visible from both accounts.
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].kind").isEqualTo("transfer_out")
                .jsonPath("$[0].counterAccountName").isEqualTo("Emergency Savings");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", savings).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].kind").isEqualTo("transfer_in");
        // The earlier classification stays in correction history, with who, when and why.
        history(checking).expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.kind=='expense')].status").isEqualTo("replaced")
                .jsonPath("$[?(@.kind=='expense')].categoryName").isEqualTo("Dining")
                .jsonPath("$[?(@.kind=='expense')].replacedBy.kind").isEqualTo("transfer_out")
                .jsonPath("$[?(@.kind=='expense')].events[0].byName").isEqualTo("Maya")
                .jsonPath("$[?(@.kind=='transfer_out')].reason").isEqualTo("This money moved to our savings")
                .jsonPath("$[?(@.kind=='transfer_out')].replaces.kind").isEqualTo("expense")
                .jsonPath("$[?(@.kind=='transfer_out')].replaces.categoryName").isEqualTo("Dining");
        history(savings).expectBody().jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].reason").isEqualTo("This money moved to our savings");
    }

    @Order(2)
    @Test
    @DisplayName("V2_EXPENSE_008 a repeated change replays; the same key with another destination is 409; the expense "
            + "cannot be "
            + "changed twice or edited as an expense afterwards")
    void repeatsAndConflicts() {
        String other = savings("Holiday Savings", "100.00", "2026-09-01");
        convert(checking, expense, "k-convert", savings, mayaId, "This money moved to our savings")
                .expectStatus().isOk();
        convert(checking, expense, "k-convert", other, mayaId, "This money moved to our savings")
                .expectStatus().isEqualTo(409);
        convert(checking, expense, "k-convert-2", other, mayaId, "Again").expectStatus().isEqualTo(409);
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", checking, expense)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).header("Idempotency-Key", "k-late")
                .bodyValue("""
                        {"description": "x", "amount": "2000.00", "occurredOn": "2026-09-04", "category": "Dining",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)).exchange().expectStatus().isEqualTo(409);
        assertBalance(other, "100.00");
        assertBalance(savings, "12000.00");
        monthIs("spending", "2026-09", "0.00", null);
    }

    @Order(3)
    @Test
    @DisplayName("V2_EXPENSE_008 the server refuses a change without a reason, to the same account, of income, of a "
            + "transfer row, to "
            + "an unknown account or by an inactive member")
    void guards() {
        String groceries = expense(checking, "k-g", "Groceries", "40.00", "2026-09-05");
        AtomicReference<String> salary = new AtomicReference<>();
        post(checking, "income", "k-c-salary", entry(mayaId, "Salary", "100.00", "2026-09-06", "Salary"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, salary::set);
        convert(checking, groceries, "k-c1", savings, mayaId, "").expectStatus().isBadRequest();
        convert(checking, groceries, "k-c2", checking, mayaId, "Same").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose a different account");
        convert(checking, salary.get(), "k-c3", savings, mayaId, "Income").expectStatus().isBadRequest();
        AtomicReference<String> transferRow = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$[?(@.kind=='transfer_out')].id")
                .value(java.util.List.class, ids -> transferRow.set(ids.get(0).toString()));
        convert(checking, transferRow.get(), "k-c8", savings, mayaId, "A transfer is not an expense").expectStatus()
                .isBadRequest();
        convert(checking, groceries, "k-c4", java.util.UUID.randomUUID().toString(), mayaId, "Nowhere")
                .expectStatus().isNotFound();
        convert(checking, java.util.UUID.randomUUID().toString(), "k-c5", savings, mayaId, "Ghost").expectStatus()
                .isNotFound();
        convert(savings, groceries, "k-c6", checking, mayaId, "Wrong account").expectStatus().isNotFound();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/transfer", checking, groceries)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"toAccountId\": \"%s\", \"enteredByMemberId\": \"%s\", \"reason\": \"x\"}"
                        .formatted(savings, mayaId)).exchange().expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            convert(checking, groceries, "k-c7", savings, samId, "Inactive").expectStatus().isBadRequest();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
        // None of it changed anything.
        assertBalance(checking, "3060.00");
        monthIs("spending", "2026-09", "40.00", null);
    }
}
