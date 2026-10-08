package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 18a, groups 2 and 3: a plan statement with a pay credit and a benefit interest credit, its correction with a
 * review, and the three refusals. A credit is never income, spending, a salary, personal cash or a securities purchase.
 */
class DefinedBenefitStatementApiTests extends DefinedBenefitTestBase {

    private static String plan;
    private static String statement;

    @Order(0)
    @Test
    @DisplayName("set up the household and Harbor Cash Balance at $40,000.00 on 2026-09-01; today is 2026-10-03")
    void setUp() {
        household();
        plan = plan("Harbor Cash Balance", samId, "40000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_DB_003 the review of a statement with a $1,000.00 pay credit and $200.00 benefit interest shows "
            + "the resulting plan value $41,200.00 and writes nothing")
    void reviewStatement() {
        reviewValue(plan, statementBody(samId, "1000.00", "200.00", "2026-09-30", null)).expectStatus().isOk()
                .expectBody().jsonPath("$.amount").isEqualTo("41200.00").jsonPath("$.payCredit")
                .isEqualTo("1000.00").jsonPath("$.interestCredit").isEqualTo("200.00").jsonPath("$.earlierAmount")
                .isEqualTo("40000.00").jsonPath("$.change").isEqualTo("1200.00").jsonPath("$.balanceBefore")
                .isEqualTo("40000.00").jsonPath("$.balanceAfter").isEqualTo("41200.00")
                .jsonPath("$.netWorthBefore").isEqualTo("40000.00").jsonPath("$.netWorthAfter")
                .isEqualTo("41200.00").jsonPath("$.retirementBefore").isEqualTo("40000.00")
                .jsonPath("$.retirementAfter").isEqualTo("41200.00");
        assertThat(historyCount(plan)).isEqualTo(1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_DB_003 saving the statement makes $41,200.00 the plan value, counted once in wealth and "
            + "Retirement, and the 2026-09-01 value stays in history")
    void saveStatement() {
        AtomicReference<String> id = new AtomicReference<>();
        saveValue(plan, "s-1", statementBody(samId, "1000.00", "200.00", "2026-09-30", null)).expectStatus()
                .isCreated().expectBody().jsonPath("$.balanceAfter").isEqualTo("41200.00")
                .jsonPath("$.value.payCredit").isEqualTo("1000.00").jsonPath("$.value.interestCredit")
                .isEqualTo("200.00").jsonPath("$.value.amount").isEqualTo("41200.00").jsonPath("$.value.id")
                .value(String.class, id::set);
        statement = id.get();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("41200.00").jsonPath("$.financialAssets").isEqualTo("41200.00")
                .jsonPath("$.retirement.total").isEqualTo("41200.00").jsonPath("$.retirement.accounts.length()")
                .isEqualTo(1);
        valueHistory(plan).expectBody().jsonPath("$.values[?(@.status=='earlier')].amount").value(List.class,
                amounts -> assertThat(amounts).containsExactly("40000.00"));
        valueHistory(plan).expectBody().jsonPath("$.events[?(@.action=='saved')].detail").value(List.class,
                details -> assertThat(String.valueOf(details.getFirst())).contains("$1,000.00")
                        .contains("$200.00"));
        // Repeating the save key replays the first save.
        saveValue(plan, "s-1", statementBody(samId, "1000.00", "200.00", "2026-09-30", null)).expectStatus().isOk()
                .expectBody().jsonPath("$.value.id").isEqualTo(statement);
        assertThat(historyCount(plan)).isEqualTo(2);
    }

    @Order(3)
    @Test
    @DisplayName("V2_DB_003 the change explanation names the $1,000.00 pay credit and $200.00 benefit interest "
            + "separately and they are not income, spending, a transfer or an asset value change")
    void creditsAreNotIncome() {
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectStatus()
                .isOk().expectBody().jsonPath("$.change").isEqualTo("1200.00").jsonPath("$.payCredits")
                .isEqualTo("1000.00").jsonPath("$.benefitInterest").isEqualTo("200.00").jsonPath("$.income")
                .isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00").jsonPath("$.valueChange")
                .isEqualTo("0.00").jsonPath("$.transfers").isEqualTo("0.00").jsonPath("$.corrections")
                .isEqualTo("0.00").jsonPath("$.other").isEqualTo("0.00").jsonPath("$.creditLines[0].name")
                .isEqualTo("Harbor Cash Balance");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("0.00");
        // No bank salary, personal cash holding or securities purchase row exists for the plan.
        assertNoMoneyRecordsExceptValues(plan);
    }

    private void assertNoMoneyRecordsExceptValues(String account) {
        for (String table : new String[] { "activity", "reminder", "statement", "opening_revision" }) {
            Long count = reactor.core.publisher.Mono.from(connectionFactory.create()).flatMap(connection ->
                    reactor.core.publisher.Mono.from(connection.createStatement("SELECT COUNT(*) FROM wealthmesh."
                            + table + " WHERE account_id = $1").bind(0, java.util.UUID.fromString(account))
                            .execute()).flatMap(result -> reactor.core.publisher.Mono.from(result.map(
                                    (row, meta) -> row.get(0, Long.class))))
                    .doFinally(signal -> reactor.core.publisher.Mono.from(connection.close()).subscribe())).block();
            assertThat(count).as(table).isZero();
        }
    }

    @Order(4)
    @Test
    @DisplayName("V2_DB_003 a credit is read once in every wealth reader: as of 2026-09-15 the plan is still "
            + "$40,000.00, as of 2026-09-30 it is $41,200.00")
    void asOfCredits() {
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-15").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("40000.00").jsonPath("$.retirement.total").isEqualTo("40000.00");
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-30").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("41200.00").jsonPath("$.retirement.total").isEqualTo("41200.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_DB_004 correcting the statement to $41,100.00 with a reason: the review shows the $100.00 "
            + "reduction and the household and retirement totals; Cancel (a review alone) changes nothing")
    void reviewCorrection() {
        String body = """
                {"amount": "41100.00", "valueOn": "2026-09-30", "reason": "Corrected statement",
                 "enteredByMemberId": "%s"}""".formatted(mayaId);
        webTestClient.post().uri("/api/v1/accounts/{id}/values/{value}/correction/review", plan, statement)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).bodyValue(body).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.replacesAmount").isEqualTo("41200.00")
                .jsonPath("$.amount").isEqualTo("41100.00").jsonPath("$.balanceBefore").isEqualTo("41200.00")
                .jsonPath("$.balanceAfter").isEqualTo("41100.00").jsonPath("$.netWorthBefore")
                .isEqualTo("41200.00").jsonPath("$.netWorthAfter").isEqualTo("41100.00")
                .jsonPath("$.retirementBefore").isEqualTo("41200.00").jsonPath("$.retirementAfter")
                .isEqualTo("41100.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("41200.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_DB_004 repeating and saving the correction makes the Balance $41,100.00 and history keeps the "
            + "original and the correction with their reasons and members")
    void saveCorrection() {
        correctValue(plan, statement, "s-2", """
                {"amount": "41100.00", "valueOn": "2026-09-30", "enteredByMemberId": "%s"}""".formatted(mayaId))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter a reason");
        correctValue(plan, statement, "s-2", """
                {"amount": "41100.00", "valueOn": "2026-09-30", "reason": "Corrected statement",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated().expectBody()
                .jsonPath("$.balanceBefore").isEqualTo("41200.00").jsonPath("$.balanceAfter")
                .isEqualTo("41100.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("41100.00");
        valueHistory(plan).expectBody().jsonPath("$.values[?(@.status=='replaced')].enteredBy")
                .value(List.class, who -> assertThat(who).containsExactly("Sam"))
                .jsonPath("$.values[?(@.status=='current')].enteredBy")
                .value(List.class, who -> assertThat(who).containsExactly("Maya"))
                .jsonPath("$.values[?(@.status=='current')].reason")
                .value(List.class, why -> assertThat(why).containsExactly("Corrected statement"));
        assertThat(historyCount(plan)).isEqualTo(3);
        // The credits of the replaced statement no longer count: the explanation shows the restated value.
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectBody()
                .jsonPath("$.payCredits").isEqualTo("0.00").jsonPath("$.benefitInterest").isEqualTo("0.00")
                .jsonPath("$.valueChange").isEqualTo("1100.00").jsonPath("$.other").isEqualTo("0.00")
                .jsonPath("$.income").isEqualTo("0.00");
    }

    private void assertRefused(String body, String message) {
        reviewValue(plan, body).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .value(String.class, found -> assertThat(found).startsWith(message));
        saveValue(plan, "r-" + Math.abs(body.hashCode()), body).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").value(String.class, found -> assertThat(found).startsWith(message));
        assertThat(historyCount(plan)).isEqualTo(3);
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("41100.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_DB_005 a negative plan value is refused in the review and at save, and no Balance is saved")
    void negativeValue() {
        assertRefused(valueBody(samId, "-100.00", "2026-09-30", null, false), "Plan value must be zero or greater");
    }

    @Order(8)
    @Test
    @DisplayName("V2_DB_005 a value dated after today is refused in the review and at save, as a plan too (Q-058)")
    void futureValue() {
        assertRefused(valueBody(samId, "40000.00", "2026-10-04", null, false),
                "Future values are not completed account history");
        assertRefused(valueBody(samId, "40000.00", "2026-10-04", null, true),
                "Future values are not completed account history");
        assertRefused(statementBody(samId, "100.00", "0.00", "2026-10-04", null),
                "Future values are not completed account history");
    }

    @Order(9)
    @Test
    @DisplayName("V2_DB_005 a value dated before the tracking start is refused in the review and at save and points "
            + "to the earlier start")
    void beforeTrackingStart() {
        assertRefused(valueBody(samId, "40000.00", "2026-08-31", null, false),
                "Review the earlier tracking start before saving");
    }

    @Order(10)
    @Test
    @DisplayName("V2_DB_005 credits must be zero or greater, a statement needs a credit, and a plan value and credits "
            + "cannot be sent together")
    void creditRules() {
        assertRefused(statementBody(samId, "-1.00", "0.00", "2026-09-30", null),
                "Pay credit must be zero or greater");
        assertRefused(statementBody(samId, "1.00", "-0.50", "2026-09-30", null),
                "Benefit interest must be zero or greater");
        assertRefused(statementBody(samId, null, null, "2026-09-30", null), "Enter a plan value or a credit");
        assertRefused(valueBody(samId, "40000.00", "2026-09-30", null, false)
                .replace("{", "{\"payCredit\": \"1.00\", "), "Enter a plan value or credits, not both");
    }

    @Order(11)
    @Test
    @DisplayName("V2_DB_003 credits belong to a defined benefit only: a property refuses a statement with credits")
    void creditsOnlyOnPlans() {
        String home = property("Family Home", "300000.00", "2026-09-01");
        reviewValue(home, statementBody(samId, "1.00", "1.00", "2026-09-30", null)).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Credits apply to a defined benefit only");
    }

    @Order(12)
    @Test
    @DisplayName("V2_DB_003 V2_DB_004 a statement with credits and a correction each wait for the account row lock, "
            + "then save, so two writers on one plan take turns")
    void statementAndCorrectionTakeTheAccountLock() throws Exception {
        String own = plan("Race Plan", samId, "1000.00", "2026-09-01");
        String correct = savedValue(own, "q-1", "2000.00", "2026-09-10", null);
        waitsForAccountLock(own, () -> saveValue(own, "q-new", statementBody(samId, "10.00", "5.00", "2026-09-20",
                null)));
        waitsForAccountLock(own, () -> correctValue(own, correct, "q-cor", """
                {"amount": "2100.00", "valueOn": "2026-09-10", "reason": "Fix",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)));
    }

    private void waitsForAccountLock(String account, java.util.function.Supplier<
            org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec> write) throws Exception {
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.account SET updated_at = updated_at WHERE id = $1", account);
        try {
            java.util.concurrent.CompletableFuture<Integer> status = async(() -> statusOf(write.get()));
            Thread.sleep(600);
            assertThat(status).as("the writer waits for the account row").isNotDone();
            commit(other);
            assertThat(status.get(10, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            close(other);
        }
    }

    @Order(13)
    @Test
    @DisplayName("V2_DB_004 a correction restates the plan value: credits on a correction are refused in the review "
            + "and at save")
    void correctionCarriesNoCredits() {
        String own = plan("Correction Plan", samId, "1000.00", "2026-09-01");
        String first = savedValue(own, "c-1", "1500.00", "2026-09-10", null);
        String body = """
                {"payCredit": "5.00", "interestCredit": "5.00", "valueOn": "2026-09-10", "reason": "Fix",
                 "enteredByMemberId": "%s"}""".formatted(mayaId);
        webTestClient.post().uri("/api/v1/accounts/{id}/values/{value}/correction/review", own, first)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).bodyValue(body).exchange()
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("A correction restates the plan value. Enter the corrected value");
        correctValue(own, first, "c-2", body).expectStatus().isBadRequest();
        assertThat(historyCount(own)).isEqualTo(2);
    }

    @Order(14)
    @Test
    @DisplayName("V2_DB_003 credits are refused on a property at save as well as in the review")
    void creditsOnPropertyRefusedAtSave() {
        String home = property("Credit Home", "300000.00", "2026-09-01");
        saveValue(home, "h-1", statementBody(samId, "1.00", "1.00", "2026-09-30", null)).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Credits apply to a defined benefit only");
        assertThat(historyCount(home)).isEqualTo(1);
    }

    @Order(15)
    @Test
    @DisplayName("V2_DB_003 a removed statement's credits no longer count in the change explanation, and Undo brings "
            + "them back")
    void removedCreditsDoNotCount() {
        String own = plan("Removal Plan", samId, "1000.00", "2026-09-01");
        Change none = change();
        String saved = savedStatement(own, "r-1", "50.00", "25.00", "2026-09-12");
        Change counted = change();
        assertThat(counted.pay() - none.pay()).isEqualTo(50.0);
        assertThat(counted.interest() - none.interest()).isEqualTo(25.0);
        valueAction(own, saved, "removal", mayaId).expectStatus().isOk();
        Change removed = change();
        assertThat(removed.pay()).isEqualTo(none.pay());
        assertThat(removed.interest()).isEqualTo(none.interest());
        valueAction(own, saved, "undo", mayaId).expectStatus().isOk();
        assertThat(change().pay()).isEqualTo(counted.pay());
    }

    @Order(16)
    @Test
    @DisplayName("V2_DB_003 two statements on one date build on each other: the later save outranks the earlier and "
            + "both credits count once")
    void twoStatementsOnOneDate() {
        String own = plan("Tie Plan", samId, "1000.00", "2026-09-01");
        clock.setAt(java.time.LocalDate.of(2026, 10, 3), java.time.LocalTime.of(9, 0));
        savedStatement(own, "t-1", "10.00", "0.00", "2026-09-20");
        clock.setAt(java.time.LocalDate.of(2026, 10, 3), java.time.LocalTime.of(10, 0));
        saveValue(own, "t-2", statementBody(samId, "5.00", "2.00", "2026-09-20", null)).expectStatus().isCreated()
                .expectBody().jsonPath("$.balanceAfter").isEqualTo("1017.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", own).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("1017.00");
    }

    @Order(17)
    @Test
    @DisplayName("V2_DB_003 a retry of a saved statement with the same key replays it; with changed credits it is "
            + "refused")
    void retryWithChangedCredits() {
        String own = plan("Retry Plan", samId, "1000.00", "2026-09-01");
        savedStatement(own, "y-1", "10.00", "5.00", "2026-09-20");
        saveValue(own, "y-1", statementBody(samId, "10.00", "5.00", "2026-09-20", null)).expectStatus().isOk();
        saveValue(own, "y-1", statementBody(samId, "11.00", "5.00", "2026-09-20", null)).expectStatus()
                .isEqualTo(409);
        webTestClient.get().uri("/api/v1/accounts/{id}", own).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("1015.00");
    }

    private String savedStatement(String account, String key, String pay, String interest, String on) {
        AtomicReference<String> id = new AtomicReference<>();
        saveValue(account, key, statementBody(samId, pay, interest, on, null)).expectStatus().isCreated()
                .expectBody().jsonPath("$.value.id").value(String.class, id::set);
        return id.get();
    }

    private record Change(double pay, double interest) {
    }

    @SuppressWarnings("unchecked")
    private Change change() {
        java.util.Map<String, Object> body = webTestClient.get()
                .uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectStatus().isOk()
                .expectBody(java.util.Map.class).returnResult().getResponseBody();
        return new Change(Double.parseDouble(String.valueOf(body.get("payCredits"))),
                Double.parseDouble(String.valueOf(body.get("benefitInterest"))));
    }
}
