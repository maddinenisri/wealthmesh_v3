package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Recurring bills, group 6 (slice 14): races, built on `holdUncommitted` so the order is forced, not left to timing.
 * Each test fails when the lock it names is taken out of the service.
 */
class RecurringRaceApiTests extends RecurringTestBase {

    private static final String DUE = "2026-10-05";
    private static String account;
    private static String household;

    @Order(0)
    @Test
    @DisplayName("set up the household and a checking account at 5000.00; today is 2026-10-03")
    void setUp() {
        household();
        household = householdId();
        account = account("Race Checking", "5000.00");
    }

    private String schedule(String name, String key) {
        return created(key, schedule(name, "10.00", "monthly", DUE, account, "Utilities"));
    }

    @Order(1)
    @Test
    @DisplayName("V2_RECURRING_006 every writer waits for the household row lock: create, change, Pause, Resume, "
            + "Delete, Record, Reschedule, Dismiss this occurrence and dismiss a suggestion")
    void everyWriterTakesTheHouseholdLock() throws Exception {
        String change = schedule("Change", "h-c");
        String pause = schedule("Pause", "h-p");
        String resume = schedule("Resume", "h-r");
        act(resume, "pause", null).expectStatus().isOk();
        String delete = schedule("Delete", "h-d");
        String record = schedule("Record", "h-rec");
        String reschedule = schedule("Reschedule", "h-s");
        String dismiss = schedule("Dismiss", "h-x");
        String category = categoryId("Utilities");
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(HOUSEHOLD_LOCK, household,
                () -> createSchedule("h-new", schedule("New", "10.00", "monthly", DUE, account, "Utilities")),
                () -> change(change, "h-chg", schedule("Change", "11.00", "monthly", DUE, account, "Utilities")),
                () -> act(pause, "pause", null),
                () -> act(resume, "resume", "2026-11-05"),
                () -> act(delete, "delete", null),
                () -> record(record, "h-rec-1", recordBody(DUE, "10.00", "2026-10-01")),
                () -> act(reschedule, "reschedule", "2026-10-20"),
                () -> act(dismiss, "dismiss", DUE),
                () -> dismissSuggestion(account, category, "Nothing yet"));
        assertThat(statuses).containsExactly(201, 201, 200, 200, 200, 201, 200, 200, 200);
        assertActivityCount(account, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 create, change, Record, Resume and Reschedule wait for an uncommitted "
            + "Archive of the account and are refused once it commits (the account row is locked and read again)")
    void accountRowIsLocked() throws Exception {
        String own = account("Race Archive", "1000.00");
        String change = created("a-c", schedule("Change", "10.00", "monthly", DUE, own, "Utilities"));
        String record = created("a-r", schedule("Record", "10.00", "monthly", DUE, own, "Utilities"));
        String resume = created("a-u", schedule("Resume", "10.00", "monthly", DUE, own, "Utilities"));
        act(resume, "pause", null).expectStatus().isOk();
        String reschedule = created("a-s", schedule("Reschedule", "10.00", "monthly", DUE, own, "Utilities"));
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(ARCHIVED, own,
                () -> createSchedule("a-new", schedule("New", "10.00", "monthly", DUE, own, "Utilities")),
                () -> change(change, "a-chg", schedule("Change", "11.00", "monthly", DUE, own, "Utilities")),
                () -> record(record, "a-rec", recordBody(DUE, "10.00", "2026-10-01")),
                () -> act(resume, "resume", "2026-11-05"),
                () -> act(reschedule, "reschedule", "2026-10-20"));
        assertThat(statuses).containsExactly(409, 409, 409, 409, 409);
        assertActivityCount(own, 0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_MEMBERS_003 create, change, Pause and Record wait for an uncommitted deactivation of who entered "
            + "them and are refused once it commits (the member is read under a share lock)")
    void memberRowIsLocked() throws Exception {
        String change = schedule("Member change", "m-c");
        String pause = schedule("Member pause", "m-p");
        String record = schedule("Member record", "m-r");
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld("UPDATE wealthmesh.household_member SET active = false WHERE id = $1",
                samId,
                () -> createSchedule("m-new", schedule(samId, "Member new", "10.00", "monthly", DUE, account,
                        "Utilities")),
                () -> change(change, "m-chg", schedule(samId, "Member change", "11.00", "monthly", DUE, account,
                        "Utilities")),
                () -> webTestClient.post().uri(RECURRING + "/{id}/pause", pause)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId)).exchange(),
                () -> record(record, "m-rec", recordBody(samId, DUE, "10.00", "2026-10-01", null)));
        assertThat(statuses).containsExactly(400, 400, 400, 400);
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
    }

    @Order(4)
    @Test
    @DisplayName("V2_CATEGORIES_005 create and Record wait for an uncommitted archive of their category and are "
            + "refused once it commits (the category is read under a share lock)")
    void categoryRowIsLocked() throws Exception {
        createCategory("Race Cat", "spending");
        String cat = categoryId("spending", "Race Cat");
        String record = created("c-r", schedule("Cat record", "10.00", "monthly", DUE, account, "Race Cat"));
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(
                "UPDATE wealthmesh.category SET archived_at = CURRENT_TIMESTAMP WHERE id = $1", cat,
                () -> createSchedule("c-new", schedule("Cat new", "10.00", "monthly", DUE, account, "Race Cat")),
                () -> record(record, "c-rec", recordBody(DUE, "10.00", "2026-10-01")));
        assertThat(statuses).containsExactly(400, 400);
    }

    @Order(5)
    @Test
    @DisplayName("V2_RECURRING_003 two Records of one occurrence at once: one saves the expense, the other is refused; "
            + "the same key twice at once: one saves, the other replays; one expense either way")
    void twoRecordsOfOneOccurrence() throws Exception {
        String id = schedule("Twice", "t-1");
        CompletableFuture<Integer> first = CompletableFuture.supplyAsync(() -> statusOf(record(id, "t-a",
                recordBody(DUE, "10.00", "2026-10-01"))));
        CompletableFuture<Integer> second = CompletableFuture.supplyAsync(() -> statusOf(record(id, "t-b",
                recordBody(DUE, "10.00", "2026-10-01"))));
        List<Integer> statuses = List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        scheduleOf(id).expectBody().jsonPath("$.occurrences.length()").isEqualTo(1).jsonPath("$.bills.length()")
                .isEqualTo(1);

        String same = schedule("Same key", "t-2");
        CompletableFuture<Integer> a = CompletableFuture.supplyAsync(() -> statusOf(record(same, "t-s",
                recordBody(DUE, "10.00", "2026-10-01"))));
        CompletableFuture<Integer> b = CompletableFuture.supplyAsync(() -> statusOf(record(same, "t-s",
                recordBody(DUE, "10.00", "2026-10-01"))));
        assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(201, 200);
        scheduleOf(same).expectBody().jsonPath("$.bills.length()").isEqualTo(1);
    }
}
