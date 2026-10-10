package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/**
 * Slice 19d (V2_WEALTH_001, V2_WEALTH_009): the September 30 snapshot of the household and its trend through October
 * 31. An earlier date uses only activity and prices dated on or before it, in every reader (net worth, financial
 * assets, debts, each person's view, each group total, each account's Balance), and the increase between two dates
 * equals the explained change.
 *
 * <p>The figures are fixed before the code: September 30 is checking $5,120.00, savings $12,000.00, card owed
 * $1,780.00, Redwood $21,500.00, Harbor 401k $80,000.00, Willow IRA $30,000.00 and the plan $40,000.00 (net worth
 * $186,840.00). October: income $2,500.00 (Oct 5), card spending $380.00 (Oct 10), Redwood HOME $110.00 to $150.00 on
 * Oct 20 (50 shares, $2,000.00); the increase is $2,500.00 - $380.00 + $2,000.00 = $4,120.00 and October 31 net worth
 * is $190,960.00.
 */
class WealthAsOfTrendApiTests extends DefinedBenefitTestBase {

    private static final String SEP30 = "2026-09-30";
    private static final String OCT31 = "2026-10-31";

    private static final List<String> GROUPS = List.of("bankMoney", "cards", "loans", "mortgages", "investments",
            "retirement", "healthSavings", "propertyAndOther");

    private static String checking;
    private static String savings;
    private static String cardId;
    private static String redwood;
    private static String harbor401k;
    private static String willowIra;
    private static String planId;
    private static Map<String, String> sep30;

    private static String json(org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec spec) {
        return spec.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
    }

    private static String at(String json, String path) {
        return String.valueOf((Object) JsonPath.read(json, path));
    }

    private static BigDecimal num(String json, String path) {
        return new BigDecimal(at(json, path));
    }

    private org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec wealthQuery(String query) {
        return webTestClient.get().uri("/api/v1/wealth" + query).exchange();
    }

    private void recordPrice(String account, String key, String symbol, String price, String on) {
        webTestClient.post().uri("/api/v1/accounts/{id}/prices", account).contentType(
                org.springframework.http.MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue(
                "{\"symbol\": \"%s\", \"price\": \"%s\", \"valueOn\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(symbol, price, on, mayaId)).exchange().expectStatus().isCreated();
    }

    private org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec balanceAsOf(String account,
            String on) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf={on}", account, on).exchange();
    }

    private void assertBalanceAsOf(String account, String on, String amount) {
        balanceAsOf(account, on).expectStatus().isOk().expectBody().jsonPath("$.amount").isEqualTo(amount);
    }

    private String wealthOn(String on) {
        return json(wealthQuery("?asOf=" + on));
    }

    private String viewOf(String member, String on) {
        return json(wealthQuery("?asOf=" + on + "&memberId=" + member));
    }

    private String changeOver(String from, String to) {
        return json(webTestClient.get().uri("/api/v1/wealth/change?from=" + from + "&to=" + to).exchange());
    }

    /** Runs the body with the clock on `date`; the clock goes back to its default even when the body fails. */
    private void onDate(String date, Runnable body) {
        clock.setToday(LocalDate.parse(date));
        try {
            body.run();
        } finally {
            clock.setToday(MutableClock.DEFAULT_TODAY);
        }
    }

    /** Every figure the readers give for a date: wealth totals, group totals and lines, both people, each Balance. */
    private Map<String, String> snapshot(String on) {
        Map<String, String> figures = new TreeMap<>();
        String wealth = wealthOn(on);
        for (String field : List.of("netWorth", "financialAssets", "debts")) {
            figures.put(field, at(wealth, "$." + field));
        }
        for (String group : GROUPS) {
            figures.put("group:" + group, at(wealth, "$." + group + ".total"));
            List<Map<String, Object>> lines = JsonPath.read(wealth, "$." + group + ".accounts");
            for (Map<String, Object> line : lines) {
                figures.put("line:" + group + ":" + line.get("name"), String.valueOf(line.get("balance")));
            }
        }
        figures.put("maya", at(viewOf(mayaId, on), "$.netWorth"));
        figures.put("sam", at(viewOf(samId, on), "$.netWorth"));
        for (String account : List.of(checking, savings, cardId, redwood, harbor401k, willowIra, planId)) {
            figures.put("balance:" + account, at(json(balanceAsOf(account, on)), "$.amount"));
        }
        return figures;
    }

    private static void assertComponentsAdd(String change, String label) {
        BigDecimal parts = BigDecimal.ZERO;
        for (String part : List.of("income", "valueChange", "corrections", "accountsAdded", "transfers",
                "payCredits", "benefitInterest", "priceChange", "other")) {
            parts = parts.add(num(change, "$." + part));
        }
        parts = parts.subtract(num(change, "$.spending"));
        assertThat(parts).as("components for " + label)
                .isEqualByComparingTo(num(change, "$.endWealth").subtract(num(change, "$.startWealth")));
        assertThat(num(change, "$.change")).as("change for " + label)
                .isEqualByComparingTo(num(change, "$.endWealth").subtract(num(change, "$.startWealth")));
        assertThat(num(change, "$.other")).as("nothing unexplained for " + label).isEqualByComparingTo("0.00");
    }

    @Order(0)
    @Test
    @DisplayName("V2_WEALTH_001 set up the September 30 household: checking, savings, card, brokerage, 401k, IRA, plan")
    void setUp() {
        household();
        checking = account("Everyday Checking", "5120.00");
        savings = savings("Emergency Savings", "12000.00", "2026-09-01");
        cardId = card("Everyday Credit Card", "1780.00", "owed", "2026-09-01");
        redwood = investment("brokerage", "Redwood Brokerage", "2026-09-01",
                opening("21500.00", "16000.00", holding("HOME", "50", "110.00", "2026-09-01")));
        harbor401k = investment("401k", "Harbor 401k", "2026-09-01",
                opening("80000.00", "60000.00", holding("HOME", "200", "100.00", "2026-09-01")));
        willowIra = investment("traditional_ira", "Willow Traditional IRA", "2026-09-01",
                opening("30000.00", "20000.00", holding("HOME", "100", "100.00", "2026-09-01")));
        planId = plan("Harbor Cash Balance", samId, "40000.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_WEALTH_001 the September 30 snapshot: assets $188,620.00, card debt $1,780.00, net worth "
            + "$186,840.00, $17,120.00 in checking and savings with both accounts, each account's Balance that day")
    void septemberThirtySnapshot() {
        String wealth = wealthOn(SEP30);
        assertThat(num(wealth, "$.financialAssets")).isEqualByComparingTo("188620.00");
        assertThat(num(wealth, "$.debts")).isEqualByComparingTo("1780.00");
        assertThat(num(wealth, "$.netWorth")).isEqualByComparingTo("186840.00");
        assertThat(num(wealth, "$.cards.total")).isEqualByComparingTo("-1780.00");
        assertThat(num(wealth, "$.bankMoney.total")).isEqualByComparingTo("17120.00");
        assertThat(JsonPath.<List<String>>read(wealth, "$.bankMoney.accounts[*].name"))
                .containsExactlyInAnyOrder("Everyday Checking", "Emergency Savings");
        assertThat(JsonPath.<List<String>>read(wealth, "$.bankMoney.accounts[?(@.name=='Everyday Checking')].balance"))
                .containsExactly("5120.00");
        assertThat(JsonPath.<List<String>>read(wealth, "$.bankMoney.accounts[?(@.name=='Emergency Savings')].balance"))
                .containsExactly("12000.00");
        // The overlapping groups are views: retirement and investments are not added again.
        assertThat(num(wealth, "$.retirement.total")).isEqualByComparingTo("150000.00");
        assertThat(num(wealth, "$.investments.total")).isEqualByComparingTo("131500.00");
        assertBalanceAsOf(checking, SEP30, "5120.00");
        assertBalanceAsOf(savings, SEP30, "12000.00");
        assertBalanceAsOf(redwood, SEP30, "21500.00");
        assertBalanceAsOf(harbor401k, SEP30, "80000.00");
        assertBalanceAsOf(willowIra, SEP30, "30000.00");
        assertBalanceAsOf(planId, SEP30, "40000.00");
        // "Open either account": its history is there for the day.
        for (String account : List.of(checking, savings)) {
            webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange().expectStatus().isOk()
                    .expectBody().jsonPath("$.length()").isEqualTo(0);
            assertActivityCount(account, 0);
        }
        assertBalanceAsOf(cardId, SEP30, "-1780.00");
        // Each person's view: Maya owns checking, savings and the card; Sam the investments and the plan.
        assertThat(num(viewOf(mayaId, SEP30), "$.netWorth")).isEqualByComparingTo("15340.00");
        assertThat(num(viewOf(samId, SEP30), "$.netWorth")).isEqualByComparingTo("171500.00");
        sep30 = snapshot(SEP30);
    }

    @Order(2)
    @Test
    @DisplayName("V2_WEALTH_009 October's income, card spending and a HOME price rise change nothing on September 30 "
            + "in any reader; October 31 is $190,960.00 and the increase is $4,120.00, explained by its parts")
    void octoberChangesNothingEarlier() {
        onDate(OCT31, () -> {
            saveIncome(checking, "t-inc", "2500.00", "2026-10-05");
            saveExpense(cardId, "t-card", "380.00", "2026-10-10", "Dining");
            recordPrice(redwood, "t-price", "HOME", "150.00", "2026-10-20");
            // The account's list now holds the October income; its September 30 Balance still excludes it.
            assertActivityCount(checking, 1);
            assertBalanceAsOf(checking, SEP30, "5120.00");
            assertThat(num(wealthOn(OCT31), "$.netWorth")).isEqualByComparingTo("190960.00");
            String change = changeOver(SEP30, OCT31);
            assertThat(num(change, "$.startWealth")).isEqualByComparingTo("186840.00");
            assertThat(num(change, "$.endWealth")).isEqualByComparingTo("190960.00");
            assertThat(num(change, "$.change")).isEqualByComparingTo("4120.00");
            assertThat(num(change, "$.income")).isEqualByComparingTo("2500.00");
            assertThat(num(change, "$.spending")).isEqualByComparingTo("380.00");
            assertThat(num(change, "$.priceChange")).isEqualByComparingTo("2000.00");
            assertThat(num(change, "$.valueChange")).isEqualByComparingTo("0.00");
            assertComponentsAdd(change, SEP30 + " to " + OCT31);
            // The price counts once everywhere it is read: net worth, assets, Maya's view, Redwood, Investments.
            Map<String, String> october = snapshot(OCT31);
            assertThat(october.get("netWorth")).isEqualTo("190960.00");
            assertThat(october.get("financialAssets")).isEqualTo("193120.00");
            assertThat(october.get("debts")).isEqualTo("2160.00");
            assertThat(october.get("maya")).isEqualTo("17460.00");
            assertThat(october.get("sam")).isEqualTo("173500.00");
            assertThat(october.get("group:investments")).isEqualTo("133500.00");
            assertThat(october.get("group:bankMoney")).isEqualTo("19620.00");
            assertThat(october.get("balance:" + redwood)).isEqualTo("23500.00");
            // And one day before the price (Oct 19) and the card spending (Oct 9) the earlier figures hold.
            assertBalanceAsOf(redwood, "2026-10-19", "21500.00");
            assertThat(num(wealthOn("2026-10-09"), "$.netWorth")).isEqualByComparingTo("189340.00");
        });
        // September 30 once more, after every October write.
        assertThat(snapshot(SEP30)).isEqualTo(sep30);
        assertThat(num(wealthOn(SEP30), "$.netWorth")).isEqualByComparingTo("186840.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_WEALTH_009 a body that fails inside the Oct 31 helper does not leave the clock moved")
    void aFailingBodyDoesNotLeaveTheClockMoved() {
        assertThatThrownBy(() -> onDate(OCT31, () -> {
            webTestClient.get().uri("/api/v1/today").exchange().expectBody().jsonPath("$.today").isEqualTo(OCT31);
            throw new IllegalStateException("body failed");
        })).isInstanceOf(IllegalStateException.class);
        webTestClient.get().uri("/api/v1/today").exchange().expectBody().jsonPath("$.today")
                .isEqualTo(MutableClock.DEFAULT_TODAY.toString());
    }

    @Order(4)
    @Test
    @DisplayName("V2_WEALTH_009 a price dated Oct 15 is ignored on Sep 30; an income dated in September but entered in "
            + "October and a price dated Sep 30 but entered in October both count on Sep 30 and after")
    void effectiveDateNotEntryDate() {
        onDate(OCT31, () -> {
            // Later-dated price: ignored on Sep 30, counted from Oct 15 (401k HOME $100 to $105, 200 shares: $1,000).
            recordPrice(harbor401k, "t-oct15", "HOME", "105.00", "2026-10-15");
            assertBalanceAsOf(harbor401k, SEP30, "80000.00");
            assertBalanceAsOf(harbor401k, "2026-10-14", "80000.00");
            assertBalanceAsOf(harbor401k, "2026-10-15", "81000.00");
            assertThat(snapshot(SEP30)).isEqualTo(sep30);
            // Entered in October, dated Sep 30: counts on Sep 30 (the mirror of the income below).
            recordPrice(harbor401k, "t-sep30", "HOME", "110.00", SEP30);
            assertBalanceAsOf(harbor401k, SEP30, "82000.00");
            // Dated Sep 20, entered in October: counts on Sep 30.
            saveIncome(checking, "t-late", "300.00", "2026-09-20");
            assertBalanceAsOf(checking, SEP30, "5420.00");
            assertBalanceAsOf(checking, "2026-09-19", "5120.00");

            Map<String, String> now = snapshot(SEP30);
            assertThat(now.get("netWorth")).isEqualTo("189140.00");
            assertThat(now.get("financialAssets")).isEqualTo("190920.00");
            assertThat(now.get("maya")).isEqualTo("15640.00");
            assertThat(now.get("sam")).isEqualTo("173500.00");
            // The 401k is in Investments and Retirement: both views rise by $2,000.00, net worth once.
            assertThat(now.get("group:investments")).isEqualTo("133500.00");
            assertThat(now.get("group:retirement")).isEqualTo("152000.00");
            assertThat(now.get("group:bankMoney")).isEqualTo("17420.00");
            // Nothing else on Sep 30 moved.
            Map<String, String> expected = new TreeMap<>(sep30);
            expected.put("netWorth", "189140.00");
            expected.put("financialAssets", "190920.00");
            expected.put("maya", "15640.00");
            expected.put("sam", "173500.00");
            expected.put("group:investments", "133500.00");
            expected.put("group:retirement", "152000.00");
            expected.put("group:bankMoney", "17420.00");
            expected.put("line:investments:Harbor 401k", "82000.00");
            expected.put("line:retirement:Harbor 401k", "82000.00");
            expected.put("line:bankMoney:Everyday Checking", "5420.00");
            expected.put("balance:" + harbor401k, "82000.00");
            expected.put("balance:" + checking, "5420.00");
            assertThat(now).isEqualTo(expected);

            // October 31 carries both late entries, the Oct 15 price and the Sep 30 price: HOME on the 401k went
            // $100 to $110 (counted on Sep 30) and then $105 on Oct 15, so its move after Sep 30 is -$1,000.00.
            // Income $2,500.00 - spending $380.00 + price moves ($2,000.00 - $1,000.00) = $3,120.00.
            String change = changeOver(SEP30, OCT31);
            assertThat(num(change, "$.startWealth")).isEqualByComparingTo("189140.00");
            assertThat(num(change, "$.endWealth")).isEqualByComparingTo("192260.00");
            assertThat(num(change, "$.change")).isEqualByComparingTo("3120.00");
            assertThat(num(change, "$.priceChange")).isEqualByComparingTo("1000.00");
            assertComponentsAdd(change, "after the late entries");
            // A sentence that compares two figures is tested with two dates: the earlier end gives another answer.
            String shorter = changeOver(SEP30, "2026-10-09");
            assertThat(num(shorter, "$.endWealth")).isEqualByComparingTo("191640.00");
            assertThat(num(shorter, "$.change")).isEqualByComparingTo("2500.00");
            assertComponentsAdd(shorter, "to Oct 9");
        });
    }
}
