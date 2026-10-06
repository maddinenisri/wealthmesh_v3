package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Recurring bills, group 6 (slice 14): every writer by account state, who entered it, the category, the key. One
 * raw-API call per cell: a UI that hides the option is not the guard.
 */
class RecurringGuardsApiTests extends RecurringTestBase {

    private static final String DUE = "2026-10-05";
    private static String utilities;

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
        utilities = categoryId("Utilities");
    }

    /** One account with a schedule per action to try, all made while the account is open. */
    private record Cells(String account, String change, String record, String reschedule, String pause,
            String dismiss, String delete, String paused) {
    }

    private Cells cells(String name) {
        String account = account(name, "0.00");
        String paused = created(name + "-p", schedule("Paused bill", "10.00", "monthly", DUE, account, "Utilities"));
        act(paused, "pause", null).expectStatus().isOk();
        return new Cells(account,
                created(name + "-c", schedule("Change bill", "10.00", "monthly", DUE, account, "Utilities")),
                created(name + "-r", schedule("Record bill", "10.00", "monthly", DUE, account, "Utilities")),
                created(name + "-s", schedule("Reschedule bill", "10.00", "monthly", DUE, account, "Utilities")),
                created(name + "-a", schedule("Pause bill", "10.00", "monthly", DUE, account, "Utilities")),
                created(name + "-d", schedule("Dismiss bill", "10.00", "monthly", DUE, account, "Utilities")),
                created(name + "-x", schedule("Delete bill", "10.00", "monthly", DUE, account, "Utilities")),
                paused);
    }

    private void assertState(Cells c, String word, boolean closed) {
        // New money and changes that set money to be paid need an open account.
        createSchedule("g-new-" + word, schedule("New bill", "10.00", "monthly", DUE, c.account, "Utilities"))
                .expectStatus().isEqualTo(409).expectBody().jsonPath("$.message")
                .value(m -> assertThat(String.valueOf(m)).contains(word));
        reviewSchedule(schedule("New bill", "10.00", "monthly", DUE, c.account, "Utilities")).expectStatus()
                .isEqualTo(409);
        change(c.change, "g-chg-" + word, schedule("Change bill", "11.00", "monthly", DUE, c.account, "Utilities"))
                .expectStatus().isEqualTo(409);
        record(c.record, "g-rec-" + word, recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isEqualTo(409);
        reviewRecord(c.record, recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isEqualTo(409);
        act(c.reschedule, "reschedule", "2026-10-20").expectStatus().isEqualTo(409);
        act(c.paused, "resume", "2026-11-05").expectStatus().isEqualTo(409);
        // What moves no money still works: Pause, Dismiss this occurrence, Delete, dismiss a suggestion.
        act(c.pause, "pause", null).expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("paused");
        act(c.dismiss, "dismiss", DUE).expectStatus().isOk().expectBody().jsonPath("$.nextDueOn")
                .isEqualTo("2026-11-05");
        act(c.delete, "delete", null).expectStatus().isOk();
        dismissSuggestion(c.account, utilities, "Some bill " + word).expectStatus().isOk();
        // The schedules stay listed with the state of their account.
        overview().expectBody().jsonPath("$.schedules[?(@.id=='" + c.change + "')].accountStatus")
                .isEqualTo(closed ? "closed" : "archived");
        assertActivityCount(c.account, 0);
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 every schedule writer on an archived account: the ones that set money to be "
            + "paid are refused (409), Pause, Dismiss this occurrence, Delete and dismissing a suggestion work")
    void archivedAccountMatrix() {
        Cells c = cells("Guard Archived");
        archive(c.account);
        assertState(c, "archived", false);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 the same matrix on a closed account")
    void closedAccountMatrix() {
        Cells c = cells("Guard Closed");
        act(c.account, "close").expectStatus().isOk();
        assertState(c, "closed", true);
    }

    @Order(3)
    @Test
    @DisplayName("V2_RECURRING_008 writer by schedule state: a paused schedule refuses Record, Reschedule and Dismiss "
            + "this occurrence; a deleted one is gone to every writer; Resume of an active bill is refused")
    void scheduleStateMatrix() {
        String account = account("Guard States", "0.00");
        String paused = created("st-1", schedule("Paused", "10.00", "monthly", DUE, account, "Utilities"));
        act(paused, "pause", null).expectStatus().isOk();
        record(paused, "st-rec", recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isEqualTo(409);
        act(paused, "reschedule", "2026-10-20").expectStatus().isEqualTo(409);
        act(paused, "dismiss", DUE).expectStatus().isEqualTo(409);
        change(paused, "st-chg", schedule("Paused", "12.00", "weekly", DUE, account, "Utilities")).expectStatus()
                .isCreated().expectBody().jsonPath("$.status").isEqualTo("paused");
        act(paused, "pause", null).expectStatus().isOk();

        String active = created("st-2", schedule("Active", "10.00", "monthly", DUE, account, "Utilities"));
        act(active, "resume", "2026-11-05").expectStatus().isEqualTo(409);

        String gone = created("st-3", schedule("Gone", "10.00", "monthly", DUE, account, "Utilities"));
        act(gone, "delete", null).expectStatus().isOk();
        record(gone, "gone-rec", recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isNotFound();
        reviewRecord(gone, recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isNotFound();
        act(gone, "reschedule", "2026-10-20").expectStatus().isNotFound();
        act(gone, "dismiss", DUE).expectStatus().isNotFound();
        act(gone, "resume", "2026-10-20").expectStatus().isNotFound();
        act(gone, "pause", null).expectStatus().isNotFound();
        change(gone, "gone-chg", schedule("Gone", "11.00", "monthly", DUE, account, "Utilities")).expectStatus()
                .isNotFound();
        act("00000000-0000-4000-8000-000000000000", "pause", null).expectStatus().isNotFound();
        assertActivityCount(account, 0);
    }

    @Order(4)
    @Test
    @DisplayName("V2_MEMBERS_003 every writer needs who entered it (400); a deactivated member cannot enter a new save "
            + "but their saved results replay")
    void whoEnteredIt() {
        String account = account("Guard Members", "100.00");
        String id = created("who-1", schedule(samId, "Sam bill", "10.00", "monthly", DUE, account, "Utilities"));
        String other = created("who-2", schedule("Maya bill", "10.00", "monthly", DUE, account, "Utilities"));
        for (String action : new String[] {"pause", "resume", "delete", "reschedule", "dismiss"}) {
            webTestClient.post().uri(RECURRING + "/{id}/{action}", other, action).exchange().expectStatus()
                    .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose who entered this");
        }
        webTestClient.post().uri(RECURRING + "/suggestions/dismiss").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"accountId\": \"%s\", \"categoryId\": \"%s\", \"description\": \"X\"}"
                        .formatted(account, utilities)).exchange().expectStatus().isBadRequest();
        createSchedule("who-n", schedule("", "10.00", "monthly", DUE, account, "Utilities").replace(
                "\"enteredByMemberId\": \"" + mayaId + "\"", "\"enteredByMemberId\": null")).expectStatus()
                .isBadRequest();
        String body = recordBody(samId, DUE, "10.00", "2026-10-01", null);
        record(id, "who-rec", body).expectStatus().isCreated();

        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            createSchedule("who-1", schedule(samId, "Sam bill", "10.00", "monthly", DUE, account, "Utilities"))
                    .expectStatus().isOk();
            record(id, "who-rec", body).expectStatus().isOk();
            createSchedule("who-new", schedule(samId, "Sam bill 2", "10.00", "monthly", DUE, account, "Utilities"))
                    .expectStatus().isBadRequest();
            change(other, "who-chg", schedule(samId, "Maya bill", "11.00", "monthly", DUE, account, "Utilities"))
                    .expectStatus().isBadRequest();
            record(other, "who-rec2", recordBody(samId, DUE, "10.00", "2026-10-01", null)).expectStatus()
                    .isBadRequest();
            for (String action : new String[] {"pause", "delete"}) {
                webTestClient.post().uri(RECURRING + "/{id}/{action}", other, action)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId)).exchange().expectStatus()
                        .isBadRequest();
            }
            // A schedule Sam created stays listed, and Maya can still pause it.
            act(id, "pause", null).expectStatus().isOk();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
    }

    @Order(5)
    @Test
    @DisplayName("V2_CATEGORIES_005 an archived category: a new schedule is refused, a saved one keeps its label and "
            + "its record is refused until another category is chosen; a merged category reads through its target")
    void categoryStates() {
        String account = account("Guard Categories", "500.00");
        createCategory("Guard Old", "spending");
        createCategory("Guard New", "spending");
        String old = categoryId("spending", "Guard Old");
        String target = categoryId("spending", "Guard New");
        String id = created("cat-1", schedule("Cat bill", "10.00", "monthly", DUE, account, "Guard Old"));

        webTestClient.post().uri("/api/v1/categories/{id}/archive", old).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        // By name an archived category is not found, as for an entry; by id the answer says it is archived.
        createSchedule("cat-2", schedule("Cat bill 2", "10.00", "monthly", DUE, account, "Guard Old"))
                .expectStatus().isBadRequest();
        createSchedule("cat-2b", schedule("Cat bill 2", "10.00", "monthly", DUE, account, "Guard Old")
                .replace("\"category\": \"Guard Old\"", "\"categoryId\": \"" + old + "\"")).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message")
                .value(m -> assertThat(String.valueOf(m)).contains("archived"));
        scheduleOf(id).expectBody().jsonPath("$.categoryName").isEqualTo("Guard Old")
                .jsonPath("$.categoryArchived").isEqualTo(true);
        record(id, "cat-rec", recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isBadRequest();
        record(id, "cat-rec2", recordBody(mayaId, DUE, "10.00", "2026-10-01", "Guard New")).expectStatus()
                .isCreated();
        assertActivityCount(account, 1);

        String second = created("cat-3", schedule("Cat bill 3", "10.00", "monthly", DUE, account, "Guard New"));
        webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sourceIds\": [\"%s\"], \"targetId\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(target, utilities, mayaId)).exchange().expectStatus()
                .isCreated();
        scheduleOf(second).expectBody().jsonPath("$.categoryName").isEqualTo("Utilities")
                .jsonPath("$.categoryArchived").isEqualTo(false);
        record(second, "cat-rec3", recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[?(@.description=='Cat bill 3')].categoryName").isEqualTo("Utilities");
    }

    @Order(6)
    @Test
    @DisplayName("V2_RECURRING_006 a retry of a save that succeeded replays after its account was archived, closed or "
            + "its category archived; a new key is refused")
    void retriesReplay() {
        String account = account("Guard Replay", "0.00");
        createCategory("Guard Replay Cat", "spending");
        String body = schedule("Replay bill", "10.00", "monthly", DUE, account, "Guard Replay Cat");
        String id = created("rp-1", body);
        record(id, "rp-rec", recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isCreated();
        webTestClient.post().uri("/api/v1/categories/{id}/archive", categoryId("spending", "Guard Replay Cat"))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        createSchedule("rp-1", body).expectStatus().isOk().expectBody().jsonPath("$.id").isEqualTo(id);
        record(id, "rp-rec", recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isOk();
        act(account, "close").expectStatus().isEqualTo(409);
        // Closing needs a zero Balance: a recorded 10.00 expense left -10.00, so archive instead.
        archive(account);
        createSchedule("rp-1", body).expectStatus().isOk();
        record(id, "rp-rec", recordBody(DUE, "10.00", "2026-10-01")).expectStatus().isOk();
        createSchedule("rp-2", body).expectStatus().is4xxClientError();
        assertActivityCount(account, 1);
    }

    @Order(7)
    @Test
    @DisplayName("V2_RECURRING_006 a missing or oversized key is refused on every keyed write")
    void keysAreRequired() {
        String account = account("Guard Keys", "0.00");
        String id = created("k-1", schedule("Key bill", "10.00", "monthly", DUE, account, "Utilities"));
        for (WebTestClient.RequestHeadersSpec<?> spec : new WebTestClient.RequestHeadersSpec<?>[] {
            webTestClient.put().uri(RECURRING + "/{id}", id).contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(schedule("Key bill", "11.00", "monthly", DUE, account, "Utilities")),
            webTestClient.post().uri(RECURRING + "/{id}/record", id).contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(recordBody(DUE, "10.00", "2026-10-01"))}) {
            spec.exchange().expectStatus().isBadRequest();
        }
        change(id, "x".repeat(101), schedule("Key bill", "11.00", "monthly", DUE, account, "Utilities"))
                .expectStatus().isBadRequest();
    }
}
