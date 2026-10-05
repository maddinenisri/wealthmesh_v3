package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;
import reactor.core.publisher.Mono;

/**
 * Edit as replacement that moves an entry to another account (slice 06, group C). The race tests hold an uncommitted
 * write on a second connection, so each fails when the lock it claims is taken out.
 */
class MoveEntryApiTests extends LedgerApiTestBase {

    private static String checking;
    private static String savings;

    @Order(0)
    @Test
    @DisplayName("set up checking 5000.00 and savings 10000.00 on 2026-09-01, today 2026-10-03")
    void setUp() {
        household();
        checking = account("Everyday Checking", "5000.00");
        savings = savings("Emergency Savings", "10000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_EXPENSE_007 preview, then move Rent to savings on 2026-10-02: Balances, months, history")
    void moveExpense() {
        String rent = expense(checking, "k-rent", "Rent", "1500.00", "2026-09-03");
        assertBalance(checking, "3500.00");
        preview(checking, rent, savings, "1500.00", "2026-10-02", "Rent").expectStatus().isOk().expectBody()
                .jsonPath("$.from.name").isEqualTo("Everyday Checking")
                .jsonPath("$.from.balanceAfter").isEqualTo("5000.00")
                .jsonPath("$.to.name").isEqualTo("Emergency Savings")
                .jsonPath("$.to.balanceAfter").isEqualTo("8500.00")
                .jsonPath("$.oldMonth.month").isEqualTo("2026-09")
                .jsonPath("$.oldMonth.after").isEqualTo("0.00")
                .jsonPath("$.newMonth.month").isEqualTo("2026-10")
                .jsonPath("$.newMonth.after").isEqualTo("1500.00");
        // The preview is informational: nothing changed.
        assertBalance(checking, "3500.00");
        assertBalance(savings, "10000.00");

        replace(checking, rent, "k-move-rent", savings, "Rent", "1500.00", "2026-10-02",
                "Correct payment account and date").expectStatus().isCreated();
        assertBalance(checking, "5000.00");
        assertBalance(savings, "8500.00");
        assertActivityCount(checking, 0);
        assertActivityCount(savings, 1);
        month("spending", "2026-09", "0.00");
        month("spending", "2026-10", "1500.00");

        // The target's history carries the original's account, date, amount, who, when and the reason.
        history(savings).expectBody()
                .jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].reason").isEqualTo("Correct payment account and date")
                .jsonPath("$[0].enteredByName").isEqualTo("Maya")
                .jsonPath("$[0].replaces.accountName").isEqualTo("Everyday Checking")
                .jsonPath("$[0].replaces.occurredOn").isEqualTo("2026-09-03")
                .jsonPath("$[0].replaces.amount").isEqualTo("1500.00")
                .jsonPath("$[0].replaces.enteredByName").isEqualTo("Sam")
                .jsonPath("$[0].replaces.at").isNotEmpty();
        // The source keeps the original, replaced, with where it went.
        history(checking).expectBody()
                .jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].status").isEqualTo("replaced")
                .jsonPath("$[0].replacedBy.accountName").isEqualTo("Emergency Savings")
                .jsonPath("$[0].events[0].action").isEqualTo("replaced");
    }

    @Order(2)
    @Test
    @DisplayName("V2_INCOME_003 preview, cancel changes nothing, then Salary becomes Bonus in savings")
    void moveIncome() {
        String salary = income(checking, "k-salary", "Salary", "6000.00", "2026-09-02");
        assertBalance(checking, "11000.00");
        preview(checking, salary, savings, "6200.00", "2026-10-02", "Bonus").expectStatus().isOk().expectBody()
                .jsonPath("$.from.balanceAfter").isEqualTo("5000.00")
                .jsonPath("$.to.balanceAfter").isEqualTo("14700.00")
                .jsonPath("$.oldMonth.after").isEqualTo("0.00")
                .jsonPath("$.newMonth.after").isEqualTo("6200.00");
        // Cancel is the absence of a save: the original stays as it was.
        assertBalance(checking, "11000.00");
        assertBalance(savings, "8500.00");
        month("income", "2026-09", "6000.00");

        replace(checking, salary, "k-move-salary", savings, "Bonus", "6200.00", "2026-10-02", "Correct pay details")
                .expectStatus().isCreated().expectBody()
                .jsonPath("$.accountId").isEqualTo(savings)
                .jsonPath("$.categoryName").isEqualTo("Bonus")
                .jsonPath("$.amount").isEqualTo("6200.00");
        assertBalance(checking, "5000.00");
        assertBalance(savings, "14700.00");
        month("income", "2026-09", "0.00");
        month("income", "2026-10", "6200.00");
        history(savings).expectBody()
                .jsonPath("$[?(@.categoryName=='Bonus')].reason").isEqualTo("Correct pay details")
                .jsonPath("$[?(@.categoryName=='Bonus')].replaces.accountName").isEqualTo("Everyday Checking");
    }

    @Order(3)
    @Test
    @DisplayName("a repeated move replays once; the same key with another target is 409; a replaced entry cannot move")
    void repeatsAndConflicts() {
        String other = savings("Holiday Savings", "100.00", "2026-09-01");
        String groceries = expense(checking, "k-g", "Groceries", "40.00", "2026-09-05");
        replace(checking, groceries, "k-move-g", savings, "Groceries", "40.00", "2026-09-06", "Moved")
                .expectStatus().isCreated();
        replace(checking, groceries, "k-move-g", savings, "Groceries", "40.00", "2026-09-06", "Moved")
                .expectStatus().isOk();
        replace(checking, groceries, "k-move-g", other, "Groceries", "40.00", "2026-09-06", "Moved")
                .expectStatus().isEqualTo(409);
        replace(checking, groceries, "k-move-g2", other, "Groceries", "40.00", "2026-09-06", "Again")
                .expectStatus().isEqualTo(409);
        assertBalance(other, "100.00");
        assertBalance(savings, "14660.00");
    }

    @Order(4)
    @Test
    @DisplayName("the server refuses a target that is unknown, a date before the target's start, or a bad body")
    void guards() {
        String young = accountOpenedOn("Young Savings", "500.00", "2026-09-20");
        String dining = expense(checking, "k-d", "Dining", "20.00", "2026-09-25");
        replace(checking, dining, "k-bad-target", UUID.randomUUID().toString(), "Dining", "20.00", "2026-09-25", "x")
                .expectStatus().isNotFound();
        replace(checking, dining, "k-early", young, "Dining", "20.00", "2026-09-10", "x").expectStatus()
                .isBadRequest();
        replace(checking, dining, "k-zero", savings, "Dining", "0.00", "2026-09-25", "x").expectStatus()
                .isBadRequest();
        replace(checking, dining, "k-wrong-kind", savings, "Salary", "20.00", "2026-09-25", "x").expectStatus()
                .isBadRequest();
        assertBalance(young, "500.00");
        assertActivityCount(young, 0);
        month("spending", "2026-09", "60.00"); // Groceries 40.00 (moved, same month) and Dining 20.00
        preview(checking, dining, UUID.randomUUID().toString(), "20.00", "2026-09-25", "Dining").expectStatus()
                .isNotFound();
    }

    @Order(5)
    @Test
    @DisplayName("a move waits for the target account's lock and then judges the target's start as it is now")
    void moveWaitsForTargetAndRechecksStart() throws Exception {
        String target = accountOpenedOn("Race Target", "1000.00", "2026-09-01");
        String lunch = expense(checking, "k-lunch", "Dining", "15.00", "2026-09-12");
        Connection other = hold(target, "UPDATE wealthmesh.account SET opened_on = DATE '2026-09-20' WHERE id = $1");
        try {
            CompletableFuture<Integer> move = async(() -> replace(checking, lunch, "k-race-start", target, "Dining",
                    "15.00", "2026-09-12", "Race").returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            assertThat(move).as("the move waits for the target account's lock").isNotDone();
            commit(other);
            // The start moved to 2026-09-20 while the move waited: it must not land before it.
            assertThat(move.get(10, TimeUnit.SECONDS)).isIn(400, 409);
        } finally {
            close(other);
        }
        assertActivityCount(target, 0);
        assertBalance(target, "1000.00");
        month("spending", "2026-09", "75.00");
    }

    @Order(6)
    @Test
    @DisplayName("a move waits for the source account's lock too, so a writer holding the source finishes first")
    void moveWaitsForSource() throws Exception {
        String target = accountOpenedOn("Source Race Target", "1000.00", "2026-09-01");
        String tea = expense(checking, "k-tea", "Dining", "5.00", "2026-09-13");
        Connection other = hold(checking, "SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE");
        try {
            CompletableFuture<Integer> move = async(() -> replace(checking, tea, "k-src", target, "Dining", "5.00",
                    "2026-09-13", "Race").returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            assertThat(move).as("the move waits for the source account's lock").isNotDone();
            commit(other);
            assertThat(move.get(10, TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            close(other);
        }
        assertBalance(target, "995.00");
    }

    @Order(7)
    @Test
    @DisplayName("two moves of one entry at once to different accounts: one wins, the other is 409, and it counts once")
    void twoMovesOfOneEntry() throws Exception {
        String a = accountOpenedOn("Race A", "100.00", "2026-09-01");
        String b = accountOpenedOn("Race B", "100.00", "2026-09-01");
        String fee = expense(checking, "k-fee", "Bank fees", "3.00", "2026-09-14");
        Connection other = hold(checking, "SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE");
        List<CompletableFuture<Integer>> moves = new ArrayList<>();
        try {
            moves.add(async(() -> replace(checking, fee, "k-fa", a, "Bank fees", "3.00", "2026-09-14", "A")
                    .returnResult(String.class).getStatus().value()));
            moves.add(async(() -> replace(checking, fee, "k-fb", b, "Bank fees", "3.00", "2026-09-14", "B")
                    .returnResult(String.class).getStatus().value()));
            Thread.sleep(700);
            assertThat(moves).allSatisfy(m -> assertThat(m).isNotDone());
            commit(other);
        } finally {
            close(other);
        }
        List<Integer> statuses = new ArrayList<>();
        for (CompletableFuture<Integer> m : moves) {
            statuses.add(m.get(10, TimeUnit.SECONDS));
        }
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        assertThat(Double.parseDouble(balanceOf(a)) + Double.parseDouble(balanceOf(b))).isEqualTo(197.0);
    }

    @Order(8)
    @Test
    @DisplayName("opposite moves between two accounts at once never deadlock: accounts are locked in id order")
    void oppositeMovesDoNotDeadlock() throws Exception {
        String a = accountOpenedOn("Opp A", "1000.00", "2026-09-01");
        String b = accountOpenedOn("Opp B", "1000.00", "2026-09-01");
        List<String[]> entries = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            entries.add(new String[] { expense(a, "k-oa" + i, "Dining", "1.00", "2026-09-15"),
                    expense(b, "k-ob" + i, "Dining", "1.00", "2026-09-15") });
        }
        List<CompletableFuture<Integer>> moves = new ArrayList<>();
        for (int i = 0; i < entries.size(); i++) {
            String[] pair = entries.get(i);
            String k = "k-opp" + i;
            moves.add(async(() -> replace(a, pair[0], k + "a", b, "Dining", "1.00", "2026-09-15", "A to B")
                    .returnResult(String.class).getStatus().value()));
            moves.add(async(() -> replace(b, pair[1], k + "b", a, "Dining", "1.00", "2026-09-15", "B to A")
                    .returnResult(String.class).getStatus().value()));
        }
        for (CompletableFuture<Integer> m : moves) {
            assertThat(m.get(20, TimeUnit.SECONDS)).isEqualTo(201);
        }
        assertBalance(a, "992.00");
        assertBalance(b, "992.00");
    }

    @Order(9)
    @Test
    @DisplayName("a retry after the target's ledger changed replays the stored move")
    void retryAfterLedgerChanged() {
        String target = accountOpenedOn("Retry Target", "100.00", "2026-09-01");
        String snack = expense(checking, "k-snack", "Dining", "7.00", "2026-09-16");
        replace(checking, snack, "k-retry", target, "Dining", "7.00", "2026-09-16", "Move").expectStatus()
                .isCreated();
        expense(target, "k-after", "Groceries", "10.00", "2026-09-17");
        replace(checking, snack, "k-retry", target, "Dining", "7.00", "2026-09-16", "Move").expectStatus().isOk();
        assertBalance(target, "83.00");
        assertActivityCount(target, 2);
    }

    @Order(10)
    @Test
    @DisplayName("every other writer of an account row takes the lock a move holds: expense, Undo, start move, "
            + "Balance correction and historical entry each wait for it")
    void otherWritersTakeTheSameLock() throws Exception {
        String target = accountOpenedOn("Writers Target", "1000.00", "2026-09-01");
        String removed = expense(target, "k-w-removed", "Dining", "9.00", "2026-09-18");
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", target, removed)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId))
                .exchange().expectStatus().isOk();
        List<java.util.function.Supplier<WebTestClient.ResponseSpec>> writers = List.of(
                () -> post(target, "expenses", "k-w-plain", entry(samId, "Tea", "4.00", "2026-09-19", "Dining")),
                () -> webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/undo", target, removed)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId)).exchange(),
                () -> post(target, "starting-balance-corrections", "k-w-start", """
                        {"openingAmount": "1100.00", "openedOn": "2026-09-01", "reason": "x",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)),
                () -> post(target, "balance-corrections", "k-w-correction", """
                        {"requestedBalance": "2000.00", "asOn": "2026-09-30", "reason": "x",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)),
                () -> post(target, "historical-entries", "k-w-hist", """
                        {"kind": "expense", "entry": {"description": "Rent", "amount": "10.00",
                          "occurredOn": "2026-08-20", "category": "Rent", "enteredByMemberId": "%s"},
                         "startRevision": {"openingAmount": "1000.00", "openedOn": "2026-08-20", "reason": "x",
                          "enteredByMemberId": "%s"}}""".formatted(mayaId, mayaId)));
        for (int i = 0; i < writers.size(); i++) {
            var writer = writers.get(i);
            Connection other = hold(target, "SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE");
            try {
                CompletableFuture<Integer> call = async(() -> writer.get().returnResult(String.class).getStatus()
                        .value());
                Thread.sleep(500);
                assertThat(call).as("writer %d waits for the account lock", i).isNotDone();
                commit(other);
                assertThat(call.get(10, TimeUnit.SECONDS)).as("writer %d finishes after it", i).isIn(200, 201);
            } finally {
                close(other);
            }
        }
    }

    @Order(11)
    @Test
    @DisplayName("a Balance correction can be replaced by its fee but never moved to another account")
    void correctionStaysOnItsAccount() {
        String own = accountOpenedOn("Correction Checking", "1000.00", "2026-09-01");
        String other = accountOpenedOn("Correction Other", "1000.00", "2026-09-01");
        post(own, "balance-corrections", "k-corr", """
                {"requestedBalance": "950.00", "asOn": "2026-09-20", "reason": "Unexplained",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated();
        AtomicReference<String> correction = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", own).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, correction::set);
        replace(own, correction.get(), "k-corr-move", other, "Bank fees", "50.00", "2026-09-20", "Fee")
                .expectStatus().isBadRequest();
        assertBalance(own, "950.00");
        assertBalance(other, "1000.00");
        replace(own, correction.get(), "k-corr-fee", own, "Bank fees", "50.00", "2026-09-20", "Fee")
                .expectStatus().isCreated();
        assertBalance(own, "950.00");
    }

    @Order(12)
    @Test
    @DisplayName("a member deactivated while the move waits is refused as who entered it")
    void inactiveEntererIsCheckedUnderTheLock() throws Exception {
        String target = accountOpenedOn("Enterer Target", "1000.00", "2026-09-01");
        String item = expense(checking, "k-enterer", "Dining", "2.00", "2026-09-21");
        Connection other = hold(target, "SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE");
        Mono.from(other.createStatement("UPDATE wealthmesh.household_member SET active = false WHERE id = $1")
                .bind(0, UUID.fromString(mayaId)).execute()).flatMap(r -> Mono.from(r.getRowsUpdated())).block();
        try {
            CompletableFuture<Integer> move = async(() -> replace(checking, item, "k-enterer-move", target, "Dining",
                    "2.00", "2026-09-21", "Move").returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            assertThat(move).isNotDone();
            commit(other);
            assertThat(move.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(other);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus()
                    .isOk();
        }
        assertActivityCount(target, 0);
    }

    @Order(13)
    @Test
    @DisplayName("the same key sent twice at once saves once and replays: 201 and 200, never a 409")
    void sameKeyAtOnce() throws Exception {
        String target = accountOpenedOn("Key Target", "1000.00", "2026-09-01");
        String item = expense(checking, "k-twice", "Dining", "3.00", "2026-09-22");
        Connection other = hold(checking, "SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE");
        List<CompletableFuture<Integer>> calls = new ArrayList<>();
        try {
            for (int i = 0; i < 2; i++) {
                calls.add(async(() -> replace(checking, item, "k-twice-move", target, "Dining", "3.00",
                        "2026-09-22", "Move").returnResult(String.class).getStatus().value()));
            }
            Thread.sleep(700);
            commit(other);
        } finally {
            close(other);
        }
        List<Integer> statuses = new ArrayList<>();
        for (CompletableFuture<Integer> call : calls) {
            statuses.add(call.get(10, TimeUnit.SECONDS));
        }
        assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        assertBalance(target, "997.00");
    }

    @Order(14)
    @Test
    @DisplayName("an entry removed while the move waits is not moved: 409, Balances stay as the removal left them")
    void removeRacesMove() throws Exception {
        String target = accountOpenedOn("Remove Target", "1000.00", "2026-09-01");
        String item = expense(checking, "k-remove-race", "Dining", "4.00", "2026-09-23");
        Connection other = hold(item, "UPDATE wealthmesh.activity SET removed_at = now() WHERE id = $1");
        try {
            CompletableFuture<Integer> move = async(() -> replace(checking, item, "k-remove-move", target, "Dining",
                    "4.00", "2026-09-23", "Move").returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            assertThat(move).isNotDone();
            commit(other);
            assertThat(move.get(10, TimeUnit.SECONDS)).isEqualTo(409);
        } finally {
            close(other);
        }
        assertBalance(target, "1000.00");
        assertActivityCount(target, 0);
    }

    // ---- helpers ----

    private String expense(String account, String key, String category, String amount, String date) {
        return create(account, "expenses", key, category, amount, date, samId);
    }

    private String income(String account, String key, String category, String amount, String date) {
        return create(account, "income", key, category, amount, date, samId);
    }

    private String create(String account, String path, String key, String category, String amount, String date,
            String member) {
        AtomicReference<String> id = new AtomicReference<>();
        post(account, path, key, entry(member, category, amount, date, category)).expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private WebTestClient.ResponseSpec replace(String account, String activity, String key, String target,
            String category, String amount, String date, String reason) {
        return webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", account, activity)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue("""
                        {"accountId": "%s", "description": "%s", "amount": "%s", "occurredOn": "%s",
                         "category": "%s", "enteredByMemberId": "%s", "reason": "%s"}"""
                        .formatted(target, category, amount, date, category, mayaId, reason))
                .exchange();
    }

    private WebTestClient.ResponseSpec preview(String account, String activity, String target, String amount,
            String date, String category) {
        return webTestClient.get().uri(
                "/api/v1/accounts/{a}/activity/{id}/replacement/preview?targetAccountId={t}&amount={m}&occurredOn={d}",
                account, activity, target, amount, date).exchange();
    }

    private WebTestClient.ResponseSpec history(String account) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange()
                .expectStatus().isOk();
    }

    private void month(String kind, String month, String total) {
        String path = "income".equals(kind) ? "/api/v1/income?month=" : "/api/v1/spending?month=";
        webTestClient.get().uri(path + month).exchange().expectBody().jsonPath("$.total").isEqualTo(total);
    }

    private String balanceOf(String account) {
        AtomicReference<String> balance = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}", account).exchange().expectBody()
                .jsonPath("$.balance.amount").value(String.class, balance::set);
        return balance.get();
    }

    private <T> CompletableFuture<T> async(java.util.function.Supplier<T> call) {
        return CompletableFuture.supplyAsync(call);
    }

    /** Holds the statement uncommitted and also the account row lock, whatever the statement did. */
    private Connection hold(String account, String sql) {
        Connection connection = holdUncommitted(sql, account);
        Mono.from(connection.createStatement("SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE")
                .bind(0, UUID.fromString(account)).execute()).flatMap(r -> Mono.from(r.getRowsUpdated())).block();
        return connection;
    }

}
