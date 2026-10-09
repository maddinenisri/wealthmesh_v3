package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 18a, groups 0 and 1: a defined benefit is a plan-reported value held by one participant. It is a valued
 * account (no cash, holdings or activity), sits in Retirement and in no other group, and counts once in wealth.
 */
class DefinedBenefitSetupApiTests extends DefinedBenefitTestBase {

    private static String plan;

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_DB_001 Sam adds Harbor Cash Balance at $40,000.00: list, detail and wealth use the one Balance, "
            + "and Retirement holds it")
    void createPlanValue() {
        plan = plan("Harbor Cash Balance", samId, "40000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.type").isEqualTo("defined_benefit").jsonPath("$.balance.amount")
                .isEqualTo("40000.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.ownerMemberIds.length()").isEqualTo(1).jsonPath("$.ownerMemberIds[0]").isEqualTo(samId);
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.name=='Harbor Cash Balance')].balance.amount").isEqualTo("40000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("40000.00").jsonPath("$.netWorth").isEqualTo("40000.00")
                .jsonPath("$.retirement.total").isEqualTo("40000.00")
                .jsonPath("$.retirement.accounts[0].name").isEqualTo("Harbor Cash Balance")
                .jsonPath("$.investments.total").isEqualTo("0.00").jsonPath("$.propertyAndOther.total")
                .isEqualTo("0.00").jsonPath("$.bankMoney.total").isEqualTo("0.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_DB_001 Maya edits the name and institution: both members see the changed details and the same "
            + "Balance and participant Sam; the edit cannot carry money")
    void editDetails() {
        editAccount(plan, "Harbor Cash Balance Main", "Harbor Benefits Services", quoted(samId)).expectStatus().isOk()
                .expectBody().jsonPath("$.name").isEqualTo("Harbor Cash Balance Main").jsonPath("$.institution")
                .isEqualTo("Harbor Benefits Services").jsonPath("$.balance.amount").isEqualTo("40000.00")
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(samId);
        webTestClient.put().uri("/api/v1/accounts/{id}", plan).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"X\", \"institution\": \"Y\", \"ownerMemberIds\": [\"" + samId
                        + "\"], \"openingBalance\": \"1.00\"}").exchange().expectStatus().isBadRequest();
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectBody().jsonPath("$.balance.amount")
                .isEqualTo("40000.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_DB_001 who set it up is recorded as the member who entered it, and a setup without one is refused")
    void creatorRecorded() {
        // The earlier edit of this class renamed the plan, so its history is the rename and then the setup.
        webTestClient.get().uri("/api/v1/accounts/{id}/events", plan).exchange().expectBody()
                .jsonPath("$[*].action").value(java.util.List.class,
                        found -> org.assertj.core.api.Assertions.assertThat(found)
                                .containsExactly("renamed", "set_up"))
                .jsonPath("$[?(@.action=='set_up')].memberId").value(java.util.List.class,
                        found -> org.assertj.core.api.Assertions.assertThat(found).containsExactly(samId));
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(planBody("Other Plan", "Harbor Benefits", quoted(samId), "1.00", "2026-09-01", null))
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Choose who entered this");
        assertAccountCount(1);
    }

    @Order(4)
    @Test
    @DisplayName("V2_DB_002 a blank starting amount starts the plan value at $0.00 on its date; no pension promise is "
            + "recorded or counted")
    void blankStart() {
        String blank = plan("Blank Plan", samId, null, "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", blank).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.openingAmount").isEqualTo("0.00").jsonPath("$.pensionPromise").doesNotExist()
                .jsonPath("$.monthlyPromise").doesNotExist();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.financialAssets")
                .isEqualTo("40000.00").jsonPath("$.netWorth").isEqualTo("40000.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_DB_006 a defined benefit has one participant: two owners are refused on create and on edit, "
            + "and the owner stays Sam")
    void oneParticipant() {
        String message = "A defined benefit has one participant. Choose one member.";
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(planBody("Joint Plan", "Harbor Benefits", quoted(mayaId) + "," + quoted(samId), "1.00",
                        "2026-09-01", samId)).exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo(message);
        // The plain Edit no longer changes the participant (Q-064); the reviewed correction does, and refuses two.
        editAccount(plan, "Harbor Cash Balance Main", "Harbor Benefits Services", quoted(mayaId) + "," + quoted(samId))
                .expectStatus().isBadRequest();
        correct(plan, quoted(mayaId) + "," + quoted(samId), mayaId).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo(message);
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectBody()
                .jsonPath("$.ownerMemberIds.length()").isEqualTo(1).jsonPath("$.ownerMemberIds[0]").isEqualTo(samId);
        // Another member may be the single participant: the choice is one named member.
        correct(plan, quoted(mayaId), mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(mayaId);
        correct(plan, quoted(samId), mayaId).expectStatus().isOk();
        assertAccountCount(2);
    }

    @Order(6)
    @Test
    @DisplayName("V2_DB_005 a negative plan value is refused when the account is set up and no account is created")
    void negativeAtSetup() {
        createPlan("Negative Plan", samId, "-100.00", "2026-09-01").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Plan value must be zero or greater");
        assertAccountCount(2);
    }

    @Order(7)
    @Test
    @DisplayName("V2_HOUSEHOLD_SETUP_002 a defined benefit takes no money in or out: the type gate refuses an expense, "
            + "income, a transfer and Update balance on it")
    void takesNoActivity() {
        post(plan, "expenses", "k-1", entry(samId, "Lunch", "5.00", "2026-09-10", "Groceries")).expectStatus()
                .isBadRequest();
        post(plan, "income", "k-2", entry(samId, "Pay", "5.00", "2026-09-10", "Salary")).expectStatus()
                .isBadRequest();
        post(plan, "statements", "k-3", "{\"statementOn\": \"2026-09-30\", \"balance\": \"0.00\", "
                + "\"note\": \"Sep\", \"enteredByMemberId\": \"" + samId + "\"}").expectStatus().isBadRequest();
        String bank = account("Plan Bank", "1000.00");
        postTransfer("k-4", bank, plan, "5.00", "2026-09-07", samId).expectStatus().isBadRequest();
        postTransfer("k-5", plan, bank, "5.00", "2026-09-07", samId).expectStatus().isBadRequest();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", plan).exchange().expectStatus().isBadRequest();
    }

    @Order(8)
    @Test
    @DisplayName("V2_DB_001 a create waits for a member being deactivated, then refuses that member as the one "
            + "entering it, and no account is created")
    void createWaitsForMemberRow() throws Exception {
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", mayaId);
        try {
            java.util.concurrent.CompletableFuture<Integer> status = async(() -> statusOf(webTestClient.post()
                    .uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(planBody("Race Plan", "Harbor Benefits", quoted(samId), "1.00", "2026-09-01", mayaId))
                    .exchange()));
            Thread.sleep(600);
            assertThat(status).as("the create waits for the member row").isNotDone();
            commit(other);
            assertThat(status.get(10, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(other);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus()
                    .isOk();
        }
        assertAccountNamed("Race Plan", false);
    }

    @Order(9)
    @Test
    @DisplayName("V2_DB_006 a correction that names a new participant waits for that member being deactivated, then "
            + "refuses them, and the participant stays Sam")
    void editWaitsForParticipantRow() throws Exception {
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", mayaId);
        try {
            java.util.concurrent.CompletableFuture<Integer> status = async(() -> statusOf(correct(plan,
                    quoted(mayaId), samId)));
            Thread.sleep(600);
            assertThat(status).as("the edit waits for the member row").isNotDone();
            commit(other);
            assertThat(status.get(10, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(other);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", mayaId).exchange().expectStatus()
                    .isOk();
        }
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectBody()
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(samId);
    }
}
