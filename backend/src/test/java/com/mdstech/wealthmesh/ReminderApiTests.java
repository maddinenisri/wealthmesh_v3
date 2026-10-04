package com.mdstech.wealthmesh;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Future-dated bills and salary are reminders, not history (slice 02, group C). */
class ReminderApiTests extends LedgerApiTestBase {

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("set up Everyday Checking at 5000.00 on 2026-09-01, today is 2026-09-10")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_EXPENSE_011 a future bill is refused as spending and kept as a reminder; money is unchanged")
    void futureBillIsAReminder() {
        today();
        post(accountId, "expenses", "k-bill", entry(samId, "Utilities", "180.00", "2026-09-30", "Utilities"))
                .expectStatus().isBadRequest();

        reminder("k-bill-reminder", "expense", "Utilities", "180.00", "2026-09-30", "Utilities")
                .expectStatus().isCreated()
                .expectBody().jsonPath("$.kind").isEqualTo("expense")
                .jsonPath("$.amount").isEqualTo("180.00")
                .jsonPath("$.dueOn").isEqualTo("2026-09-30")
                .jsonPath("$.categoryName").isEqualTo("Utilities")
                .jsonPath("$.accountName").isEqualTo("Everyday Checking");

        assertBalance(accountId, "5000.00");
        assertActivityCount(accountId, 0);
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        reminders().expectBody().jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].amount").isEqualTo("180.00").jsonPath("$[0].dueOn").isEqualTo("2026-09-30");
    }

    @Order(2)
    @Test
    @DisplayName("V2_INCOME_006 expected salary is kept as a reminder until received; Balance and income are unchanged")
    void expectedSalaryIsAReminder() {
        today();
        post(accountId, "income", "k-pay", entry(mayaId, "Salary", "6000.00", "2026-09-30", "Salary"))
                .expectStatus().isBadRequest();
        reminder("k-pay-reminder", "income", "Salary", "6000.00", "2026-09-30", "Salary")
                .expectStatus().isCreated().expectBody().jsonPath("$.kind").isEqualTo("income");

        assertBalance(accountId, "5000.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        reminders().expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.kind=='income')].amount").isEqualTo("6000.00");
    }

    @Order(3)
    @Test
    @DisplayName("a reminder save is repeat-safe: the same key returns the first reminder, other details are refused")
    void repeatSafe() {
        today();
        AtomicReference<String> first = new AtomicReference<>();
        reminder("k-rent", "expense", "Rent", "1500.00", "2026-09-28", "Rent").expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, first::set);
        reminder("k-rent", "expense", "Rent", "1500.00", "2026-09-28", "Rent").expectStatus().isOk()
                .expectBody().jsonPath("$.id").isEqualTo(first.get());
        reminder("k-rent", "expense", "Rent", "1600.00", "2026-09-28", "Rent").expectStatus().isEqualTo(409);
        reminders().expectBody().jsonPath("$.length()").isEqualTo(3);
    }

    @Order(4)
    @Test
    @DisplayName("a reminder needs a date after today, a positive amount, a category of its kind and a member")
    void validation() {
        today();
        reminder("k-today", "expense", "Rent", "10.00", "2026-09-10", "Rent").expectStatus().isBadRequest();
        reminder("k-past", "expense", "Rent", "10.00", "2026-09-09", "Rent").expectStatus().isBadRequest();
        reminder("k-zero", "expense", "Rent", "0.00", "2026-09-30", "Rent").expectStatus().isBadRequest();
        reminder("k-cat", "income", "Pay", "10.00", "2026-09-30", "Groceries").expectStatus().isBadRequest();
        reminder("k-kind", "transfer", "Pay", "10.00", "2026-09-30", "Rent").expectStatus().isBadRequest();
        post(accountId, "reminders", "k-ghost", """
                {"kind": "expense", "amount": "10.00", "dueOn": "2026-09-30", "category": "Rent",
                 "enteredByMemberId": "00000000-0000-0000-0000-000000000000"}""").expectStatus().isBadRequest();
        reminders().expectBody().jsonPath("$.length()").isEqualTo(3);
    }

    private void today() {
        clock.setToday(LocalDate.of(2026, 9, 10));
    }

    private WebTestClient.ResponseSpec reminder(String key, String kind, String description, String amount,
            String dueOn, String category) {
        return post(accountId, "reminders", key, """
                {"kind": "%s", "description": "%s", "amount": "%s", "dueOn": "%s", "category": "%s",
                 "enteredByMemberId": "%s"}""".formatted(kind, description, amount, dueOn, category, mayaId));
    }

    private WebTestClient.ResponseSpec reminders() {
        return webTestClient.get().uri("/api/v1/reminders").exchange().expectStatus().isOk();
    }
}
