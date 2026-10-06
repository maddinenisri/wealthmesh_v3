package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** D-044: a second Undo of the same removal is idempotent for every Undo that exists (V2_SPLITS_004 and its kin). */
class RepeatUndoApiTests extends TransferTestBase {

    private static String checking;
    private static String savings;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00 and savings at 1000.00")
    void setUp() {
        household();
        checking = account("Repeat Checking", "5000.00");
        savings = savings("Repeat Savings", "1000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_SPLITS_004 a plain expense: Undo twice restores it once and the second Undo is a 200")
    void plainEntry() {
        String id = expense(checking, "u1", "Groceries", "50.00", "2026-09-10");
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", checking, id)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        assertBalance(checking, "5000.00");
        for (int i = 0; i < 2; i++) {
            webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/undo", checking, id)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk()
                    .expectBody().jsonPath("$.status").isEqualTo("effective").jsonPath("$.events.length()")
                    .isEqualTo(2);
            assertBalance(checking, "4950.00");
        }
    }

    @Order(2)
    @Test
    @DisplayName("V2_SPLITS_004 a transfer: Undo twice restores it once and the second Undo is a 200")
    void transferPair() {
        String movement = transfer("u2", checking, savings, "100.00", "2026-09-11");
        removeTransfer(movement, mayaId).expectStatus().isOk();
        assertBalance(checking, "4950.00");
        for (int i = 0; i < 2; i++) {
            undoTransfer(movement, mayaId).expectStatus().isOk();
            assertBalance(checking, "4850.00");
            assertBalance(savings, "1100.00");
        }
        history(checking).expectBody().jsonPath("$[?(@.movementId=='" + movement + "')].events.length()")
                .isEqualTo(2);
    }

    @Order(3)
    @Test
    @DisplayName("V2_SPLITS_004 a transfer that was never removed still refuses Undo with a 409")
    void liveTransferIsRefused() {
        String movement = transfer("u3", checking, savings, "10.00", "2026-09-12");
        undoTransfer(movement, mayaId).expectStatus().isEqualTo(409);
        assertBalance(checking, "4840.00");
    }
}
