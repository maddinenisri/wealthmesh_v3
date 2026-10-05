package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;
import reactor.core.publisher.Mono;

/**
 * Races on the rows a transfer changes (slice 07 inventory). Each test holds an uncommitted write or lock on a second
 * connection, starts the request, asserts it is still waiting, releases, and asserts the outcome. Each fails when the
 * lock it claims is taken out of the service; random timing proves nothing.
 */
class TransferRaceApiTests extends TransferTestBase {

    private static final String DATE = "2026-09-10";
    private static int n;

    @Order(0)
    @Test
    @DisplayName("set up a household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_SAVINGS_002 V2_CHECKING_010 a new transfer waits for the lock on the source and on the "
            + "destination, each on its own")
    void createWaitsForBothAccounts() throws Exception {
        for (int side = 0; side < 2; side++) {
            String a = savings("Create A" + side, "100.00", "2026-09-01");
            String b = savings("Create B" + side, "100.00", "2026-09-01");
            int status = waitsFor(side == 0 ? a : b, () -> postTransfer(key(), a, b, "1.00", DATE, mayaId));
            assertThat(status).as("side %d", side).isEqualTo(201);
            assertBalance(a, "99.00");
            assertBalance(b, "101.00");
        }
    }

    @Order(2)
    @Test
    @DisplayName("V2_TRANSFER_001 a change waits for the lock on the old destination, the new destination and the "
            + "source")
    void replaceWaitsForEveryAccount() throws Exception {
        for (int held = 0; held < 3; held++) {
            String a = savings("Replace A" + held, "100.00", "2026-09-01");
            String b = savings("Replace B" + held, "100.00", "2026-09-01");
            String c = savings("Replace C" + held, "100.00", "2026-09-01");
            String movement = transfer(key(), a, b, "10.00", DATE);
            String locked = held == 0 ? a : held == 1 ? b : c;
            int status = waitsFor(locked, () -> replaceTransfer(movement, key(), a, c, "5.00", DATE, "Move"));
            assertThat(status).as("held account %d", held).isEqualTo(201);
            assertBalance(a, "95.00");
            assertBalance(b, "100.00");
            assertBalance(c, "105.00");
        }
    }

    @Order(3)
    @Test
    @DisplayName("V2_TRANSFER_002 V2_EXPENSE_008 removal, Undo and the change of an expense each wait for the lock on "
            + "both accounts")
    void removeUndoConvertWait() throws Exception {
        for (int side = 0; side < 2; side++) {
            String a = savings("Rm A" + side, "100.00", "2026-09-01");
            String b = savings("Rm B" + side, "100.00", "2026-09-01");
            String locked = side == 0 ? a : b;
            String movement = transfer(key(), a, b, "10.00", DATE);
            assertThat(waitsFor(locked, () -> removeTransfer(movement, mayaId))).as("remove %d", side).isEqualTo(200);
            assertBalance(a, "100.00");
            assertThat(waitsFor(locked, () -> undoTransfer(movement, mayaId))).as("undo %d", side).isEqualTo(200);
            assertBalance(a, "90.00");
            String bill = expense(a, key(), "Dining", "3.00", DATE);
            assertThat(waitsFor(locked, () -> convert(a, bill, key(), b, mayaId, "It was a transfer")))
                    .as("convert %d", side).isEqualTo(201);
            assertBalance(a, "87.00");
            assertBalance(b, "113.00");
        }
    }

    @Order(4)
    @Test
    @DisplayName("V2_SAVINGS_010 V2_TRANSFER_001 V2_EXPENSE_008 the date is judged against the destination's start as "
            + "it is after the wait: create, change and "
            + "convert are refused when the start moved while they waited")
    void startMovedWhileWaiting() throws Exception {
        for (int kind = 0; kind < 3; kind++) {
            String a = savings("Start A" + kind, "100.00", "2026-09-01");
            String b = savings("Start B" + kind, "100.00", "2026-09-01");
            String c = savings("Start C" + kind, "100.00", "2026-09-01");
            String movement = transfer(key(), a, b, "10.00", DATE);
            String bill = expense(a, key(), "Dining", "3.00", DATE);
            Supplier<WebTestClient.ResponseSpec> call = switch (kind) {
                case 0 -> () -> postTransfer(key(), a, c, "1.00", DATE, mayaId);
                case 1 -> () -> replaceTransfer(movement, key(), a, c, "5.00", DATE, "Move");
                default -> () -> convert(a, bill, key(), c, mayaId, "It was a transfer");
            };
            Connection other = hold(c, "UPDATE wealthmesh.account SET opened_on = DATE '2026-09-20' WHERE id = $1");
            try {
                CompletableFuture<Integer> status = async(() -> statusOf(call.get()));
                Thread.sleep(600);
                assertThat(status).as("kind %d waits", kind).isNotDone();
                commit(other);
                assertThat(status.get(10, TimeUnit.SECONDS)).as("kind %d", kind).isEqualTo(400);
            } finally {
                close(other);
            }
            assertBalance(c, "100.00");
            assertActivityCount(c, 0);
        }
    }

    @Order(5)
    @Test
    @DisplayName("V2_TRANSFER_001 V2_TRANSFER_002 a member deactivated while a save, change, removal or Undo waits is "
            + "refused under the lock")
    void memberDeactivatedWhileWaiting() throws Exception {
        for (int kind = 0; kind < 4; kind++) {
            String a = savings("Member A" + kind, "100.00", "2026-09-01");
            String b = savings("Member B" + kind, "100.00", "2026-09-01");
            String movement = transfer(key(), a, b, "10.00", DATE);
            if (kind == 3) {
                removeTransfer(movement, mayaId).expectStatus().isOk();
            }
            Supplier<WebTestClient.ResponseSpec> run = switch (kind) {
                case 0 -> () -> postTransfer(key(), a, b, "1.00", DATE, samId);
                case 1 -> () -> webTestClient.post().uri("/api/v1/transfers/{id}/replacement", movement)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key())
                        .bodyValue(body(a, b, "5.00", DATE, samId, null)).exchange();
                case 2 -> () -> removeTransfer(movement, samId);
                default -> () -> undoTransfer(movement, samId);
            };
            Connection other = holdLock(a);
            Mono.from(other.createStatement("UPDATE wealthmesh.household_member SET active = false WHERE id = $1")
                    .bind(0, UUID.fromString(samId)).execute()).flatMap(r -> Mono.from(r.getRowsUpdated())).block();
            try {
                CompletableFuture<Integer> status = async(() -> statusOf(run.get()));
                Thread.sleep(600);
                assertThat(status).as("kind %d waits", kind).isNotDone();
                commit(other);
                assertThat(status.get(10, TimeUnit.SECONDS)).as("kind %d", kind).isEqualTo(400);
            } finally {
                close(other);
                webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                        .isOk();
            }
        }
    }

    @Order(6)
    @Test
    @DisplayName("V2_SAVINGS_006 opposite and circular transfers at once never deadlock: accounts are locked in id "
            + "order")
    void noDeadlock() throws Exception {
        String a = savings("Cycle A", "1000.00", "2026-09-01");
        String b = savings("Cycle B", "1000.00", "2026-09-01");
        String c = savings("Cycle C", "1000.00", "2026-09-01");
        List<CompletableFuture<Integer>> calls = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            calls.add(async(() -> statusOf(postTransfer(key(), a, b, "1.00", DATE, mayaId))));
            calls.add(async(() -> statusOf(postTransfer(key(), b, a, "1.00", DATE, mayaId))));
            calls.add(async(() -> statusOf(postTransfer(key(), b, c, "1.00", DATE, mayaId))));
            calls.add(async(() -> statusOf(postTransfer(key(), c, a, "1.00", DATE, mayaId))));
            calls.add(async(() -> statusOf(postTransfer(key(), a, c, "1.00", DATE, mayaId))));
        }
        for (CompletableFuture<Integer> call : calls) {
            assertThat(call.get(30, TimeUnit.SECONDS)).isEqualTo(201);
        }
        // Every transfer moves money between two of the three accounts, so the sum cannot change.
        double total = Double.parseDouble(balanceOf(a)) + Double.parseDouble(balanceOf(b))
                + Double.parseDouble(balanceOf(c));
        assertThat(total).isEqualTo(3000.0);
        // Per round: a nets 0, b gives one more than it gets, c gets one more than it gives.
        assertBalance(a, "1000.00");
        assertBalance(b, "994.00");
        assertBalance(c, "1006.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_SAVINGS_002 the same key sent twice at once saves one transfer: 201 and 200, never a 409; a "
            + "retry after the "
            + "ledger changed replays")
    void sameKeyAtOnceAndRetry() throws Exception {
        String a = savings("Key A", "100.00", "2026-09-01");
        String b = savings("Key B", "100.00", "2026-09-01");
        String k = key();
        Connection other = holdLock(a);
        List<CompletableFuture<Integer>> calls = new ArrayList<>();
        try {
            for (int i = 0; i < 2; i++) {
                calls.add(async(() -> statusOf(postTransfer(k, a, b, "4.00", DATE, mayaId))));
            }
            Thread.sleep(700);
            calls.forEach(call -> assertThat(call).isNotDone());
            commit(other);
        } finally {
            close(other);
        }
        List<Integer> statuses = new ArrayList<>();
        for (CompletableFuture<Integer> call : calls) {
            statuses.add(call.get(10, TimeUnit.SECONDS));
        }
        assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        assertBalance(a, "96.00");
        assertBalance(b, "104.00");
        assertActivityCount(a, 1);

        // The ledger changes (a later entry; a member leaves), then the client retries: same answer, nothing new.
        expense(b, key(), "Dining", "1.00", "2026-09-12");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", mayaId).exchange().expectStatus().isOk();
        try {
            postTransfer(k, a, b, "4.00", DATE, mayaId).expectStatus().isOk();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus().isOk();
        }
        assertBalance(a, "96.00");
        assertBalance(b, "103.00");
        assertActivityCount(a, 1);
    }

    @Order(8)
    @Test
    @DisplayName("V2_TRANSFER_002 two removals, two Undos, and a removal against a change of one transfer at once: "
            + "one wins, the "
            + "other is 409, and the pair is never half changed")
    void onePairOneWinner() throws Exception {
        String a = savings("Pair A", "100.00", "2026-09-01");
        String b = savings("Pair B", "100.00", "2026-09-01");

        String first = transfer(key(), a, b, "10.00", DATE);
        assertThat(both(a, () -> removeTransfer(first, mayaId), () -> removeTransfer(first, mayaId)))
                .containsExactlyInAnyOrder(200, 409);
        assertBalance(a, "100.00");
        assertThat(both(a, () -> undoTransfer(first, mayaId), () -> undoTransfer(first, mayaId)))
                .containsExactlyInAnyOrder(200, 409);
        assertBalance(a, "90.00");
        assertBalance(b, "110.00");

        List<Integer> mixed = both(a, () -> removeTransfer(first, mayaId),
                () -> replaceTransfer(first, key(), a, b, "20.00", DATE, "Bigger"));
        assertThat(mixed).containsAnyOf(200, 201).contains(409);
        // Exactly one effective transfer is left, and both Balances agree with it.
        assertActivityCount(a, mixed.contains(201) ? 1 : 0);
        assertActivityCount(b, mixed.contains(201) ? 1 : 0);
        assertBalance(a, mixed.contains(201) ? "80.00" : "100.00");
        assertBalance(b, mixed.contains(201) ? "120.00" : "100.00");
    }

    @Order(9)
    @Test
    @DisplayName("V2_EXPENSE_008 changing an expense to a transfer at once with editing it, or after it was removed: "
            + "one wins and "
            + "the expense counts once")
    void convertRacesTheExpense() throws Exception {
        String a = savings("Conv A", "100.00", "2026-09-01");
        String b = savings("Conv B", "100.00", "2026-09-01");
        String edited = expense(a, key(), "Dining", "5.00", DATE);
        List<Integer> statuses = both(a, () -> convert(a, edited, key(), b, mayaId, "It was a transfer"),
                () -> webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", a, edited)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key())
                        .bodyValue("""
                                {"description": "x", "amount": "6.00", "occurredOn": "%s", "category": "Dining",
                                 "enteredByMemberId": "%s"}""".formatted(DATE, mayaId)).exchange());
        assertThat(statuses).contains(409);
        assertThat(statuses.stream().filter(s -> s == 201).count()).isEqualTo(1);
        // Either the transfer took the expense (a down 5, b up 5) or the edit did (a down 6).
        assertThat(balanceOf(a)).isIn("95.00", "94.00");

        String removed = expense(a, key(), "Dining", "7.00", DATE);
        Connection other = hold(removed, "UPDATE wealthmesh.activity SET removed_at = now() WHERE id = $1");
        try {
            CompletableFuture<Integer> convert = async(() -> statusOf(convert(a, removed, key(), b, mayaId, "Late")));
            Thread.sleep(700);
            assertThat(convert).as("the change waits for the removal still being written").isNotDone();
            commit(other);
            assertThat(convert.get(10, TimeUnit.SECONDS)).isEqualTo(409);
        } finally {
            close(other);
        }
    }

    @Order(10)
    @Test
    @DisplayName("V2_SAVINGS_002 a start-date move and a transfer at once never leave a transfer dated before the "
            + "start")
    void startMoveRacesTransfer() throws Exception {
        String a = savings("Race A", "100.00", "2026-09-01");
        String b = savings("Race B", "100.00", "2026-09-01");
        List<Integer> statuses = both(b,
                () -> postTransfer(key(), a, b, "1.00", DATE, mayaId),
                () -> post(b, "starting-balance-corrections", key(), """
                        {"openingAmount": "100.00", "openedOn": "2026-09-20", "reason": "Later start",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)));
        assertThat(statuses.stream().filter(s -> s >= 200 && s < 300).count()).as("exactly one of the two")
                .isEqualTo(1);
        AtomicReference<String> openedOn = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}", b).exchange().expectBody()
                .jsonPath("$.openedOn").value(String.class, openedOn::set);
        AtomicReference<Integer> count = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", b).exchange().expectBody()
                .jsonPath("$.length()").value(Integer.class, count::set);
        // Either the start moved and no transfer was saved, or the transfer was saved and the start did not move.
        assertThat(openedOn.get().equals("2026-09-20") ? count.get() == 0 : count.get() == 1).isTrue();
    }

    @Order(11)
    @Test
    @DisplayName("V2_TRANSFER_001 V2_EXPENSE_008 a change and a change of an expense sent twice at once with one key "
            + "save once and replay: 201 and "
            + "200; a retry after the ledger changed replays too")
    void sameKeyAtOnceForChangeAndConversion() throws Exception {
        String a = savings("Twice A", "100.00", "2026-09-01");
        String b = savings("Twice B", "100.00", "2026-09-01");
        String movement = transfer(key(), a, b, "10.00", DATE);
        String changeKey = key();
        List<Integer> changes = both(a, () -> replaceTransfer(movement, changeKey, a, b, "20.00", DATE, "More"),
                () -> replaceTransfer(movement, changeKey, a, b, "20.00", DATE, "More"));
        assertThat(changes).containsExactlyInAnyOrder(200, 201);
        assertBalance(a, "80.00");
        assertBalance(b, "120.00");

        String bill = expense(a, key(), "Dining", "5.00", DATE);
        String convertKey = key();
        List<Integer> conversions = both(a, () -> convert(a, bill, convertKey, b, mayaId, "It was a transfer"),
                () -> convert(a, bill, convertKey, b, mayaId, "It was a transfer"));
        assertThat(conversions).containsExactlyInAnyOrder(200, 201);
        assertBalance(a, "75.00");
        assertBalance(b, "125.00");

        // The ledger moves on (a later entry, a member leaves); the retries still replay the stored answers.
        expense(b, key(), "Dining", "1.00", "2026-09-12");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", mayaId).exchange().expectStatus().isOk();
        try {
            replaceTransfer(movement, changeKey, a, b, "20.00", DATE, "More").expectStatus().isOk();
            convert(a, bill, convertKey, b, mayaId, "It was a transfer").expectStatus().isOk();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus().isOk();
        }
        assertBalance(a, "75.00");
        assertBalance(b, "124.00");
    }

    @Order(12)
    @Test
    @DisplayName("V2_TRANSFER_001 V2_TRANSFER_002 V2_EXPENSE_008 a member's deactivation still being written makes "
            + "every transfer writer wait on the member row itself, then refuse them")
    void memberRowIsLocked() throws Exception {
        for (int kind = 0; kind < 5; kind++) {
            String a = savings("Row A" + kind, "100.00", "2026-09-01");
            String b = savings("Row B" + kind, "100.00", "2026-09-01");
            String movement = transfer(key(), a, b, "10.00", DATE);
            String bill = expense(a, key(), "Dining", "3.00", DATE);
            if (kind == 4) {
                removeTransfer(movement, mayaId).expectStatus().isOk();
            }
            Supplier<WebTestClient.ResponseSpec> call = switch (kind) {
                case 0 -> () -> postTransfer(key(), a, b, "1.00", DATE, samId);
                case 1 -> () -> webTestClient.post().uri("/api/v1/transfers/{id}/replacement", movement)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key())
                        .bodyValue(body(a, b, "5.00", DATE, samId, null)).exchange();
                case 2 -> () -> removeTransfer(movement, samId);
                case 3 -> () -> convert(a, bill, key(), b, samId, "It was a transfer");
                default -> () -> undoTransfer(movement, samId);
            };
            // Only the member row is held: no account lock, so waiting proves the member is read FOR SHARE.
            Connection other = holdUncommitted("UPDATE wealthmesh.household_member SET active = false WHERE id = $1",
                    samId);
            try {
                CompletableFuture<Integer> status = async(() -> statusOf(call.get()));
                Thread.sleep(600);
                assertThat(status).as("kind %d waits for the member row", kind).isNotDone();
                commit(other);
                assertThat(status.get(10, TimeUnit.SECONDS)).as("kind %d", kind).isEqualTo(400);
            } finally {
                close(other);
                webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                        .isOk();
            }
        }
    }

    @Order(13)
    @Test
    @DisplayName("V2_TRANSFER_001 an account that cannot hold activity is refused even though the form hides it; "
            + "a preview of a removed transfer is refused")
    void typeRuleAndRemovedPreview() {
        String a = savings("Type A", "100.00", "2026-09-01");
        String b = savings("Type B", "100.00", "2026-09-01");
        Connection other = holdUncommitted("UPDATE wealthmesh.account SET type = 'credit_card' WHERE id = $1", b);
        commit(other);
        close(other);
        postTransfer(key(), a, b, "1.00", DATE, mayaId).expectStatus().isBadRequest();
        previewTransfer("fromAccountId=%s&toAccountId=%s&amount=1.00&occurredOn=%s".formatted(a, b, DATE))
                .expectStatus().isBadRequest();
        assertActivityCount(a, 0);

        String c = savings("Type C", "100.00", "2026-09-01");
        String d = savings("Type D", "100.00", "2026-09-01");
        String movement = transfer(key(), c, d, "10.00", DATE);
        removeTransfer(movement, mayaId).expectStatus().isOk();
        previewTransfer("fromAccountId=%s&toAccountId=%s&amount=5.00&occurredOn=%s&movementId=%s"
                .formatted(c, d, DATE, movement)).expectStatus().isEqualTo(409);
    }

    // ---- helpers ----

    private String key() {
        return "k-race-" + (++n);
    }

    /** Runs the call while a second connection holds the account's row lock; returns its status after release. */
    private int waitsFor(String lockedAccount, Supplier<WebTestClient.ResponseSpec> call) throws Exception {
        Connection other = holdLock(lockedAccount);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(call.get()));
            Thread.sleep(600);
            assertThat(status).as("the request waits for the account lock").isNotDone();
            commit(other);
            return status.get(10, TimeUnit.SECONDS);
        } finally {
            close(other);
        }
    }

    /** Starts two requests while the account's lock is held, releases it, and returns both statuses. */
    private List<Integer> both(String lockedAccount, Supplier<WebTestClient.ResponseSpec> first,
            Supplier<WebTestClient.ResponseSpec> second) throws Exception {
        Connection other = holdLock(lockedAccount);
        List<CompletableFuture<Integer>> calls = new ArrayList<>();
        try {
            calls.add(async(() -> statusOf(first.get())));
            calls.add(async(() -> statusOf(second.get())));
            Thread.sleep(700);
            calls.forEach(call -> assertThat(call).as("both wait for the lock").isNotDone());
            commit(other);
        } finally {
            close(other);
        }
        List<Integer> statuses = new ArrayList<>();
        for (CompletableFuture<Integer> call : calls) {
            statuses.add(call.get(15, TimeUnit.SECONDS));
        }
        return statuses;
    }

    private String balanceOf(String account) {
        AtomicReference<String> balance = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}", account).exchange().expectBody()
                .jsonPath("$.balance.amount").value(String.class, balance::set);
        return balance.get();
    }
}
