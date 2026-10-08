package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 18a, group 0: every account is in exactly one base group, so the base groups add up to net worth; the figures
 * come from the account lines and no group total is added to anything (Q-055). Every reader of wealth reads the same
 * lines.
 */
class WealthPartitionApiTests extends DefinedBenefitTestBase {

    private static final List<String> BASE_GROUPS = List.of("bankMoney", "cards", "loans", "mortgages",
            "investments", "retirement", "propertyAndOther");

    @Order(0)
    @Test
    @DisplayName("set up one account of every kind; today is 2026-10-03")
    void setUp() {
        household();
        account("Everyday Checking", "5000.00");
        savings("Emergency Savings", "12000.00", "2026-09-01");
        card("Everyday Credit Card", "1780.00", "owed", "2026-09-01");
        investment("brokerage", "Redwood Brokerage", "2026-09-01", opening("21500.00", "16000.00",
                holding("HOME", "50", "110.00", "2026-09-01")));
        property("Family Home", "300000.00", "2026-09-01");
        otherAsset("Family Car", "30000.00", "2026-09-01");
        loan("Car Loan", "2000.00", "2026-09-01");
        plan("Harbor Cash Balance", samId, "40000.00", "2026-09-01");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> wealth(String query) {
        return webTestClient.get().uri("/api/v1/wealth" + query).exchange().expectStatus().isOk()
                .expectBody(Map.class).returnResult().getResponseBody();
    }

    @SuppressWarnings("unchecked")
    private static BigDecimal total(Map<String, Object> wealth, String group) {
        return new BigDecimal(String.valueOf(((Map<String, Object>) wealth.get(group)).get("total")));
    }

    @SuppressWarnings("unchecked")
    private static List<String> names(Map<String, Object> wealth, String group) {
        return ((List<Map<String, Object>>) ((Map<String, Object>) wealth.get(group)).get("accounts")).stream()
                .map(line -> String.valueOf(line.get("name"))).toList();
    }

    private static BigDecimal baseSum(Map<String, Object> wealth) {
        return BASE_GROUPS.stream().map(group -> total(wealth, group)).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    @Order(1)
    @Test
    @DisplayName("V2_DB_001 Q-055 the base groups add up to net worth, which comes from the lines: assets "
            + "$408,500.00, debts $3,780.00, net worth $404,720.00")
    void baseGroupsAddUp() {
        Map<String, Object> wealth = wealth("");
        assertThat(wealth.get("financialAssets")).isEqualTo("408500.00");
        assertThat(wealth.get("debts")).isEqualTo("3780.00");
        assertThat(wealth.get("netWorth")).isEqualTo("404720.00");
        assertThat(baseSum(wealth)).isEqualByComparingTo("404720.00");
    }

    @Order(2)
    @Test
    @DisplayName("Q-055 the plan value is in Retirement and not in Investments, and is not "
            + "listed as personal investment cash or in Property and other assets")
    void planValueIsInRetirementOnly() {
        Map<String, Object> wealth = wealth("");
        assertThat(names(wealth, "retirement")).containsExactly("Harbor Cash Balance");
        assertThat(total(wealth, "retirement")).isEqualByComparingTo("40000.00");
        assertThat(names(wealth, "investments")).containsExactly("Redwood Brokerage");
        assertThat(total(wealth, "investments")).isEqualByComparingTo("21500.00");
        assertThat(names(wealth, "propertyAndOther")).containsExactlyInAnyOrder("Family Home", "Family Car");
        assertThat(total(wealth, "propertyAndOther")).isEqualByComparingTo("330000.00");
    }

    @Order(3)
    @Test
    @DisplayName("Q-055 the same lines hold on an earlier date: as of 2026-09-01 the base groups still add up "
            + "to net worth")
    void asOfAddsUp() {
        Map<String, Object> wealth = wealth("?asOf=2026-09-01");
        assertThat(baseSum(wealth)).isEqualByComparingTo(String.valueOf(wealth.get("netWorth")));
    }
}
