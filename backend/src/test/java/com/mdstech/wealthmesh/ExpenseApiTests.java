package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Expense entry, the dated Balance and the monthly spending views (slice 01a). */
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@AutoConfigureWebTestClient
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ExpenseApiTests {

    private static final String POSITIVE = "Enter an amount greater than zero";

    private static String mayaId;
    private static String samId;
    private static String accountId;

    @Autowired
    WebTestClient webTestClient;

    @Autowired
    MutableClock clock;

    @BeforeEach
    void resetToday() {
        clock.setToday(MutableClock.DEFAULT_TODAY);
    }

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam with Everyday Checking at 5000.00 on 2026-09-01")
    void setUp() {
        AtomicReference<String> household = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/household").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Maya and Sam\"}").exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, household::set);
        mayaId = member(household.get(), "Maya");
        samId = member(household.get(), "Sam");
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "checking", "name": "Everyday Checking", "ownerMemberIds": ["%s"],
                         "openedOn": "2026-09-01", "openingBalance": "5000.00"}""".formatted(mayaId))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        accountId = id.get();
    }

    @Order(1)
    @Test
    @DisplayName("the seeded categories offer spending names and keep income names out of the expense list")
    void categories() {
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$[?(@.name=='Groceries')].kind").isEqualTo("spending")
                .jsonPath("$[?(@.name=='Salary')]").isEmpty();
        webTestClient.get().uri("/api/v1/categories").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$[?(@.name=='Salary')].kind").isEqualTo("income");
    }

    @Order(2)
    @Test
    @DisplayName("V2_EXPENSE_010 reject a zero purchase and leave the Balance and activity alone")
    void rejectZero() {
        post("k-zero", expense("Groceries", "0.00", "2026-09-10", "Groceries"))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo(POSITIVE);
        assertBalance("5000.00");
        assertActivityCount(0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_CHECKING_011 reject -100.00, then save 100.00 once even when the same save is repeated")
    void rejectNegativeThenSaveOnce() {
        post("k-neg", expense("Groceries", "-100.00", "2026-09-10", "Groceries"))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo(POSITIVE);
        assertActivityCount(0);

        AtomicReference<String> first = new AtomicReference<>();
        post("k-groceries", expense("Groceries", "100.00", "2026-09-10", "Groceries"))
                .expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, first::set);
        post("k-groceries", expense("Groceries", "100.00", "2026-09-10", "Groceries"))
                .expectStatus().isOk()
                .expectBody().jsonPath("$.id").isEqualTo(first.get());

        assertActivityCount(1);
        assertBalance("4900.00");
    }

    @Order(4)
    @Test
    @DisplayName("D-024 the same key with different details is refused")
    void sameKeyDifferentDetails() {
        post("k-groceries", expense("Groceries", "150.00", "2026-09-10", "Groceries"))
                .expectStatus().isEqualTo(409);
        assertActivityCount(1);
    }

    @Order(5)
    @Test
    @DisplayName("D-024 equal entries from two forms are both saved")
    void twoFormsTwoRows() {
        post("k-a", expense("Groceries", "150.00", "2026-09-06", "Groceries")).expectStatus().isCreated();
        post("k-b", expense("Groceries", "150.00", "2026-09-13", "Groceries")).expectStatus().isCreated();
        assertActivityCount(3);
        assertBalance("4600.00");
    }

    @Order(6)
    @Test
    @DisplayName("D-025 the entered-by member is saved on the record, and must belong to the household")
    void enteredBy() {
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$[0].enteredByMemberId").isEqualTo(samId);
        post("k-ghost", expense("Groceries", "5.00", "2026-09-14", "Groceries")
                .replace(samId, "00000000-0000-0000-0000-000000000000")).expectStatus().isBadRequest();
    }

    @Order(7)
    @Test
    @DisplayName("an expense needs a spending category, a date that is not in the future and not before the opening")
    void otherValidation() {
        post("k-income-cat", expense("Pay", "5.00", "2026-09-14", "Salary")).expectStatus().isBadRequest();
        post("k-future", expense("Bill", "5.00", "2026-10-04", "Utilities")).expectStatus().isBadRequest();
        post("k-early", expense("Bill", "5.00", "2026-08-31", "Utilities")).expectStatus().isBadRequest();
        post("k-text", expense("Bill", "abc", "2026-09-14", "Utilities")).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        assertActivityCount(3);
    }

    @Order(8)
    @Test
    @DisplayName("V2_EXPENSE_001 record a bill and follow it from the September spending view")
    void recordBillAndInspect() {
        post("k-electricity", expense("Electricity", "180.00", "2026-09-05", "Utilities"))
                .expectStatus().isCreated();
        assertBalance("4420.00");

        AtomicReference<String> utilities = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.categories[?(@.name=='Utilities')].total").isEqualTo("180.00")
                .jsonPath("$.categories[?(@.name=='Utilities')].categoryId").value(
                        net.minidev.json.JSONArray.class, ids -> utilities.set((String) ids.get(0)));
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&categoryId={c}", utilities.get())
                .exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].description").isEqualTo("Electricity")
                .jsonPath("$[0].amount").isEqualTo("180.00")
                .jsonPath("$[0].occurredOn").isEqualTo("2026-09-05")
                .jsonPath("$[0].accountName").isEqualTo("Everyday Checking")
                .jsonPath("$[0].categoryName").isEqualTo("Utilities");
    }

    @Order(9)
    @Test
    @DisplayName("V2_MONTHLY_005 label an annual estimate built from one recorded month, and keep October empty")
    void annualEstimateFromOneMonth() {
        // September holds 100 + 150 + 150 + 180 = 580.00 so far, and it is the only month with expenses.
        webTestClient.get().uri("/api/v1/spending/history").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.recordedMonths").isEqualTo(1)
                .jsonPath("$.averageRecordedMonth").isEqualTo("580.00")
                .jsonPath("$.annualEstimate").isEqualTo("6960.00");

        post("k-top", expense("Top up", "3080.00", "2026-09-28", "Rent")).expectStatus().isCreated();

        webTestClient.get().uri("/api/v1/spending/history").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.recordedMonths").isEqualTo(1)
                .jsonPath("$.averageRecordedMonth").isEqualTo("3660.00")
                .jsonPath("$.annualEstimate").isEqualTo("43920.00")
                .jsonPath("$.months[?(@.month=='2026-09')].total").isEqualTo("3660.00")
                .jsonPath("$.months[?(@.month=='2026-10')].recorded").isEqualTo(false);
        webTestClient.get().uri("/api/v1/spending?month=2026-10").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.total").isEqualTo("0.00").jsonPath("$.categories.length()").isEqualTo(0);
    }

    @Order(10)
    @Test
    @DisplayName("D-024 a save key is forgotten after its lifetime, so the same key may save again")
    void expiredKeyCanBeReused() {
        post("k-a", expense("Groceries", "150.00", "2026-09-06", "Groceries")).expectStatus().isOk();
        clock.setToday(MutableClock.DEFAULT_TODAY.plusDays(2));
        post("k-a", expense("Groceries", "150.00", "2026-09-06", "Groceries")).expectStatus().isCreated();
    }

    private WebTestClient.ResponseSpec post(String key, String json) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/expenses", accountId)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(json).exchange();
    }

    private String expense(String description, String amount, String date, String category) {
        return """
                {"description": "%s", "amount": "%s", "occurredOn": "%s", "category": "%s",
                 "enteredByMemberId": "%s"}""".formatted(description, amount, date, category, samId);
    }

    private void assertBalance(String amount) {
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.balance.amount").isEqualTo(amount);
    }

    private void assertActivityCount(int count) {
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(count);
    }

    private String member(String householdId, String name) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/household-members").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"householdId\": \"%s\", \"name\": \"%s\"}".formatted(householdId, name))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }
}
