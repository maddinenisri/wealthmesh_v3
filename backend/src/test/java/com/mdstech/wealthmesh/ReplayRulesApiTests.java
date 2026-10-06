package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Q-044 (slice 14, group 0): a retry of a save that already succeeded (same key, same body) replays the stored result
 * (D-024) and is judged on what was saved, not on today's category, member and date rules. One shared replay mechanism
 * (`EntryValidator.parseForReplay`) serves the entry, batch, reminder and historical entry writers, so each writer is
 * tried by id and by name against each cause: the category archived, the category merged, the member deactivated, and
 * the category's default class changed. A new key still meets every rule.
 */
class ReplayRulesApiTests extends SplitTestBase {

    private static String account;
    private static String[] historyAccounts;

    @Order(0)
    @Test
    @DisplayName("set up the household and a checking account")
    void setUp() {
        household();
        account = account("Replay Checking", "5000.00");
        historyAccounts = new String[] {account("Replay History Name", "5000.00"),
                account("Replay History Id", "5000.00")};
        clock.setToday(LocalDate.of(2026, 9, 10));
    }

    /** One way to name the category in a request. */
    private enum Naming {
        BY_NAME, BY_ID
    }

    /** Ids of the categories made here, kept because an archived or merged one is no longer listed. */
    private static final java.util.Map<String, String> IDS = new java.util.HashMap<>();

    private void create(String name) {
        createCategory(name, "spending");
        IDS.put(name, categoryId("spending", name));
    }

    private String named(Naming naming, String name) {
        return naming == Naming.BY_NAME ? "\"category\": \"" + name + "\""
                : "\"categoryId\": \"" + (IDS.containsKey(name) ? IDS.get(name) : categoryId("spending", name))
                        + "\"";
    }

    private WebTestClient.ResponseSpec expense(String key, Naming naming, String category, String amount) {
        return post(account, "expenses", key, """
                {"description": "Replay", "amount": "%s", "occurredOn": "2026-09-07", %s,
                 "enteredByMemberId": "%s"}""".formatted(amount, named(naming, category), samId));
    }

    private WebTestClient.ResponseSpec batch(String key, Naming naming, String category, String amount) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue("""
                        {"enteredByMemberId": "%s", "entries": [{"description": "Replay", "amount": "%s",
                         "occurredOn": "2026-09-07", %s}]}""".formatted(samId, amount, named(naming, category)))
                .exchange();
    }

    private WebTestClient.ResponseSpec reminder(String key, Naming naming, String category, String amount) {
        return post(account, "reminders", key, """
                {"kind": "expense", "description": "Replay", "amount": "%s", "dueOn": "2026-10-20", %s,
                 "enteredByMemberId": "%s"}""".formatted(amount, named(naming, category), samId));
    }

    private WebTestClient.ResponseSpec splitExpense(String key, Naming naming, String first, String second) {
        return post(account, "expenses", key, """
                {"description": "Replay split", "amount": "30.00", "occurredOn": "2026-09-07",
                 "enteredByMemberId": "%s", "portions": [
                  {%s, "amount": "10.00"}, {%s, "amount": "20.00"}]}"""
                .formatted(samId, named(naming, first), named(naming, second)));
    }

    private WebTestClient.ResponseSpec historical(String key, Naming naming, String category, String amount) {
        return post(historyAccounts[naming.ordinal()], "historical-entries", key, """
                {"kind": "expense", "entry": {"description": "Replay old", "amount": "%s", "occurredOn": "2026-08-20",
                 %s, "enteredByMemberId": "%s"},
                 "startRevision": {"openingAmount": "5000.00", "openedOn": "2026-08-01", "reason": "Earlier",
                 "enteredByMemberId": "%s"}}""".formatted(amount, named(naming, category), samId, samId));
    }

    private void archiveCategory(String name) {
        categoryChange(IDS.get(name), "archive", "{\"enteredByMemberId\": \"%s\"}".formatted(mayaId));
    }

    private void mergeInto(String source, String target) {
        webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sourceIds\": [\"%s\"], \"targetId\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(IDS.get(source), IDS.get(target), mayaId))
                .exchange().expectStatus().is2xxSuccessful();
    }

    private void categoryChange(String id, String action, String json) {
        webTestClient.post().uri("/api/v1/categories/{id}/{action}", id, action)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(json).exchange().expectStatus().isOk();
    }

    private void setDefaultClass(String name, String defaultClass) {
        categoryChange(IDS.get(name), "default-class",
                "{\"defaultClass\": \"%s\", \"enteredByMemberId\": \"%s\"}".formatted(defaultClass, mayaId));
    }

    private static void assertConflict(WebTestClient.ResponseSpec spec) {
        spec.expectStatus().isEqualTo(409).expectBody().jsonPath("$.message").value(
                m -> assertThat(String.valueOf(m)).contains("already used"));
    }

    /** Entry, batch and split writers by name and by id: replay after the category is archived. */
    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a retry of an entry, batch, split, reminder and historical entry replays "
            + "after its category is archived, by name and by id; a new key is refused")
    void retryAfterCategoryArchived() {
        for (Naming naming : Naming.values()) {
            String cat = "ArchRetry" + naming;
            create(cat);
            String other = "ArchRetryOther" + naming;
            create(other);
            String k = "arch-" + naming + "-";
            expense(k + "e", naming, cat, "5.00").expectStatus().isCreated();
            batch(k + "b", naming, cat, "6.00").expectStatus().isCreated();
            reminder(k + "r", naming, cat, "8.00").expectStatus().isCreated();
            splitExpense(k + "s", naming, cat, other).expectStatus().isCreated();
            historical(k + "h", naming, cat, "7.00").expectStatus().isCreated();
            archiveCategory(cat);

            expense(k + "e", naming, cat, "5.00").expectStatus().isOk();
            batch(k + "b", naming, cat, "6.00").expectStatus().isOk();
            reminder(k + "r", naming, cat, "8.00").expectStatus().isOk();
            splitExpense(k + "s", naming, cat, other).expectStatus().isOk();
            historical(k + "h", naming, cat, "7.00").expectStatus().isOk();

            assertConflict(expense(k + "e", naming, cat, "5.50"));
            assertConflict(batch(k + "b", naming, cat, "6.50"));
            assertConflict(reminder(k + "r", naming, cat, "8.50"));

            expense(k + "e2", naming, cat, "5.00").expectStatus().isBadRequest();
            batch(k + "b2", naming, cat, "6.00").expectStatus().isBadRequest();
            reminder(k + "r2", naming, cat, "8.00").expectStatus().isBadRequest();
        }
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a retry of an entry, batch and reminder replays after its category was "
            + "merged into another, by name and by id; the entry count does not change")
    void retryAfterCategoryMerged() {
        for (Naming naming : Naming.values()) {
            String source = "MergeRetry" + naming;
            String target = "MergeTarget" + naming;
            create(source);
            create(target);
            String k = "merge-" + naming + "-";
            expense(k + "e", naming, source, "5.00").expectStatus().isCreated();
            batch(k + "b", naming, source, "6.00").expectStatus().isCreated();
            reminder(k + "r", naming, source, "8.00").expectStatus().isCreated();
            splitExpense(k + "s", naming, source, target).expectStatus().isCreated();
            mergeInto(source, target);
            int before = count();

            expense(k + "e", naming, source, "5.00").expectStatus().isOk();
            batch(k + "b", naming, source, "6.00").expectStatus().isOk();
            reminder(k + "r", naming, source, "8.00").expectStatus().isOk();
            splitExpense(k + "s", naming, source, target).expectStatus().isOk();
            assertThat(count()).as("a replay saves nothing").isEqualTo(before);
        }
    }

    @Order(3)
    @Test
    @DisplayName("V2_CATEGORIES_002 a retry that names no class replays after the category's default class changed "
            + "(the stored class stands), for an entry, a batch and a split")
    void retryAfterDefaultClassChanged() {
        for (Naming naming : Naming.values()) {
            String cat = "ClassRetry" + naming;
            create(cat);
            setDefaultClass(cat, "essential");
            String k = "class-" + naming + "-";
            expense(k + "e", naming, cat, "5.00").expectStatus().isCreated();
            batch(k + "b", naming, cat, "6.00").expectStatus().isCreated();
            splitExpense(k + "s", naming, cat, cat).expectStatus().isCreated();
            setDefaultClass(cat, "discretionary");

            expense(k + "e", naming, cat, "5.00").expectStatus().isOk();
            batch(k + "b", naming, cat, "6.00").expectStatus().isOk();
            splitExpense(k + "s", naming, cat, cat).expectStatus().isOk();
            // A request that names the other class is a different request.
            assertConflict(post(account, "expenses", k + "e", """
                    {"description": "Replay", "amount": "5.00", "occurredOn": "2026-09-07", %s,
                     "classification": "discretionary", "enteredByMemberId": "%s"}"""
                    .formatted(named(naming, cat), samId)));
        }
    }

    @Order(4)
    @Test
    @DisplayName("V2_EXPENSE_011 a retry of a reminder replays after its due date has passed; a new key is refused")
    void retryAfterDueDatePassed() {
        clock.setToday(LocalDate.of(2026, 9, 10));
        post(account, "reminders", "due-r", dueReminder("2026-09-11")).expectStatus().isCreated();
        // 21 hours later it is the due date: no longer "after today", and the save key is still alive.
        clock.setAt(LocalDate.of(2026, 9, 11), java.time.LocalTime.of(8, 0));
        try {
            post(account, "reminders", "due-r", dueReminder("2026-09-11")).expectStatus().isOk();
            post(account, "reminders", "due-r2", dueReminder("2026-09-11")).expectStatus().isBadRequest();
        } finally {
            clock.setToday(LocalDate.of(2026, 9, 10));
        }
    }

    @Order(5)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a retry of an entry, batch, split, reminder and historical entry by a "
            + "member deactivated since replays; a new key is refused")
    void retryAfterMemberDeactivated() {
        String cat = "MemberRetry";
        create(cat);
        // The earlier tests moved these accounts' tracking start; a second move to the same date is a no-op.
        historyAccounts = new String[] {account("Replay Member Name", "5000.00"),
                account("Replay Member Id", "5000.00")};
        for (Naming naming : Naming.values()) {
            String k = "member-" + naming + "-";
            expense(k + "e", naming, cat, "5.00").expectStatus().isCreated();
            batch(k + "b", naming, cat, "6.00").expectStatus().isCreated();
            reminder(k + "r", naming, cat, "8.00").expectStatus().isCreated();
            splitExpense(k + "s", naming, cat, cat).expectStatus().isCreated();
            historical(k + "h", naming, cat, "7.00").expectStatus().isCreated();
        }
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            for (Naming naming : Naming.values()) {
                String k = "member-" + naming + "-";
                expense(k + "e", naming, cat, "5.00").expectStatus().isOk();
                batch(k + "b", naming, cat, "6.00").expectStatus().isOk();
                reminder(k + "r", naming, cat, "8.00").expectStatus().isOk();
                splitExpense(k + "s", naming, cat, cat).expectStatus().isOk();
                historical(k + "h", naming, cat, "7.00").expectStatus().isOk();
                expense(k + "e2", naming, cat, "5.00").expectStatus().isBadRequest();
                batch(k + "b2", naming, cat, "6.00").expectStatus().isBadRequest();
                reminder(k + "r2", naming, cat, "8.00").expectStatus().isBadRequest();
            }
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
    }

    @Order(6)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a retry with another member or another category is still a different "
            + "request (409), so the replay never accepts a different save")
    void differentDetailsStillConflict() {
        String cat = "DiffRetry";
        create(cat);
        create("DiffOther");
        expense("diff-e", Naming.BY_NAME, cat, "5.00").expectStatus().isCreated();
        assertConflict(expense("diff-e", Naming.BY_NAME, "DiffOther", "5.00"));
        assertConflict(post(account, "expenses", "diff-e", entry(mayaId, "Replay", "5.00", "2026-09-07", cat)));
        archiveCategory(cat);
        assertConflict(expense("diff-e", Naming.BY_NAME, "DiffOther", "5.00"));
    }

    private String dueReminder(String dueOn) {
        return """
                {"kind": "expense", "description": "Replay due", "amount": "9.00", "dueOn": "%s",
                 "category": "Utilities", "enteredByMemberId": "%s"}""".formatted(dueOn, samId);
    }

    private int count() {
        java.util.concurrent.atomic.AtomicInteger n = new java.util.concurrent.atomic.AtomicInteger();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$.length()").value(Integer.class, n::set);
        return n.get();
    }
}
