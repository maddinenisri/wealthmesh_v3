package com.mdstech.wealthmesh;

import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Close needs an accounted-for zero Balance and keeps history; reopen is explicit (slice 12, A2). */
class CloseReopenApiTests extends LifecycleTestBase {

    private static String checking;
    private static String savings;

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 closing savings with $1,000.00 is refused until it is moved by a transfer; "
            + "then it is closed at zero, wealth is unchanged and nothing is income or spending")
    void closeSavingsAfterMovingMoney() {
        checking = account("Everyday Checking", "5000.00");
        savings = savings("Emergency Savings", "1000.00", "2026-09-01");
        assertRefused(act(savings, "close"), "needs a zero Balance. It has 1000.00");
        assertStatus(savings, "active");
        transfer("c-move", savings, checking, "1000.00", "2026-09-10");
        act(savings, "close").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("closed")
                .jsonPath("$.balance.amount").isEqualTo("0.00");
        // A repeat is the same result.
        act(savings, "close").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("closed");
        assertBalance(checking, "6000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("6000.00").jsonPath("$.netWorth").isEqualTo("6000.00");
        noIncomeOrSpending("2026-09");
        assertActivityCount(savings, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 a closed account takes no new entry, transfer or payment until it is "
            + "reopened")
    void closedTakesNothingUntilReopened() {
        assertRefused(post(savings, "expenses", "c-1", entry(mayaId, "Dining", "5.00", "2026-09-11", "Dining")),
                "Emergency Savings is closed");
        assertRefused(postTransfer("c-2", checking, savings, "5.00", "2026-09-11", mayaId),
                "Emergency Savings is closed");
        assertRefused(act(savings, "archive"), "Reopen Emergency Savings before archiving");
        assertRefused(act(savings, "restore"), "Reopen it instead");
        act(savings, "reopen").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("active");
        act(savings, "reopen").expectStatus().isOk();
        post(savings, "income", "c-3", entry(mayaId, "Interest", "5.00", "2026-09-11", "Salary")).expectStatus()
                .isCreated();
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_004 a card paid to zero closes; the payment and purchases stay in history "
            + "and net worth is unchanged")
    void closePaidOffCard() {
        String bank = account("Card Bank", "5000.00");
        String card = card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts").isEqualTo("1000.00");
        assertRefused(act(card, "close"), "needs a zero Balance. It has -1000.00");
        payment(bank, card, "1000.00", "2026-09-12");
        act(card, "close").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("closed")
                .jsonPath("$.balance.amount").isEqualTo("0.00");
        assertBalance(bank, "4000.00");
        assertActivityCount(card, 1);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts").isEqualTo("0.00");
        monthIs("income", "2026-09", "5.00", null);
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_004 a card with a Card credit is not at zero, so it cannot close")
    void cardCreditCannotClose() {
        String credit = card("Travel Card", "50.00", "credit", "2026-09-01");
        assertRefused(act(credit, "close"), "needs a zero Balance. It has 50.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 close refuses while an entry is dated after today")
    void closeRefusedWithFutureEntry() {
        String account = account("Future Checking", "100.00");
        clock.setToday(LocalDate.of(2026, 10, 20));
        saveExpense(account, "c-future", "100.00", "2026-10-15", "Utilities");
        clock.setToday(MutableClock.DEFAULT_TODAY);
        assertBalance(account, "0.00");
        assertRefused(act(account, "close"), "has 1 entry dated after today");
        assertStatus(account, "active");
    }

    @Order(6)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 a save that commits first changes the Balance the close reads under "
            + "the lock")
    void closeReadsBalanceUnderLock() throws Exception {
        String account = account("Racing Checking", "100.00");
        saveExpense(account, "c-race-0", "100.00", "2026-09-05", "Utilities");
        assertBalance(account, "0.00");
        String insert = "INSERT INTO wealthmesh.activity (account_id, kind, amount, occurred_on) "
                + "VALUES ($1, 'expense', 5.00, '2026-09-06')";
        assertRefusedStatus(afterUncommitted(account, insert, () -> act(account, "close")));
        assertStatus(account, "active");
    }

    private static void assertRefusedStatus(int status) {
        org.assertj.core.api.Assertions.assertThat(status).isEqualTo(409);
    }
}
