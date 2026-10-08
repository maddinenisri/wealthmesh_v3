package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import reactor.core.publisher.Mono;

/**
 * Helpers for the investment setup tests (slice 17): an account of one of the five investment types owned by Sam,
 * with an institution and opening components (cash, holding lines, an optional typed total).
 */
abstract class InvestmentTestBase extends DebtTestBase {

    /** One holding line: 50 shares of HOME at $100.00 priced on the given date. */
    protected static String holding(String symbol, String quantity, String price, String valueOn) {
        String priced = valueOn == null ? "" : ", \"valueOn\": \"" + valueOn + "\"";
        return "{\"symbol\": \"%s\", \"quantity\": \"%s\", \"price\": \"%s\"%s}".formatted(symbol, quantity, price,
                priced);
    }

    /** An `opening` object; any of `total` and `cash` may be null (left out), and `holdings` may be empty. */
    protected static String opening(String total, String cash, String... holdings) {
        StringBuilder out = new StringBuilder("{");
        String sep = "";
        if (total != null) {
            out.append("\"total\": \"").append(total).append('"');
            sep = ", ";
        }
        if (cash != null) {
            out.append(sep).append("\"cash\": \"").append(cash).append('"');
            sep = ", ";
        }
        out.append(sep).append("\"holdings\": [").append(String.join(", ", holdings)).append("]}");
        return out.toString();
    }

    /** The create (and preview) body for an investment account of `type`, owned by Sam, set up on `openedOn`. */
    protected String investmentBody(String type, String name, String openedOn, String opening) {
        String components = opening == null ? "" : ", \"opening\": " + opening;
        return """
                {"type": "%s", "name": "%s", "institution": "Harbor Benefits", "ownerMemberIds": ["%s"],
                 "openedOn": "%s", "enteredByMemberId": "%s"%s}""".formatted(type, name, samId, openedOn, mayaId,
                components);
    }

    protected WebTestClient.ResponseSpec createInvestment(String type, String name, String openedOn,
            String opening) {
        return webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(investmentBody(type, name, openedOn, opening)).exchange();
    }

    protected WebTestClient.ResponseSpec previewInvestment(String type, String name, String openedOn,
            String opening) {
        return webTestClient.post().uri("/api/v1/accounts/opening-preview").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(investmentBody(type, name, openedOn, opening)).exchange();
    }

    /** Saves an investment account (expects 201) and returns its id. */
    protected String investment(String type, String name, String openedOn, String opening) {
        AtomicReference<String> id = new AtomicReference<>();
        createInvestment(type, name, openedOn, opening).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec finishSetup(String account, String opening) {
        return webTestClient.put().uri("/api/v1/accounts/{id}/opening", account)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\", \"opening\": %s}".formatted(samId, opening))
                .exchange();
    }

    protected WebTestClient.ResponseSpec discard(String account) {
        return act(account, "discard");
    }

    /** Rows that record money for the account: entries, reminders, statements, values, start changes. */
    protected void assertNoMoneyRecords(String account) {
        for (String table : new String[] { "activity", "reminder", "statement", "account_value", "opening_revision" }) {
            Long count = Mono.from(connectionFactory.create()).flatMap(connection -> Mono
                    .from(connection.createStatement("SELECT COUNT(*) FROM wealthmesh." + table
                            + " WHERE account_id = $1").bind(0, java.util.UUID.fromString(account)).execute())
                    .flatMap(result -> Mono.from(result.map((row, meta) -> row.get(0, Long.class))))
                    .doFinally(signal -> Mono.from(connection.close()).subscribe())).block();
            org.assertj.core.api.Assertions.assertThat(count).as(table).isZero();
        }
    }

    protected void assertWealthAssets(String assets) {
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo(assets);
    }

    protected void assertAccountNamed(String name, boolean present) {
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$[?(@.name == '" + name + "')].length()").value(java.util.List.class,
                        found -> org.assertj.core.api.Assertions.assertThat(!found.isEmpty()).isEqualTo(present));
    }
}
