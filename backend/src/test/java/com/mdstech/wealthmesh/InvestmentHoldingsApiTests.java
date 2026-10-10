package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 19c, groups 1: the whole-investment view (V2_HOLDINGS_002) and the selected account against the group
 * (V2_HOLDINGS_003). Redwood Brokerage: cash $16,000.00 and 50 HOME, opened at $100.00 and priced $110.00 on Sep 30,
 * known cost $4,500.00; Harbor 401k: $60,000.00 and 200 HOME at $100.00, known cost $15,000.00; Willow Traditional
 * IRA: $20,000.00 and 100 HOME at $100.00, cost unknown. Prices belong to a holding: Redwood's $110.00 is nobody
 * else's.
 */
class InvestmentHoldingsApiTests extends PriceTestBase {

    private static String redwood;
    private static String harbor;
    private static String willow;

    @Order(0)
    @Test
    @DisplayName("V2_HOLDINGS_002 set up the three accounts, price Redwood on Sep 30 and add a checking account")
    void setUp() {
        household();
        account("Group Checking", "5000.00");
        redwood = held("brokerage", "Group Redwood Brokerage", samId, "2026-09-01", "16000.00",
                holding("HOME", "50", "100.00", "2026-09-01", "4500.00"));
        harbor = held("401k", "Group Harbor 401k", mayaId, "2026-09-01", "60000.00",
                holding("HOME", "200", "100.00", "2026-09-01", "15000.00"));
        willow = held("traditional_ira", "Group Willow Traditional IRA", mayaId, "2026-09-01", "20000.00",
                holding("HOME", "100", "100.00", "2026-09-01"));
        record(redwood, "grp-1", "HOME", "110.00", "2026-09-30");
    }

    @Order(1)
    @Test
    @DisplayName("V2_HOLDINGS_002 HOME across three accounts: 350 shares, $35,500.00, known cost and gain for 250 "
            + "shares, full cost and gain not available, coverage 71.43%, 27.00% of the investment Balance")
    void oneSecurityAcrossThreeAccounts() {
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.total").isEqualTo("131500.00").jsonPath("$.accounts.length()").isEqualTo(3)
                .jsonPath("$.securities.length()").isEqualTo(1).jsonPath("$.securities[0].symbol").isEqualTo("HOME")
                .jsonPath("$.securities[0].shares").isEqualTo("350").jsonPath("$.securities[0].value")
                .isEqualTo("35500.00").jsonPath("$.securities[0].accountCount").isEqualTo(3)
                .jsonPath("$.securities[0].knownShares").isEqualTo("250").jsonPath("$.securities[0].knownCost")
                .isEqualTo("19500.00").jsonPath("$.securities[0].knownGain").isEqualTo("6000.00")
                .jsonPath("$.securities[0].cost").isEmpty().jsonPath("$.securities[0].gain").isEmpty()
                .jsonPath("$.securities[0].coverage").isEqualTo("71.43%")
                .jsonPath("$.securities[0].shareOfBalance").isEqualTo("27.00%");
    }

    @Order(2)
    @Test
    @DisplayName("V2_HOLDINGS_002 the account Balances are $21,500.00, $80,000.00 and $30,000.00, and each account "
            + "keeps its own shares, price, price date and cost explanation (a price is never shared)")
    void accountsAndPositions() {
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectBody()
                .jsonPath("$.accounts[?(@.name == 'Group Redwood Brokerage')].balance")
                .value(List.class, found -> assertThat(found).containsExactly("21500.00"))
                .jsonPath("$.accounts[?(@.name == 'Group Harbor 401k')].balance")
                .value(List.class, found -> assertThat(found).containsExactly("80000.00"))
                .jsonPath("$.accounts[?(@.name == 'Group Willow Traditional IRA')].balance")
                .value(List.class, found -> assertThat(found).containsExactly("30000.00"))
                .jsonPath("$.securities[0].positions[?(@.accountName == 'Group Redwood Brokerage')].price")
                .value(List.class, found -> assertThat(found).containsExactly("110.00"))
                .jsonPath("$.securities[0].positions[?(@.accountName == 'Group Redwood Brokerage')].priceOn")
                .value(List.class, found -> assertThat(found).containsExactly("2026-09-30"))
                .jsonPath("$.securities[0].positions[?(@.accountName == 'Group Harbor 401k')].price")
                .value(List.class, found -> assertThat(found).containsExactly("100.00"))
                .jsonPath("$.securities[0].positions[?(@.accountName == 'Group Harbor 401k')].cost")
                .value(List.class, found -> assertThat(found).containsExactly("15000.00"))
                .jsonPath("$.securities[0].positions[?(@.accountName == 'Group Willow Traditional IRA')].cost")
                .value(List.class, found -> assertThat(found).containsOnlyNulls())
                .jsonPath("$.securities[0].positions[?(@.accountName == 'Group Willow Traditional IRA')].coverage")
                .value(List.class, found -> assertThat(found).containsExactly("0.00%"));
    }

    @Order(3)
    @Test
    @DisplayName("V2_HOLDINGS_003 the selected account has its own cash, holdings value, Balance and 25.58% share; "
            + "its holdings do not include the other accounts")
    void selectedAccountIsSeparate() {
        webTestClient.get().uri("/api/v1/accounts/{id}/holdings", redwood).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.cash").isEqualTo("16000.00").jsonPath("$.holdingsValue")
                .isEqualTo("5500.00").jsonPath("$.balance").isEqualTo("21500.00")
                .jsonPath("$.securities.length()").isEqualTo(1).jsonPath("$.securities[0].shares").isEqualTo("50")
                .jsonPath("$.securities[0].shareOfBalance").isEqualTo("25.58%");
        webTestClient.get().uri("/api/v1/accounts/{id}/holdings", harbor).exchange().expectBody()
                .jsonPath("$.securities[0].shares").isEqualTo("200").jsonPath("$.securities[0].shareOfBalance")
                .isEqualTo("25.00%");
    }

    @Order(4)
    @Test
    @DisplayName("V2_HOLDINGS_002 a price term dropped from the group read would show $5,000.00 for Redwood's HOME: "
            + "the group read and the account read agree on the same price")
    void groupReadUsesTheEffectivePrice() {
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectBody()
                .jsonPath("$.securities[0].positions[?(@.accountName == 'Group Redwood Brokerage')].value")
                .value(List.class, found -> assertThat(found).containsExactly("5500.00"));
        // A later price shows in the group read at once, with the shares unchanged.
        record(redwood, "grp-2", "HOME", "120.00", "2026-10-01");
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("132000.00").jsonPath("$.securities[0].value").isEqualTo("36000.00")
                .jsonPath("$.securities[0].shares").isEqualTo("350");
        // A replaced price counts no more: the group read follows the replacement.
        record(redwood, "grp-3", "HOME", "110.00", "2026-10-01");
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("131500.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_HOLDINGS_002 counted once: the group total is the wealth Investments total; the 401(k) is in "
            + "two groups but counted once in financial assets and net worth; the view adds nothing")
    void countedOnce() {
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("131500.00");
        wealth("").expectBody().jsonPath("$.investments.total").isEqualTo("131500.00")
                .jsonPath("$.retirement.total").isEqualTo("110000.00")
                .jsonPath("$.financialAssets").isEqualTo("136500.00").jsonPath("$.netWorth")
                .isEqualTo("136500.00");
        // Each account appears once in the group read, and the ids are the wealth group's ids.
        List<String> viewIds = new java.util.ArrayList<>();
        List<String> wealthIds = new java.util.ArrayList<>();
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectBody()
                .jsonPath("$.accounts[*].accountId").value(List.class, l -> l.forEach(v -> viewIds.add((String) v)));
        wealth("").expectBody().jsonPath("$.investments.accounts[*].accountId").value(List.class,
                l -> l.forEach(v -> wealthIds.add((String) v)));
        assertThat(viewIds).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(wealthIds);
        // Reading the view twice changes nothing anywhere.
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectStatus().isOk();
        wealth("").expectBody().jsonPath("$.financialAssets").isEqualTo("136500.00");
        // Each person's view counts an account once and the people add up to the group: Sam has Redwood, Maya the
        // other two (the checking account is Maya's too).
        wealth("?memberId=" + samId).expectBody().jsonPath("$.investments.total").isEqualTo("21500.00")
                .jsonPath("$.netWorth").isEqualTo("21500.00");
        wealth("?memberId=" + mayaId).expectBody().jsonPath("$.investments.total").isEqualTo("110000.00")
                .jsonPath("$.netWorth").isEqualTo("115000.00");
        // The change explanation takes the price move as its own line and still balances (HOME 50 x $10.00).
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-10-03").exchange().expectBody()
                .jsonPath("$.priceChange").isEqualTo("500.00").jsonPath("$.income").isEqualTo("0.00")
                .jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_HOLDINGS_002 an archived account stays in the view, labeled; a draft is not in it")
    void archivedLabeledDraftLeftOut() {
        createInvestment("brokerage", "Group Draft Brokerage", "2026-09-01",
                opening("30000.00", null, holding("HOME", "10", "100.00", "2026-09-01"))).expectStatus().isCreated()
                .expectBody().jsonPath("$.status").isEqualTo("draft");
        webTestClient.post().uri("/api/v1/accounts/{id}/archive", willow).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"" + mayaId + "\"}").exchange().expectStatus().isOk();
        webTestClient.get().uri("/api/v1/investments/holdings").exchange().expectBody()
                .jsonPath("$.accounts.length()").isEqualTo(3)
                .jsonPath("$.accounts[?(@.name == 'Group Willow Traditional IRA')].status")
                .value(List.class, found -> assertThat(found).containsExactly("archived"))
                .jsonPath("$.accounts[?(@.name == 'Group Draft Brokerage')]")
                .value(List.class, found -> assertThat(found).isEmpty()).jsonPath("$.total")
                .isEqualTo("131500.00");
    }
}
