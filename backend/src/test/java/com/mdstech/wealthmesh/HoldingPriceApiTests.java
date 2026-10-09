package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Slice 19b: a price recorded on a holding after setup (V2_HOLDINGS_008, V2_WEALTH_004). A known $0.00 price is
 * reviewed with the zero highlighted and saved; a later price moves the one Balance and nothing else; a second price
 * for a holding and date replaces the first and the earlier stays in the history; every rule is refused in the review
 * and at save.
 */
class HoldingPriceApiTests extends PriceTestBase {

    private static Stream<Arguments> zeroRows() {
        return Stream.of(
                Arguments.of("brokerage", "Redwood Brokerage", "200.00", "-200.00"),
                Arguments.of("401k", "Harbor 401k", "200.00", "-200.00"),
                Arguments.of("traditional_ira", "Willow Traditional IRA", "200.00", "-200.00"),
                Arguments.of("roth_ira", "Willow Roth IRA", "200.00", "-200.00"),
                Arguments.of("hsa", "Meadow HSA", "200.00", "-200.00"),
                Arguments.of("hsa", "Meadow HSA Unknown Cost", null, null));
    }

    @Order(0)
    @Test
    @DisplayName("V2_HOLDINGS_008 set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @ParameterizedTest(name = "V2_HOLDINGS_008 {1}: a known $0.00 price is reviewed with the zero highlighted, saved, "
            + "and the Balance equals cash; cost {2}, gain {3}")
    @MethodSource("zeroRows")
    void zeroPrice(String type, String name, String cost, String gain) {
        String line = cost == null ? holding("HOME", "10", "100.00", "2026-09-01")
                : holding("HOME", "10", "100.00", "2026-09-01", cost);
        String account = held(type, name, samId, "2026-09-01", "1000.00", line);
        assertBalance(account, "2000.00");
        String body = priceBody("HOME", "0.00", "2026-09-30", mayaId);
        reviewPrice(account, body).expectStatus().isOk().expectBody().jsonPath("$.zero").isEqualTo(true)
                .jsonPath("$.changesBalance").isEqualTo(true).jsonPath("$.shares").isEqualTo("10")
                .jsonPath("$.holdingBefore").isEqualTo("1000.00").jsonPath("$.holdingAfter").isEqualTo("0.00")
                .jsonPath("$.balanceBefore").isEqualTo("2000.00").jsonPath("$.balanceAfter").isEqualTo("1000.00")
                .jsonPath("$.message").value(text -> assertThat(String.valueOf(text))
                        .contains("will be worth $0.00").contains("Your 10 shares stay recorded"));
        // The review wrote nothing.
        assertBalance(account, "2000.00");
        assertThat(priceRows(account)).isZero();

        savePrice(account, "zero-" + name, body).expectStatus().isCreated().expectBody()
                .jsonPath("$.price.price").isEqualTo("0.00").jsonPath("$.holdingValue").isEqualTo("0.00")
                .jsonPath("$.balance").isEqualTo("1000.00").jsonPath("$.balanceOn").isEqualTo("2026-09-30")
                .jsonPath("$.shares").isEqualTo("10");
        // The single Balance equals cash; the list, the detail and wealth agree; shares and cost are unchanged.
        assertBalance(account, "1000.00");
        assertWealthLine(account, null, "1000.00");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.id == '" + account + "')].balance.amount")
                .value(List.class, found -> assertThat(found).containsExactly("1000.00"))
                .jsonPath("$[?(@.id == '" + account + "')].balance.asOf")
                .value(List.class, found -> assertThat(found).containsExactly("2026-09-30"));
        webTestClient.get().uri("/api/v1/accounts/{id}/holdings", account).exchange().expectBody()
                .jsonPath("$.cash").isEqualTo("1000.00").jsonPath("$.holdingsValue").isEqualTo("0.00")
                .jsonPath("$.balance").isEqualTo("1000.00").jsonPath("$.securities[0].shares").isEqualTo("10")
                .jsonPath("$.securities[0].price").isEqualTo("0.00").jsonPath("$.securities[0].priceOn")
                .isEqualTo("2026-09-30").jsonPath("$.securities[0].value").isEqualTo("0.00");
        if (cost == null) {
            // A missing cost still says not available (null), never zero; a missing price is not a zero price.
            webTestClient.get().uri("/api/v1/accounts/{id}/holdings", account).exchange().expectBody()
                    .jsonPath("$.securities[0].cost").doesNotExist().jsonPath("$.securities[0].gain").doesNotExist();
        } else {
            webTestClient.get().uri("/api/v1/accounts/{id}/holdings", account).exchange().expectBody()
                    .jsonPath("$.securities[0].cost").isEqualTo(cost).jsonPath("$.securities[0].gain")
                    .isEqualTo(gain);
        }
        assertNoMoneyRecords(account);
    }

    @Order(2)
    @Test
    @DisplayName("V2_WEALTH_004 brokerage last priced Sep 1: wealth shows the older price date and the different-"
            + "dates note; HOME $130.00 on Sep 30 gives $26,620.00, Balance $21,500.00, and $20,000.00 stays visible")
    void olderBalanceThenNewPrice() {
        String checking = account("Everyday Checking", "5120.00");
        String brokerage = redwood("Redwood WEALTH_004", samId);
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-30").exchange().expectBody()
                .jsonPath("$.investments.accounts[?(@.accountId == '" + brokerage + "')].valueDate")
                .value(List.class, found -> assertThat(found).containsExactly("2026-09-01"))
                .jsonPath("$.olderPrices[?(@.accountId == '" + brokerage + "')].priceOn")
                .value(List.class, found -> assertThat(found).containsExactly("2026-09-01"));
        assertWealthLine(brokerage, "2026-09-30", "20000.00");
        long assetsBefore = assets();

        record(brokerage, "w4-1", "HOME", "130.00", "2026-09-30");
        assertBalance(brokerage, "21500.00");
        assertThat(assets() - assetsBefore).isEqualTo(1500_00L);
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-30").exchange().expectBody()
                .jsonPath("$.investments.accounts[?(@.accountId == '" + brokerage + "')].valueDate")
                .value(List.class, found -> assertThat(found).containsExactly("2026-09-30"))
                .jsonPath("$.olderPrices[?(@.accountId == '" + brokerage + "')].priceOn")
                .value(List.class, found -> assertThat(found).isEmpty());
        webTestClient.get().uri("/api/v1/accounts/{id}/holdings", brokerage).exchange().expectBody()
                .jsonPath("$.cash").isEqualTo("15000.00").jsonPath("$.holdingsValue").isEqualTo("6500.00")
                .jsonPath("$.balance").isEqualTo("21500.00");
        // The older Balance stays visible in the history.
        prices(brokerage).expectBody().jsonPath("$.points.length()").isEqualTo(2).jsonPath("$.points[0].on")
                .isEqualTo("2026-09-01").jsonPath("$.points[0].balance").isEqualTo("20000.00")
                .jsonPath("$.points[1].on").isEqualTo("2026-09-30").jsonPath("$.points[1].balance")
                .isEqualTo("21500.00");
        assertBalanceAsOf(brokerage, "2026-09-29", "20000.00");
        assertThat(checking).isNotBlank();
    }

    private long assets() {
        AtomicReference<String> assets = new AtomicReference<>();
        wealth("").expectBody().jsonPath("$.financialAssets").value(String.class, assets::set);
        return new java.math.BigDecimal(assets.get()).movePointRight(2).longValueExact();
    }

    @Order(3)
    @Test
    @DisplayName("V2_HOLDINGS_008 Q-069 a second price for the same holding and date replaces the first; the earlier "
            + "stays in the history with who and when, and an as-of read for an earlier date still returns it")
    void replaceOnTheSameDate() {
        String account = redwood("Redwood Replace", samId);
        String first = record(account, "r-1", "HOME", "120.00", "2026-09-10");
        record(account, "r-2", "HOME", "130.00", "2026-09-30");
        String replaced = record(account, "r-3", "HOME", "125.00", "2026-09-30");
        record(account, "r-4", "HOME", "140.00", "2026-09-30");
        assertThat(replaced).isNotEqualTo(first);
        assertBalanceAsOf(account, "2026-09-09", "20000.00");
        assertBalanceAsOf(account, "2026-09-10", "21000.00");
        assertBalanceAsOf(account, "2026-09-29", "21000.00");
        assertBalanceAsOf(account, "2026-09-30", "22000.00");
        assertBalance(account, "22000.00");
        // Four prices were saved: the Sep 30 date was taken three times (130, 125, 140), so two are replaced and the
        // history keeps all four, with only one counting per date.
        prices(account).expectBody().jsonPath("$.prices.length()").isEqualTo(4)
                .jsonPath("$.prices[?(@.replaced == true)].length()").value(List.class,
                        found -> assertThat(found).hasSize(2))
                .jsonPath("$.prices[?(@.replaced == true && @.price == '130.00')].enteredByName")
                .value(List.class, found -> assertThat(found).containsExactly("Maya"))
                .jsonPath("$.prices[?(@.replaced == true)].replacedAt").value(List.class,
                        found -> assertThat(found.get(0)).isNotNull())
                .jsonPath("$.prices[?(@.replaced == false)].length()").value(List.class,
                        found -> assertThat(found).hasSize(2));
        assertNoMoneyRecords(account);
    }

    @Order(4)
    @Test
    @DisplayName("V2_HOLDINGS_008 a price older than the one that counts changes no Balance, and the review says so")
    void olderPriceChangesNothing() {
        String account = redwood("Redwood Older", samId);
        record(account, "o-1", "HOME", "130.00", "2026-09-30");
        reviewPrice(account, priceBody("HOME", "120.00", "2026-09-10", mayaId)).expectStatus().isOk().expectBody()
                .jsonPath("$.changesBalance").isEqualTo(false).jsonPath("$.balanceBefore").isEqualTo("21500.00")
                .jsonPath("$.balanceAfter").isEqualTo("21500.00").jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("The Balance does not change"));
        record(account, "o-2", "HOME", "120.00", "2026-09-10");
        assertBalance(account, "21500.00");
        assertBalanceAsOf(account, "2026-09-10", "21000.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_HOLDINGS_008 the review of a price that replaces another names it and its author")
    void reviewNamesWhatItReplaces() {
        String account = redwood("Redwood Names", samId);
        record(account, "n-1", "HOME", "130.00", "2026-09-30");
        reviewPrice(account, priceBody("HOME", "135.00", "2026-09-30", samId)).expectStatus().isOk().expectBody()
                .jsonPath("$.replaces.price").isEqualTo("130.00").jsonPath("$.replaces.enteredByName")
                .isEqualTo("Maya").jsonPath("$.message").value(text -> assertThat(String.valueOf(text))
                        .contains("It replaces the 130.00 price").contains("Maya recorded"));
    }

    private static Stream<Arguments> badRequests() {
        return Stream.of(
                Arguments.of("a negative price", "HOME", "-1.00", "2026-09-30", true,
                        "Holding market price must be zero or greater"),
                Arguments.of("a price that is text", "HOME", "abc", "2026-09-30", true, "Enter a valid amount"),
                Arguments.of("a missing price", "HOME", null, "2026-09-30", true, "Enter a valid amount"),
                Arguments.of("a symbol the account does not hold", "NOPE", "10.00", "2026-09-30", true,
                        "NOPE is not held in"),
                Arguments.of("a blank symbol", " ", "10.00", "2026-09-30", true, "Choose the holding"),
                Arguments.of("a future date", "HOME", "10.00", "2026-10-04", true,
                        "Future values are not completed account history"),
                Arguments.of("a date before tracking began", "HOME", "10.00", "2026-08-31", true,
                        "Review the earlier tracking start before saving. The Setup date is 2026-09-01."),
                Arguments.of("a date before the opening price date", "HOME", "10.00", "2026-09-10", true,
                        "HOME's opening price is dated 2026-09-20; record a price on or after it"),
                Arguments.of("no date", "HOME", "10.00", null, true, "Enter the price date"),
                Arguments.of("no member", "HOME", "10.00", "2026-09-30", false, "Choose who entered this"));
    }

    @Order(6)
    @ParameterizedTest(name = "V2_HOLDINGS_008 {0} is refused in the review and at save, and nothing is saved")
    @MethodSource("badRequests")
    void refusedRules(String what, String symbol, String price, String on, boolean member, String message) {
        String account = held("brokerage", "Redwood Rules " + what, samId, "2026-09-01", "1000.00",
                holding("HOME", "10", "100.00", "2026-09-20"));
        String body = priceBody(symbol, price, on, member ? mayaId : null);
        assertRefusedWith(reviewPrice(account, body), 400, message);
        assertRefusedWith(savePrice(account, "rule-" + what, body), 400, message);
        assertThat(priceRows(account)).isZero();
        assertBalance(account, "2000.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_HOLDINGS_008 a price sent as a JSON number, an unknown member and a missing key are refused")
    void shapeRefusals() {
        String account = redwood("Redwood Shapes", samId);
        String number = "{\"symbol\": \"HOME\", \"price\": 130, \"valueOn\": \"2026-09-30\", "
                + "\"enteredByMemberId\": \"" + mayaId + "\"}";
        assertRefusedWith(reviewPrice(account, number), 400, "Enter a valid amount");
        assertRefusedWith(savePrice(account, "shape-1", number), 400, "Enter a valid amount");
        String stranger = priceBody("HOME", "130.00", "2026-09-30", "00000000-0000-4000-8000-000000000000");
        assertRefusedWith(reviewPrice(account, stranger), 400, "Choose who entered this from this household");
        assertRefusedWith(savePrice(account, "shape-2", stranger), 400, "Choose who entered this from this household");
        assertRefusedWith(savePrice(account, null, priceBody("HOME", "130.00", "2026-09-30", mayaId)), 400,
                "Missing save key");
        assertThat(priceRows(account)).isZero();
    }

    @Order(8)
    @Test
    @DisplayName("V2_HOLDINGS_008 Q-070 a price is refused on a draft, archived, closed, deleted or another type of "
            + "account, in the review and at save, and on an unknown account")
    void stateMatrix() {
        String body = priceBody("HOME", "130.00", "2026-09-30", mayaId);
        String draft = investment("brokerage", "Redwood Draft Price", "2026-09-01",
                opening("20000.00", null, holding("HOME", "50", "100.00", "2026-09-01")));
        assertRefusedWith(reviewPrice(draft, body), 409, "a draft");
        assertRefusedWith(savePrice(draft, "st-1", body), 409, "a draft");

        String archived = redwood("Redwood Archived Price", samId);
        act(archived, "archive").expectStatus().isOk();
        assertRefusedWith(reviewPrice(archived, body), 409, "archived. Restore it first.");
        assertRefusedWith(savePrice(archived, "st-2", body), 409, "archived. Restore it first.");

        String closed = held("brokerage", "Redwood Closed Price", samId, "2026-09-01", "0.00");
        act(closed, "close").expectStatus().isOk();
        assertRefusedWith(reviewPrice(closed, priceBody("HOME", "1.00", "2026-09-30", mayaId)), 409,
                "closed. Reopen it first.");
        assertRefusedWith(savePrice(closed, "st-3", priceBody("HOME", "1.00", "2026-09-30", mayaId)), 409,
                "closed. Reopen it first.");

        String deleted = held("brokerage", "Redwood Deleted Price", samId, "2026-09-01", "0.00");
        act(deleted, "delete").expectStatus().isOk();
        reviewPrice(deleted, body).expectStatus().isNotFound();
        savePrice(deleted, "st-4", body).expectStatus().isNotFound();
        prices(deleted).expectStatus().isNotFound();

        String checking = account("Checking For Price", "100.00");
        assertRefusedWith(reviewPrice(checking, body), 400, "investment accounts only");
        assertRefusedWith(savePrice(checking, "st-5", body), 400, "investment accounts only");
        prices(checking).expectStatus().isBadRequest();

        reviewPrice("00000000-0000-4000-8000-000000000000", body).expectStatus().isNotFound();
        savePrice("00000000-0000-4000-8000-000000000000", "st-6", body).expectStatus().isNotFound();
        assertThat(priceRows(archived)).isZero();
    }

    @Order(9)
    @Test
    @DisplayName("V2_HOLDINGS_008 a price creates no entry, no income and no purchase cost; cost and shares stay")
    void priceIsNotMoney() {
        String account = held("brokerage", "Redwood Not Money", samId, "2026-09-01", "15000.00",
                holding("HOME", "50", "100.00", "2026-09-01", "4000.00"));
        record(account, "nm-1", "HOME", "130.00", "2026-09-30");
        assertNoMoneyRecords(account);
        webTestClient.get().uri("/api/v1/accounts/{id}/holdings", account).exchange().expectBody()
                .jsonPath("$.securities[0].shares").isEqualTo("50").jsonPath("$.securities[0].cost")
                .isEqualTo("4000.00").jsonPath("$.securities[0].gain").isEqualTo("2500.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", account).exchange().expectBody()
                .jsonPath("$.holdings[0].price").isEqualTo("100.00").jsonPath("$.cash").isEqualTo("15000.00");
    }
}
