package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Saving a split expense and the rules a split must meet (V2_SPLITS_001, V2_SPLITS_003). */
class SplitRulesApiTests extends SplitTestBase {

    private static String account;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, checking at 5000.00 and a Gifts category")
    void setUp() {
        household();
        createCategory("Gifts", "spending");
        account = account("Split Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_SPLITS_003 portions that do not add up are refused with what is still to assign")
    void portionsMustAddUp() {
        String short115 = split(mayaId, "Shop", "120.00", "2026-09-10", p("Groceries", null, "90.00"),
                p("Gifts", null, "25.00"));
        post(account, "expenses", "short", short115).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").value(m -> assertThat((String) m)
                        .contains("$115.00 is assigned and $5.00 is still to assign"));
        String over = split(mayaId, "Shop", "120.00", "2026-09-10", p("Groceries", null, "100.00"),
                p("Gifts", null, "30.00"));
        post(account, "expenses", "over", over).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").value(m -> assertThat((String) m).contains("$10.00 more is assigned"));
        assertBalance(account, "5000.00");
        assertActivityCount(account, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_SPLITS_001 a $120.00 split into $90.00 Groceries and $30.00 Gifts saves one payment")
    void savesOnePayment() {
        String body = split(mayaId, "Mixed shop", "120.00", "2026-09-10", p("Groceries", "essential", "90.00"),
                p("Gifts", "discretionary", "30.00"));
        post(account, "expenses", "split-1", body).expectStatus().isCreated().expectBody()
                .jsonPath("$.amount").isEqualTo("120.00")
                .jsonPath("$.categoryId").isEmpty()
                .jsonPath("$.portions.length()").isEqualTo(2)
                .jsonPath("$.portions[0].categoryName").isEqualTo("Groceries")
                .jsonPath("$.portions[0].amount").isEqualTo("90.00")
                .jsonPath("$.portions[0].classification").isEqualTo("essential")
                .jsonPath("$.portions[1].categoryName").isEqualTo("Gifts")
                .jsonPath("$.portions[1].amount").isEqualTo("30.00");
        assertBalance(account, "4880.00");
        assertActivityCount(account, 1);
    }

    @Order(3)
    @Test
    @DisplayName("V2_SPLITS_001 the same key and portions replay the payment; other portions are a 409")
    void replayAndConflict() {
        String body = split(mayaId, "Mixed shop", "120.00", "2026-09-10", p("Groceries", "essential", "90.00"),
                p("Gifts", "discretionary", "30.00"));
        post(account, "expenses", "split-1", body).expectStatus().isOk();
        String other = split(mayaId, "Mixed shop", "120.00", "2026-09-10", p("Groceries", "essential", "80.00"),
                p("Gifts", "discretionary", "40.00"));
        post(account, "expenses", "split-1", other).expectStatus().isEqualTo(409);
        assertBalance(account, "4880.00");
        assertActivityCount(account, 1);
    }

    @Order(4)
    @Test
    @DisplayName("V2_SPLITS_003 the server refuses a bad split even when the form would not send it")
    void shapeRules() {
        assertBad("one", split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", null, "10.00")),
                "at least two");
        assertBad("dup", split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", null, "4.00"),
                p("Groceries", null, "6.00")), "once");
        assertBad("zero", split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", null, "0.00"),
                p("Gifts", null, "10.00")), "greater than zero");
        assertBad("income-cat", split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", null, "5.00"),
                p("Salary", null, "5.00")), "spending category");
        assertBad("unknown", split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", null, "5.00"),
                p("Nope", null, "5.00")), "spending category");
        assertBad("class", split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", "bogus", "5.00"),
                p("Gifts", null, "5.00")), "Essential or Discretionary");
        String named = """
                {"description": "x", "amount": "10.00", "occurredOn": "2026-09-10", "category": "Groceries",
                 "enteredByMemberId": "%s", "portions": [{"category": "Groceries", "amount": "5.00"},
                 {"category": "Gifts", "amount": "5.00"}]}""".formatted(mayaId);
        assertBad("named", named, "on each portion");
        P[] many = new P[21];
        for (int i = 0; i < 21; i++) {
            many[i] = p(i % 2 == 0 ? "Groceries" : "Gifts", null, "1.00");
        }
        assertBad("many", split(mayaId, "x", "21.00", "2026-09-10", many), "at most 20");
        assertBalance(account, "4880.00");
        assertActivityCount(account, 1);
    }

    @Order(5)
    @Test
    @DisplayName("V2_SPLITS_003 an archived category, income, refunds, batch rows and reminders cannot be split")
    void whereSplitsAreRefused() {
        createCategory("OldGifts", "spending");
        String oldGifts = categoryId("spending", "OldGifts");
        webTestClient.post().uri("/api/v1/categories/{id}/archive", oldGifts)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        assertBad("archived-name", split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", null, "5.00"),
                p("OldGifts", null, "5.00")), "spending category");
        String byId = """
                {"description": "x", "amount": "10.00", "occurredOn": "2026-09-10", "enteredByMemberId": "%s",
                 "portions": [{"category": "Groceries", "amount": "5.00"},
                 {"categoryId": "%s", "amount": "5.00"}]}""".formatted(mayaId, oldGifts);
        assertBad("archived-id", byId, "archived");
        String body = split(mayaId, "x", "10.00", "2026-09-10", p("Groceries", null, "5.00"),
                p("Gifts", null, "5.00"));
        post(account, "income", "inc", body).expectStatus().isBadRequest();
        post(account, "refunds", "ref", body).expectStatus().isBadRequest();
        String row = """
                {"enteredByMemberId": "%s", "entries": [{"description": "x", "amount": "10.00",
                 "occurredOn": "2026-09-10", "portions": [{"category": "Groceries", "amount": "5.00"},
                 {"category": "Gifts", "amount": "5.00"}]}]}""".formatted(mayaId);
        post(account, "expense-batches", "batch", row).expectStatus().isBadRequest();
        String reminder = """
                {"kind": "expense", "description": "x", "amount": "10.00", "dueOn": "2026-10-20",
                 "category": "Groceries", "enteredByMemberId": "%s", "portions": [{"category": "Groceries",
                 "amount": "5.00"}, {"category": "Gifts", "amount": "5.00"}]}""".formatted(mayaId);
        post(account, "reminders", "rem", reminder).expectStatus().is2xxSuccessful();
        webTestClient.get().uri("/api/v1/reminders").exchange().expectBody()
                .jsonPath("$[0].categoryName").isEqualTo("Groceries").jsonPath("$[0].portions").doesNotExist();
        assertBalance(account, "4880.00");
        assertActivityCount(account, 1);
    }

    private void assertBad(String key, String body, String message) {
        post(account, "expenses", key, body).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .value(m -> assertThat((String) m).containsIgnoringCase(message));
    }
}
