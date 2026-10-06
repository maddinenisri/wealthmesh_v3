package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Raw-API guards for a closed account (slice 12): nothing changes on it, not new money and not what it already holds,
 * until it is reopened. Archived accounts are covered by ArchivedAccountGuardsApiTests.
 */
class ClosedAccountGuardsApiTests extends LifecycleTestBase {

    private static final String CLOSED_SAVINGS = "Closed Savings is closed";
    private static String checking;
    private static String savings;
    private static String card;
    private static String zeroed;
    private static String transferId;
    private static String paymentId;
    private static String billId;
    private static String correctionId;

    @Order(0)
    @Test
    @DisplayName("set up the household, then close savings, a card and two zeroed accounts")
    void setUp() {
        household();
        checking = account("Everyday Checking", "1000.00");
        savings = savings("Closed Savings", "100.00", "2026-09-01");
        card = card("Closed Card", "100.00", "owed", "2026-09-01");
        zeroed = account("Zeroed Checking", "100.00");
        transferId = transfer("x-move", savings, checking, "100.00", "2026-09-10");
        paymentId = payment(checking, card, "100.00", "2026-09-11");
        billId = expense(zeroed, "x-bill", "Groceries", "100.00", "2026-09-05");
        AtomicReference<String> id = new AtomicReference<>();
        String other = account("Corrected Checking", "100.00");
        post(other, "balance-corrections", "x-corr", """
                {"requestedBalance": "0.00", "asOn": "2026-09-10", "reason": "Fee", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, id::set);
        correctionId = id.get();
        for (String closing : new String[] {savings, card, zeroed, other}) {
            act(closing, "close").expectStatus().isOk();
        }
        corrected = other;
    }

    private static String corrected;

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 a starting-balance correction on a closed account is refused (409)")
    void startingBalanceRefused() {
        assertRefused(post(savings, "starting-balance-corrections", "x-sb", """
                {"openingAmount": "150.00", "openedOn": "2026-09-01", "reason": "Fix",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)), CLOSED_SAVINGS);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 replacing, removing or restoring a transfer or card payment that touches "
            + "a closed account is refused")
    void movementChangesRefused() {
        assertRefused(replaceTransfer(transferId, "x-r1", savings, checking, "90.00", "2026-09-10", "Fix"),
                CLOSED_SAVINGS);
        assertRefused(removeTransfer(transferId, mayaId), CLOSED_SAVINGS);
        assertRefused(replacePayment(paymentId, "x-r2", checking, card, "90.00", "2026-09-11", "Fix"),
                "Closed Card is closed");
        assertRefused(removePayment(paymentId, mayaId), "Closed Card is closed");
        assertRefused(postPayment("x-p1", checking, card, "5.00", "2026-09-12", mayaId), "Closed Card is closed");
        assertBalance(savings, "0.00");
        assertBalance(card, "0.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 converting an entry of a closed account to a transfer, or correcting its "
            + "Balance correction, is refused")
    void conversionsAndCorrectionsRefused() {
        assertRefused(convert(zeroed, billId, "x-c1", checking, mayaId, "It was a transfer"),
                "Zeroed Checking is closed");
        assertRefused(post(corrected, "balance-corrections", "x-c2", """
                {"requestedBalance": "20.00", "asOn": "2026-09-10", "reason": "Redo", "enteredByMemberId": "%s",
                 "replacesId": "%s"}""".formatted(mayaId, correctionId)), "Corrected Checking is closed");
        assertRefused(webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", zeroed, billId)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "x-c3")
                .bodyValue("""
                        {"description": "Groceries", "amount": "90.00", "occurredOn": "2026-09-05",
                         "category": "Groceries", "enteredByMemberId": "%s", "reason": "Fix"}""".formatted(mayaId))
                .exchange(), "Zeroed Checking is closed");
        assertBalance(zeroed, "0.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 moving an entry from an active account is fine, but a source that is "
            + "closed cannot be left")
    void moveFromClosedSourceRefused() {
        String bill = expense(checking, "x-bill-2", "Groceries", "10.00", "2026-09-12");
        assertRefused(webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", checking, bill)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "x-m1")
                .bodyValue("""
                        {"accountId": "%s", "description": "Groceries", "amount": "10.00",
                         "occurredOn": "2026-09-12", "category": "Groceries", "enteredByMemberId": "%s",
                         "reason": "Wrong account"}""".formatted(savings, mayaId)).exchange(), CLOSED_SAVINGS);
    }
}
