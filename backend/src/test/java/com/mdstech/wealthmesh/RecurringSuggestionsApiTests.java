package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Recurring bills, group 2 (slice 14): suggestions found in recorded bills, their bills, confirm and dismiss. */
class RecurringSuggestionsApiTests extends RecurringTestBase {

    private static String checking;
    private static String utilities;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5360.00 on 2026-07-01 with Electricity bills of 180.00 on July 5, August 5 and "
            + "September 5; today is 2026-09-30")
    void setUp() {
        household();
        setToday("2026-09-30");
        checking = accountOpenedOn("Suggest Checking", "5360.00", "2026-07-01");
        utilities = categoryId("Utilities");
        bill(checking, "e-1", "Electricity", "Utilities", "180.00", "2026-07-05");
        bill(checking, "e-2", "Electricity", "Utilities", "180.00", "2026-08-05");
        bill(checking, "e-3", "Electricity", "Utilities", "180.00", "2026-09-05");
    }

    @Order(1)
    @Test
    @DisplayName("V2_RECURRING_001 the monthly Electricity suggestion shows expected 180.00, last bill 2026-09-05, "
            + "next expected 2026-10-05 and the three supporting bills; September still has its one 180.00 expense")
    void suggestionShowsItsBills() {
        overview().expectBody()
                .jsonPath("$.suggestions.length()").isEqualTo(1)
                .jsonPath("$.suggestions[0].description").isEqualTo("Electricity")
                .jsonPath("$.suggestions[0].categoryName").isEqualTo("Utilities")
                .jsonPath("$.suggestions[0].accountName").isEqualTo("Suggest Checking")
                .jsonPath("$.suggestions[0].frequency").isEqualTo("monthly")
                .jsonPath("$.suggestions[0].amount").isEqualTo("180.00")
                .jsonPath("$.suggestions[0].lastRecordedOn").isEqualTo("2026-09-05")
                .jsonPath("$.suggestions[0].nextExpectedOn").isEqualTo("2026-10-05")
                .jsonPath("$.suggestions[0].bills.length()").isEqualTo(3)
                .jsonPath("$.suggestions[0].bills[0].occurredOn").isEqualTo("2026-07-05")
                .jsonPath("$.suggestions[0].bills[2].occurredOn").isEqualTo("2026-09-05")
                .jsonPath("$.schedules.length()").isEqualTo(0);
        assertSpending("2026-09", "180.00");
        assertActivityCount(checking, 3);
        assertBalance(checking, "4820.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_RECURRING_002 confirming the monthly 180.00 estimate due 2026-10-05 lists it with its supporting "
            + "bills and leaves checking Balance 4820.00 and October spending 0.00")
    void confirmSuggestion() {
        created("confirm-1", schedule("Electricity", "180.00", "monthly", "2026-10-05", checking, "Utilities"));
        overview().expectBody()
                .jsonPath("$.schedules.length()").isEqualTo(1)
                .jsonPath("$.schedules[0].amount").isEqualTo("180.00")
                .jsonPath("$.schedules[0].nextDueOn").isEqualTo("2026-10-05")
                .jsonPath("$.schedules[0].bills.length()").isEqualTo(3)
                .jsonPath("$.suggestions.length()").isEqualTo(0);
        assertBalance(checking, "4820.00");
        assertSpending("2026-10", "0.00");
        assertSpending("2026-09", "180.00");
        assertActivityCount(checking, 3);
    }

    @Order(3)
    @Test
    @DisplayName("V2_RECURRING_009 dismissing a suggestion removes it from the list, keeps every bill, and a repeat is "
            + "the same result")
    void dismissSuggestionKeepsBills() {
        String water = accountOpenedOn("Suggest Water", "1000.00", "2026-07-01");
        bill(water, "w-1", "Water", "Utilities", "40.00", "2026-07-10");
        bill(water, "w-2", "Water", "Utilities", "40.00", "2026-08-10");
        bill(water, "w-3", "Water", "Utilities", "40.00", "2026-09-10");
        overview().expectBody().jsonPath("$.suggestions.length()").isEqualTo(1)
                .jsonPath("$.suggestions[0].description").isEqualTo("Water");

        dismissSuggestion(water, utilities, "Water").expectStatus().isOk().expectBody()
                .jsonPath("$.suggestions.length()").isEqualTo(0);
        dismissSuggestion(water, utilities, "water ").expectStatus().isOk();
        overview().expectBody().jsonPath("$.suggestions.length()").isEqualTo(0);
        assertActivityCount(water, 3);
        assertBalance(water, "880.00");
        // A fourth bill does not bring a dismissed suggestion back.
        setToday("2026-10-15");
        bill(water, "w-4", "Water", "Utilities", "41.00", "2026-10-10");
        setToday("2026-09-30");
        overview().expectBody().jsonPath("$.suggestions.length()").isEqualTo(0);
    }

    @Order(4)
    @Test
    @DisplayName("V2_RECURRING_001 only three bills about a month apart make a suggestion: two do not, a removed bill "
            + "ends it, a split payment, income, an archived account and unequal amounts are handled")
    void whatCountsAsASuggestion() {
        String gas = accountOpenedOn("Suggest Gas", "1000.00", "2026-07-01");
        bill(gas, "g-1", "Gas", "Utilities", "30.00", "2026-08-12");
        String second = bill(gas, "g-2", "Gas", "Utilities", "30.00", "2026-09-12");
        overview().expectBody().jsonPath("$.suggestions[?(@.description=='Gas')]").isEmpty();
        String first = bill(gas, "g-0", "Gas", "Utilities", "35.00", "2026-07-12");
        overview().expectBody().jsonPath("$.suggestions[?(@.description=='Gas')].amount").isEqualTo("30.00")
                .jsonPath("$.suggestions[?(@.description=='Gas')].bills.length()").isEqualTo(3);
        removeEntry(gas, first);
        overview().expectBody().jsonPath("$.suggestions[?(@.description=='Gas')]").isEmpty();
        assertThat(second).isNotBlank();

        // Income and a refund of the same description never count.
        String pay = accountOpenedOn("Suggest Pay", "0.00", "2026-07-01");
        for (int month = 7; month <= 9; month++) {
            post(pay, "income", "pay-" + month, entry(mayaId, "Retainer", "100.00", "2026-0" + month + "-03",
                    "Salary")).expectStatus().isCreated();
        }
        overview().expectBody().jsonPath("$.suggestions[?(@.description=='Retainer')]").isEmpty();

        // A split payment has no category of its own, so three of them are not a suggestion.
        String shop = accountOpenedOn("Suggest Split", "1000.00", "2026-07-01");
        for (int month = 7; month <= 9; month++) {
            post(shop, "expenses", "split-" + month, """
                    {"description": "Household run", "amount": "30.00", "occurredOn": "2026-0%d-20",
                     "enteredByMemberId": "%s", "portions": [{"category": "Utilities", "amount": "10.00"},
                     {"category": "Groceries", "amount": "20.00"}]}""".formatted(month, mayaId))
                    .expectStatus().isCreated();
        }
        overview().expectBody().jsonPath("$.suggestions[?(@.description=='Household run')]").isEmpty();

        // An account that is archived offers no suggestion.
        String old = accountOpenedOn("Suggest Old", "1000.00", "2026-07-01");
        for (int month = 7; month <= 9; month++) {
            bill(old, "old-" + month, "Cable", "Utilities", "60.00", "2026-0" + month + "-15");
        }
        overview().expectBody().jsonPath("$.suggestions[?(@.description=='Cable')]").isNotEmpty();
        archive(old);
        overview().expectBody().jsonPath("$.suggestions[?(@.description=='Cable')]").isEmpty();
    }

    @Order(5)
    @Test
    @DisplayName("V2_RECURRING_009 deleting the confirmed estimate does not bring its suggestion back and keeps the "
            + "three bills")
    void deletedEstimateIsNotSuggestedAgain() {
        String id = overviewScheduleId("Electricity");
        act(id, "delete", null).expectStatus().isOk();
        overview().expectBody().jsonPath("$.schedules.length()").isEqualTo(0)
                .jsonPath("$.suggestions[?(@.description=='Electricity')]").isEmpty();
        assertActivityCount(checking, 3);
        assertBalance(checking, "4820.00");
    }

    private String overviewScheduleId(String description) {
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        overview().expectBody().jsonPath("$.schedules[?(@.description=='" + description + "')].id")
                .value(java.util.List.class, ids -> id.set((String) ids.getFirst()));
        return id.get();
    }

    @Order(6)
    @Test
    @DisplayName("V2_RECURRING_009 dismissing needs a suggestion, an account and who; a made-up category is refused")
    void dismissIsChecked() {
        dismissSuggestion(checking, utilities, " ").expectStatus().isBadRequest();
        dismissSuggestion("00000000-0000-4000-8000-000000000000", utilities, "Electricity").expectStatus()
                .isNotFound();
        dismissSuggestion(checking, "00000000-0000-4000-8000-000000000000", "Electricity").expectStatus()
                .isBadRequest();
        webTestClient.post().uri(RECURRING + "/suggestions/dismiss")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"accountId\": \"%s\", \"categoryId\": \"%s\", \"description\": \"X\"}"
                        .formatted(checking, utilities)).exchange().expectStatus().isBadRequest();
    }
}
