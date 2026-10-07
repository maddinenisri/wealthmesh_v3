package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 16b, group 5: a future-dated value on a loan or a mortgage is saved only as a plan (DATED_VALUE_001). A plan
 * lives in `account_value` like a property's (D-051), stored with the debt's sign (negative is owed), never counted by
 * a reader, listed with the debt, removable, and blocking Close with slice 15's message. Everything else about a
 * debt's amount owed changes by payments and reviewed corrections (D-053).
 */
class DebtPlanApiTests extends DebtTestBase {

    private static String home;
    private static String car;
    private static String carLoan;
    private static String homeMortgage;
    private static final String FUTURE_GUIDE = "Future values are not completed account history";

    @Order(0)
    @Test
    @DisplayName("set up: Family Home, Family Car, Car Loan and Home Mortgage; today is 2026-10-03")
    void setUp() {
        household();
        home = property("Family Home", "300000.00", "2026-09-01");
        car = otherAsset("Family Car", "30000.00", "2026-09-01");
        carLoan = loan("Car Loan", "20000.00", "2026-09-01");
        homeMortgage = mortgage("Home Mortgage", "200000.00", "2026-09-01");
    }

    private String snapshot(String account) {
        StringBuilder all = new StringBuilder();
        for (String uri : List.of("/api/v1/accounts/" + account, "/api/v1/accounts/" + account + "/activity",
                "/api/v1/accounts/" + account + "/activity/history", "/api/v1/wealth",
                "/api/v1/wealth?asOf=2026-09-15", "/api/v1/wealth/change?from=2026-09-01&to=2026-10-03")) {
            all.append(uri).append(' ').append(new String(webTestClient.get().uri(uri).exchange().expectBody()
                    .returnResult().getResponseBody(), java.nio.charset.StandardCharsets.UTF_8)
                    .replaceAll("\"(timestamp|requestId)\":\"[^\"]*\",?", "")).append('\n');
        }
        return all.toString();
    }

    @Order(1)
    @Test
    @DisplayName("V2_DATED_VALUE_001 for Family Home, Family Car, Car Loan and Home Mortgage a value dated December 31 "
            + "is refused with guidance, saves as a plan, and leaves the Balance, today's wealth and the history alone")
    void futureValueIsAPlanOnAllFourRows() {
        String[][] rows = {{"Family Home", home, "300000.00", "330000.00"}, {"Family Car", car, "30000.00", "28000.00"},
            {"Car Loan", carLoan, "-20000.00", "15000.00"}, {"Home Mortgage", homeMortgage, "-200000.00", "150000.00"}};
        for (String[] row : rows) {
            String account = row[1];
            String before = snapshot(account);
            saveValue(account, "f-" + account, valueBody(mayaId, row[3], "2026-12-31", null, false)).expectStatus()
                    .isBadRequest().expectBody().jsonPath("$.message").value(m -> assertThat(String.valueOf(m))
                            .contains(FUTURE_GUIDE).contains("future plan").contains("on or before today"));
            reviewValue(account, valueBody(mayaId, row[3], "2026-12-31", null, false)).expectStatus().isBadRequest();
            assertThat(snapshot(account)).as(row[0] + " after the refusals").isEqualTo(before);
            // The plan: the review says nothing changes, the save lists it, and no reader counts it.
            reviewValue(account, valueBody(mayaId, row[3], "2026-12-31", "Plan", true)).expectStatus().isOk()
                    .expectBody().jsonPath("$.plan").isEqualTo(true);
            assertThat(snapshot(account)).as(row[0] + " after the review").isEqualTo(before);
            AtomicReference<String> plan = new AtomicReference<>();
            saveValue(account, "p-" + account, valueBody(mayaId, row[3], "2026-12-31", "Plan", true)).expectStatus()
                    .isCreated().expectBody().jsonPath("$.value.status").isEqualTo("planned")
                    .jsonPath("$.value.id").value(String.class, plan::set);
            assertBalance(account, row[2]);
            valueHistory(account).expectStatus().isOk().expectBody()
                    .jsonPath("$.values[?(@.status=='planned')].length()").value(List.class, l -> assertThat(l)
                            .isNotEmpty());
            // The account's own page, activity and history, and wealth now and on a past date are unchanged.
            assertThat(snapshot(account)).as(row[0] + " after the plan").isEqualTo(before);
            valueAction(account, plan.get(), "removal", mayaId).expectStatus().isOk();
            assertThat(snapshot(account)).as(row[0] + " after removing the plan").isEqualTo(before);
        }
    }

    @Order(2)
    @Test
    @DisplayName("V2_DATED_VALUE_001 a debt's plan is saved as an amount owed with the debt's sign, listed without an "
            + "invented initial value, removable, and brought back by Undo (a repeat of Undo changes nothing)")
    void planOnADebtIsListedAndRemovable() {
        int rows = historyCount(carLoan);
        AtomicReference<String> plan = new AtomicReference<>();
        saveValue(carLoan, "q-1", valueBody(mayaId, "15000.00", "2026-12-31", "Refinance", true)).expectStatus()
                .isCreated().expectBody().jsonPath("$.value.amount").isEqualTo("-15000.00")
                .jsonPath("$.value.status").isEqualTo("planned").jsonPath("$.value.reason").isEqualTo("Refinance")
                .jsonPath("$.value.id").value(String.class, plan::set);
        assertThat(historyCount(carLoan)).isEqualTo(rows + 1);
        valueHistory(carLoan).expectStatus().isOk().expectBody().jsonPath("$.values[?(@.initial==true)]").isEmpty()
                .jsonPath("$.values[?(@.id=='" + plan.get() + "')].amount").isEqualTo("-15000.00");
        // A repeat of the same save replays; the same key with other figures is refused.
        saveValue(carLoan, "q-1", valueBody(mayaId, "15000.00", "2026-12-31", "Refinance", true)).expectStatus()
                .isOk();
        saveValue(carLoan, "q-1", valueBody(mayaId, "14000.00", "2026-12-31", "Refinance", true)).expectStatus()
                .isEqualTo(409);
        assertThat(historyCount(carLoan)).isEqualTo(rows + 1);
        valueAction(carLoan, plan.get(), "removal", mayaId).expectStatus().isOk();
        valueAction(carLoan, plan.get(), "removal", mayaId).expectStatus().isEqualTo(409);
        valueAction(carLoan, plan.get(), "undo", mayaId).expectStatus().isOk();
        valueAction(carLoan, plan.get(), "undo", mayaId).expectStatus().isOk();
        valueHistory(carLoan).expectBody().jsonPath("$.values[?(@.id=='" + plan.get() + "')].status")
                .isEqualTo("planned");
        assertBalance(carLoan, "-20000.00");
        // A plan is dated after today and is never corrected in place.
        saveValue(carLoan, "q-2", valueBody(mayaId, "1.00", "2026-10-03", null, true)).expectStatus().isBadRequest();
        correctValue(carLoan, plan.get(), "q-3", valueBody(mayaId, "1.00", "2026-12-31", "x", false)).expectStatus()
                .isEqualTo(409);
    }

    @Order(3)
    @Test
    @DisplayName("V2_DATED_VALUE_001 a debt takes no recorded value and no moved start, whatever the date: it "
            + "changes by payments and reviewed corrections; a negative or invalid plan is refused")
    void aDebtTakesPlansOnly() {
        for (String debt : List.of(carLoan, homeMortgage)) {
            saveValue(debt, "r-1", valueBody(mayaId, "1.00", "2026-09-08", null, false)).expectStatus().isBadRequest()
                    .expectBody().jsonPath("$.message").value(m -> assertThat(String.valueOf(m))
                            .contains("Update balance owed"));
            reviewValue(debt, valueBody(mayaId, "1.00", "2026-09-08", null, false)).expectStatus().isBadRequest();
            extendStart(debt, "r-2", """
                    {"amount": "9.00", "valueOn": "2026-08-01", "reason": "Earlier", "enteredByMemberId": "%s"}"""
                    .formatted(mayaId)).expectStatus().isBadRequest();
            saveValue(debt, "r-3", valueBody(mayaId, "-5.00", "2026-12-31", null, true)).expectStatus()
                    .isBadRequest().expectBody().jsonPath("$.message")
                    .isEqualTo("Enter zero or a positive amount owed");
            saveValue(debt, "r-4", valueBody(mayaId, "abc", "2026-12-31", null, true)).expectStatus().isBadRequest()
                    .expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        }
        assertBalance(carLoan, "-20000.00");
        assertBalance(homeMortgage, "-200000.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_PROPERTY_005 Close on a debt with a plan is refused with slice 15's message until the plan is "
            + "removed; the review of Close says so first; archive is not blocked")
    void closeNeedsNoPlan() {
        String own = loan("Paid Off", null, "2026-09-01");
        String plan = planOf(own);
        assertRefused(act(own, "close"), "has 1 planned value. Remove it first, then close.");
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", own).exchange().expectBody()
                .jsonPath("$.closeBlockedBy[0]").value(m -> assertThat(String.valueOf(m))
                        .contains("1 planned value").contains("Remove it first"));
        act(own, "archive").expectStatus().isOk();
        act(own, "restore").expectStatus().isOk();
        valueAction(own, plan, "removal", mayaId).expectStatus().isOk();
        act(own, "close").expectStatus().isOk();
        // A closed or archived debt takes no new plan.
        saveValue(own, "s-1", valueBody(mayaId, "1.00", "2026-12-31", null, true)).expectStatus().is4xxClientError();
        String archived = mortgage("Archived Mortgage", null, "2026-09-01");
        act(archived, "archive").expectStatus().isOk();
        saveValue(archived, "s-2", valueBody(mayaId, "1.00", "2026-12-31", null, true)).expectStatus()
                .is4xxClientError();
    }

    private String planOf(String account) {
        AtomicReference<String> id = new AtomicReference<>();
        saveValue(account, "plan-" + account, valueBody(mayaId, "1.00", "2026-12-31", null, true)).expectStatus()
                .isCreated().expectBody().jsonPath("$.value.id").value(String.class, id::set);
        return id.get();
    }

    @Order(5)
    @Test
    @DisplayName("V2_PROPERTY_005 a plan and a Close of a paid-off debt at once: exactly one is saved (the plan "
            + "writers take the account lock)")
    void planAndCloseRace() throws Exception {
        String own = mortgage("Race Mortgage", null, "2026-09-01");
        List<Integer> statuses = both(own, () -> saveValue(own, "race-plan",
                valueBody(mayaId, "1.00", "2026-12-31", null, true)), () -> act(own, "close"));
        assertThat(statuses.stream().filter(status -> status >= 200 && status < 300).count()).isEqualTo(1);
    }

    @Order(6)
    @Test
    @DisplayName("V2_PROPERTY_005 Delete is refused while a debt has a plan, removed ones counting; Close on a debt "
            + "that still owes is refused for the amount first")
    void deleteAndCloseOrder() {
        String own = loan("Delete Loan", null, "2026-09-01");
        String plan = planOf(own);
        assertRefused(act(own, "delete"), "dated value");
        valueAction(own, plan, "removal", mayaId).expectStatus().isOk();
        assertRefused(act(own, "delete"), "dated value");
        String owing = loan("Owing Loan", "100.00", "2026-09-01");
        planOf(owing);
        assertRefused(act(owing, "close"), "needs a zero Balance owed");
    }

    @Order(7)
    @Test
    @DisplayName("V2_DATED_VALUE_001 a savings or card account takes no plan or value, like checking")
    void otherTypesRefused() {
        String saver = savings("Plan Savings", "10.00", "2026-09-01");
        String cardId = card("Plan Card", "10.00", "owed", "2026-09-01");
        for (String other : List.of(saver, cardId)) {
            saveValue(other, "o-" + other, valueBody(mayaId, "1.00", "2026-12-31", null, true)).expectStatus()
                    .isBadRequest();
            valueHistory(other).expectStatus().isBadRequest();
        }
    }
}
