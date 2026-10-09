package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 18c, group 3 (MEMBERS_002): the per-person view. A joint account is in each owner's view in full and once in
 * the household; every figure of a view is summed from that view's account lines, so the people's totals are never
 * added to one another. The counted-once tests collect every account id across all groups, de-duplicate and sum;
 * they never add the displayed group totals (D-067).
 */
class PersonViewApiTests extends DefinedBenefitTestBase {

    private static String checking;
    private static String harbor;
    private static String trad;

    private String investmentOwnedBy(String type, String name, String owner, String cash, String shares) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "%s", "name": "%s", "institution": "Harbor Benefits", "ownerMemberIds": ["%s"],
                 "openedOn": "2026-09-01", "enteredByMemberId": "%s",
                 "opening": {"cash": "%s", "holdings": [%s]}}"""
                .formatted(type, name, owner, mayaId, cash, holding("HOME", shares, "100.00", "2026-09-01")))
                .exchange().expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> wealth(String query) {
        return webTestClient.get().uri("/api/v1/wealth" + query).exchange().expectStatus().isOk()
                .expectBody(Map.class).returnResult().getResponseBody();
    }

    private static final List<String> GROUPS = List.of("bankMoney", "cards", "loans", "mortgages", "investments",
            "retirement", "healthSavings", "propertyAndOther");

    /** Every account line of a view across all groups, one entry per account (de-duplicated by id). */
    @SuppressWarnings("unchecked")
    private static Map<String, BigDecimal> distinctAccounts(Map<String, Object> view) {
        Map<String, BigDecimal> accounts = new HashMap<>();
        for (String group : GROUPS) {
            for (Map<String, Object> line : (List<Map<String, Object>>) ((Map<String, Object>) view.get(group))
                    .get("accounts")) {
                accounts.put((String) line.get("accountId"), new BigDecimal((String) line.get("balance")));
            }
        }
        return accounts;
    }

    private static BigDecimal sum(Map<String, BigDecimal> accounts) {
        return accounts.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Net worth, financial assets and debts of a view equal what its distinct accounts add up to, once each. */
    private static void assertCountedOnce(Map<String, Object> view, String assets, int accounts) {
        Map<String, BigDecimal> distinct = distinctAccounts(view);
        assertThat(distinct).hasSize(accounts);
        BigDecimal positive = distinct.values().stream().filter(v -> v.signum() > 0).reduce(BigDecimal.ZERO,
                BigDecimal::add);
        assertThat(new BigDecimal((String) view.get("financialAssets"))).isEqualByComparingTo(assets);
        assertThat(positive).isEqualByComparingTo(assets);
        assertThat(new BigDecimal((String) view.get("netWorth"))).isEqualByComparingTo(sum(distinct));
    }

    @Order(0)
    @Test
    @DisplayName("set up (MEMBERS_002): joint checking $5,000.00; Sam's 401(k) $60,000.00 cash and $20,000.00 of "
            + "holdings; Maya's Traditional IRA $20,000.00 cash and $10,000.00 of holdings")
    void setUp() {
        household();
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "checking", "name": "Joint Checking", "ownerMemberIds": ["%s", "%s"],
                 "openedOn": "2026-09-01", "openingBalance": "5000.00"}""".formatted(mayaId, samId))
                .exchange().expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, id::set);
        checking = id.get();
        harbor = investmentOwnedBy("401k", "Harbor 401k", samId, "60000.00", "200");
        trad = investmentOwnedBy("traditional_ira", "Willow Traditional IRA", mayaId, "20000.00", "100");
    }

    @Order(1)
    @Test
    @DisplayName("V2_MEMBERS_002 Sam's accounts: the checking once and the 401(k) once, total assets $85,000.00")
    void samSeesCheckingAndHisAccount() {
        Map<String, Object> sam = wealth("?memberId=" + samId);
        assertCountedOnce(sam, "85000.00", 2);
        assertThat(distinctAccounts(sam)).containsOnlyKeys(checking, harbor);
        assertThat(sam).containsEntry("netWorth", "85000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_MEMBERS_002 Maya's accounts: the checking once and the Traditional IRA once, total assets "
            + "$35,000.00")
    void mayaSeesCheckingAndHerAccount() {
        Map<String, Object> maya = wealth("?memberId=" + mayaId);
        assertCountedOnce(maya, "35000.00", 2);
        assertThat(distinctAccounts(maya)).containsOnlyKeys(checking, trad);
    }

    @Order(3)
    @Test
    @DisplayName("V2_MEMBERS_002 the whole household: each account once, total assets $115,000.00; the people's "
            + "totals ($85,000.00 and $35,000.00) are never added, because the joint checking is in both")
    void householdCountsEachAccountOnce() {
        Map<String, Object> household = wealth("");
        assertCountedOnce(household, "115000.00", 3);
        assertThat(distinctAccounts(household)).containsOnlyKeys(checking, harbor, trad);
        BigDecimal people = new BigDecimal((String) wealth("?memberId=" + samId).get("financialAssets"))
                .add(new BigDecimal((String) wealth("?memberId=" + mayaId).get("financialAssets")));
        assertThat(people).as("the two views overlap by the joint checking").isEqualByComparingTo("120000.00");
        assertThat(new BigDecimal((String) household.get("financialAssets"))).isNotEqualByComparingTo(people);
        // Asking for no member is the household; the member filter does not change the household figures.
        assertThat(wealth("")).isEqualTo(household);
    }

    @Order(4)
    @Test
    @DisplayName("V2_MEMBERS_002 the 401(k) is still in both Investments and Retirement inside Sam's view, counted "
            + "once; the group totals are views and are not added")
    void groupsInsideAViewStillOverlapOnce() {
        Map<String, Object> sam = wealth("?memberId=" + samId);
        @SuppressWarnings("unchecked")
        Map<String, Object> investments = (Map<String, Object>) sam.get("investments");
        @SuppressWarnings("unchecked")
        Map<String, Object> retirement = (Map<String, Object>) sam.get("retirement");
        assertThat(investments).containsEntry("total", "80000.00");
        assertThat(retirement).containsEntry("total", "80000.00");
        assertThat(sam).containsEntry("financialAssets", "85000.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_MEMBERS_002 the change explanation is the household's and counts each account once: from before "
            + "they opened, the accounts added are $115,000.00 and the end wealth is the household net worth")
    void changeExplanationCountsOnce() {
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-08-31&to=2026-10-03").exchange().expectBody()
                .jsonPath("$.startWealth").isEqualTo("0.00").jsonPath("$.endWealth").isEqualTo("115000.00")
                .jsonPath("$.accountsAdded").isEqualTo("115000.00").jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_MEMBERS_002 a person who is not in the household is refused, and a draft counts in no view")
    void unknownMemberAndDrafts() {
        webTestClient.get().uri("/api/v1/wealth?memberId=" + UUID.randomUUID()).exchange().expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose a member from this household");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "hsa", "name": "Draft HSA", "institution": "Harbor Benefits", "ownerMemberIds": ["%s"],
                 "openedOn": "2026-09-01", "enteredByMemberId": "%s", "opening": {"holdings": [%s]}}"""
                .formatted(samId, mayaId, holding("HOME", "1", "100.00", "2026-09-01"))).exchange().expectStatus()
                .isCreated().expectBody()
                .jsonPath("$.status").isEqualTo("draft");
        assertCountedOnce(wealth("?memberId=" + samId), "85000.00", 2);
        assertCountedOnce(wealth(""), "115000.00", 3);
    }

    @Order(7)
    @Test
    @DisplayName("V2_MEMBERS_002 an owner correction moves the account between the people's views and leaves the "
            + "household as it was")
    void correctionMovesTheAccountBetweenViews() {
        correct(harbor, quoted(mayaId), mayaId).expectStatus().isOk();
        assertCountedOnce(wealth("?memberId=" + samId), "5000.00", 1);
        assertCountedOnce(wealth("?memberId=" + mayaId), "115000.00", 3);
        assertCountedOnce(wealth(""), "115000.00", 3);
    }

    @Order(8)
    @Test
    @DisplayName("V2_MEMBERS_002 the view as of an earlier date holds only the accounts that had begun by then, "
            + "in each person's view")
    void asOfAnEarlierDate() {
        Map<String, Object> early = wealth("?asOf=2026-08-31&memberId=" + mayaId);
        assertThat(distinctAccounts(early)).isEmpty();
        assertThat(early).containsEntry("financialAssets", "0.00");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> notTracked = (List<Map<String, Object>>) early.get("notTracked");
        assertThat(notTracked).extracting(m -> m.get("accountId")).containsExactlyInAnyOrder(checking, harbor, trad);
    }
}
