package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Raw-API guards (slice 12): an archived account takes no new money, whatever the UI offers, and keeps its history
 * editable (Q-038). Every request below goes straight to the server.
 */
class ArchivedAccountGuardsApiTests extends LifecycleTestBase {

    private static final String SAVINGS_ARCHIVED = "Emergency Savings is archived";
    private static String checking;
    private static String savings;
    private static String oldCard;
    private static String liveCard;
    private static String checkingBill;
    private static String savingsBill;
    private static String transferId;

    @Order(0)
    @Test
    @DisplayName("set up the household, accounts, history, then archive savings and a card")
    void setUp() {
        household();
        checking = account("Everyday Checking", "1000.00");
        savings = savings("Emergency Savings", "1000.00", "2026-09-01");
        oldCard = card("Old Card", "200.00", "owed", "2026-09-01");
        liveCard = card("Live Card", "100.00", "owed", "2026-09-01");
        checkingBill = expense(checking, "g-bill-c", "Groceries", "10.00", "2026-09-05");
        savingsBill = expense(savings, "g-bill-s", "Groceries", "20.00", "2026-09-05");
        transferId = transfer("g-move", savings, checking, "50.00", "2026-09-06");
        archive(savings);
        archive(oldCard);
        assertBalance(savings, "930.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an expense, income, batch, historical entry, correction or reminder "
            + "on an archived account is refused (409)")
    void newEntriesRefused() {
        assertRefused(post(savings, "expenses", "g-1", entry(mayaId, "Dining", "5.00", "2026-09-07", "Dining")),
                SAVINGS_ARCHIVED);
        assertRefused(post(savings, "income", "g-2", entry(mayaId, "Gift", "5.00", "2026-09-07", "Salary")),
                SAVINGS_ARCHIVED);
        assertRefused(webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", savings)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-3")
                .bodyValue("""
                        {"enteredByMemberId": "%s", "entries": [{"description": "Dining", "amount": "5.00",
                         "occurredOn": "2026-09-07", "category": "Dining"}]}""".formatted(mayaId)).exchange(),
                SAVINGS_ARCHIVED);
        assertRefused(post(savings, "historical-entries", "g-4", """
                {"kind": "expense", "entry": {"description": "Old", "amount": "5.00", "occurredOn": "2026-08-20",
                 "category": "Dining", "enteredByMemberId": "%s"},
                 "startRevision": {"openingAmount": "1000.00", "openedOn": "2026-08-01", "reason": "Earlier",
                 "enteredByMemberId": "%s"}}""".formatted(mayaId, mayaId)), SAVINGS_ARCHIVED);
        assertRefused(post(savings, "balance-corrections", "g-5", """
                {"requestedBalance": "900.00", "asOn": "2026-09-08", "reason": "Fee",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)), SAVINGS_ARCHIVED);
        assertRefused(post(savings, "reminders", "g-6", """
                {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                 "category": "Dining", "enteredByMemberId": "%s"}""".formatted(mayaId)), SAVINGS_ARCHIVED);
        assertRefused(post(oldCard, "refunds", "g-7", entry(mayaId, "Return", "5.00", "2026-09-07", "Dining")),
                "Old Card is archived");
        assertBalance(savings, "930.00");
        assertBalance(oldCard, "-200.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a transfer or card payment to or from an archived account is refused")
    void movementsRefused() {
        assertRefused(postTransfer("g-t1", checking, savings, "5.00", "2026-09-07", mayaId), SAVINGS_ARCHIVED);
        assertRefused(postTransfer("g-t2", savings, checking, "5.00", "2026-09-07", mayaId), SAVINGS_ARCHIVED);
        assertRefused(postPayment("g-p1", checking, oldCard, "5.00", "2026-09-07", mayaId), "Old Card is archived");
        assertRefused(postPayment("g-p2", savings, liveCard, "5.00", "2026-09-07", mayaId), SAVINGS_ARCHIVED);
        assertBalance(checking, "1040.00");
        assertBalance(liveCard, "-100.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 moving or converting an entry onto an archived account is refused")
    void moveAndConvertRefused() {
        assertRefused(webTestClient.post()
                .uri("/api/v1/accounts/{a}/activity/{id}/replacement", checking, checkingBill)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-m1")
                .bodyValue("""
                        {"accountId": "%s", "description": "Groceries", "amount": "10.00",
                         "occurredOn": "2026-09-05", "category": "Groceries", "enteredByMemberId": "%s",
                         "reason": "Wrong account"}""".formatted(savings, mayaId)).exchange(), SAVINGS_ARCHIVED);
        assertRefused(convert(checking, checkingBill, "g-c1", savings, mayaId, "It was a transfer"),
                SAVINGS_ARCHIVED);
        assertBalance(checking, "1040.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an archived account's own entries and transfers stay editable, "
            + "removable and restorable, and it still takes a statement and a rename (Q-038)")
    void historyStaysEditable() {
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", savings, savingsBill)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-e1")
                .bodyValue("""
                        {"description": "Groceries", "amount": "25.00", "occurredOn": "2026-09-05",
                         "category": "Groceries", "enteredByMemberId": "%s", "reason": "Wrong amount"}"""
                        .formatted(mayaId)).exchange().expectStatus().isCreated();
        assertBalance(savings, "925.00");
        replaceTransfer(transferId, "g-e2", savings, checking, "60.00", "2026-09-06", "Fix").expectStatus()
                .isCreated();
        assertBalance(savings, "915.00");
        AtomicReference<String> current = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", savings).exchange().expectBody()
                .jsonPath("$[?(@.kind=='transfer_out')].movementId").value(java.util.List.class,
                        ids -> current.set(String.valueOf(ids.get(0))));
        removeTransfer(current.get(), mayaId).expectStatus().isOk();
        assertBalance(savings, "975.00");
        undoTransfer(current.get(), mayaId).expectStatus().isOk();
        assertBalance(savings, "915.00");
        post(savings, "statements", "g-s1", """
                {"statementOn": "2026-09-30", "balance": "915.00", "note": "September",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated();
        webTestClient.put().uri("/api/v1/accounts/{id}", savings).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Emergency Savings", "institution": "Harbor Bank 2",
                         "ownerMemberIds": ["%s"]}""".formatted(mayaId)).exchange().expectStatus().isOk();
        assertStatus(savings, "archived");
        assertThat(statusOf(act(savings, "archive"))).isEqualTo(200);
    }

    @Order(5)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 after restore the account takes money again")
    void restoredTakesMoney() {
        act(savings, "restore").expectStatus().isOk();
        post(savings, "expenses", "g-r1", entry(mayaId, "Dining", "5.00", "2026-09-07", "Dining")).expectStatus()
                .isCreated();
    }
}
