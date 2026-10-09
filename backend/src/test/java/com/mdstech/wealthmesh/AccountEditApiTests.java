package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Slice 18b, group 2: a plain Edit account on a property and an other asset (OTHER_ASSET_001, PROPERTY_001) changes
 * the name and owners and never the Balance, creates no income, and records a rename in the account's history (Q-062).
 * The edit takes the account row lock first: a concurrent state change is not overwritten by the edit's copy of the
 * row.
 */
class AccountEditApiTests extends DefinedBenefitTestBase {

    private static String car;
    private static String home;
    private static String mortgage;

    private WebTestClient.ResponseSpec edit(String id, String name, String owners, String enteredBy) {
        String by = enteredBy == null ? "" : ", \"enteredByMemberId\": \"" + enteredBy + "\"";
        return webTestClient.put().uri("/api/v1/accounts/{id}", id).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"ownerMemberIds\": [%s]%s}".formatted(name, owners, by)).exchange();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> wealth() {
        return webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody(Map.class)
                .returnResult().getResponseBody();
    }

    @Order(0)
    @Test
    @DisplayName("set up: Family Car $30,000 and Family Home $300,000 (Maya), a mortgage, and a checking account")
    void setUp() {
        household();
        account("Everyday Checking", "5000.00");
        car = otherAsset("Family Car", "30000.00", "2026-09-01");
        home = property("Family Home", "300000.00", "2026-09-01");
        mortgage = mortgage("Maple Mortgage", "200000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_OTHER_ASSET_001 the car is one $30,000.00 Balance in the list, its details and the Property and "
            + "other assets group, and not in Bank money or Investments")
    void carIsOneBalanceInOneGroup() {
        webTestClient.get().uri("/api/v1/accounts/{id}", car).exchange().expectBody().jsonPath("$.balance.amount")
                .isEqualTo("30000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.propertyAndOther.accounts[?(@.name=='Family Car')].balance").isEqualTo("30000.00")
                .jsonPath("$.propertyAndOther.accounts[?(@.name=='Family Car')].groups[0]")
                .isEqualTo("propertyAndOther")
                .jsonPath("$.bankMoney.accounts[?(@.name=='Family Car')]").isEmpty()
                .jsonPath("$.investments.accounts[?(@.name=='Family Car')]").isEmpty()
                .jsonPath("$.retirement.accounts[?(@.name=='Family Car')]").isEmpty();
    }

    @Order(2)
    @Test
    @DisplayName("V2_OTHER_ASSET_001 editing the name to Blue Car and the owners to Maya and Sam changes neither the "
            + "Balance nor wealth, and creates no income")
    void carRenamedAndJoint() {
        Object before = wealth().get("netWorth");
        edit(car, "Blue Car", quoted(mayaId) + ", " + quoted(samId), mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.name").isEqualTo("Blue Car").jsonPath("$.ownerMemberIds.length()").isEqualTo(2)
                .jsonPath("$.balance.amount").isEqualTo("30000.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        assertThat(wealth().get("netWorth")).isEqualTo(before);
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-02&to=2026-09-30").exchange().expectBody()
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.change").isEqualTo("0.00")
                .jsonPath("$.other").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", car).exchange().expectStatus().isBadRequest();
    }

    @Order(3)
    @Test
    @DisplayName("V2_PROPERTY_001 renaming a jointly owned home keeps its owners, Balance and value date, the home is "
            + "counted once and the mortgage stays its own debt")
    void homeRenamedKeepsOwnersAndBalance() {
        edit(home, "Family Home", quoted(mayaId) + ", " + quoted(samId), mayaId).expectStatus().isOk();
        Object net = wealth().get("netWorth");
        edit(home, "Maple Street Home", quoted(mayaId) + ", " + quoted(samId), mayaId).expectStatus().isOk()
                .expectBody().jsonPath("$.name").isEqualTo("Maple Street Home")
                .jsonPath("$.ownerMemberIds.length()").isEqualTo(2).jsonPath("$.balance.amount")
                .isEqualTo("300000.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        assertThat(wealth().get("netWorth")).isEqualTo(net);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.propertyAndOther.accounts[?(@.name=='Maple Street Home')].balance")
                .isEqualTo("300000.00")
                .jsonPath("$.propertyAndOther.accounts[?(@.name=='Maple Street Home')].valueDate")
                .isEqualTo("2026-09-01")
                .jsonPath("$.propertyAndOther.accounts.length()").isEqualTo(2)
                .jsonPath("$.mortgages.accounts[0].name").isEqualTo("Maple Mortgage")
                .jsonPath("$.mortgages.accounts[0].balance").isEqualTo("-200000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", mortgage).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("-200000.00");
    }

    @Order(4)
    @Test
    @DisplayName("Q-062 Q-064 a rename adds one history row saying what it was renamed from and who did it, a change "
            + "of owners adds one saying who owned it before and after; an edit that keeps both adds none")
    void renameIsInTheHistory() {
        webTestClient.get().uri("/api/v1/accounts/{id}/events", car).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.action == 'renamed')].detail").isEqualTo("Family Car")
                .jsonPath("$[?(@.action == 'renamed')].memberId").isEqualTo(mayaId)
                .jsonPath("$[?(@.action == 'owner_changed')].detail").isEqualTo("Maya → Maya and Sam")
                .jsonPath("$[?(@.action == 'owner_changed')].memberId").isEqualTo(mayaId);
        edit(car, "Blue Car", quoted(mayaId) + ", " + quoted(samId), mayaId).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", car).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2);
    }

    @Order(5)
    @Test
    @DisplayName("Q-062 an edit entered by a member who is not active is refused and changes nothing")
    void inactiveEnteringMemberIsRefused() {
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            edit(car, "Red Car", quoted(mayaId), samId).expectStatus().isBadRequest();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
        webTestClient.get().uri("/api/v1/accounts/{id}", car).exchange().expectBody().jsonPath("$.name")
                .isEqualTo("Blue Car");
    }

    @Order(8)
    @Test
    @DisplayName("Q-062 an edit entered by someone who is not a member of this household is refused")
    void foreignEnteringMemberIsRefused() {
        edit(car, "Red Car", quoted(mayaId), java.util.UUID.randomUUID().toString()).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose who entered this from this household");
        webTestClient.get().uri("/api/v1/accounts/{id}", car).exchange().expectBody().jsonPath("$.name")
                .isEqualTo("Green Car");
    }

    @Order(6)
    @Test
    @DisplayName("Q-062 an edit waits for an archive that is still open, then keeps it archived: the account row is "
            + "locked before the edit reads and rewrites it")
    void editWaitsForTheAccountRow() throws Exception {
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.account SET status = 'archived' WHERE id = $1", car);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(edit(car, "Green Car", quoted(mayaId),
                    mayaId)));
            Thread.sleep(600);
            assertThat(status).as("the edit waits for the account row").isNotDone();
            commit(other);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        } finally {
            close(other);
        }
        webTestClient.get().uri("/api/v1/accounts/{id}", car).exchange().expectBody().jsonPath("$.name")
                .isEqualTo("Green Car").jsonPath("$.status").isEqualTo("archived");
    }

    @Order(7)
    @Test
    @DisplayName("Q-062 an edit entered by a member who is being deactivated waits for that row, then refuses them")
    void editWaitsForTheEnteringMemberRow() throws Exception {
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(edit(car, "Black Car", quoted(mayaId),
                    samId)));
            Thread.sleep(600);
            assertThat(status).as("the edit waits for the member row").isNotDone();
            commit(other);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(other);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
        webTestClient.get().uri("/api/v1/accounts/{id}", car).exchange().expectBody().jsonPath("$.name")
                .isEqualTo("Green Car");
    }

    @Order(9)
    @Test
    @DisplayName("Q-062 the edit's own response carries the current value, so its sentence states the right figure: "
            + "a property valued $31,000.00 on 2026-09-15 reads $31,000.00 after a rename, not its opening")
    void editResponseCarriesTheCurrentValue() {
        String field = property("Value Field", "30000.00", "2026-09-01");
        savedValue(field, "edit-value-1", "31000.00", "2026-09-15", null);
        edit(field, "Value Meadow", quoted(mayaId), mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("31000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-15");
    }
}
