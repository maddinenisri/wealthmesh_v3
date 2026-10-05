package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
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

/**
 * Races on the rows a card payment changes (slice 08 inventory). Each test holds an uncommitted write or lock on a
 * second connection, starts the request, asserts it is still waiting, releases, and asserts the outcome. Each fails
 * when the lock it claims is taken out of the service.
 */
class CardPaymentRaceApiTests extends CardPaymentTestBase {

    private static final String DATE = "2026-09-10";

    @Order(0)
    @Test
    @DisplayName("set up a household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_CARD_006 a new payment waits for the lock on the bank account and on the card, each on its own")
    void createWaitsForBothAccounts() throws Exception {
        for (int side = 0; side < 2; side++) {
            String bank = account("Create Bank" + side, "500.00");
            String owed = card("Create Card" + side, "100.00", "owed", "2026-09-01");
            int status = waitsFor(side == 0 ? bank : owed,
                    () -> postPayment(key(), bank, owed, "10.00", DATE, mayaId));
            assertThat(status).as("side %d", side).isEqualTo(201);
            assertBalance(bank, "490.00");
            assertBalance(owed, "-90.00");
        }
    }

    @Order(2)
    @Test
    @DisplayName("V2_CARD_013 a change, removal and Undo each wait for the lock on the bank account and the card")
    void changeRemoveUndoWait() throws Exception {
        for (int side = 0; side < 2; side++) {
            String bank = account("Change Bank" + side, "500.00");
            String owed = card("Change Card" + side, "100.00", "owed", "2026-09-01");
            String locked = side == 0 ? bank : owed;
            String movement = payment(bank, owed, "10.00", DATE);
            assertThat(waitsFor(locked, () -> replacePayment(movement, key(), bank, owed, "20.00", DATE, "More")))
                    .as("change %d", side).isEqualTo(201);
            assertBalance(owed, "-80.00");
            String current = currentMovement(bank);
            assertThat(waitsFor(locked, () -> removePayment(current, mayaId))).as("remove %d", side).isEqualTo(200);
            assertBalance(owed, "-100.00");
            assertThat(waitsFor(locked, () -> undoPayment(current, mayaId))).as("undo %d", side).isEqualTo(200);
            assertBalance(owed, "-80.00");
            assertBalance(bank, "480.00");
        }
    }

    @Order(3)
    @Test
    @DisplayName("V2_CARD_013 a member deactivated while a save, change, removal or Undo waits on the member row alone "
            + "is refused")
    void memberRowIsLocked() throws Exception {
        for (int kind = 0; kind < 4; kind++) {
            String bank = account("Member Bank" + kind, "500.00");
            String owed = card("Member Card" + kind, "100.00", "owed", "2026-09-01");
            String movement = payment(bank, owed, "10.00", DATE);
            if (kind == 3) {
                removePayment(movement, mayaId).expectStatus().isOk();
            }
            Supplier<WebTestClient.ResponseSpec> call = switch (kind) {
                case 0 -> () -> postPayment(key(), bank, owed, "1.00", DATE, samId);
                case 1 -> () -> webTestClient.post().uri("/api/v1/card-payments/{id}/replacement", movement)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key())
                        .bodyValue(body(bank, owed, "5.00", DATE, samId, null)).exchange();
                case 2 -> () -> removePayment(movement, samId);
                default -> () -> undoPayment(movement, samId);
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

    @Order(4)
    @Test
    @DisplayName("V2_CARD_006 the same key sent twice at once saves one payment: 201 and 200; a retry after the ledger "
            + "changed replays")
    void sameKeyAtOnceAndRetry() throws Exception {
        String bank = account("Key Bank", "500.00");
        String owed = card("Key Card", "100.00", "owed", "2026-09-01");
        String k = key();
        List<Integer> statuses = both(bank, () -> postPayment(k, bank, owed, "40.00", DATE, mayaId),
                () -> postPayment(k, bank, owed, "40.00", DATE, mayaId));
        assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        assertBalance(bank, "460.00");
        assertBalance(owed, "-60.00");
        assertActivityCount(bank, 1);

        saveExpense(owed, "key-later", "5.00", "2026-09-12", "Groceries");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", mayaId).exchange().expectStatus().isOk();
        try {
            postPayment(k, bank, owed, "40.00", DATE, mayaId).expectStatus().isOk();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus().isOk();
        }
        assertBalance(bank, "460.00");
        assertBalance(owed, "-65.00");
        assertActivityCount(bank, 1);
    }

    @Order(5)
    @Test
    @DisplayName("V2_CARD_013 two removals, two Undos, and a removal against a change of one payment at once: one wins")
    void onePairOneWinner() throws Exception {
        String bank = account("Pair Bank", "500.00");
        String owed = card("Pair Card", "100.00", "owed", "2026-09-01");
        String first = payment(bank, owed, "10.00", DATE);
        assertThat(both(bank, () -> removePayment(first, mayaId), () -> removePayment(first, mayaId)))
                .containsExactlyInAnyOrder(200, 409);
        assertBalance(bank, "500.00");
        assertThat(both(bank, () -> undoPayment(first, mayaId), () -> undoPayment(first, mayaId)))
                .containsExactlyInAnyOrder(200, 409);
        assertBalance(bank, "490.00");
        assertBalance(owed, "-90.00");

        List<Integer> mixed = both(bank, () -> removePayment(first, mayaId),
                () -> replacePayment(first, key(), bank, owed, "20.00", DATE, "Bigger"));
        assertThat(mixed).containsAnyOf(200, 201).contains(409);
        // One effective payment or none, and both Balances agree with it.
        assertActivityCount(bank, mixed.contains(201) ? 1 : 0);
        assertActivityCount(owed, mixed.contains(201) ? 1 : 0);
        assertBalance(bank, mixed.contains(201) ? "480.00" : "500.00");
        assertBalance(owed, mixed.contains(201) ? "-80.00" : "-100.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_CARD_006 a start-date move on the bank account and a payment at once never leave a payment "
            + "before the start")
    void startMoveRacesPayment() throws Exception {
        String bank = account("Race Bank", "500.00");
        String owed = card("Race Card", "100.00", "owed", "2026-09-01");
        List<Integer> statuses = both(bank, () -> postPayment(key(), bank, owed, "1.00", DATE, mayaId),
                () -> post(bank, "starting-balance-corrections", key(), """
                        {"openingAmount": "500.00", "openedOn": "2026-09-20", "reason": "Later start",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)));
        assertThat(statuses.stream().filter(s -> s >= 200 && s < 300).count()).as("exactly one of the two")
                .isEqualTo(1);
        AtomicReference<String> openedOn = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}", bank).exchange().expectBody()
                .jsonPath("$.openedOn").value(String.class, openedOn::set);
        AtomicReference<Integer> count = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", bank).exchange().expectBody()
                .jsonPath("$.length()").value(Integer.class, count::set);
        assertThat(openedOn.get().equals("2026-09-20") ? count.get() == 0 : count.get() == 1).isTrue();
    }

    @Order(7)
    @Test
    @DisplayName("V2_CARD_006 payments and transfers between the same accounts at once never deadlock")
    void noDeadlock() throws Exception {
        String a = account("Cycle A", "1000.00");
        String b = account("Cycle B", "1000.00");
        String owed = card("Cycle Card", "1000.00", "owed", "2026-09-01");
        List<CompletableFuture<Integer>> calls = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            calls.add(async(() -> statusOf(postPayment(key(), a, owed, "1.00", DATE, mayaId))));
            calls.add(async(() -> statusOf(postPayment(key(), b, owed, "1.00", DATE, mayaId))));
            calls.add(async(() -> statusOf(postTransfer(key(), a, b, "1.00", DATE, mayaId))));
            calls.add(async(() -> statusOf(postTransfer(key(), b, a, "1.00", DATE, mayaId))));
        }
        for (CompletableFuture<Integer> call : calls) {
            assertThat(call.get(30, TimeUnit.SECONDS)).isEqualTo(201);
        }
        assertBalance(a, "994.00");
        assertBalance(b, "994.00");
        assertBalance(owed, "-988.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_CARD_007 a payment to a checking account, and one to a removed payment, are refused by the server")
    void typeRuleHeldByTheServer() {
        String a = account("Type A", "100.00");
        String b = account("Type B", "100.00");
        // Both are checking: a payment to a checking account is refused by the server, not just hidden by the form.
        postPayment(key(), a, b, "1.00", DATE, mayaId).expectStatus().isBadRequest();
        previewPayment("fromAccountId=%s&toAccountId=%s&amount=1.00&occurredOn=%s".formatted(a, b, DATE))
                .expectStatus().isBadRequest();
        String owed = card("Type Card", "100.00", "owed", "2026-09-01");
        String movement = payment(a, owed, "10.00", DATE);
        removePayment(movement, mayaId).expectStatus().isOk();
        previewPayment("fromAccountId=%s&toAccountId=%s&amount=5.00&occurredOn=%s&movementId=%s"
                .formatted(a, owed, DATE, movement)).expectStatus().isEqualTo(409);
        replacePayment(movement, key(), a, owed, "5.00", DATE, "Late").expectStatus().isEqualTo(409);
        assertActivityCount(a, 0);
    }

    @Order(9)
    @Test
    @DisplayName("V2_CARD_013 a change sent twice at once with one key saves once: 201 and 200; a late retry replays")
    void sameKeyForAChange() throws Exception {
        String bank = account("Change Key Bank", "500.00");
        String owed = card("Change Key Card", "100.00", "owed", "2026-09-01");
        String movement = payment(bank, owed, "10.00", DATE);
        String k = key();
        List<Integer> statuses = both(bank, () -> replacePayment(movement, k, bank, owed, "20.00", DATE, "More"),
                () -> replacePayment(movement, k, bank, owed, "20.00", DATE, "More"));
        assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        assertBalance(bank, "480.00");
        assertBalance(owed, "-80.00");
        saveExpense(owed, "change-later", "5.00", "2026-09-12", "Groceries");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", mayaId).exchange().expectStatus().isOk();
        try {
            replacePayment(movement, k, bank, owed, "20.00", DATE, "More").expectStatus().isOk();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus().isOk();
        }
        assertBalance(owed, "-85.00");
    }

    private String currentMovement(String account) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[0].movementId").value(String.class, id::set);
        return id.get();
    }
}
