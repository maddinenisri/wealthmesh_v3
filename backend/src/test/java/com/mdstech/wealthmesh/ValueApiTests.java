package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 15, groups 2 and 3: record, correct, review, cancel, remove and Undo a dated value of a property or other
 * asset, and the future-date rule with its plan. Every rule has a raw-API test; the state matrix and the races are in
 * `ValueStateApiTests` and `ValueRaceApiTests`.
 */
class ValueApiTests extends ValuedTestBase {

    private static String home;
    private static String car;

    @Order(0)
    @Test
    @DisplayName("set up the household, Family Home at 300000.00 and Family Car at 30000.00, both from 2026-09-01; "
            + "today is 2026-10-03")
    void setUp() {
        household();
        home = property("Family Home", "300000.00", "2026-09-01");
        car = otherAsset("Family Car", "30000.00", "2026-09-01");
    }

    @SuppressWarnings("unchecked")
    private List<Object> field(String account, String status, String field) {
        AtomicReference<List<Object>> found = new AtomicReference<>();
        valueHistory(account).expectStatus().isOk().expectBody()
                .jsonPath("$.values[?(@.status=='" + status + "')]." + field).value(List.class, found::set);
        return found.get();
    }

    @Order(1)
    @Test
    @DisplayName("V2_PROPERTY_003 a new estimate dated 2026-09-30 becomes the Balance, the setup value stays in "
            + "history, and it is an asset value change, never income or spending")
    void newEstimate() {
        saveValue(home, "p-1", valueBody(mayaId, "320000.00", "2026-09-30", "September estimate", false))
                .expectStatus().isCreated().expectBody().jsonPath("$.balanceBefore").isEqualTo("300000.00")
                .jsonPath("$.balanceAfter").isEqualTo("320000.00").jsonPath("$.balanceAfterOn")
                .isEqualTo("2026-09-30").jsonPath("$.value.status").isEqualTo("current")
                .jsonPath("$.value.reason").isEqualTo("September estimate");
        webTestClient.get().uri("/api/v1/accounts/{id}", home).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("320000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-30").jsonPath("$.openingAmount").isEqualTo("300000.00");
        assertThat(field(home, "earlier", "amount")).containsExactly("300000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("350000.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("0.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_PROPERTY_003 correcting the estimate keeps the setup value and both estimates in history and the "
            + "corrected one effective; a correction needs a reason")
    void correctEstimate() {
        String estimate = (String) field(home, "current", "id").getFirst();
        correctValue(home, estimate, "p-2", valueBody(mayaId, "315000.00", "2026-09-30", null, false))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter a reason");
        correctValue(home, estimate, "p-2", """
                {"amount": "315000.00", "reason": "Copied the wrong estimate", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isCreated().expectBody().jsonPath("$.balanceBefore")
                .isEqualTo("320000.00").jsonPath("$.balanceAfter").isEqualTo("315000.00")
                .jsonPath("$.value.replacesId").isEqualTo(estimate).jsonPath("$.value.valueOn")
                .isEqualTo("2026-09-30");
        webTestClient.get().uri("/api/v1/accounts/{id}", home).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("315000.00");
        assertThat(field(home, "replaced", "amount")).containsExactly("320000.00");
        assertThat(field(home, "current", "amount")).containsExactly("315000.00");
        assertThat(field(home, "earlier", "amount")).containsExactly("300000.00");
        assertThat(historyCount(home)).isEqualTo(3);
        // The replaced value cannot be corrected or removed again, and a second correction is refused.
        correctValue(home, estimate, "p-3", """
                {"amount": "1.00", "reason": "Again", "enteredByMemberId": "%s"}""".formatted(mayaId))
                .expectStatus().isEqualTo(409);
        valueAction(home, estimate, "removal", mayaId).expectStatus().isEqualTo(409);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("345000.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_OTHER_ASSET_003 a lower estimate by Sam keeps the earlier estimate, reason and member in history "
            + "and the review names the $2,000.00 decrease")
    void lowerEstimate() {
        String body = valueBody(samId, "28000.00", "2026-09-30", "Updated resale estimate", false);
        reviewValue(car, body).expectStatus().isOk().expectBody().jsonPath("$.earlierAmount")
                .isEqualTo("30000.00").jsonPath("$.change").isEqualTo("-2000.00").jsonPath("$.balanceBefore")
                .isEqualTo("30000.00").jsonPath("$.balanceAfter").isEqualTo("28000.00").jsonPath("$.balanceAfterOn")
                .isEqualTo("2026-09-30");
        saveValue(car, "c-1", body).expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/accounts/{id}", car).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("28000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-30");
        assertThat(field(car, "earlier", "amount")).containsExactly("30000.00");
        assertThat(field(car, "current", "enteredBy")).containsExactly("Sam");
        assertThat(field(car, "current", "reason")).containsExactly("Updated resale estimate");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("0.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_OTHER_ASSET_005 a review writes nothing: Balance, wealth and history are unchanged")
    void reviewWritesNothing() {
        int before = historyCount(car);
        reviewValue(car, valueBody(mayaId, "20000.00", "2026-10-01", null, false)).expectStatus().isOk()
                .expectBody().jsonPath("$.balanceAfter").isEqualTo("20000.00");
        assertThat(historyCount(car)).isEqualTo(before);
        assertBalance(car, "28000.00");
        // A review of an older date shows that the Balance (the latest value) would not change.
        reviewValue(car, valueBody(mayaId, "29000.00", "2026-09-10", null, false)).expectStatus().isOk()
                .expectBody().jsonPath("$.balanceAfter").isEqualTo("28000.00").jsonPath("$.earlierAmount")
                .isEqualTo("30000.00");
        assertThat(historyCount(car)).isEqualTo(before);
    }

    @Order(5)
    @Test
    @DisplayName("V2_DATED_VALUE_004 pressing Confirm twice with one key saves one estimate; the same key with other "
            + "details is refused; the wealth change from it counts once")
    void repeatedConfirmationSavesOnce() {
        String own = otherAsset("Double Car", "30000.00", "2026-09-01");
        String body = valueBody(samId, "28000.00", "2026-09-30", null, false);
        AtomicReference<String> first = new AtomicReference<>();
        saveValue(own, "d-1", body).expectStatus().isCreated().expectBody().jsonPath("$.value.id")
                .value(String.class, first::set);
        saveValue(own, "d-1", body).expectStatus().isOk().expectBody().jsonPath("$.value.id").isEqualTo(first.get())
                .jsonPath("$.balanceAfter").isEqualTo("28000.00");
        assertThat(historyCount(own)).as("setup value and one estimate").isEqualTo(2);
        saveValue(own, "d-1", valueBody(samId, "27000.00", "2026-09-30", null, false)).expectStatus()
                .isEqualTo(409);
        assertThat(historyCount(own)).isEqualTo(2);
        assertBalance(own, "28000.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_PROPERTY_006 a future-dated value is refused with guidance and nothing changes; a plan is saved, "
            + "listed, never counted, and can be removed")
    void futureValueIsAPlan() {
        int before = historyCount(home);
        saveValue(home, "f-1", valueBody(mayaId, "330000.00", "2026-12-31", null, false)).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").value(m -> assertThat(String.valueOf(m))
                        .contains("Future values are not completed account history")
                        .contains("future plan").contains("on or before today"));
        reviewValue(home, valueBody(mayaId, "330000.00", "2026-12-31", null, false)).expectStatus().isBadRequest();
        assertThat(historyCount(home)).isEqualTo(before);
        assertBalance(home, "315000.00");

        AtomicReference<String> plan = new AtomicReference<>();
        saveValue(home, "f-2", valueBody(mayaId, "330000.00", "2026-12-31", "Revaluation", true)).expectStatus()
                .isCreated().expectBody().jsonPath("$.value.status").isEqualTo("planned")
                .jsonPath("$.balanceAfter").isEqualTo("315000.00").jsonPath("$.value.id")
                .value(String.class, plan::set);
        assertBalance(home, "315000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("371000.00");
        assertThat(field(home, "planned", "amount")).containsExactly("330000.00");
        // A plan is dated after today, and a plan is never corrected in place.
        saveValue(home, "f-3", valueBody(mayaId, "1.00", "2026-10-03", null, true)).expectStatus().isBadRequest();
        correctValue(home, plan.get(), "f-4", valueBody(mayaId, "331000.00", "2026-12-31", "x", false))
                .expectStatus().isEqualTo(409);
        valueAction(home, plan.get(), "removal", mayaId).expectStatus().isOk();
        assertThat(field(home, "planned", "amount")).isEmpty();
        assertBalance(home, "315000.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_PROPERTY_004 a value that is negative, invalid, undated, before the start or by nobody is refused "
            + "with its message and saves nothing")
    void invalidValues() {
        int before = historyCount(home);
        saveValue(home, "i-1", valueBody(mayaId, "-5.00", "2026-10-01", null, false)).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter zero or a positive property value");
        saveValue(car, "i-2", valueBody(mayaId, "-5.00", "2026-10-01", null, false)).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter zero or a positive asset value");
        saveValue(home, "i-3", valueBody(mayaId, "abc", "2026-10-01", null, false)).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        saveValue(home, "i-4", """
                {"amount": 5, "valueOn": "2026-10-01", "enteredByMemberId": "%s"}""".formatted(mayaId))
                .expectStatus().isBadRequest();
        saveValue(home, "i-5", """
                {"amount": "5.00", "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter a date");
        saveValue(home, "i-6", valueBody(mayaId, "5.00", "2026-08-01", null, false)).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").value(m -> assertThat(String.valueOf(m))
                        .contains("before the account's start (2026-09-01)"));
        saveValue(home, "i-7", """
                {"amount": "5.00", "valueOn": "2026-10-01"}""").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose who entered this");
        saveValue(home, "", valueBody(mayaId, "5.00", "2026-10-01", null, false)).expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{id}/values", home).contentType(
                org.springframework.http.MediaType.APPLICATION_JSON).bodyValue(valueBody(mayaId, "5.00",
                "2026-10-01", null, false)).exchange().expectStatus().isBadRequest();
        assertThat(historyCount(home)).isEqualTo(before);
    }

    @Order(8)
    @Test
    @DisplayName("V2_OTHER_ASSET_006 removing the 2026-09-30 estimate returns the earlier value with its older date, "
            + "keeps the removed one in history, and Undo brings it back; a repeat of Remove is 409")
    void removeAndUndoAnEstimate() {
        String estimate = (String) field(car, "current", "id").getFirst();
        webTestClient.get().uri("/api/v1/accounts/{id}/values/{v}/removal/review", car, estimate).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.balanceBefore").isEqualTo("28000.00")
                .jsonPath("$.balanceAfter").isEqualTo("30000.00").jsonPath("$.balanceAfterOn")
                .isEqualTo("2026-09-01");
        assertBalance(car, "28000.00");
        valueAction(car, estimate, "removal", mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.balanceAfter").isEqualTo("30000.00").jsonPath("$.value.status").isEqualTo("removed")
                .jsonPath("$.value.removedBy").isEqualTo("Maya");
        webTestClient.get().uri("/api/v1/accounts/{id}", car).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("30000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-01");
        assertThat(field(car, "removed", "amount")).containsExactly("28000.00");
        assertThat(field(car, "removed", "reason")).containsExactly("Updated resale estimate");
        valueAction(car, estimate, "removal", mayaId).expectStatus().isEqualTo(409);

        valueAction(car, estimate, "undo", mayaId).expectStatus().isOk().expectBody().jsonPath("$.balanceAfter")
                .isEqualTo("28000.00").jsonPath("$.value.status").isEqualTo("current");
        assertBalance(car, "28000.00");
        assertThat(field(car, "current", "amount")).containsExactly("28000.00");
    }

    @Order(9)
    @Test
    @DisplayName("V2_PROPERTY_005 Undo twice returns one effective estimate: the second Undo is the same result, an "
            + "Undo of a value never removed is 409, and the wealth figure follows each step")
    void undoTwiceReturnsOneEstimate() {
        String own = property("Undo Home", "300000.00", "2026-09-01");
        String estimate = savedValue(own, "u-1", "320000.00", "2026-09-30", null);
        valueAction(own, estimate, "undo", mayaId).expectStatus().isEqualTo(409);
        valueAction(own, estimate, "removal", samId).expectStatus().isOk();
        assertBalance(own, "300000.00");
        valueAction(own, estimate, "undo", mayaId).expectStatus().isOk();
        valueAction(own, estimate, "undo", mayaId).expectStatus().isOk().expectBody().jsonPath("$.value.status")
                .isEqualTo("current").jsonPath("$.balanceAfter").isEqualTo("320000.00");
        assertBalance(own, "320000.00");
        assertThat(field(own, "current", "amount")).containsExactly("320000.00");
        assertThat(field(own, "removed", "amount")).isEmpty();
        valueAction(own, "00000000-0000-0000-0000-000000000000", "removal", mayaId).expectStatus().isNotFound();
        valueAction(home, estimate, "removal", mayaId).expectStatus().isNotFound();
    }

    @Order(10)
    @Test
    @DisplayName("V2_PROPERTY_002 values belong to a property or other asset only; a checking account has none")
    void checkingHasNoValues() {
        String bank = account("Valued Checking", "100.00");
        valueHistory(bank).expectStatus().isBadRequest();
        saveValue(bank, "b-1", valueBody(mayaId, "5.00", "2026-10-01", null, false)).expectStatus().isBadRequest();
        reviewValue(bank, valueBody(mayaId, "5.00", "2026-10-01", null, false)).expectStatus().isBadRequest();
    }
}
