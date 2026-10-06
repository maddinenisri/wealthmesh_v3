package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 15: races of the dated value writers, built on `holdUncommitted` so the order is forced. Each test fails when
 * the lock it names is taken out of the service: the account row (every writer), the member row read FOR SHARE, and
 * the save key read under the account lock.
 */
class ValueRaceApiTests extends ValuedTestBase {

    private static final String ACCOUNT_LOCK = "SELECT id FROM wealthmesh.account WHERE id = $1 FOR UPDATE";
    private static final String DEACTIVATE = "UPDATE wealthmesh.household_member SET active = false WHERE id = $1";

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    private String fresh(String name) {
        return property(name, "1000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_DATED_VALUE_004 save, plan, correct, remove and Undo each wait for the account row lock")
    void everyWriterTakesTheAccountLock() throws Exception {
        String own = fresh("Race Lock");
        String correct = savedValue(own, "l-1", "2000.00", "2026-09-10", null);
        String remove = savedValue(own, "l-2", "3000.00", "2026-09-12", null);
        String undo = savedValue(own, "l-3", "4000.00", "2026-09-14", null);
        valueAction(own, undo, "removal", mayaId).expectStatus().isOk();
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(ACCOUNT_LOCK, own,
                () -> saveValue(own, "l-new", valueBody(mayaId, "5000.00", "2026-09-16", null, false)),
                () -> saveValue(own, "l-plan", valueBody(mayaId, "6000.00", "2026-12-16", null, true)),
                () -> correctValue(own, correct, "l-cor", """
                        {"amount": "2100.00", "reason": "Fix", "enteredByMemberId": "%s"}""".formatted(mayaId)),
                () -> valueAction(own, remove, "removal", mayaId),
                () -> valueAction(own, undo, "undo", mayaId));
        assertThat(statuses).containsExactly(201, 201, 201, 200, 200);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 save and correct wait for an uncommitted Archive and are refused or allowed "
            + "by the committed state (new value 409, correction 200)")
    void archiveDecidesAfterTheLock() throws Exception {
        String own = fresh("Race Archive");
        String correct = savedValue(own, "a-1", "2000.00", "2026-09-10", null);
        assertThat(afterUncommitted(own, ARCHIVED, () -> saveValue(own, "a-new",
                valueBody(mayaId, "5000.00", "2026-09-16", null, false)))).isEqualTo(409);
        assertThat(afterUncommitted(own, ARCHIVED, () -> correctValue(own, correct, "a-cor", """
                {"amount": "2100.00", "reason": "Fix", "enteredByMemberId": "%s"}""".formatted(mayaId))))
                .isEqualTo(201);
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 save, correct, remove and Undo are refused after an uncommitted Close "
            + "commits")
    void closeBeatsEveryWriter() throws Exception {
        String own = property("Race Close", "0.00", "2026-09-01");
        String correct = savedValue(own, "c-1", "0.00", "2026-09-10", null);
        String remove = savedValue(own, "c-2", "0.00", "2026-09-12", null);
        String undo = savedValue(own, "c-3", "0.00", "2026-09-14", null);
        valueAction(own, undo, "removal", mayaId).expectStatus().isOk();
        assertThat(afterUncommitted(own, CLOSED, () -> saveValue(own, "c-new",
                valueBody(mayaId, "0.00", "2026-09-16", null, false)))).isEqualTo(409);
        assertThat(afterUncommitted(own, CLOSED, () -> correctValue(own, correct, "c-cor", """
                {"amount": "0.00", "reason": "Fix", "enteredByMemberId": "%s"}""".formatted(mayaId))))
                .isEqualTo(409);
        assertThat(afterUncommitted(own, CLOSED, () -> valueAction(own, remove, "removal", mayaId))).isEqualTo(409);
        assertThat(afterUncommitted(own, CLOSED, () -> valueAction(own, undo, "undo", mayaId))).isEqualTo(409);
    }

    @Order(4)
    @Test
    @DisplayName("V2_MEMBERS_003 save, correct, remove and Undo wait for an uncommitted deactivation of who entered "
            + "them and are refused once it commits (the member is read under a share lock)")
    void memberRowIsLocked() throws Exception {
        String own = fresh("Race Member");
        String correct = savedValue(own, "m-1", "2000.00", "2026-09-10", null);
        String remove = savedValue(own, "m-2", "3000.00", "2026-09-12", null);
        String undo = savedValue(own, "m-3", "4000.00", "2026-09-14", null);
        valueAction(own, undo, "removal", mayaId).expectStatus().isOk();
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(DEACTIVATE, samId,
                () -> saveValue(own, "m-new", valueBody(samId, "5000.00", "2026-09-16", null, false)),
                () -> correctValue(own, correct, "m-cor", """
                        {"amount": "2100.00", "reason": "Fix", "enteredByMemberId": "%s"}""".formatted(samId)),
                () -> valueAction(own, remove, "removal", samId),
                () -> valueAction(own, undo, "undo", samId));
        assertThat(statuses).containsExactly(400, 400, 400, 400);
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
    }

    @Order(5)
    @Test
    @DisplayName("V2_DATED_VALUE_004 two requests with one key at once save one value: the second replays the first")
    void sameKeyAtOnce() throws Exception {
        String own = fresh("Race Key");
        String body = valueBody(mayaId, "2000.00", "2026-09-10", null, false);
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(ACCOUNT_LOCK, own, () -> saveValue(own, "k-1", body),
                () -> saveValue(own, "k-1", body));
        assertThat(statuses).containsExactlyInAnyOrder(201, 200);
        assertThat(historyCount(own)).as("the setup value and one value").isEqualTo(2);
    }

    @Order(6)
    @Test
    @DisplayName("V2_DATED_VALUE_004 a retry replays after a later value, an Archive, a deactivation of who entered it "
            + "and a Close; another body under the key is 409")
    void retryAfterTheAccountChanged() {
        String own = property("Race Retry", "0.00", "2026-09-01");
        String body = valueBody(samId, "0.00", "2026-09-10", null, false);
        saveValue(own, "r-1", body).expectStatus().isCreated();
        saveValue(own, "r-later", valueBody(mayaId, "0.00", "2026-09-20", null, false)).expectStatus().isCreated();
        saveValue(own, "r-1", body).expectStatus().isOk();
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            saveValue(own, "r-1", body).expectStatus().isOk();
            saveValue(own, "r-2", valueBody(samId, "0.00", "2026-09-11", null, false)).expectStatus().isBadRequest();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
        act(own, "archive").expectStatus().isOk();
        saveValue(own, "r-1", body).expectStatus().isOk();
        act(own, "restore").expectStatus().isOk();
        act(own, "close").expectStatus().isOk();
        saveValue(own, "r-1", body).expectStatus().isOk();
        saveValue(own, "r-1", valueBody(samId, "1.00", "2026-09-10", null, false)).expectStatus().isEqualTo(409);
        assertThat(historyCount(own)).isEqualTo(3);
    }
}
