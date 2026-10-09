package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;
import reactor.core.publisher.Mono;

/**
 * Slice 18c, groups 1 and 2 (401K_007, HSA_007, ROTH_IRA_007, TRAD_IRA_007): the four retirement and health types have
 * one owner, and the reviewed owner correction changes who owns an account and nothing else. Cash, holdings and Balance
 * stay, no income is made, and the history keeps the previous owner. The correction takes the account row lock, is
 * refused in its review exactly as at Confirm, and the plain Edit no longer changes the owners of these types.
 */
class OwnerCorrectionApiTests extends DefinedBenefitTestBase {

    private static final String[] FOUR = { "401k", "traditional_ira", "roth_ira", "hsa" };
    private static final Map<String, String> MESSAGE = Map.of(
            "401k", "A 401(k) has one owner. Choose one member.",
            "traditional_ira", "A Traditional IRA has one owner. Choose one member.",
            "roth_ira", "A Roth IRA has one owner. Choose one member.",
            "hsa", "An HSA has one owner. Choose one member.");

    private static String harbor;
    private static String willowTrad;
    private static String willowRoth;
    private static String meadow;

    private static final String CASH_AND_HOLDINGS = "{\"cash\": \"%s\", \"holdings\": [%s]}";

    /** An investment account of `type` owned by `owner`, 60,000.00 cash and 200 shares at 100.00 (80,000.00). */
    private String investmentFor(String type, String name, String owner) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "%s", "name": "%s", "institution": "Harbor Benefits", "ownerMemberIds": ["%s"],
                 "openedOn": "2026-09-01", "enteredByMemberId": "%s", "opening": %s}"""
                .formatted(type, name, owner, mayaId, CASH_AND_HOLDINGS.formatted("60000.00",
                        holding("HOME", "200", "100.00", "2026-09-01"))))
                .exchange().expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private WebTestClient.ResponseSpec correction(String path, String id, String owners, String enteredBy) {
        String by = enteredBy == null ? "" : ", \"enteredByMemberId\": \"" + enteredBy + "\"";
        return webTestClient.post().uri("/api/v1/accounts/{id}/owner-correction" + path, id)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"ownerMemberIds\": [%s]%s}".formatted(owners, by)).exchange();
    }

    private WebTestClient.ResponseSpec review(String id, String owners, String enteredBy) {
        return correction("/review", id, owners, enteredBy);
    }

    private WebTestClient.ResponseSpec save(String id, String owners, String enteredBy) {
        return correction("", id, owners, enteredBy);
    }

    /** The review and the save refuse with the same status and message, and nothing is written. */
    private void refusedByBoth(String id, String owners, String enteredBy, int status, String message) {
        for (WebTestClient.ResponseSpec spec : List.of(review(id, owners, enteredBy), save(id, owners, enteredBy))) {
            spec.expectStatus().isEqualTo(status).expectBody().jsonPath("$.message").isEqualTo(message);
        }
    }

    private void sql(String statement, UUID... params) {
        Connection connection = Mono.from(connectionFactory.create()).block();
        try {
            var spec = connection.createStatement(statement);
            for (int i = 0; i < params.length; i++) {
                spec.bind(i, params[i]);
            }
            Mono.from(spec.execute()).flatMap(result -> Mono.from(result.getRowsUpdated())).block();
        } finally {
            close(connection);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> wealth() {
        return webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody(Map.class)
                .returnResult().getResponseBody();
    }

    private void assertOwners(String id, String... owners) {
        webTestClient.get().uri("/api/v1/accounts/{id}", id).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.ownerMemberIds.length()").isEqualTo(owners.length)
                .jsonPath("$.ownerMemberIds").value(List.class, ids -> assertThat(ids).containsExactlyInAnyOrder(
                        (Object[]) owners));
    }

    private void assertEventCount(String id, int count) {
        webTestClient.get().uri("/api/v1/accounts/{id}/events", id).exchange().expectBody().jsonPath("$.length()")
                .isEqualTo(count);
    }

    @Order(0)
    @Test
    @DisplayName("set up: Harbor 401(k) (Sam), Willow Traditional and Roth IRA and Meadow HSA (Maya), each $80,000.00")
    void setUp() {
        household();
        harbor = investmentFor("401k", "Harbor 401k", samId);
        willowTrad = investmentFor("traditional_ira", "Willow Traditional IRA", mayaId);
        willowRoth = investmentFor("roth_ira", "Willow Roth IRA", mayaId);
        meadow = investmentFor("hsa", "Meadow HSA", mayaId);
        assertThat(wealth()).containsEntry("financialAssets", "320000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_401K_007 V2_HSA_007 V2_ROTH_IRA_007 V2_TRAD_IRA_007 a second owner is refused at setup, in the "
            + "setup review and when editing, for each of the four types, with a message that names the type")
    void twoOwnersAreRefusedPerType() {
        for (String type : FOUR) {
            String body = """
                    {"type": "%s", "name": "Joint %s", "institution": "Harbor Benefits",
                     "ownerMemberIds": ["%s", "%s"], "openedOn": "2026-09-01", "enteredByMemberId": "%s",
                     "opening": %s}""".formatted(type, type, mayaId, samId, mayaId,
                    CASH_AND_HOLDINGS.formatted("100.00", holding("HOME", "1", "100.00", "2026-09-01")));
            for (String path : List.of("/api/v1/accounts", "/api/v1/accounts/opening-preview")) {
                webTestClient.post().uri(path).contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange()
                        .expectStatus().isBadRequest().expectBody().jsonPath("$.message").isEqualTo(MESSAGE.get(type));
            }
            assertAccountNamed("Joint " + type, false);
        }
        String both = quoted(mayaId) + ", " + quoted(samId);
        for (String id : List.of(harbor, willowTrad, willowRoth, meadow)) {
            webTestClient.put().uri("/api/v1/accounts/{id}", id).contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("{\"name\": \"X\", \"ownerMemberIds\": [" + both + "]}").exchange().expectStatus()
                    .isBadRequest().expectBody().jsonPath("$.message")
                    .isEqualTo("Use Change owner to change who owns this account. It is reviewed first.");
        }
        assertWealthAssets("320000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_401K_007 the review names the previous and the new owner and the Balance it keeps, and writes "
            + "nothing")
    void reviewWritesNothing() {
        review(harbor, quoted(mayaId), mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.name").isEqualTo("Harbor 401k").jsonPath("$.from.length()").isEqualTo(1)
                .jsonPath("$.from[0].name").isEqualTo("Sam").jsonPath("$.to[0].name").isEqualTo("Maya")
                .jsonPath("$.balance").isEqualTo("80000.00");
        assertOwners(harbor, samId);
        assertEventCount(harbor, 1);
    }

    @Order(3)
    @Test
    @DisplayName("V2_401K_007 Maya saves the reviewed correction: Sam's 401(k) is Maya's, cash, holdings and Balance "
            + "are unchanged, no income is made, and the history keeps Sam")
    void correctionKeepsMoneyAndHistory() {
        Map<String, Object> before = wealth();
        String openingBefore = new String(webTestClient.get().uri("/api/v1/accounts/{id}/opening", harbor)
                .exchange().expectBody().returnResult().getResponseBody());
        save(harbor, quoted(mayaId), mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(mayaId).jsonPath("$.balance.amount")
                .isEqualTo("80000.00");
        assertOwners(harbor, mayaId);
        assertThat(wealth()).isEqualTo(before);
        assertThat(new String(webTestClient.get().uri("/api/v1/accounts/{id}/opening", harbor).exchange()
                .expectBody().returnResult().getResponseBody())).isEqualTo(openingBefore);
        assertNoMoneyRecords(harbor);
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-10-03").exchange().expectBody()
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00")
                .jsonPath("$.corrections").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/events", harbor).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2).jsonPath("$[0].action").isEqualTo("owner_changed")
                .jsonPath("$[0].detail").isEqualTo("Sam → Maya").jsonPath("$[0].memberId").isEqualTo(mayaId)
                .jsonPath("$[1].action").isEqualTo("set_up");
    }

    @Order(4)
    @Test
    @DisplayName("V2_HSA_007 V2_ROTH_IRA_007 V2_TRAD_IRA_007 Maya changes each IRA and the HSA to Sam: Balance "
            + "unchanged, the previous owner in the history")
    void eachOtherTypeIsCorrected() {
        for (String id : List.of(willowTrad, willowRoth, meadow)) {
            review(id, quoted(samId), mayaId).expectStatus().isOk().expectBody().jsonPath("$.from[0].name")
                    .isEqualTo("Maya").jsonPath("$.to[0].name").isEqualTo("Sam");
            save(id, quoted(samId), mayaId).expectStatus().isOk().expectBody().jsonPath("$.balance.amount")
                    .isEqualTo("80000.00");
            assertOwners(id, samId);
            assertNoMoneyRecords(id);
            webTestClient.get().uri("/api/v1/accounts/{id}/events", id).exchange().expectBody()
                    .jsonPath("$[0].action").isEqualTo("owner_changed").jsonPath("$[0].detail")
                    .isEqualTo("Maya → Sam");
        }
        assertWealthAssets("320000.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_401K_007 V2_HSA_007 V2_ROTH_IRA_007 V2_TRAD_IRA_007 the review refuses what the save refuses, "
            + "and a refusal changes nothing: two owners per type, the same owner, nobody, a stranger, an "
            + "inactive new owner")
    void refusalsAreTheSameInReviewAndSave() {
        String both = quoted(mayaId) + ", " + quoted(samId);
        refusedByBoth(harbor, both, mayaId, 400, MESSAGE.get("401k"));
        refusedByBoth(willowTrad, both, mayaId, 400, MESSAGE.get("traditional_ira"));
        refusedByBoth(willowRoth, both, mayaId, 400, MESSAGE.get("roth_ira"));
        refusedByBoth(meadow, both, mayaId, 400, MESSAGE.get("hsa"));
        refusedByBoth(harbor, quoted(mayaId), mayaId, 400, "Choose a different owner");
        refusedByBoth(harbor, "", mayaId, 400, "Choose an owner");
        refusedByBoth(harbor, quoted(UUID.randomUUID().toString()), mayaId, 400,
                "Choose an owner from this household");
        refusedByBoth(harbor, quoted(samId), null, 400, "Choose who entered this");
        refusedByBoth(harbor, quoted(samId), UUID.randomUUID().toString(), 400,
                "Choose who entered this from this household");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            refusedByBoth(harbor, quoted(samId), mayaId, 400, "Choose an active member");
            refusedByBoth(harbor, quoted(mayaId), samId, 400, "Choose a different owner");
            refusedByBoth(willowTrad, quoted(mayaId), samId, 400, "Choose an active member");
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
        assertOwners(harbor, mayaId);
        assertEventCount(harbor, 2);
    }

    @Order(6)
    @Test
    @DisplayName("Q-064 a brokerage can be joint: its correction may name both members, and the history says so")
    void brokerageCorrectionMayBeJoint() {
        String brokerage = investmentFor("brokerage", "Redwood Brokerage", samId);
        save(brokerage, quoted(mayaId) + ", " + quoted(samId), mayaId).expectStatus().isOk();
        assertOwners(brokerage, mayaId, samId);
        webTestClient.get().uri("/api/v1/accounts/{id}/events", brokerage).exchange().expectBody()
                .jsonPath("$[0].detail").isEqualTo("Sam → Maya and Sam");
        assertWealthAssets("400000.00");
    }

    @Order(7)
    @Test
    @DisplayName("Q-064 the plain Edit changes the name and institution of these types and refuses an owner change; "
            + "a type with no history of its own is not corrected here")
    void plainEditNoLongerChangesOwners() {
        webTestClient.put().uri("/api/v1/accounts/{id}", harbor).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Harbor Retirement\", \"institution\": \"Harbor\", \"ownerMemberIds\": ["
                        + quoted(mayaId) + "]}").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(mayaId);
        webTestClient.put().uri("/api/v1/accounts/{id}", harbor).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Harbor 401k\", \"ownerMemberIds\": [" + quoted(samId) + "]}").exchange()
                .expectStatus().isBadRequest();
        webTestClient.put().uri("/api/v1/accounts/{id}", harbor).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Harbor 401k\", \"ownerMemberIds\": [" + quoted(mayaId) + "]}").exchange()
                .expectStatus().isOk();
        String checking = account("Everyday Checking", "5000.00");
        review(checking, quoted(samId), mayaId).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Change who owns this account from Edit account");
        save(checking, quoted(samId), mayaId).expectStatus().isBadRequest();
        assertOwners(harbor, mayaId);
    }

    @Order(8)
    @Test
    @DisplayName("Q-064 an owner change in the plain Edit of a checking account adds the same history row")
    void plainEditOfOtherTypesRecordsTheOwnerChange() {
        String checking = account("Joint Checking", "5000.00");
        webTestClient.put().uri("/api/v1/accounts/{id}", checking).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Joint Checking\", \"ownerMemberIds\": [%s, %s], \"enteredByMemberId\": \"%s\"}"
                        .formatted(quoted(mayaId), quoted(samId), samId)).exchange().expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", checking).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].action").isEqualTo("owner_changed")
                .jsonPath("$[0].detail").isEqualTo("Maya → Maya and Sam").jsonPath("$[0].memberId")
                .isEqualTo(samId);
    }

    @Order(9)
    @Test
    @DisplayName("V2_401K_007 an account that was joint before the rule still shows, counts once, edits its other "
            + "fields, and its owner correction needs one named member")
    void aJointRowFromBeforeTheRule() {
        String legacy = investmentFor("401k", "Old Joint 401k", mayaId);
        sql("INSERT INTO wealthmesh.account_owner (account_id, member_id, household_id) "
                + "SELECT $1, $2, household_id FROM wealthmesh.account WHERE id = $1", UUID.fromString(legacy),
                UUID.fromString(samId));
        assertOwners(legacy, mayaId, samId);
        // It shows in the list and in the wealth groups, once, and its $80,000.00 is counted once.
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.name == 'Old Joint 401k')].ownerMemberIds.length()").value(List.class,
                        sizes -> assertThat(sizes).containsExactly(2));
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.investments.accounts[?(@.name == 'Old Joint 401k')].length()").value(List.class,
                        found -> assertThat(found).hasSize(1))
                .jsonPath("$.retirement.accounts[?(@.name == 'Old Joint 401k')].balance")
                .isEqualTo("80000.00");
        // Its other fields can be edited while the owners stay as they are.
        String both = quoted(mayaId) + ", " + quoted(samId);
        webTestClient.put().uri("/api/v1/accounts/{id}", legacy).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Old Joint Retirement\", \"institution\": \"Maple\", \"ownerMemberIds\": ["
                        + both + "]}").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.ownerMemberIds.length()").isEqualTo(2);
        // The correction needs one named member: both again, or nobody, is refused; one is accepted.
        refusedByBoth(legacy, both, mayaId, 400, MESSAGE.get("401k"));
        refusedByBoth(legacy, "", mayaId, 400, "Choose an owner");
        review(legacy, quoted(samId), mayaId).expectStatus().isOk().expectBody().jsonPath("$.from.length()")
                .isEqualTo(2).jsonPath("$.to.length()").isEqualTo(1);
        save(legacy, quoted(samId), mayaId).expectStatus().isOk();
        assertOwners(legacy, samId);
        webTestClient.get().uri("/api/v1/accounts/{id}/events", legacy).exchange().expectBody()
                .jsonPath("$[0].detail").isEqualTo("Maya and Sam → Sam");
        sql("DELETE FROM wealthmesh.account_owner WHERE account_id = $1", UUID.fromString(legacy));
    }

    @Order(10)
    @Test
    @DisplayName("Q-064 a correction waits for an archive that is still open: the account row is locked before the "
            + "owners are read")
    void correctionWaitsForTheAccountRow() throws Exception {
        Connection other = holdUncommitted("UPDATE wealthmesh.account SET status = 'archived' WHERE id = $1", meadow);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(save(meadow, quoted(mayaId), mayaId)));
            Thread.sleep(600);
            assertThat(status).as("the correction waits for the account row").isNotDone();
            commit(other);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        } finally {
            close(other);
        }
        assertOwners(meadow, mayaId);
        webTestClient.get().uri("/api/v1/accounts/{id}", meadow).exchange().expectBody().jsonPath("$.status")
                .isEqualTo("archived");
    }

    @Order(11)
    @Test
    @DisplayName("Q-064 two corrections at once take turns: the second sees the first's owner and is refused as "
            + "no change")
    void twoCorrectionsTakeTurns() throws Exception {
        Connection other = holdUncommitted("UPDATE wealthmesh.account SET status = 'archived' WHERE id = $1",
                willowRoth);
        try {
            CompletableFuture<Integer> first = async(() -> statusOf(save(willowRoth, quoted(mayaId), mayaId)));
            CompletableFuture<Integer> second = async(() -> statusOf(save(willowRoth, quoted(mayaId), samId)));
            Thread.sleep(600);
            assertThat(first).isNotDone();
            commit(other);
            List<Integer> statuses = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertThat(statuses).containsExactlyInAnyOrder(200, 400);
        } finally {
            close(other);
        }
        assertOwners(willowRoth, mayaId);
        webTestClient.get().uri("/api/v1/accounts/{id}/events", willowRoth).exchange().expectBody()
                .jsonPath("$[?(@.action == 'owner_changed')].length()").value(List.class,
                        rows -> assertThat(rows).hasSize(2));
    }

    @Order(13)
    @Test
    @DisplayName("Q-064 state matrix: a draft is refused by the review and the save (409), an archived and a closed "
            + "account may be corrected, a deleted account is not found")
    void stateMatrix() {
        // A draft: holdings without cash. It is refused by both, and its owner is chosen in the plain Edit.
        AtomicReference<String> draft = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "hsa", "name": "Draft HSA", "institution": "Harbor Benefits", "ownerMemberIds": ["%s"],
                 "openedOn": "2026-09-01", "enteredByMemberId": "%s", "opening": {"holdings": [%s]}}"""
                .formatted(mayaId, mayaId, holding("HOME", "1", "100.00", "2026-09-01"))).exchange().expectStatus()
                .isCreated().expectBody().jsonPath("$.status").isEqualTo("draft").jsonPath("$.id")
                .value(String.class, draft::set);
        refusedByBoth(draft.get(), quoted(samId), mayaId, 409,
                "Draft HSA is a draft. Choose its owner in Finish setup.");
        webTestClient.put().uri("/api/v1/accounts/{id}", draft.get()).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Draft HSA\", \"ownerMemberIds\": [" + quoted(samId) + "]}").exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.ownerMemberIds[0]").isEqualTo(samId);
        webTestClient.put().uri("/api/v1/accounts/{id}", draft.get()).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Draft HSA\", \"ownerMemberIds\": [" + quoted(mayaId) + ", "
                        + quoted(samId) + "]}").exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo(MESSAGE.get("hsa"));
        // A closed account (zero Balance): an ownership change is a detail, like a rename (Q-063).
        String closing = investmentFor("roth_ira", "Closing Roth", mayaId);
        sql("UPDATE wealthmesh.account SET status = 'closed' WHERE id = $1", UUID.fromString(closing));
        save(closing, quoted(samId), mayaId).expectStatus().isOk();
        assertOwners(closing, samId);
        // A deleted account is not found.
        String gone = investmentFor("hsa", "Gone HSA", mayaId);
        sql("UPDATE wealthmesh.account SET deleted_at = now() WHERE id = $1", UUID.fromString(gone));
        review(gone, quoted(samId), mayaId).expectStatus().isNotFound();
        save(gone, quoted(samId), mayaId).expectStatus().isNotFound();
    }

    @Order(12)
    @Test
    @DisplayName("Q-064 a correction entered by a member who is being deactivated waits for that row, then refuses "
            + "them")
    void correctionWaitsForTheEnteringMemberRow() throws Exception {
        Connection other = holdUncommitted("UPDATE wealthmesh.household_member SET active = false WHERE id = $1",
                samId);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(save(harbor, quoted(samId), samId)));
            Thread.sleep(600);
            assertThat(status).as("the correction waits for the member row").isNotDone();
            commit(other);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(other);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
        assertOwners(harbor, mayaId);
    }
}
