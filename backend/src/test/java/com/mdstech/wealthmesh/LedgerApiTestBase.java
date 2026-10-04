package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Shared set-up for API tests that need a household, members, checking accounts and entries. Each subclass gets its
 * own database (DirtiesContext), so household-wide figures such as September income are exact.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@AutoConfigureWebTestClient
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
abstract class LedgerApiTestBase {

    protected static String mayaId;
    protected static String samId;

    @Autowired
    protected WebTestClient webTestClient;

    @Autowired
    protected MutableClock clock;

    @BeforeEach
    void resetToday() {
        clock.setToday(MutableClock.DEFAULT_TODAY);
    }

    /** Creates the household with Maya and Sam. */
    protected void household() {
        AtomicReference<String> household = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/household").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Maya and Sam\"}").exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, household::set);
        mayaId = member(household.get(), "Maya");
        samId = member(household.get(), "Sam");
    }

    /** A checking account owned by Maya, opened 2026-09-01; a null opening leaves the Balance blank. */
    protected String account(String name, String opening) {
        AtomicReference<String> id = new AtomicReference<>();
        String balance = opening == null ? "" : ", \"openingBalance\": \"" + opening + "\"";
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "checking", "name": "%s", "ownerMemberIds": ["%s"],
                         "openedOn": "2026-09-01"%s}""".formatted(name, mayaId, balance))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec post(String accountId, String path, String key, String json) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/{path}", accountId, path)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(json).exchange();
    }

    /** Body for income or an expense; `memberId` is who entered it. */
    protected String entry(String memberId, String description, String amount, String date, String category) {
        return """
                {"description": "%s", "amount": "%s", "occurredOn": "%s", "category": "%s",
                 "enteredByMemberId": "%s"}""".formatted(description, amount, date, category, memberId);
    }

    protected void saveIncome(String accountId, String key, String amount, String date) {
        post(accountId, "income", key, entry(mayaId, "Salary", amount, date, "Salary")).expectStatus().isCreated();
    }

    protected void saveExpense(String accountId, String key, String amount, String date, String category) {
        post(accountId, "expenses", key, entry(samId, category, amount, date, category)).expectStatus().isCreated();
    }

    protected void assertBalance(String accountId, String amount) {
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.balance.amount").isEqualTo(amount);
    }

    protected void assertActivityCount(String accountId, int count) {
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
