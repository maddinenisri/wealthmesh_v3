package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 15, the state matrix for a valued account (checklist: every writer by every state, one raw-API test per cell).
 * Active is covered by `ValueApiTests`. Archived takes no new value or plan but keeps history editable; closed takes
 * nothing until it is reopened. Close needs a zero value and no plan, delete needs an account with no value at all,
 * and an archived account's value stays in wealth.
 */
class ValueStateApiTests extends ValuedTestBase {

    private static final String ARCHIVED_TEXT = "archived. Restore it first.";
    private static final String CLOSED_TEXT = "closed. Reopen it first.";

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    /** An account with a kept value, a value to correct and a removed one to restore. */
    private String[] prepared(String name, String opening, String kept, String removed) {
        String own = property(name, opening, "2026-09-01");
        String correct = savedValue(own, name + "-1", kept, "2026-09-10", null);
        String gone = savedValue(own, name + "-2", removed, "2026-09-20", null);
        valueAction(own, gone, "removal", mayaId).expectStatus().isOk();
        return new String[] { own, correct, gone };
    }

    @Order(1)
    @Test
    @DisplayName("V2_PROPERTY_005 an archived property takes no new value or plan (409), keeps its value in "
            + "wealth, and allows a correction, a removal and an Undo")
    void archivedCells() {
        String[] a = prepared("Archived Home", "1000.00", "2000.00", "3000.00");
        String own = a[0];
        act(own, "archive").expectStatus().isOk();
        assertRefused(saveValue(own, "ar-1", valueBody(mayaId, "4000.00", "2026-09-25", null, false)),
                ARCHIVED_TEXT);
        assertRefused(saveValue(own, "ar-2", valueBody(mayaId, "4000.00", "2026-12-25", null, true)), ARCHIVED_TEXT);
        assertThat(historyCount(own)).as("nothing was added").isEqualTo(3);
        assertBalance(own, "2000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.financialAssets")
                .value(total -> assertThat(Double.parseDouble(String.valueOf(total))).isGreaterThanOrEqualTo(2000.0));
        correctValue(own, a[1], "ar-3", """
                {"amount": "2500.00", "reason": "Archived fix", "enteredByMemberId": "%s"}""".formatted(mayaId))
                .expectStatus().isCreated();
        valueAction(own, a[2], "undo", mayaId).expectStatus().isOk();
        valueAction(own, a[2], "removal", mayaId).expectStatus().isOk();
    }

    @Order(2)
    @Test
    @DisplayName("V2_PROPERTY_005 a closed property takes no new value, plan, correction, removal or Undo (409) until "
            + "it is reopened")
    void closedCells() {
        String own = property("Closed Plot", "0.00", "2026-09-01");
        String correct = savedValue(own, "cl-1", "0.00", "2026-09-10", null);
        String gone = savedValue(own, "cl-2", "0.00", "2026-09-20", null);
        valueAction(own, gone, "removal", mayaId).expectStatus().isOk();
        String live = savedValue(own, "cl-3", "0.00", "2026-09-25", null);
        act(own, "close").expectStatus().isOk();
        int before = historyCount(own);
        assertRefused(saveValue(own, "cl-4", valueBody(mayaId, "5.00", "2026-09-26", null, false)), CLOSED_TEXT);
        assertRefused(saveValue(own, "cl-5", valueBody(mayaId, "5.00", "2026-12-26", null, true)), CLOSED_TEXT);
        assertRefused(correctValue(own, correct, "cl-6", """
                {"amount": "5.00", "reason": "Closed fix", "enteredByMemberId": "%s"}""".formatted(mayaId)),
                CLOSED_TEXT);
        assertRefused(valueAction(own, live, "removal", mayaId), CLOSED_TEXT);
        assertRefused(valueAction(own, gone, "undo", mayaId), CLOSED_TEXT);
        assertThat(historyCount(own)).isEqualTo(before);
        act(own, "reopen").expectStatus().isOk();
        saveValue(own, "cl-7", valueBody(mayaId, "5.00", "2026-09-26", null, false)).expectStatus().isCreated();
    }

    @Order(3)
    @Test
    @DisplayName("V2_PROPERTY_005 Close needs a $0.00 value and no plan; delete is refused once any value exists, "
            + "removed ones included")
    void closeAndDeleteRules() {
        String own = property("Sold Home", "50000.00", "2026-09-01");
        assertRefused(act(own, "close"), "record a $0.00 value first");
        saveValue(own, "sd-1", valueBody(mayaId, "0.00", "2026-10-01", "Sold", false)).expectStatus().isCreated();
        String plan = (String) planId(own);
        assertRefused(act(own, "close"), "has 1 planned value. Remove it first, then close.");
        valueAction(own, plan, "removal", mayaId).expectStatus().isOk();
        act(own, "close").expectStatus().isOk();
        assertRefused(act(own, "delete"), "dated values (removed ones count)");

        String unused = property("Unused Plot", null, "2026-09-01");
        String only = savedValue(unused, "sd-2", "10.00", "2026-09-10", null);
        valueAction(unused, only, "removal", mayaId).expectStatus().isOk();
        assertRefused(act(unused, "delete"), "dated value");
    }

    private Object planId(String own) {
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        saveValue(own, "plan-" + own, valueBody(mayaId, "1.00", "2026-12-31", null, true)).expectStatus().isCreated()
                .expectBody().jsonPath("$.value.id").value(String.class, id::set);
        return id.get();
    }

    @Order(4)
    @Test
    @DisplayName("V2_PROPERTY_005 the review of Close and Delete is told about a plan and about a moved start before "
            + "the person confirms (Cowork faults 2 and 9)")
    void lifecycleReviewExplainsFirst() {
        String own = property("Review Plan", "0.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", own).exchange().expectBody()
                .jsonPath("$.closeBlockedBy.length()").isEqualTo(0);
        planId(own);
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", own).exchange().expectBody()
                .jsonPath("$.closeBlockedBy[0]").value(m -> assertThat(String.valueOf(m))
                        .contains("1 planned value").contains("Remove it first"));
        String moved = otherAsset("Review Moved", "10.00", "2026-09-01");
        extendStart(moved, "rm-1", """
                {"amount": "9.00", "valueOn": "2026-08-01", "reason": "Earlier", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", moved).exchange().expectBody()
                .jsonPath("$.deleteBlockedBy[?(@=~/.*starting-balance.*/)]").isEmpty()
                .jsonPath("$.deleteBlockedBy[?(@=~/.*start moved earlier.*/)]").isNotEmpty();
    }
}
