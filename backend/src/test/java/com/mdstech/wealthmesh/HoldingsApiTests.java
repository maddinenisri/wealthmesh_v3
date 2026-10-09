package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Slice 19a: the holdings of an investment account are shown with the one Balance of the list, the detail and
 * wealth, and an unknown purchase cost is "not available" (null on the wire), never zero. Cost is optional on each
 * opening line; a repeated symbol is a second line, so a partly known cost needs no extra field (Q-066).
 */
class HoldingsApiTests extends InvestmentTestBase {

    /** One type as its feature file words it; `joint` means the owner is both members. */
    private record Kind(String wire, String name, String institution, String owner, String total, String cash,
            String shares, String holdings, String editedName, String editedInstitution) {
        @Override
        public String toString() {
            return wire;
        }
    }

    private static final Kind BROKERAGE = new Kind("brokerage", "Redwood Brokerage", "Redwood Investments", "both",
            "20000.00", "15000.00", "50", "5000.00", "Redwood Brokerage Main", "Redwood Investments Services");
    private static final Kind K401 = new Kind("401k", "Harbor 401k", "Harbor Benefits", "sam", "80000.00",
            "60000.00", "200", "20000.00", "Harbor 401k Main", "Harbor Benefits Services");
    private static final Kind HSA = new Kind("hsa", "Meadow HSA", "Meadow Health Savings", "maya", "3050.00",
            "1050.00", "20", "2000.00", "Meadow HSA Main", "Meadow Health Savings Services");
    private static final Kind ROTH = new Kind("roth_ira", "Willow Roth IRA", "Willow Investments", "maya",
            "6000.00", "1000.00", "50", "5000.00", "Willow Roth IRA Main", "Willow Investments Services");
    private static final Kind TRAD = new Kind("traditional_ira", "Willow Traditional IRA", "Willow Investments",
            "maya", "30000.00", "20000.00", "100", "10000.00", "Willow Traditional IRA Main",
            "Willow Investments Services");

    private static Stream<Kind> kinds() {
        return Stream.of(BROKERAGE, K401, HSA, ROTH, TRAD);
    }

    private String owners(Kind kind) {
        return switch (kind.owner()) {
            case "both" -> "\"" + mayaId + "\", \"" + samId + "\"";
            case "sam" -> "\"" + samId + "\"";
            default -> "\"" + mayaId + "\"";
        };
    }

    private WebTestClient.ResponseSpec create(String path, Kind kind, String name, String opening) {
        return webTestClient.post().uri(path).contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "%s", "name": "%s", "institution": "%s", "ownerMemberIds": [%s], "openedOn": "2026-09-01",
                 "enteredByMemberId": "%s", "opening": %s}""".formatted(kind.wire(), name, kind.institution(),
                owners(kind), mayaId, opening)).exchange();
    }

    private WebTestClient.ResponseSpec holdings(String account) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/holdings", account).exchange();
    }

    private String save(Kind kind, String name, String opening) {
        AtomicReference<String> id = new AtomicReference<>();
        create("/api/v1/accounts", kind, name, opening).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    private void assertWealthLine(String account, String balance) {
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.investments.accounts[?(@.accountId == '" + account + "')].balance")
                .value(List.class, found -> assertThat(found).containsExactly(balance));
    }

    private void assertListBalance(String account, String balance, String asOf) {
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.id == '" + account + "')].balance.amount")
                .value(List.class, found -> assertThat(found).containsExactly(balance))
                .jsonPath("$[?(@.id == '" + account + "')].balance.asOf")
                .value(List.class, found -> assertThat(found).containsExactly(asOf));
    }

    private int accountCount() {
        AtomicReference<Integer> count = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()")
                .value(Integer.class, count::set);
        return count.get();
    }

    @Order(0)
    @Test
    @DisplayName("V2_BROKERAGE_001 set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @ParameterizedTest(name = "V2_BROKERAGE_001 V2_401K_001 V2_HSA_001 V2_ROTH_IRA_001 V2_TRAD_IRA_001 {0}: the list, "
            + "detail, wealth and holdings use one Balance; cost and gain are not available; an edit by Sam keeps it")
    @MethodSource("kinds")
    void completeOpeningThenEdit(Kind kind) {
        String components = opening(kind.total(), kind.cash(), holding("HOME", kind.shares(), "100.00", "2026-09-01"));
        create("/api/v1/accounts/opening-preview", kind, kind.name(), components).expectStatus().isOk().expectBody()
                .jsonPath("$.state").isEqualTo("complete").jsonPath("$.difference").isEqualTo("0.00")
                .jsonPath("$.holdings[0].cost").doesNotExist().jsonPath("$.holdings[0].gain").doesNotExist();
        String id = save(kind, kind.name(), components);
        webTestClient.get().uri("/api/v1/accounts/{id}", id).exchange().expectBody().jsonPath("$.balance.amount")
                .isEqualTo(kind.total()).jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        assertListBalance(id, kind.total(), "2026-09-01");
        assertWealthLine(id, kind.total());
        holdings(id).expectStatus().isOk().expectBody().jsonPath("$.cash").isEqualTo(kind.cash())
                .jsonPath("$.holdingsValue").isEqualTo(kind.holdings()).jsonPath("$.balance").isEqualTo(kind.total())
                .jsonPath("$.balanceOn").isEqualTo("2026-09-01").jsonPath("$.securities.length()").isEqualTo(1)
                .jsonPath("$.securities[0].symbol").isEqualTo("HOME").jsonPath("$.securities[0].shares")
                .isEqualTo(kind.shares()).jsonPath("$.securities[0].price").isEqualTo("100.00")
                .jsonPath("$.securities[0].priceOn").isEqualTo("2026-09-01").jsonPath("$.securities[0].value")
                .isEqualTo(kind.holdings()).jsonPath("$.securities[0].knownShares").isEqualTo("0")
                .jsonPath("$.securities[0].coverage").isEqualTo("0.00%").jsonPath("$.securities[0].cost")
                .doesNotExist().jsonPath("$.securities[0].gain").doesNotExist().jsonPath("$.cost").doesNotExist()
                .jsonPath("$.gain").doesNotExist();
        webTestClient.put().uri("/api/v1/accounts/{id}", id).contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"name": "%s", "institution": "%s", "ownerMemberIds": [%s], "enteredByMemberId": "%s"}"""
                .formatted(kind.editedName(), kind.editedInstitution(), owners(kind), samId)).exchange()
                .expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}", id).exchange().expectBody().jsonPath("$.name")
                .isEqualTo(kind.editedName()).jsonPath("$.institution").isEqualTo(kind.editedInstitution())
                .jsonPath("$.balance.amount").isEqualTo(kind.total()).jsonPath("$.ownerMemberIds.length()")
                .isEqualTo("both".equals(kind.owner()) ? 2 : 1);
        webTestClient.get().uri("/api/v1/accounts/{id}/events", id).exchange().expectBody()
                .jsonPath("$[?(@.action == 'renamed')].memberId")
                .value(List.class, found -> assertThat(found).containsExactly(samId));
        assertListBalance(id, kind.total(), "2026-09-01");
        assertWealthLine(id, kind.total());
        holdings(id).expectBody().jsonPath("$.balance").isEqualTo(kind.total());
    }

    @Order(2)
    @Test
    @DisplayName("V2_HOLDINGS_004 two CARE lines, 2 shares with a known cost and 12 without: only the known 2 show "
            + "cost and gain, the full cost and gain stay not available, coverage 14.29%")
    void partlyKnownCost() {
        String id = save(HSA, "Meadow HSA Care", opening("4000.00", "500.00",
                holding("CARE", "2", "250.00", "2026-09-30", "400.00"),
                holding("CARE", "12", "250.00", "2026-09-30")));
        assertBalance(id, "4000.00");
        holdings(id).expectStatus().isOk().expectBody().jsonPath("$.balance").isEqualTo("4000.00")
                .jsonPath("$.securities.length()").isEqualTo(1).jsonPath("$.securities[0].symbol").isEqualTo("CARE")
                .jsonPath("$.securities[0].shares").isEqualTo("14").jsonPath("$.securities[0].value")
                .isEqualTo("3500.00").jsonPath("$.securities[0].knownShares").isEqualTo("2")
                .jsonPath("$.securities[0].knownValue").isEqualTo("500.00")
                .jsonPath("$.securities[0].knownCost").isEqualTo("400.00")
                .jsonPath("$.securities[0].knownGain").isEqualTo("100.00")
                .jsonPath("$.securities[0].coverage").isEqualTo("14.29%").jsonPath("$.securities[0].cost")
                .doesNotExist().jsonPath("$.securities[0].gain").doesNotExist().jsonPath("$.cost").doesNotExist()
                .jsonPath("$.gain").doesNotExist();
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id).exchange().expectBody()
                .jsonPath("$.holdings[0].cost").isEqualTo("400.00").jsonPath("$.holdings[0].gain")
                .isEqualTo("100.00").jsonPath("$.holdings[1].cost").doesNotExist().jsonPath("$.holdings[1].gain")
                .doesNotExist();
    }

    @Order(3)
    @Test
    @DisplayName("V2_HOLDINGS_004 a cost known for every share gives the full cost and gain, and a loss is negative")
    void fullyKnownCost() {
        String id = save(ROTH, "Willow Roth Known", opening(null, "100.00",
                holding("HOME", "10", "100.00", "2026-09-01", "1200.00")));
        holdings(id).expectBody().jsonPath("$.securities[0].cost").isEqualTo("1200.00")
                .jsonPath("$.securities[0].gain").isEqualTo("-200.00").jsonPath("$.securities[0].coverage")
                .isEqualTo("100.00%").jsonPath("$.cost").isEqualTo("1200.00").jsonPath("$.gain")
                .isEqualTo("-200.00");
        assertBalance(id, "1100.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_HOLDINGS_004 a known cost of $0.00 is a cost (gain equals value), unlike an unknown one")
    void zeroCostIsKnown() {
        String id = save(TRAD, "Willow Trad Zero", opening(null, "0.00",
                holding("HOME", "10", "100.00", "2026-09-01", "0.00")));
        holdings(id).expectBody().jsonPath("$.securities[0].cost").isEqualTo("0.00")
                .jsonPath("$.securities[0].gain").isEqualTo("1000.00");
    }

    @Order(5)
    @ParameterizedTest(name = "V2_HOLDINGS_004 cost {0}: refused in the review and at save, nothing is added")
    @MethodSource("badCosts")
    void invalidCost(String input, String cost, String message) {
        int before = accountCount();
        String components = opening(null, "100.00", holding("HOME", "1", "100.00", "2026-09-01", cost));
        create("/api/v1/accounts/opening-preview", HSA, "Bad Cost", components).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo(message);
        create("/api/v1/accounts", HSA, "Bad Cost", components).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo(message);
        assertThat(accountCount()).isEqualTo(before);
    }

    private static Stream<org.junit.jupiter.params.provider.Arguments> badCosts() {
        return Stream.of(
                org.junit.jupiter.params.provider.Arguments.of("-$1.00", "-1.00",
                        "Purchase cost must be zero or greater"),
                org.junit.jupiter.params.provider.Arguments.of("text", "abc", "Enter a valid amount"),
                org.junit.jupiter.params.provider.Arguments.of("too large", "9999999999999999.00",
                        "That amount is too large to record"));
    }

    @Order(6)
    @Test
    @DisplayName("V2_HOLDINGS_004 a cost sent as a JSON number is refused, not turned into text")
    void numberCostRefused() {
        webTestClient.post().uri("/api/v1/accounts/opening-preview").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "hsa", "name": "Num", "institution": "X", "ownerMemberIds": ["%s"],
                         "openedOn": "2026-09-01", "enteredByMemberId": "%s", "opening": {"cash": "1.00",
                         "holdings": [{"symbol": "A", "quantity": "1", "price": "1.00", "cost": 5}]}}"""
                        .formatted(mayaId, mayaId)).exchange().expectStatus().isBadRequest();
    }

    @Order(6)
    @Test
    @DisplayName("V2_HOLDINGS_004 a cost sent as a JSON number is refused at save too, with the message")
    void numberCostRefusedAtSave() {
        String body = """
                {"type": "hsa", "name": "Num Save", "institution": "X", "ownerMemberIds": ["%s"],
                 "openedOn": "2026-09-01", "enteredByMemberId": "%s", "opening": {"cash": "1.00",
                 "holdings": [{"symbol": "A", "quantity": "1", "price": "1.00", "cost": 5}]}}""".formatted(mayaId,
                mayaId);
        webTestClient.post().uri("/api/v1/accounts/opening-preview").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body).exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Enter a valid amount");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue(body)
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Enter a valid amount");
        assertAccountNamed("Num Save", false);
    }

    @Order(6)
    @Test
    @DisplayName("V2_HOLDINGS_004 a cost is never part of the reviewed Balance: the preview ignores it")
    void previewIgnoresCost() {
        String components = opening("1500.00", "500.00", holding("CARE", "4", "250.00", "2026-09-01", "9000.00"));
        create("/api/v1/accounts/opening-preview", HSA, "Preview Cost", components).expectStatus().isOk()
                .expectBody().jsonPath("$.state").isEqualTo("complete").jsonPath("$.calculatedBalance")
                .isEqualTo("1500.00").jsonPath("$.difference").isEqualTo("0.00").jsonPath("$.holdingsValue")
                .isEqualTo("1000.00").jsonPath("$.holdings[0].cost").isEqualTo("9000.00")
                .jsonPath("$.holdings[0].gain").isEqualTo("-8000.00");
        assertAccountNamed("Preview Cost", false);
    }

    @Order(7)
    @Test
    @DisplayName("V2_HOLDINGS_004 Finish setup refuses a bad cost with the same words and keeps the draft's cost")
    void finishRefusesBadCost() {
        String id = save(HSA, "Meadow Finish Cost", opening("1500.00", null,
                holding("CARE", "4", "100.00", "2026-09-01", "300.00")));
        finishSetup(id, opening("1500.00", "1100.00", holding("CARE", "4", "100.00", "2026-09-01", "-1.00")))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Purchase cost must be zero or greater");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id).exchange().expectBody()
                .jsonPath("$.holdings[0].cost").isEqualTo("300.00").jsonPath("$.cash").doesNotExist();
    }

    @Order(7)
    @Test
    @DisplayName("V2_HOLDINGS_004 a draft keeps the cost it was given, Finish setup can change it, and cost is not "
            + "part of the Balance")
    void draftKeepsCost() {
        String id = save(HSA, "Meadow Draft Cost", opening("1500.00", null,
                holding("CARE", "4", "100.00", "2026-09-01", "300.00")));
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id).exchange().expectBody()
                .jsonPath("$.holdings[0].cost").isEqualTo("300.00");
        holdings(id).expectStatus().isEqualTo(409);
        finishSetup(id, opening("1500.00", "1100.00", holding("CARE", "4", "100.00", "2026-09-01", "350.00")))
                .expectStatus().isOk();
        assertBalance(id, "1500.00");
        holdings(id).expectBody().jsonPath("$.securities[0].cost").isEqualTo("350.00")
                .jsonPath("$.securities[0].gain").isEqualTo("50.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_HOLDINGS_004 an account with no holdings shows none, and an unknown account is not found")
    void otherAccounts() {
        String blank = save(HSA, "Meadow Blank", opening(null, null));
        holdings(blank).expectStatus().isOk().expectBody().jsonPath("$.securities.length()").isEqualTo(0)
                .jsonPath("$.cost").doesNotExist();
        holdings("00000000-0000-0000-0000-000000000000").expectStatus().isNotFound();
    }
}
