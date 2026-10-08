package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 18b, group 0 (D-067): Investments, Retirement and Health savings overlap on purpose. Every account counts once
 * in net worth and financial assets (they come from the lines), a group total is a view and is never added, and each
 * line says which groups list it.
 */
class WealthOverlapApiTests extends DefinedBenefitTestBase {

    private static String planId;

    @SuppressWarnings("unchecked")
    private Map<String, Object> wealth(String query) {
        return webTestClient.get().uri("/api/v1/wealth" + query).exchange().expectStatus().isOk()
                .expectBody(Map.class).returnResult().getResponseBody();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> accounts(Map<String, Object> wealth, String group) {
        return (List<Map<String, Object>>) ((Map<String, Object>) wealth.get(group)).get("accounts");
    }

    @SuppressWarnings("unchecked")
    private static BigDecimal total(Map<String, Object> wealth, String group) {
        return new BigDecimal(String.valueOf(((Map<String, Object>) wealth.get(group)).get("total")));
    }

    private static List<String> names(Map<String, Object> wealth, String group) {
        return accounts(wealth, group).stream().map(line -> String.valueOf(line.get("name"))).toList();
    }

    private static final List<String> GROUPS = List.of("bankMoney", "cards", "loans", "mortgages", "investments",
            "retirement", "healthSavings", "propertyAndOther");

    /**
     * The independent reader: every account across every group and the debt lines, once each, with its signed
     * Balance. No displayed set partitions the accounts after D-067, so the groups are never summed again.
     */
    @SuppressWarnings("unchecked")
    private static BigDecimal countedOnce(Map<String, Object> wealth) {
        Map<String, BigDecimal> byId = new HashMap<>();
        for (String group : GROUPS) {
            for (Map<String, Object> line : accounts(wealth, group)) {
                byId.put(String.valueOf(line.get("accountId")), new BigDecimal(String.valueOf(line.get("balance"))));
            }
        }
        for (Map<String, Object> line : (List<Map<String, Object>>) wealth.get("debtLines")) {
            assertThat(byId).as("a debt line is an account already in a group").containsKey(
                    String.valueOf(line.get("accountId")));
        }
        return byId.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static Map<String, Object> line(Map<String, Object> wealth, String name) {
        return GROUPS.stream().flatMap(group -> accounts(wealth, group).stream())
                .filter(line -> name.equals(line.get("name"))).findFirst().orElseThrow();
    }

    @Order(0)
    @Test
    @DisplayName("set up WEALTH_002's household: checking, savings, card, brokerage, 401k, Traditional IRA, plan")
    void setUp() {
        household();
        account("Everyday Checking", "5120.00");
        savings("Emergency Savings", "12000.00", "2026-09-01");
        card("Everyday Credit Card", "1780.00", "owed", "2026-09-01");
        investment("brokerage", "Redwood Brokerage", "2026-09-01",
                opening("21500.00", "16000.00", holding("HOME", "50", "110.00", "2026-09-01")));
        investment("401k", "Harbor 401k", "2026-09-01",
                opening("80000.00", "60000.00", holding("HOME", "200", "100.00", "2026-09-01")));
        investment("traditional_ira", "Willow Traditional IRA", "2026-09-01",
                opening("30000.00", "20000.00", holding("HOME", "100", "100.00", "2026-09-01")));
        planId = plan("Harbor Cash Balance", samId, "40000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_WEALTH_002 V2_HOLDINGS_007 retirement $150,000 and investments $131,500 overlap; net worth stays "
            + "$186,840 and neither group is added again")
    void retirementAndInvestmentsOverlap() {
        Map<String, Object> wealth = wealth("");
        assertThat(wealth.get("financialAssets")).isEqualTo("188620.00");
        assertThat(wealth.get("debts")).isEqualTo("1780.00");
        assertThat(wealth.get("netWorth")).isEqualTo("186840.00");
        assertThat(total(wealth, "retirement")).isEqualByComparingTo("150000.00");
        assertThat(total(wealth, "investments")).isEqualByComparingTo("131500.00");
        assertThat(names(wealth, "retirement")).containsExactlyInAnyOrder("Harbor 401k", "Willow Traditional IRA",
                "Harbor Cash Balance");
        assertThat(names(wealth, "investments")).containsExactlyInAnyOrder("Redwood Brokerage", "Harbor 401k",
                "Willow Traditional IRA");
        assertThat(names(wealth, "healthSavings")).isEmpty();
        // Counted once: the groups overlap, so they cannot be summed; the lines can.
        assertThat(countedOnce(wealth)).isEqualByComparingTo("186840.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_WEALTH_002 each line says which groups list it: the 401k in two, the plan in Retirement only and "
            + "not in Investments")
    void linesNameTheirGroups() {
        Map<String, Object> wealth = wealth("");
        assertThat(line(wealth, "Harbor 401k").get("groups")).isEqualTo(List.of("investments", "retirement"));
        assertThat(line(wealth, "Willow Traditional IRA").get("groups"))
                .isEqualTo(List.of("investments", "retirement"));
        assertThat(line(wealth, "Harbor Cash Balance").get("groups")).isEqualTo(List.of("retirement"));
        assertThat(line(wealth, "Redwood Brokerage").get("groups")).isEqualTo(List.of("investments"));
        assertThat(line(wealth, "Everyday Checking").get("groups")).isEqualTo(List.of("bankMoney"));
    }

    @Order(3)
    @Test
    @DisplayName("V2_WEALTH_008 a Roth IRA is in Investments and Retirement, the HSA in Investments and Health "
            + "savings and not in Retirement; financial assets $197,670, net worth $195,890")
    void rothAndHsaAreNamed() {
        investment("roth_ira", "Willow Roth IRA", "2026-09-01",
                opening("6000.00", "1000.00", holding("HOME", "50", "100.00", "2026-09-01")));
        investment("hsa", "Health Savings", "2026-09-01",
                opening("3050.00", "1050.00", holding("CARE", "20", "100.00", "2026-09-01")));
        Map<String, Object> wealth = wealth("");
        assertThat(wealth.get("financialAssets")).isEqualTo("197670.00");
        assertThat(wealth.get("netWorth")).isEqualTo("195890.00");
        assertThat(total(wealth, "investments")).isEqualByComparingTo("140550.00");
        assertThat(total(wealth, "retirement")).isEqualByComparingTo("156000.00");
        assertThat(total(wealth, "healthSavings")).isEqualByComparingTo("3050.00");
        assertThat(names(wealth, "healthSavings")).containsExactly("Health Savings");
        assertThat(names(wealth, "retirement")).contains("Willow Roth IRA").doesNotContain("Health Savings");
        assertThat(names(wealth, "bankMoney")).doesNotContain("Health Savings");
        assertThat(line(wealth, "Health Savings").get("groups")).isEqualTo(List.of("investments", "healthSavings"));
        assertThat(line(wealth, "Willow Roth IRA").get("groups")).isEqualTo(List.of("investments", "retirement"));
        assertThat(countedOnce(wealth)).isEqualByComparingTo("195890.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_WEALTH_008 the same lines hold on an earlier date (2026-09-01), where all nine accounts exist")
    void countedOnceAsOf() {
        Map<String, Object> wealth = wealth("?asOf=2026-09-01");
        assertThat(countedOnce(wealth)).isEqualByComparingTo(String.valueOf(wealth.get("netWorth")));
    }

    @Order(5)
    @Test
    @DisplayName("V2_WEALTH_008 the change explanation counts an account added in the period once: a 401k and an HSA "
            + "opened on 2026-09-15 explain the whole change, and nothing is left unexplained")
    void changeExplanationCountsOnce() {
        investment("401k", "Late 401k", "2026-09-15", opening("1000.00", "1000.00"));
        investment("hsa", "Late HSA", "2026-09-15", opening("500.00", "500.00"));
        Map<String, Object> change = webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-10&to=2026-09-30")
                .exchange().expectStatus().isOk().expectBody(Map.class).returnResult().getResponseBody();
        assertThat(change.get("accountsAdded")).isEqualTo("1500.00");
        assertThat(change.get("change")).isEqualTo("1500.00");
        assertThat(change.get("other")).isEqualTo("0.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_WEALTH_002 V2_DB_003 a plan statement's review reads the Retirement total that now holds the "
            + "401k and IRAs too: before is the group total, after adds only the credits, net worth moves the same")
    @SuppressWarnings("unchecked")
    void planReviewReadsTheOverlappingTotal() {
        Map<String, Object> wealth = wealth("");
        Map<String, Object> review = webTestClient.post().uri("/api/v1/accounts/{id}/values/review", planId)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(statementBody(samId, "100.00", "20.00", "2026-09-30", null)).exchange().expectStatus()
                .isOk().expectBody(Map.class).returnResult().getResponseBody();
        assertThat(new BigDecimal(String.valueOf(review.get("retirementBefore"))))
                .isEqualByComparingTo(total(wealth, "retirement"));
        assertThat(new BigDecimal(String.valueOf(review.get("retirementAfter"))))
                .isEqualByComparingTo(total(wealth, "retirement").add(new BigDecimal("120.00")));
        assertThat(new BigDecimal(String.valueOf(review.get("netWorthAfter"))))
                .isEqualByComparingTo(new BigDecimal(String.valueOf(wealth.get("netWorth")))
                        .add(new BigDecimal("120.00")));
    }

    @Order(7)
    @Test
    @DisplayName("V2_HOLDINGS_001 a draft investment account adds nothing to any group or to wealth, and is still "
            + "listed (as a draft) so the page can offer Finish setup")
    @SuppressWarnings("unchecked")
    void draftCountsNowhere() {
        Map<String, Object> before = wealth("");
        String draft = investment("brokerage", "Redwood Draft", "2026-09-01", opening("20000.00", null));
        Map<String, Object> after = wealth("");
        assertThat(after.get("financialAssets")).isEqualTo(before.get("financialAssets"));
        assertThat(after.get("netWorth")).isEqualTo(before.get("netWorth"));
        for (String group : GROUPS) {
            assertThat(names(after, group)).as(group).doesNotContain("Redwood Draft");
        }
        assertThat(total(after, "investments")).isEqualByComparingTo(total(before, "investments"));
        webTestClient.get().uri("/api/v1/accounts/{id}", draft).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo("draft");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.name=='Redwood Draft')].status").isEqualTo("draft");
    }

    @Order(8)
    @Test
    @DisplayName("V2_HOUSEHOLD_SETUP_005 a retirement account found in the Retirement list and in Investments is one "
            + "account: its id is the same in both, with its owner and a balance of $80,000.00")
    @SuppressWarnings("unchecked")
    void oneAccountFromEitherList() {
        Map<String, Object> wealth = wealth("");
        String fromRetirement = String.valueOf(accounts(wealth, "retirement").stream()
                .filter(line -> "Harbor 401k".equals(line.get("name"))).findFirst().orElseThrow().get("accountId"));
        String fromInvestments = String.valueOf(accounts(wealth, "investments").stream()
                .filter(line -> "Harbor 401k".equals(line.get("name"))).findFirst().orElseThrow().get("accountId"));
        assertThat(fromRetirement).isEqualTo(fromInvestments);
        webTestClient.get().uri("/api/v1/accounts/{id}", fromRetirement).exchange().expectBody()
                .jsonPath("$.name").isEqualTo("Harbor 401k").jsonPath("$.ownerMemberIds[0]").isEqualTo(samId)
                .jsonPath("$.balance.amount").isEqualTo("80000.00");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.name=='Harbor 401k')]").value(List.class, found -> assertThat(found).hasSize(1));
    }
}
