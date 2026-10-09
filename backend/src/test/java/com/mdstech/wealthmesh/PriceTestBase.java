package com.mdstech.wealthmesh;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Helpers for the price tests (slice 19b): an investment account of any type owned by Maya or Sam, a price review and
 * a keyed price save, and reads of the one Balance through every route a person reaches it by.
 */
abstract class PriceTestBase extends InvestmentTestBase {

    /** A completed account of `type` owned by `owner` (a member id), opened on `openedOn`, cash plus these lines. */
    protected String held(String type, String name, String owner, String openedOn, String cash, String... holdings) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"type": "%s", "name": "%s", "institution": "Harbor Benefits", "ownerMemberIds": ["%s"],
                 "openedOn": "%s", "enteredByMemberId": "%s", "opening": %s}""".formatted(type, name, owner, openedOn,
                mayaId, opening(null, cash, holdings))).exchange().expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    /** The usual: Redwood Brokerage, cash $15,000.00 and 50 HOME at $100.00 on 2026-09-01, Balance $20,000.00. */
    protected String redwood(String name, String owner) {
        return held("brokerage", name, owner, "2026-09-01", "15000.00", holding("HOME", "50", "100.00", "2026-09-01"));
    }

    protected String priceBody(String symbol, String price, String on, String member) {
        String date = on == null ? "" : ", \"valueOn\": \"" + on + "\"";
        String who = member == null ? "" : ", \"enteredByMemberId\": \"" + member + "\"";
        String amount = price == null ? "" : ", \"price\": \"" + price + "\"";
        return "{\"symbol\": \"" + symbol + "\"" + amount + date + who + "}";
    }

    protected WebTestClient.ResponseSpec reviewPrice(String account, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/prices/review", account)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec savePrice(String account, String key, String body) {
        WebTestClient.RequestBodySpec request = webTestClient.post().uri("/api/v1/accounts/{id}/prices", account)
                .contentType(MediaType.APPLICATION_JSON);
        return (key == null ? request : request.header("Idempotency-Key", key)).bodyValue(body).exchange();
    }

    /** Records HOME (or `symbol`) at `price` on `on`, entered by Maya: expects 201 and returns the saved price id. */
    protected String record(String account, String key, String symbol, String price, String on) {
        AtomicReference<String> id = new AtomicReference<>();
        savePrice(account, key, priceBody(symbol, price, on, mayaId)).expectStatus().isCreated().expectBody()
                .jsonPath("$.price.id").value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec prices(String account) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/prices", account).exchange();
    }

    protected int priceRows(String account) {
        AtomicReference<Integer> rows = new AtomicReference<>();
        prices(account).expectStatus().isOk().expectBody().jsonPath("$.prices.length()").value(Integer.class,
                rows::set);
        return rows.get();
    }

    protected WebTestClient.ResponseSpec balanceAsOf(String account, String on) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf={on}", account, on).exchange();
    }

    protected void assertBalanceAsOf(String account, String on, String amount) {
        balanceAsOf(account, on).expectStatus().isOk().expectBody().jsonPath("$.amount").isEqualTo(amount);
    }

    protected WebTestClient.ResponseSpec wealth(String query) {
        return webTestClient.get().uri("/api/v1/wealth" + query).exchange();
    }

    /** The Balance the wealth lines give one account (any group view), as of a date; the line is found by id. */
    protected void assertWealthLine(String account, String asOf, String balance) {
        wealth(asOf == null ? "" : "?asOf=" + asOf).expectStatus().isOk().expectBody()
                .jsonPath("$.investments.accounts[?(@.accountId == '" + account + "')].balance")
                .value(List.class, found -> assertThat(found).containsExactly(balance));
    }

    protected void assertRefusedWith(WebTestClient.ResponseSpec spec, int status, String message) {
        spec.expectStatus().isEqualTo(status).expectBody().jsonPath("$.message").value(
                text -> assertThat(String.valueOf(text)).contains(message));
    }
}
