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

import java.util.UUID;

import io.r2dbc.spi.Connection;
import io.r2dbc.spi.ConnectionFactory;
import reactor.core.publisher.Mono;

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

    @Autowired
    protected ConnectionFactory connectionFactory;

    /**
     * Race tests: starts a transaction on its own connection and runs a write that stays uncommitted, so its row lock
     * is held. Call {@link #commit} then {@link #close} (in a finally) to release it. A race test must fail when the
     * lock it claims is taken out of the service.
     */
    protected Connection holdUncommitted(String sql, String id) {
        Connection connection = Mono.from(connectionFactory.create()).block();
        Mono.from(connection.beginTransaction()).block();
        Mono.from(connection.createStatement(sql).bind(0, UUID.fromString(id)).execute())
                .flatMap(result -> Mono.from(result.getRowsUpdated())).block();
        return connection;
    }

    protected void commit(Connection connection) {
        Mono.from(connection.commitTransaction()).block();
    }

    protected void close(Connection connection) {
        Mono.from(connection.close()).block();
    }

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

    /** A checking account owned by Maya with its start on the given date. */
    protected String accountOpenedOn(String name, String opening, String openedOn) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "checking", "name": "%s", "ownerMemberIds": ["%s"],
                         "openedOn": "%s", "openingBalance": "%s"}""".formatted(name, mayaId, openedOn, opening))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    /** A savings account owned by Maya with its start on the given date. */
    protected String savings(String name, String opening, String openedOn) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "savings", "name": "%s", "institution": "Harbor Bank", "ownerMemberIds": ["%s"],
                         "openedOn": "%s", "openingBalance": "%s"}""".formatted(name, mayaId, openedOn, opening))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    /** A credit card at Harbor Cards owned by Maya; `side` is "owed" or "credit", null for a blank Balance. */
    protected String card(String name, String amount, String side, String openedOn) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(cardBody(name, amount, side, openedOn)).exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    protected String cardBody(String name, String amount, String side, String openedOn) {
        String balance = amount == null ? "" : ", \"openingBalance\": \"" + amount + "\"";
        String sideField = side == null ? "" : ", \"balanceSide\": \"" + side + "\"";
        return """
                {"type": "credit_card", "name": "%s", "institution": "Harbor Cards", "ownerMemberIds": ["%s"],
                 "openedOn": "%s"%s%s}""".formatted(name, mayaId, openedOn, balance, sideField);
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
