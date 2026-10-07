package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Edit a correction (013, group B) and replace one with the actual fee (014, group C). */
class CorrectCorrectionApiTests extends LedgerApiTestBase {

    private static String accountId;
    private static String correctionId;
    private static String feeAccountId;
    private static String feeCorrectionId;

    @Order(0)
    @Test
    @DisplayName("set up checking 5000.00 with a 100.00 expense on 09-10 and a 100.00 correction on 09-30")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "5000.00");
        saveExpense(accountId, "k-groceries", "100.00", "2026-09-10", "Groceries");
        AtomicReference<String> id = new AtomicReference<>();
        correct(accountId, "k-first", "5000.00", "2026-09-30", "First review", null).expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        correctionId = id.get();
        assertBalance(accountId, "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CHECKING_013 preview of the edit leaves the original out: original 5000.00, corrected 4900.00")
    void previewEdit() {
        webTestClient.get().uri("/api/v1/accounts/{id}/balance-corrections/preview?requested=4900.00&asOn=2026-09-30"
                + "&replaces={r}", accountId, correctionId).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.balanceOnDate").isEqualTo("4900.00")
                .jsonPath("$.difference").isEqualTo("0.00")
                .jsonPath("$.currentBalance").isEqualTo("5000.00")
                .jsonPath("$.currentBalanceAfter").isEqualTo("4900.00");
        assertBalance(accountId, "5000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_CHECKING_013 confirm: Balance 4900.00, both versions in history, expense once, spending 100.00")
    void confirmEdit() {
        AtomicReference<String> newId = new AtomicReference<>();
        correct(accountId, "k-edit", "4900.00", "2026-09-30", "Original reviewed amount was mistyped", correctionId)
                .expectStatus().isCreated().expectBody().jsonPath("$.amount").isEqualTo("0.00")
                .jsonPath("$.id").value(String.class, newId::set);
        correct(accountId, "k-edit", "4900.00", "2026-09-30", "Original reviewed amount was mistyped", correctionId)
                .expectStatus().isOk();
        correct(accountId, "k-again", "4800.00", "2026-09-30", "Stale edit", correctionId)
                .expectStatus().isEqualTo(409);

        assertBalance(accountId, "4900.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.spending").isEqualTo("100.00");
        assertActivityCount(accountId, 2);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(3)
                .jsonPath("$[?(@.id=='" + correctionId + "')].status").isEqualTo("replaced")
                .jsonPath("$[?(@.id=='" + correctionId + "')].amount").isEqualTo("100.00")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].status").isEqualTo("effective")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].replacesId").isEqualTo(correctionId)
                .jsonPath("$[?(@.id=='" + newId.get() + "')].enteredByName").isEqualTo("Maya")
                .jsonPath("$[?(@.id=='" + newId.get() + "')].reason")
                .isEqualTo("Original reviewed amount was mistyped");
    }

    @Order(3)
    @Test
    @DisplayName("set up checking 6000.00 and a -40.00 correction on 2026-09-30 (Balance 5960.00)")
    void feeSetUp() {
        feeAccountId = account("Fee Checking", "6000.00");
        AtomicReference<String> id = new AtomicReference<>();
        correct(feeAccountId, "k-low", "5960.00", "2026-09-30", "Reviewed account amount is lower", null)
                .expectStatus().isCreated().expectBody().jsonPath("$.amount").isEqualTo("-40.00")
                .jsonPath("$.id").value(String.class, id::set);
        feeCorrectionId = id.get();
        assertBalance(feeAccountId, "5960.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_CHECKING_014 the fee must match the correction: same date and a 40.00 amount, else refused")
    void feeMustMatch() {
        replaceWithFee("k-fee-amount", "45.00", "2026-09-30").expectStatus().isBadRequest();
        replaceWithFee("k-fee-date", "40.00", "2026-09-29").expectStatus().isBadRequest();
        assertBalance(feeAccountId, "5960.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_CHECKING_014 replace the correction with the Bank fees expense: Balance 5960.00, spending 40.00")
    void replaceWithFee() {
        AtomicReference<String> feeId = new AtomicReference<>();
        replaceWithFee("k-fee", "40.00", "2026-09-30").expectStatus().isCreated().expectBody()
                .jsonPath("$.kind").isEqualTo("expense").jsonPath("$.categoryName").isEqualTo("Bank fees")
                .jsonPath("$.id").value(String.class, feeId::set);
        replaceWithFee("k-fee", "40.00", "2026-09-30").expectStatus().isOk();

        assertBalance(feeAccountId, "5960.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.spending").isEqualTo("140.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", feeAccountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.id=='" + feeCorrectionId + "')].status").isEqualTo("replaced")
                .jsonPath("$[?(@.id=='" + feeCorrectionId + "')].replacedById").isEqualTo(feeId.get())
                .jsonPath("$[?(@.id=='" + feeId.get() + "')].status").isEqualTo("effective");
        assertActivityCount(feeAccountId, 1);
    }

    @Order(6)
    @Test
    @DisplayName("a replaced correction can be neither removed nor restored (a current one can, owner 2026-10-07), "
            + "nor replaced again, and another account's correction is not found")
    void guards() {
        // The first correction was replaced by an edit: it can be neither removed nor restored.
        for (String action : new String[] { "removal", "undo" }) {
            webTestClient.post().uri("/api/v1/accounts/{id}/activity/{entry}/" + action, accountId, correctionId)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange()
                    .expectStatus().isEqualTo(409);
        }
        replaceWithFee("k-fee-again", "40.00", "2026-09-30").expectStatus().isEqualTo(409);
        correct(accountId, "k-foreign", "4000.00", "2026-09-30", "Wrong account", feeCorrectionId)
                .expectStatus().isNotFound();
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-09-01", accountId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.amount").isEqualTo("5000.00");
    }

    private WebTestClient.ResponseSpec replaceWithFee(String key, String amount, String date) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/activity/{entry}/replacement", feeAccountId,
                feeCorrectionId).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key).bodyValue("""
                {"description": "Bank fee", "amount": "%s", "occurredOn": "%s", "category": "Bank fees",
                 "enteredByMemberId": "%s", "reason": "Found the actual bank fee"}""".formatted(amount, date, mayaId))
                .exchange();
    }

    private WebTestClient.ResponseSpec correct(String account, String key, String requested, String asOn,
            String reason, String replaces) {
        return post(account, "balance-corrections", key, """
                {"requestedBalance": "%s", "asOn": "%s", "reason": "%s", "enteredByMemberId": "%s"%s}"""
                .formatted(requested, asOn, reason, mayaId,
                        replaces == null ? "" : ", \"replacesId\": \"" + replaces + "\""));
    }
}
