package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 19b: a recorded price reaches the one Balance through every reader, and each reader has a test that fails when
 * the price term is dropped from it (planted and watched red): `ActivityStore.deltaOf` (the detail, Close),
 * `deltasByAccount` (the list), `changeUpTo` (Balance as of a date), `WealthStore.balancesAsOf` (wealth, each person's
 * view, the Household total, each group total) and the change explanation. Overlapping groups stay views: every
 * account is counted once (D-065, D-067).
 *
 * <p>Accounts: Redwood Brokerage (Sam) 50 HOME, Harbor 401k (Maya) 200 HOME, Meadow HSA (Maya) 20 HOME, all opened
 * 2026-09-01 at $100.00, and a joint Redwood Joint; prices: Redwood $130.00 on Sep 30 (+$1,500.00), Harbor $110.00 on
 * Sep 15 (+$2,000.00), HSA $90.00 on Sep 20 (-$200.00), Joint $120.00 on Sep 10 (+$1,000.00).
 */
class HoldingPriceReadersApiTests extends PriceTestBase {

    private static String redwood;
    private static String harbor;
    private static String hsa;
    private static String joint;
    private static String checking;

    @Order(0)
    @Test
    @DisplayName("V2_WEALTH_004 V2_HOLDINGS_008 set up the accounts and record the prices")
    void setUp() {
        household();
        checking = account("Readers Checking", "5000.00");
        redwood = redwood("Readers Redwood", samId);
        harbor = held("401k", "Readers Harbor 401k", mayaId, "2026-09-01", "60000.00",
                holding("HOME", "200", "100.00", "2026-09-01"));
        hsa = held("hsa", "Readers Meadow HSA", mayaId, "2026-09-01", "1050.00",
                holding("HOME", "20", "100.00", "2026-09-01"));
        joint = held("brokerage", "Readers Joint", mayaId + "\", \"" + samId, "2026-09-01", "15000.00",
                holding("HOME", "50", "100.00", "2026-09-01"));
        record(redwood, "rd-1", "HOME", "130.00", "2026-09-30");
        record(harbor, "rd-2", "HOME", "110.00", "2026-09-15");
        record(hsa, "rd-3", "HOME", "90.00", "2026-09-20");
        record(joint, "rd-4", "HOME", "120.00", "2026-09-10");
    }

    @Order(1)
    @Test
    @DisplayName("V2_WEALTH_004 reader deltaOf: the account detail and its Balance date carry the price")
    void detailCarriesThePrice() {
        assertBalance(redwood, "21500.00");
        assertBalance(harbor, "82000.00");
        assertBalance(hsa, "2850.00");
        assertBalance(joint, "21000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", redwood).exchange().expectBody()
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-30").jsonPath("$.openingAmount")
                .isEqualTo("20000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_WEALTH_004 reader deltaOf: Close needs a zero Balance and names the Balance with the price in it")
    void closeNamesThePricedBalance() {
        assertRefusedWith(act(redwood, "close"), 409, "It has $21,500.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_WEALTH_004 reader deltasByAccount: the accounts list carries the price")
    void listCarriesThePrice() {
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.id == '" + redwood + "')].balance.amount")
                .value(List.class, found -> assertThat(found).containsExactly("21500.00"))
                .jsonPath("$[?(@.id == '" + harbor + "')].balance.amount")
                .value(List.class, found -> assertThat(found).containsExactly("82000.00"))
                .jsonPath("$[?(@.id == '" + hsa + "')].balance.amount")
                .value(List.class, found -> assertThat(found).containsExactly("2850.00"))
                .jsonPath("$[?(@.id == '" + redwood + "')].balance.asOf")
                .value(List.class, found -> assertThat(found).containsExactly("2026-09-30"));
    }

    @Order(4)
    @Test
    @DisplayName("V2_WEALTH_004 reader changeUpTo: the Balance on a date counts the prices dated on or before it")
    void balanceOnADate() {
        assertBalanceAsOf(redwood, "2026-09-29", "20000.00");
        assertBalanceAsOf(redwood, "2026-09-30", "21500.00");
        assertBalanceAsOf(harbor, "2026-09-14", "80000.00");
        assertBalanceAsOf(harbor, "2026-09-15", "82000.00");
        assertBalanceAsOf(hsa, "2026-09-19", "3050.00");
        assertBalanceAsOf(hsa, "2026-09-20", "2850.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_WEALTH_004 reader WealthStore.balancesAsOf: wealth lines carry the price on every date")
    void wealthLinesOnADate() {
        assertWealthLine(redwood, null, "21500.00");
        assertWealthLine(redwood, "2026-09-29", "20000.00");
        assertWealthLine(redwood, "2026-09-30", "21500.00");
        assertWealthLine(harbor, "2026-09-14", "80000.00");
        assertWealthLine(harbor, "2026-09-15", "82000.00");
        assertWealthLine(joint, "2026-09-09", "20000.00");
        assertWealthLine(joint, "2026-09-10", "21000.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_WEALTH_004 counted once: net worth, financial assets, each group total and the Household total "
            + "are summed from the account lines, and the overlapping groups are never added")
    void countedOnce() {
        // Checking 5,000 + Redwood 21,500 + Harbor 82,000 + HSA 2,850 + Joint 21,000, once each.
        wealth("").expectBody().jsonPath("$.netWorth").isEqualTo("132350.00").jsonPath("$.financialAssets")
                .isEqualTo("132350.00").jsonPath("$.debts").isEqualTo("0.00").jsonPath("$.bankMoney.total")
                .isEqualTo("5000.00").jsonPath("$.investments.total").isEqualTo("127350.00")
                .jsonPath("$.retirement.total").isEqualTo("82000.00").jsonPath("$.healthSavings.total")
                .isEqualTo("2850.00");
        // The three groups overlap: Retirement and Health savings are inside Investments, so adding them to
        // Investments and Bank money would claim 217,200.00 instead of 132,350.00.
        wealth("").expectBody().jsonPath("$.investments.accounts.length()").isEqualTo(4);
        // The same on an earlier date, where fewer prices count: 5,000 + 20,000 + 80,000 + 3,050 + 20,000.
        wealth("?asOf=2026-09-09").expectBody().jsonPath("$.netWorth").isEqualTo("128050.00")
                .jsonPath("$.investments.total").isEqualTo("123050.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_WEALTH_004 each person's view counts a joint account in full and the price in it: Sam, Maya and "
            + "the Household are three views, never added")
    void personViews() {
        // Sam: Redwood 21,500 + Joint 21,000. Maya: checking 5,000 + Harbor 82,000 + HSA 2,850 + Joint 21,000.
        wealth("?memberId=" + samId).expectBody().jsonPath("$.netWorth").isEqualTo("42500.00")
                .jsonPath("$.investments.total").isEqualTo("42500.00").jsonPath("$.retirement.total")
                .isEqualTo("0.00");
        wealth("?memberId=" + mayaId).expectBody().jsonPath("$.netWorth").isEqualTo("110850.00")
                .jsonPath("$.retirement.total").isEqualTo("82000.00").jsonPath("$.healthSavings.total")
                .isEqualTo("2850.00");
        // The joint account is in both, so the two people's totals add to more than the Household's.
        assertThat(42500 + 110850).isGreaterThan(132350);
        wealth("?memberId=" + samId + "&asOf=2026-09-09").expectBody().jsonPath("$.netWorth").isEqualTo("40000.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_WEALTH_004 the change explanation has a price term of its own, never income, and still balances")
    void changeExplanation() {
        // From Sep 1 to Oct 3: Redwood +1,500, Harbor +2,000, HSA -200, Joint +1,000 = +4,300.
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-10-03").exchange().expectStatus()
                .isOk().expectBody().jsonPath("$.change").isEqualTo("4300.00").jsonPath("$.priceChange")
                .isEqualTo("4300.00").jsonPath("$.income").isEqualTo("0.00").jsonPath("$.spending")
                .isEqualTo("0.00").jsonPath("$.valueChange").isEqualTo("0.00").jsonPath("$.other")
                .isEqualTo("0.00").jsonPath("$.priceMoves.length()").isEqualTo(4)
                .jsonPath("$.priceMoves[?(@.accountId == '" + hsa + "')].change")
                .value(List.class, found -> assertThat(found).containsExactly("-200.00"));
        // A slice of the period: Sep 14 to Sep 25 holds Harbor's +2,000 and the HSA's -200, and no other price.
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-14&to=2026-09-25").exchange().expectBody()
                .jsonPath("$.change").isEqualTo("1800.00").jsonPath("$.priceChange").isEqualTo("1800.00")
                .jsonPath("$.other").isEqualTo("0.00").jsonPath("$.priceMoves.length()").isEqualTo(2);
        // Dates before every price: no price term.
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-09").exchange().expectBody()
                .jsonPath("$.priceChange").isEqualTo("0.00").jsonPath("$.priceMoves.length()").isEqualTo(0)
                .jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(9)
    @Test
    @DisplayName("V2_WEALTH_004 a price move is not income or spending in the month review")
    void notIncomeNotSpending() {
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("0.00");
    }
}
