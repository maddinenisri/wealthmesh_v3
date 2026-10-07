package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Slice 15, group 5: wealth as of a date with the date of each manually valued account's value and a flag when it is
 * old (W4), and the explanation of the change between two dates (W5). The identity test compares the change
 * components with the difference of two as-of figures.
 */
class WealthAsOfApiTests extends DebtTestBase {

    private static String home;
    private static String car;
    private static String checking;
    private static String savings;

    @Order(0)
    @Test
    @DisplayName("set up the household, a home, a car, a checking and a savings account; today is 2026-10-03")
    void setUp() {
        household();
        home = property("Wealth Home", "300000.00", "2026-09-01");
        car = otherAsset("Wealth Car", "30000.00", "2026-09-01");
        checking = account("Wealth Checking", "5000.00");
        savings = savings("Wealth Savings", "1000.00", "2026-09-01");
    }

    private WebTestClient.ResponseSpec wealth(String asOf) {
        return webTestClient.get().uri("/api/v1/wealth" + (asOf == null ? "" : "?asOf=" + asOf)).exchange();
    }

    private WebTestClient.ResponseSpec change(String from, String to) {
        return webTestClient.get().uri("/api/v1/wealth/change?from=" + from + "&to=" + to).exchange();
    }

    private String lineOf(String asOf, String account, String field) {
        AtomicReference<String> found = new AtomicReference<>();
        wealth(asOf).expectBody().jsonPath("$.propertyAndOther.accounts[?(@.accountId=='" + account + "')]." + field)
                .value(List.class, list -> found.set(list.isEmpty() ? null : String.valueOf(list.getFirst())));
        return found.get();
    }

    private static String json(WebTestClient.ResponseSpec spec) {
        return spec.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
    }

    private static String at(String json, String path) {
        return String.valueOf((Object) com.jayway.jsonpath.JsonPath.read(json, path));
    }

    private String field(WebTestClient.ResponseSpec spec, String path) {
        return at(json(spec), path);
    }

    @Order(1)
    @Test
    @DisplayName("V2_PROPERTY_003 wealth on 2026-09-01 still uses $300,000.00 after a new estimate and its correction; "
            + "the corrected estimate counts from 2026-09-30; each valued line shows the date of its value")
    void estimateAndCorrectionInTheirOwnMonth() {
        String estimate = savedValue(home, "w-1", "320000.00", "2026-09-30", "September estimate");
        correctValue(home, estimate, "w-2", """
                {"amount": "315000.00", "reason": "Copied the wrong estimate", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isCreated();
        assertThat(lineOf("2026-09-01", home, "balance")).isEqualTo("300000.00");
        assertThat(lineOf("2026-09-01", home, "valueDate")).isEqualTo("2026-09-01");
        assertThat(lineOf("2026-09-29", home, "balance")).isEqualTo("300000.00");
        assertThat(lineOf("2026-09-30", home, "balance")).isEqualTo("315000.00");
        assertThat(lineOf("2026-09-30", home, "valueDate")).isEqualTo("2026-09-30");
        assertThat(lineOf(null, home, "balance")).isEqualTo("315000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-09-15", home).exchange().expectBody()
                .jsonPath("$.amount").isEqualTo("300000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-09-30", home).exchange().expectBody()
                .jsonPath("$.amount").isEqualTo("315000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-08-15", home).exchange().expectBody()
                .jsonPath("$.amount").isEmpty();
    }

    @Order(2)
    @Test
    @DisplayName("V2_PROPERTY_003 the wealth explanation names the property value change, as a value change and not as "
            + "income, and counts a corrected estimate once")
    void explanationNamesTheValueChange() {
        change("2026-09-01", "2026-09-30").expectStatus().isOk().expectBody()
                .jsonPath("$.valueMoves[?(@.accountId=='" + home + "')].change").isEqualTo("15000.00")
                .jsonPath("$.valueMoves[?(@.accountId=='" + home + "')].start").isEqualTo("300000.00")
                .jsonPath("$.valueMoves[?(@.accountId=='" + home + "')].end").isEqualTo("315000.00")
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00")
                .jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_OTHER_ASSET_003 a lower car estimate is a $2,000.00 asset value decrease, not spending, and "
            + "September 1 still shows $30,000.00")
    void lowerCarEstimate() {
        saveValue(car, "w-3", valueBody(samId, "28000.00", "2026-09-30", "Updated resale estimate", false))
                .expectStatus().isCreated();
        change("2026-09-01", "2026-09-30").expectBody()
                .jsonPath("$.valueMoves[?(@.accountId=='" + car + "')].change").isEqualTo("-2000.00")
                .jsonPath("$.spending").isEqualTo("0.00");
        assertThat(lineOf("2026-09-01", car, "balance")).isEqualTo("30000.00");
        assertThat(lineOf("2026-09-30", car, "balance")).isEqualTo("28000.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_DATED_VALUE_004 after a repeated confirmation the wealth change from the estimate is negative "
            + "$2,000.00 once, and September 30 shows $28,000.00 everywhere")
    void repeatedConfirmationCountsOnce() {
        String own = otherAsset("Double Wealth Car", "30000.00", "2026-09-01");
        String body = valueBody(samId, "28000.00", "2026-09-30", null, false);
        saveValue(own, "w-d", body).expectStatus().isCreated();
        saveValue(own, "w-d", body).expectStatus().isOk();
        change("2026-09-01", "2026-09-30").expectBody()
                .jsonPath("$.valueMoves[?(@.accountId=='" + own + "')].change").isEqualTo("-2000.00");
        assertThat(lineOf("2026-09-30", own, "balance")).isEqualTo("28000.00");
        assertBalance(own, "28000.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_DATED_VALUE_002 August wealth uses $31,000.00 for the car after the start moves earlier; "
            + "September 1 and September 30 stay $30,000.00 and $28,000.00; an account not yet tracking is named")
    void augustWealthUsesTheEarlierOpening() {
        String own = otherAsset("Early Car", "30000.00", "2026-09-01");
        savedValue(own, "w-e", "28000.00", "2026-09-30", null);
        extendStart(own, "w-ex", """
                {"amount": "31000.00", "valueOn": "2026-08-01", "reason": "Add an earlier car estimate",
                 "enteredByMemberId": "%s"}""".formatted(samId)).expectStatus().isOk();
        assertThat(lineOf("2026-08-15", own, "balance")).isEqualTo("31000.00");
        assertThat(lineOf("2026-08-15", own, "valueDate")).isEqualTo("2026-08-01");
        assertThat(lineOf("2026-09-01", own, "balance")).isEqualTo("30000.00");
        assertThat(lineOf("2026-09-30", own, "balance")).isEqualTo("28000.00");
        wealth("2026-07-15").expectStatus().isOk().expectBody()
                .jsonPath("$.notTracked[?(@.accountId=='" + own + "')].name").isEqualTo("Early Car")
                .jsonPath("$.propertyAndOther.accounts[?(@.accountId=='" + own + "')]").isEmpty();
        assertThat(lineOf("2026-07-15", own, "balance")).isNull();
        // The earlier start adds history only: the change from August 15 to September 1 is the value move.
        change("2026-08-15", "2026-09-01").expectBody()
                .jsonPath("$.valueMoves[?(@.accountId=='" + own + "')].change").isEqualTo("-1000.00")
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00")
                .jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_PROPERTY_005 after the estimate is removed, wealth uses $300,000.00 and flags the older value "
            + "date; Undo twice brings one estimate back; a value 30 days old is not flagged, 31 days is")
    void removalFlagsTheOlderValue() {
        String own = property("Removal Home", "300000.00", "2026-09-01");
        String estimate = savedValue(own, "w-r", "320000.00", "2026-09-30", null);
        assertThat(lineOf(null, own, "stale")).isEqualTo("false");
        valueAction(own, estimate, "removal", samId).expectStatus().isOk();
        assertThat(lineOf(null, own, "balance")).isEqualTo("300000.00");
        assertThat(lineOf(null, own, "valueDate")).isEqualTo("2026-09-01");
        assertThat(lineOf(null, own, "stale")).as("32 days before 2026-10-03").isEqualTo("true");
        valueAction(own, estimate, "undo", samId).expectStatus().isOk();
        valueAction(own, estimate, "undo", samId).expectStatus().isOk();
        assertThat(lineOf(null, own, "balance")).isEqualTo("320000.00");
        assertThat(lineOf(null, own, "stale")).isEqualTo("false");

        String thirty = property("Thirty Days", "1.00", "2026-09-03");
        String thirtyOne = property("Thirty One Days", "1.00", "2026-09-02");
        assertThat(lineOf(null, thirty, "stale")).as("2026-09-03 is 30 days before 2026-10-03").isEqualTo("false");
        assertThat(lineOf(null, thirtyOne, "stale")).as("2026-09-02 is 31 days before").isEqualTo("true");
    }

    @Order(7)
    @Test
    @DisplayName("V2_PROPERTY_006 a plan is never counted in wealth, an as-of figure or the change, and a future date "
            + "is refused for wealth")
    void planIsNeverCounted() {
        String own = property("Plan Home", "300000.00", "2026-09-01");
        String before = field(wealth(null), "$.netWorth");
        saveValue(own, "w-p", valueBody(mayaId, "999999.00", "2026-12-31", null, true)).expectStatus().isCreated();
        assertThat(field(wealth(null), "$.netWorth")).isEqualTo(
                new BigDecimal(before).toPlainString());
        assertThat(lineOf(null, own, "balance")).isEqualTo("300000.00");
        change("2026-09-01", "2026-10-03").expectBody()
                .jsonPath("$.valueMoves[?(@.accountId=='" + own + "')]").isEmpty();
        // Once the plan's date has passed it is still only a plan: no reader counts it as a value.
        clock.setToday(java.time.LocalDate.of(2027, 1, 5));
        assertThat(lineOf(null, own, "balance")).isEqualTo("300000.00");
        assertThat(lineOf("2027-01-05", own, "balance")).isEqualTo("300000.00");
        assertThat(field(wealth("2027-01-05"), "$.netWorth")).isEqualTo(before);
        assertBalance(own, "300000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2027-01-02", own).exchange().expectBody()
                .jsonPath("$.amount").isEqualTo("300000.00");
        change("2026-10-03", "2027-01-05").expectBody().jsonPath("$.valueMoves[?(@.accountId=='" + own + "')]")
                .isEmpty();
        clock.setToday(java.time.LocalDate.of(2026, 10, 3));
        wealth("2026-10-04").expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("The date cannot be in the future");
        change("2026-09-01", "2026-10-04").expectStatus().isBadRequest();
        change("2026-09-30", "2026-09-01").expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("The start date must be on or before the end date");
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01").exchange().expectStatus().isBadRequest();
    }

    @Order(8)
    @Test
    @DisplayName("V2_PROPERTY_003 the change components add up to the difference between two as-of wealth figures, "
            + "with income, spending, a correction, a transfer, an estimate and an account added in the period")
    void componentsEqualTheDifferenceOfTwoFigures() {
        saveIncome(checking, "i-1", "2000.00", "2026-09-15");
        saveExpense(checking, "i-2", "500.00", "2026-09-20", "Dining");
        post(checking, "refunds", "i-r", entry(mayaId, "Return", "40.00", "2026-09-21", "Dining")).expectStatus()
                .isCreated();
        transfer("i-t", checking, savings, "300.00", "2026-09-25");
        post(checking, "balance-corrections", "i-c", """
                {"requestedBalance": "6000.00", "asOn": "2026-09-27", "reason": "Fee",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated();
        String added = otherAsset("Added Late", "700.00", "2026-09-10");
        savedValue(added, "i-a", "650.00", "2026-09-29", null);
        savedValue(home, "i-h", "318000.00", "2026-09-28", "Late September");
        String closed = property("Closed Late", "0.00", "2026-09-05");
        savedValue(closed, "i-z", "0.00", "2026-09-06", null);
        act(closed, "close").expectStatus().isOk();

        for (String period : List.of("2026-09-01 2026-09-30", "2026-09-12 2026-09-26", "2026-08-01 2026-10-03",
                "2026-09-30 2026-10-03")) {
            String[] dates = period.split(" ");
            BigDecimal start = new BigDecimal(field(wealth(dates[0]), "$.netWorth"));
            BigDecimal end = new BigDecimal(field(wealth(dates[1]), "$.netWorth"));
            String spec = json(change(dates[0], dates[1]));
            BigDecimal income = new BigDecimal(at(spec, "$.income"));
            BigDecimal spending = new BigDecimal(at(spec, "$.spending"));
            BigDecimal value = new BigDecimal(at(spec, "$.valueChange"));
            BigDecimal corrections = new BigDecimal(at(spec, "$.corrections"));
            BigDecimal addedNow = new BigDecimal(at(spec, "$.accountsAdded"));
            BigDecimal transfers = new BigDecimal(at(spec, "$.transfers"));
            BigDecimal other = new BigDecimal(at(spec, "$.other"));
            assertThat(new BigDecimal(at(spec, "$.startWealth"))).isEqualByComparingTo(start);
            assertThat(new BigDecimal(at(spec, "$.endWealth"))).isEqualByComparingTo(end);
            assertThat(income.subtract(spending).add(value).add(corrections).add(addedNow).add(transfers)
                    .add(other)).as("components for " + period)
                    .isEqualByComparingTo(end.subtract(start));
            assertThat(other).as("nothing is left unexplained").isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(transfers).as("a transfer cancels").isEqualByComparingTo(BigDecimal.ZERO);
        }
        String september = json(change("2026-09-01", "2026-09-30"));
        assertThat(new BigDecimal(at(september, "$.income"))).isEqualByComparingTo("2000.00");
        assertThat(new BigDecimal(at(september, "$.spending"))).isEqualByComparingTo("460.00");
        assertThat(new BigDecimal(at(september, "$.corrections"))).isNotEqualByComparingTo(BigDecimal.ZERO);
    }

    @Order(9)
    @Test
    @DisplayName("V2_LOAN_003 the change components still add up with loans: a payment's interest is spending, its "
            + "principal and the debt it pays cancel as a transfer, and a loan added in the period is an account added")
    void componentsEqualTheDifferenceWithLoanPayments() {
        BigDecimal addedBefore = new BigDecimal(field(change("2026-09-01", "2026-09-30"), "$.accountsAdded"));
        String carLoan = loan("Wealth Car Loan", "20000.00", "2026-09-01");
        loanPayment("l-1", checking, carLoan, "450.00", "50.00", "2026-09-16");
        String lateLoan = loan("Wealth Late Loan", "10000.00", "2026-09-10");
        loanPayment("l-2", checking, lateLoan, "1000.00", "100.00", "2026-09-20");
        loanPayment("l-3", checking, carLoan, "200.00", "0.00", "2026-10-02");

        for (String period : List.of("2026-09-01 2026-09-30", "2026-09-12 2026-09-26", "2026-08-01 2026-10-03",
                "2026-09-30 2026-10-03", "2026-09-15 2026-09-16")) {
            String[] dates = period.split(" ");
            BigDecimal start = new BigDecimal(field(wealth(dates[0]), "$.netWorth"));
            BigDecimal end = new BigDecimal(field(wealth(dates[1]), "$.netWorth"));
            String spec = json(change(dates[0], dates[1]));
            BigDecimal explained = new BigDecimal(at(spec, "$.income")).subtract(new BigDecimal(at(spec, "$.spending")))
                    .add(new BigDecimal(at(spec, "$.valueChange"))).add(new BigDecimal(at(spec, "$.corrections")))
                    .add(new BigDecimal(at(spec, "$.accountsAdded"))).add(new BigDecimal(at(spec, "$.transfers")))
                    .add(new BigDecimal(at(spec, "$.other")));
            assertThat(explained).as("components for " + period).isEqualByComparingTo(end.subtract(start));
            assertThat(new BigDecimal(at(spec, "$.other"))).as("nothing unexplained " + period)
                    .isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(new BigDecimal(at(spec, "$.transfers"))).as("principal cancels " + period)
                    .isEqualByComparingTo(BigDecimal.ZERO);
        }
        // Only the interest is spending: 50 on September 16 and 100 on September 20, on top of the earlier 460.
        assertThat(new BigDecimal(field(change("2026-09-15", "2026-09-16"), "$.spending")))
                .isEqualByComparingTo("50.00");
        assertThat(new BigDecimal(field(change("2026-09-01", "2026-09-30"), "$.spending")))
                .isEqualByComparingTo("610.00");
        // The late loan's $10,000.00 opening is an account added, a debt, in a period that starts before it.
        assertThat(new BigDecimal(field(change("2026-09-01", "2026-09-30"), "$.accountsAdded")).subtract(addedBefore))
                .isEqualByComparingTo("-10000.00");
        assertThat(new BigDecimal(field(change("2026-10-02", "2026-10-03"), "$.spending")))
                .isEqualByComparingTo("0.00");
    }

    @Order(10)
    @Test
    @DisplayName("V2_DATED_VALUE_001 a plan on a loan or a mortgage is never counted in wealth, an as-of figure or "
            + "the change, before or after its date (the twin of the property plan test)")
    void debtPlanIsNeverCounted() {
        String bank = account("Plan Checking", "1000.00");
        String loanId = loan("Plan Loan", "5000.00", "2026-09-01");
        String mortgageId = mortgage("Plan Mortgage", "100000.00", "2026-09-01");
        loanPayment("dp-0", bank, loanId, "100.00", "0.00", "2026-09-10");
        String before = json(wealth(null));
        String beforeAsOf = json(wealth("2026-09-20"));
        String beforeChange = json(change("2026-09-01", "2026-10-03"));
        for (String debt : List.of(loanId, mortgageId)) {
            saveValue(debt, "dp-" + debt, valueBody(mayaId, "1.00", "2026-12-31", "Refinance", true)).expectStatus()
                    .isCreated().expectBody().jsonPath("$.value.status").isEqualTo("planned");
        }
        assertThat(json(wealth(null))).isEqualTo(before);
        assertThat(json(wealth("2026-09-20"))).isEqualTo(beforeAsOf);
        assertThat(json(change("2026-09-01", "2026-10-03"))).isEqualTo(beforeChange);
        assertBalance(loanId, "-4900.00");
        assertBalance(mortgageId, "-100000.00");
        // Once the plan's date has passed it is still only a plan.
        clock.setToday(java.time.LocalDate.of(2027, 1, 5));
        try {
            assertBalance(loanId, "-4900.00");
            assertBalance(mortgageId, "-100000.00");
            assertThat(json(wealth("2026-09-20"))).isEqualTo(beforeAsOf);
            assertThat(field(wealth("2027-01-05"), "$.debts")).isEqualTo(field(wealth(null), "$.debts"));
        } finally {
            clock.setToday(java.time.LocalDate.of(2026, 10, 3));
        }
    }
}
