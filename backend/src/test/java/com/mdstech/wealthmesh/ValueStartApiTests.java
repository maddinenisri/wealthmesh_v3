package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 15, group 4 (DATED_VALUE_002): a value before a property or other asset's start is a reviewed move of the
 * start, never a silent value. The old opening becomes a value on its own date; nothing is income, spending or a
 * transfer. Raw-API tests of every rule, the state matrix and the races of this one writer.
 */
class ValueStartApiTests extends ValuedTestBase {

    private static final String ACCOUNT_LOCK = "SELECT id FROM wealthmesh.account WHERE id = $1 FOR UPDATE";

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    /** Family Car began at $30,000.00 on 2026-09-01 and was valued at $28,000.00 on 2026-09-30. */
    private String car(String name) {
        String id = otherAsset(name, "30000.00", "2026-09-01");
        savedValue(id, name + "-v", "28000.00", "2026-09-30", "Updated resale estimate");
        return id;
    }

    private String earlier(String amount, String on, String reason) {
        String why = reason == null ? "" : ", \"reason\": \"" + reason + "\"";
        return """
                {"amount": "%s", "valueOn": "%s", "enteredByMemberId": "%s"%s}""".formatted(amount, on, samId, why);
    }

    @Order(1)
    @Test
    @DisplayName("V2_DATED_VALUE_002 a value dated before the start is refused as a plain value and guided to a "
            + "review that shows the August opening, the September 1 value and the September 30 value")
    void reviewShowsTheTimeline() {
        String own = car("Start Car");
        saveValue(own, "s-1", valueBody(samId, "31000.00", "2026-08-01", null, false)).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").value(m -> assertThat(String.valueOf(m))
                        .contains("before the account's start (2026-09-01)").contains("extending its history"));
        reviewExtension(own, earlier("31000.00", "2026-08-01", null)).expectStatus().isOk().expectBody()
                .jsonPath("$.timeline[0].kind").isEqualTo("opening").jsonPath("$.timeline[0].on")
                .isEqualTo("2026-08-01").jsonPath("$.timeline[0].amount").isEqualTo("31000.00")
                .jsonPath("$.timeline[1].on").isEqualTo("2026-09-01").jsonPath("$.timeline[1].amount")
                .isEqualTo("30000.00").jsonPath("$.timeline[2].on").isEqualTo("2026-09-30")
                .jsonPath("$.timeline[2].amount").isEqualTo("28000.00").jsonPath("$.balance")
                .isEqualTo("28000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_DATED_VALUE_002 cancelling after the review leaves the start and both values unchanged")
    void cancelChangesNothing() {
        String own = car("Cancel Car");
        int before = historyCount(own);
        reviewExtension(own, earlier("31000.00", "2026-08-01", null)).expectStatus().isOk();
        assertThat(historyCount(own)).isEqualTo(before);
        webTestClient.get().uri("/api/v1/accounts/{id}", own).exchange().expectBody()
                .jsonPath("$.openingAmount").isEqualTo("30000.00").jsonPath("$.openedOn").isEqualTo("2026-09-01")
                .jsonPath("$.balance.amount").isEqualTo("28000.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_DATED_VALUE_002 confirming with a reason moves the start, keeps September 1 and September 30 "
            + "as values, and creates no income, spending or transfer")
    void confirmMovesTheStart() {
        String own = car("Move Car");
        extendStart(own, "m-0", earlier("31000.00", "2026-08-01", null)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter a reason");
        extendStart(own, "m-1", earlier("31000.00", "2026-08-01", "Add an earlier car estimate")).expectStatus()
                .isOk().expectBody().jsonPath("$.openedOn").isEqualTo("2026-08-01").jsonPath("$.amount")
                .isEqualTo("31000.00").jsonPath("$.balance").isEqualTo("28000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", own).exchange().expectBody()
                .jsonPath("$.openingAmount").isEqualTo("31000.00").jsonPath("$.openedOn").isEqualTo("2026-08-01")
                .jsonPath("$.balance.amount").isEqualTo("28000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-30");
        valueHistory(own).expectBody().jsonPath("$.values.length()").isEqualTo(3)
                .jsonPath("$.values[?(@.initial==true)].amount").isEqualTo("31000.00")
                .jsonPath("$.values[?(@.valueOn=='2026-09-01')].amount").isEqualTo("30000.00")
                .jsonPath("$.values[?(@.valueOn=='2026-09-30')].amount").isEqualTo("28000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections", own).exchange().expectBody()
                .jsonPath("$[0].reason").isEqualTo("Add an earlier car estimate").jsonPath("$[0].previousAmount")
                .isEqualTo("30000.00").jsonPath("$[0].previousOn").isEqualTo("2026-09-01");
        for (String month : List.of("2026-08", "2026-09")) {
            webTestClient.get().uri("/api/v1/spending?month=" + month + "&accountId=" + own).exchange().expectBody()
                    .jsonPath("$.total").isEqualTo("0.00");
        }
        webTestClient.get().uri("/api/v1/income?month=2026-08").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("0.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_DATED_VALUE_002 the new start must be earlier than the current one, an amount must be valid and "
            + "a person must be named")
    void rules() {
        String own = car("Rules Car");
        for (String bad : List.of(earlier("31000.00", "2026-09-01", "Same day"),
                earlier("31000.00", "2026-09-15", "Later"), earlier("31000.00", "2026-10-30", "Future"))) {
            extendStart(own, "r-1", bad).expectStatus().isBadRequest();
            reviewExtension(own, bad).expectStatus().isBadRequest();
        }
        extendStart(own, "r-2", earlier("-1.00", "2026-08-01", "Negative")).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter zero or a positive asset value");
        extendStart(own, "r-3", earlier("abc", "2026-08-01", "Bad")).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter a valid amount");
        extendStart(own, "r-4", """
                {"amount": "31000.00", "valueOn": "2026-08-01", "reason": "Nobody"}""").expectStatus()
                .isBadRequest();
        extendStart(own, "", earlier("31000.00", "2026-08-01", "No key")).expectStatus().isBadRequest();
        String bank = account("Start Checking", "100.00");
        extendStart(bank, "r-5", earlier("31000.00", "2026-08-01", "Checking")).expectStatus().isBadRequest();
        webTestClient.get().uri("/api/v1/accounts/{id}", own).exchange().expectBody()
                .jsonPath("$.openedOn").isEqualTo("2026-09-01");
    }

    @Order(5)
    @Test
    @DisplayName("V2_DATED_VALUE_002 a repeat of the confirmation replays; the same key with other details is 409; "
            + "an earlier start can be moved again")
    void repeatsAndAnotherMove() {
        String own = car("Repeat Car");
        String body = earlier("31000.00", "2026-08-01", "Add an earlier car estimate");
        extendStart(own, "p-1", body).expectStatus().isOk();
        extendStart(own, "p-1", body).expectStatus().isOk().expectBody().jsonPath("$.openedOn")
                .isEqualTo("2026-08-01");
        assertThat(historyCount(own)).as("one move, one new value").isEqualTo(3);
        extendStart(own, "p-1", earlier("32000.00", "2026-08-01", "Other")).expectStatus().isEqualTo(409);
        extendStart(own, "p-2", earlier("29000.00", "2026-07-01", "Earlier still")).expectStatus().isOk();
        assertThat(historyCount(own)).isEqualTo(4);
        assertBalance(own, "28000.00");
        // The value dated before the old start now saves as a plain value.
        saveValue(own, "p-3", valueBody(samId, "30500.00", "2026-08-10", null, false)).expectStatus().isCreated();
    }

    @Order(6)
    @Test
    @DisplayName("V2_PROPERTY_005 moving the start is allowed on an archived account and refused on a closed one")
    void stateCells() {
        String archived = car("Archived Start");
        act(archived, "archive").expectStatus().isOk();
        extendStart(archived, "t-1", earlier("31000.00", "2026-08-01", "Archived")).expectStatus().isOk();
        String closed = property("Closed Start", "0.00", "2026-09-01");
        savedValue(closed, "t-c", "0.00", "2026-09-10", null);
        act(closed, "close").expectStatus().isOk();
        assertRefused(extendStart(closed, "t-2", earlier("0.00", "2026-08-01", "Closed")), "closed. Reopen it first.");
        webTestClient.get().uri("/api/v1/accounts/{id}", closed).exchange().expectBody().jsonPath("$.openedOn")
                .isEqualTo("2026-09-01");
    }

    @Order(7)
    @Test
    @DisplayName("V2_DATED_VALUE_002 the move waits for the account row lock and for an uncommitted Close, and its "
            + "person is read under a share lock")
    void races() throws Exception {
        String locked = car("Race Lock Start");
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(ACCOUNT_LOCK, locked,
                () -> extendStart(locked, "x-1", earlier("31000.00", "2026-08-01", "Held")));
        assertThat(statuses).containsExactly(200);

        String closing = property("Race Close Start", "0.00", "2026-09-01");
        savedValue(closing, "x-c", "0.00", "2026-09-10", null);
        assertThat(afterUncommitted(closing, CLOSED,
                () -> extendStart(closing, "x-2", earlier("0.00", "2026-08-01", "Closing")))).isEqualTo(409);

        String member = car("Race Member Start");
        @SuppressWarnings("unchecked")
        List<Integer> memberStatuses = afterHeld(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId,
                () -> extendStart(member, "x-3", earlier("31000.00", "2026-08-01", "Member")));
        assertThat(memberStatuses).containsExactly(400);
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();

        String same = car("Race Key Start");
        String body = earlier("31000.00", "2026-08-01", "Twice");
        @SuppressWarnings("unchecked")
        List<Integer> twice = afterHeld(ACCOUNT_LOCK, same, () -> extendStart(same, "x-4", body),
                () -> extendStart(same, "x-4", body));
        assertThat(twice).containsExactly(200, 200);
        assertThat(historyCount(same)).as("one move, one new value").isEqualTo(3);
    }

    @Order(8)
    @Test
    @DisplayName("V2_DATED_VALUE_002 a value saved on the old start date outranks the old opening after the start "
            + "moves, so the Balance and wealth do not change (a later save on one date wins)")
    void movingTheStartNeverChangesTheBalance() {
        String own = otherAsset("Tie Car", "30000.00", "2026-09-01");
        clock.setAt(java.time.LocalDate.of(2026, 10, 3), java.time.LocalTime.of(12, 0));
        savedValue(own, "tie-1", "32000.00", "2026-09-01", "Revalued on the first");
        assertBalance(own, "32000.00");
        clock.setAt(java.time.LocalDate.of(2026, 10, 3), java.time.LocalTime.of(12, 5));
        savedValue(own, "tie-2", "33000.00", "2026-09-01", "Revalued again");
        assertBalance(own, "33000.00");
        clock.setAt(java.time.LocalDate.of(2026, 10, 3), java.time.LocalTime.of(12, 10));
        extendStart(own, "tie-3", earlier("31000.00", "2026-08-01", "Earlier start")).expectStatus().isOk();
        assertBalance(own, "33000.00");
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-01").exchange().expectBody()
                .jsonPath("$.propertyAndOther.accounts[?(@.accountId=='" + own + "')].balance")
                .isEqualTo("33000.00");
        valueHistory(own).expectBody().jsonPath("$.values[?(@.amount=='33000.00')].status").isEqualTo("current");
    }
}
