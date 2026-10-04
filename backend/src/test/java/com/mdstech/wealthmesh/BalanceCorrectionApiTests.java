package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Dated Balance correction with review, reason and history (slice 03, group A: 009 and MEMBERS_003). */
class BalanceCorrectionApiTests extends LedgerApiTestBase {

    private static String accountId;
    private static String correctionId;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00 on 2026-09-01 with one 100.00 grocery expense on 2026-09-10")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "5000.00");
        saveExpense(accountId, "k-groceries", "100.00", "2026-09-10", "Groceries");
        assertBalance(accountId, "4900.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CHECKING_009 preview shows 4900.00 now, requested 5000.00, a 100.00 increase; saves nothing")
    void preview() {
        preview("5000.00", "2026-09-30").expectStatus().isOk().expectBody()
                .jsonPath("$.balanceOnDate").isEqualTo("4900.00")
                .jsonPath("$.requested").isEqualTo("5000.00")
                .jsonPath("$.difference").isEqualTo("100.00")
                .jsonPath("$.currentBalanceAfter").isEqualTo("5000.00")
                .jsonPath("$.overdraft").isEqualTo(false);
        assertBalance(accountId, "4900.00");
        assertActivityCount(accountId, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_CHECKING_009 a correction needs a reason; same Balance, future date and a stranger are refused")
    void validation() {
        correct("k-noreason", "5000.00", "2026-09-30", "", mayaId).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter a reason");
        correct("k-same", "4900.00", "2026-09-30", "Same", mayaId).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("The Balance already matches this amount");
        correct("k-future", "5000.00", "2026-10-04", "Future", mayaId).expectStatus().isBadRequest();
        correct("k-early", "5000.00", "2026-08-31", "Early", mayaId).expectStatus().isBadRequest();
        correct("k-ghost", "5000.00", "2026-09-30", "Ghost", "00000000-0000-0000-0000-000000000000")
                .expectStatus().isBadRequest();
        correct("k-bad", "abc", "2026-09-30", "Bad", mayaId).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        assertBalance(accountId, "4900.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_CHECKING_009 confirm: one Balance everywhere, income 0.00 and spending 100.00, repeat saves once")
    void confirm() {
        AtomicReference<String> id = new AtomicReference<>();
        correct("k-fix", "5000.00", "2026-09-30", "Correct tracking to reviewed amount", mayaId)
                .expectStatus().isCreated().expectBody()
                .jsonPath("$.kind").isEqualTo("correction")
                .jsonPath("$.amount").isEqualTo("100.00")
                .jsonPath("$.id").value(String.class, id::set);
        correctionId = id.get();
        correct("k-fix", "5000.00", "2026-09-30", "Correct tracking to reviewed amount", mayaId)
                .expectStatus().isOk();
        correct("k-fix", "5100.00", "2026-09-30", "Correct tracking to reviewed amount", mayaId)
                .expectStatus().isEqualTo(409);

        assertBalance(accountId, "5000.00");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$[?(@.id=='" + accountId + "')].balance.amount").isEqualTo("5000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("5000.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.income").isEqualTo("0.00")
                .jsonPath("$.spending").isEqualTo("100.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("-100.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-09-30", accountId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.amount").isEqualTo("5000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$[?(@.kind=='correction')].reason")
                .isEqualTo("Correct tracking to reviewed amount");
    }

    @Order(4)
    @Test
    @DisplayName("V2_CHECKING_009 V2_MEMBERS_003 history keeps expense and correction with who, time and reason")
    void history() {
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.id=='" + correctionId + "')].kind").isEqualTo("correction")
                .jsonPath("$[?(@.id=='" + correctionId + "')].amount").isEqualTo("100.00")
                .jsonPath("$[?(@.id=='" + correctionId + "')].reason")
                .isEqualTo("Correct tracking to reviewed amount")
                .jsonPath("$[?(@.id=='" + correctionId + "')].enteredByName").isEqualTo("Maya")
                .jsonPath("$[?(@.id=='" + correctionId + "')].createdAt").isNotEmpty()
                .jsonPath("$[?(@.id=='" + correctionId + "')].occurredOn").isEqualTo("2026-09-30");
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.openingAmount").isEqualTo("5000.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_MEMBERS_003 Sam enters a correction: the selected name is stored, not a sign-in")
    void samCorrection() {
        String other = account("Second Checking", "5000.00");
        correct(other, "k-sam", "4950.00", "2026-09-01", "Opening amount copied incorrectly", samId)
                .expectStatus().isCreated();
        assertBalance(other, "4950.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", other).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$[0].amount").isEqualTo("-50.00")
                .jsonPath("$[0].enteredByName").isEqualTo("Sam")
                .jsonPath("$[0].reason").isEqualTo("Opening amount copied incorrectly");
    }

    @Order(6)
    @Test
    @DisplayName("D-024 a retried correction save still replays after later activity is added before its date")
    void retryAfterLaterActivity() {
        String retry = account("Retry Checking", "5000.00");
        saveExpense(retry, "k-r-exp", "100.00", "2026-09-10", "Groceries");
        correct(retry, "k-retry", "5000.00", "2026-09-30", "Retry review", mayaId).expectStatus().isCreated();
        saveExpense(retry, "k-r-exp2", "50.00", "2026-09-15", "Dining");
        correct(retry, "k-retry", "5000.00", "2026-09-30", "Retry review", mayaId).expectStatus().isOk();
        correct(retry, "k-retry", "5100.00", "2026-09-30", "Retry review", mayaId).expectStatus().isEqualTo(409);
    }

    @Order(7)
    @Test
    @DisplayName("two members correcting the same date at once apply it once")
    void concurrentCorrections() {
        String race = account("Race Checking", "5000.00");
        saveExpense(race, "k-c-exp", "100.00", "2026-09-10", "Groceries");
        java.util.List<Integer> statuses = java.util.stream.IntStream.range(0, 6).parallel()
                .mapToObj(i -> correct(race, "k-race-" + i, "5000.00", "2026-09-30", "Race " + i,
                        i % 2 == 0 ? mayaId : samId).returnResult(String.class).getStatus().value())
                .toList();
        org.assertj.core.api.Assertions.assertThat(statuses.stream().filter(s -> s == 201)).hasSize(1);
        assertBalance(race, "5000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-09-30", race).exchange().expectBody()
                .jsonPath("$.amount").isEqualTo("5000.00");
    }

    private WebTestClient.ResponseSpec preview(String requested, String asOn) {
        return webTestClient.get().uri(
                "/api/v1/accounts/{id}/balance-corrections/preview?requested={r}&asOn={d}", accountId, requested, asOn)
                .exchange();
    }

    private WebTestClient.ResponseSpec correct(String key, String requested, String asOn, String reason,
            String memberId) {
        return correct(accountId, key, requested, asOn, reason, memberId);
    }

    private WebTestClient.ResponseSpec correct(String account, String key, String requested, String asOn,
            String reason, String memberId) {
        return post(account, "balance-corrections", key, """
                {"requestedBalance": "%s", "asOn": "%s", "reason": "%s", "enteredByMemberId": "%s"}"""
                .formatted(requested, asOn, reason, memberId));
    }
}
