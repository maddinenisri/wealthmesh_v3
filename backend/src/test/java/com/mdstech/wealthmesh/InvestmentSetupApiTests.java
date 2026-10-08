package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.MediaType;

/**
 * Slice 17a, group 1: an investment account is set up from opening components (cash plus holding lines); the typed
 * total is only a check. Empty setup (002), the six invalid components (005) and the mismatch review (006), each
 * refused in the review and at save, and a complete opening that saves.
 */
class InvestmentSetupApiTests extends InvestmentTestBase {

    private static final String TYPE = "brokerage";

    private static Stream<Arguments> invalidComponents() {
        return Stream.of(
                Arguments.of("cash -$1.00", opening(null, "-1.00"), "Cash must be zero or greater"),
                Arguments.of("quantity 0", opening(null, "100.00", holding("HOME", "0", "100.00", "2026-09-01")),
                        "Enter more than zero shares"),
                Arguments.of("quantity -2", opening(null, "100.00", holding("HOME", "-2", "100.00", "2026-09-01")),
                        "Enter more than zero shares"),
                Arguments.of("price -$1.00", opening(null, "100.00", holding("HOME", "1", "-1.00", "2026-09-01")),
                        "Holding market price must be zero or greater"),
                Arguments.of("value date 2026-10-04", opening(null, "100.00",
                        holding("HOME", "1", "100.00", "2026-10-04")),
                        "Future values are not completed account history"),
                Arguments.of("value date 2026-08-31", opening(null, "100.00",
                        holding("HOME", "1", "100.00", "2026-08-31")),
                        "Review the earlier tracking start before saving"));
    }

    @Order(0)
    @Test
    @DisplayName("V2_BROKERAGE_002 set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_BROKERAGE_002 a blank starting amount saves cash $0.00 on the setup date and nothing else")
    void emptySetup() {
        AtomicReference<String> id = new AtomicReference<>();
        previewInvestment(TYPE, "Redwood Brokerage", "2026-09-01", null).expectStatus().isOk().expectBody()
                .jsonPath("$.state").isEqualTo("complete").jsonPath("$.canSave").isEqualTo(true)
                .jsonPath("$.cash").isEqualTo("0.00").jsonPath("$.calculatedBalance").isEqualTo("0.00")
                .jsonPath("$.holdings.length()").isEqualTo(0);
        createInvestment(TYPE, "Redwood Brokerage", "2026-09-01", null).expectStatus().isCreated().expectBody()
                .jsonPath("$.status").isEqualTo("active").jsonPath("$.type").isEqualTo(TYPE)
                .jsonPath("$.id").value(String.class, id::set);
        webTestClient.get().uri("/api/v1/accounts/{id}", id.get()).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.openingAmount").isEqualTo("0.00").jsonPath("$.institution")
                .isEqualTo("Harbor Benefits");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id.get()).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.noStartingAmount").isEqualTo(true).jsonPath("$.cash").isEqualTo("0.00")
                .jsonPath("$.holdings.length()").isEqualTo(0);
        assertNoMoneyRecords(id.get());
        assertWealthAssets("0.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_BROKERAGE_002 an empty opening object is the same as no opening: cash $0.00, no holdings")
    void emptyOpeningObject() {
        String id = investment(TYPE, "Empty Object", "2026-09-01", opening(null, null));
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id).exchange().expectBody()
                .jsonPath("$.noStartingAmount").isEqualTo(true);
        assertBalance(id, "0.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 a complete opening saves cash plus holdings as one Balance")
    void completeOpening() {
        String components = opening("20000.00", "15000.00", holding("HOME", "50", "100.00", "2026-09-01"));
        previewInvestment(TYPE, "Redwood Complete", "2026-09-01", components).expectStatus().isOk().expectBody()
                .jsonPath("$.state").isEqualTo("complete").jsonPath("$.cash").isEqualTo("15000.00")
                .jsonPath("$.holdingsValue").isEqualTo("5000.00").jsonPath("$.calculatedBalance")
                .isEqualTo("20000.00").jsonPath("$.difference").isEqualTo("0.00")
                .jsonPath("$.holdings[0].value").isEqualTo("5000.00");
        String id = investment(TYPE, "Redwood Complete", "2026-09-01", components);
        assertBalance(id, "20000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id).exchange().expectBody()
                .jsonPath("$.noStartingAmount").isEqualTo(false).jsonPath("$.total").isEqualTo("20000.00")
                .jsonPath("$.cash").isEqualTo("15000.00").jsonPath("$.holdings[0].symbol").isEqualTo("HOME")
                .jsonPath("$.holdings[0].quantity").isEqualTo("50").jsonPath("$.holdings[0].price")
                .isEqualTo("100.00").jsonPath("$.holdings[0].valueOn").isEqualTo("2026-09-01");
        assertWealthAssets("20000.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_BROKERAGE_002 a typed total with the cash and no holdings must equal the cash")
    void totalWithoutHoldings() {
        String id = investment(TYPE, "Cash Only", "2026-09-01", opening("500.00", "500.00"));
        assertBalance(id, "500.00");
        createInvestment(TYPE, "Cash Mismatch", "2026-09-01", opening("500.00", "400.00")).expectStatus()
                .isBadRequest();
    }

    @ParameterizedTest(name = "V2_BROKERAGE_005 {0} is refused in the review and at save, and nothing is added")
    @Order(5)
    @MethodSource("invalidComponents")
    void invalidOpening(String input, String components, String message) {
        int before = accountCount();
        previewInvestment(TYPE, "Redwood Invalid", "2026-09-01", components).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo(message);
        createInvestment(TYPE, "Redwood Invalid", "2026-09-01", components).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo(message);
        assertThat(accountCount()).isEqualTo(before);
        assertAccountNamed("Redwood Invalid", false);
    }

    @Order(6)
    @Test
    @DisplayName("V2_BROKERAGE_005 the other malformed components: symbol, quantity text, amounts that are numbers")
    void malformedComponents() {
        String line = holding("HOME", "1", "100.00", "2026-09-01");
        createInvestment(TYPE, "Bad", "2026-09-01", opening(null, "abc")).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter a valid amount");
        createInvestment(TYPE, "Bad", "2026-09-01", opening(null, "10.00", holding("", "1", "100.00", null)))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Enter the holding's name or symbol");
        createInvestment(TYPE, "Bad", "2026-09-01", opening(null, "10.00", holding("HOME", "x", "100.00", null)))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Enter a valid number of shares");
        createInvestment(TYPE, "Bad", "2026-09-01", opening(null, "10.00", holding("HOME", "1", "abc", null)))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Enter a valid amount");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "brokerage", "name": "Bad", "ownerMemberIds": ["%s"], "openedOn": "2026-09-01",
                 "opening": {"cash": 10.00, "holdings": [%s]}}""".formatted(samId, line))
                .exchange().expectStatus().isBadRequest();
        assertAccountNamed("Bad", false);
    }

    @Order(7)
    @Test
    @DisplayName("V2_BROKERAGE_006 a total that differs from cash plus holdings is shown, not saved, and not made cash")
    void mismatchIsReviewedNotSaved() {
        String components = opening("80000.00", "100.00", holding("HOME", "1", "100.00", "2026-09-01"));
        int before = accountCount();
        previewInvestment(TYPE, "Redwood Mismatch", "2026-09-01", components).expectStatus().isOk().expectBody()
                .jsonPath("$.state").isEqualTo("mismatch").jsonPath("$.canSave").isEqualTo(false)
                .jsonPath("$.calculatedBalance").isEqualTo("200.00").jsonPath("$.openingTotal")
                .isEqualTo("80000.00").jsonPath("$.difference").isEqualTo("79800.00")
                .jsonPath("$.cash").isEqualTo("100.00").jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("$200.00").contains("$80,000.00"));
        createInvestment(TYPE, "Redwood Mismatch", "2026-09-01", components).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("$200.00").contains("$80,000.00"));
        assertThat(accountCount()).isEqualTo(before);
        assertWealthAssets("20500.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_BROKERAGE_006 once the components are corrected to match, the same setup saves")
    void correctedMismatchSaves() {
        String components = opening("200.00", "100.00", holding("HOME", "1", "100.00", "2026-09-01"));
        previewInvestment(TYPE, "Redwood Corrected", "2026-09-01", components).expectBody().jsonPath("$.state")
                .isEqualTo("complete");
        assertBalance(investment(TYPE, "Redwood Corrected", "2026-09-01", components), "200.00");
    }

    @Order(9)
    @Test
    @DisplayName("V2_BROKERAGE_002 the setup date cannot be in the future and the type must be a known one")
    void setupDate() {
        createInvestment(TYPE, "Future", "2026-10-04", null).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("The opening date cannot be in the future");
        createInvestment("stocks", "Odd", "2026-09-01", null).expectStatus().isBadRequest();
    }

    @Order(10)
    @Test
    @DisplayName("V2_BROKERAGE_005 a value too large to store is refused in the review and at save, not a 500")
    void hugeValue() {
        String components = opening(null, "1.00", holding("HOME", "1000000", "1000000000000", "2026-09-01"));
        previewInvestment(TYPE, "Huge", "2026-09-01", components).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("That amount is too large to record");
        createInvestment(TYPE, "Huge", "2026-09-01", components).expectStatus().isBadRequest();
        createInvestment(TYPE, "Huge", "2026-09-01", opening("99999999999999999.00", "99999999999999999.00"))
                .expectStatus().isBadRequest();
        assertAccountNamed("Huge", false);
    }

    @Order(11)
    @Test
    @DisplayName("V2_BROKERAGE_002 an institution over 120 characters is refused in the word of the form")
    void longInstitution() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "brokerage", "name": "Long", "institution": "%s", "ownerMemberIds": ["%s"],
                 "openedOn": "2026-09-01"}""".formatted("I".repeat(121), samId))
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Institution must be 120 characters or fewer");
    }

    @Order(12)
    @Test
    @DisplayName("V2_BROKERAGE_002 a fund name of 100 characters is accepted, and 121 refused")
    void longHoldingName() {
        String fund = "F".repeat(100);
        assertBalance(investment(TYPE, "Funds", "2026-09-01", opening(null, "1.00",
                holding(fund, "1", "1.00", "2026-09-01"))), "2.00");
        createInvestment(TYPE, "Funds2", "2026-09-01", opening(null, "1.00",
                holding("F".repeat(121), "1", "1.00", "2026-09-01"))).expectStatus().isBadRequest();
    }

    @Order(13)
    @Test
    @DisplayName("V2_BROKERAGE_002 wealth lists investments as one group whose total equals the lines")
    void investmentsGroup() {
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.investments.total").isEqualTo("20702.00")
                .jsonPath("$.investments.accounts.length()").isEqualTo(6)
                .jsonPath("$.bankMoney.accounts.length()").isEqualTo(0)
                .jsonPath("$.financialAssets").isEqualTo("20702.00");
    }

    @Order(14)
    @Test
    @DisplayName("V2_BROKERAGE_002 a create without who is setting up is refused; with it, history says who and when")
    void setupRecordsWhoAndWhen() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "brokerage", "name": "No Member", "institution": "Harbor Benefits",
                 "ownerMemberIds": ["%s"], "openedOn": "2026-09-01"}""".formatted(samId))
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Choose who entered this");
        assertAccountNamed("No Member", false);
        String id = investment(TYPE, "Who And When", "2026-09-01", opening(null, "50.00"));
        webTestClient.get().uri("/api/v1/accounts/{id}/events", id).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].action").isEqualTo("set_up")
                .jsonPath("$[0].memberId").isEqualTo(mayaId).jsonPath("$[0].at").isNotEmpty();
        String draftId = investment(TYPE, "Who Drafted", "2026-09-01", opening("100.00", null));
        webTestClient.get().uri("/api/v1/accounts/{id}/events", draftId).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].action").isEqualTo("drafted")
                .jsonPath("$[0].memberId").isEqualTo(mayaId);
    }

    @Order(15)
    @Test
    @DisplayName("V2_BROKERAGE_002 the person setting up must be an active member of this household, and only an "
            + "investment account takes the field")
    void setupMemberRules() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "brokerage", "name": "Stranger", "institution": "Harbor Benefits",
                 "ownerMemberIds": ["%s"], "openedOn": "2026-09-01",
                 "enteredByMemberId": "00000000-0000-0000-0000-000000000001"}""".formatted(samId))
                .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Choose who entered this from this household");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "checking", "name": "Plain", "institution": "Bank", "ownerMemberIds": ["%s"],
                 "openedOn": "2026-09-01", "openingBalance": "10.00", "enteredByMemberId": "%s"}"""
                .formatted(samId, mayaId)).exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Who set it up applies to an investment account only");
        assertAccountNamed("Plain", false);
    }

    private int accountCount() {
        AtomicReference<Integer> count = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()")
                .value(Integer.class, count::set);
        return count.get();
    }
}
