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
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Slice 17b: the four retirement and health types are thin additions over the brokerage (17a). Each scenario runs once
 * over the four wires, with that type's own name, institution, owner and figures from its feature file: empty setup
 * (002), the incomplete draft and its Cancel (003), the six invalid components (005) and the mismatch review (006).
 * The brokerage itself is covered by the 17a classes.
 */
class InvestmentTypesApiTests extends InvestmentTestBase {

    /** One type as its feature file words it; `owner` is "sam" or "maya". */
    private record Kind(String wire, String name, String institution, String owner, String total, String shares) {
        @Override
        public String toString() {
            return wire;
        }
    }

    private static final Kind K401 = new Kind("401k", "Harbor 401k", "Harbor Benefits", "sam", "80000.00", "200");
    private static final Kind HSA = new Kind("hsa", "Meadow HSA", "Meadow Health Savings", "maya", "3050.00", "20");
    private static final Kind ROTH = new Kind("roth_ira", "Willow Roth IRA", "Willow Investments", "maya", "6000.00",
            "50");
    private static final Kind TRAD = new Kind("traditional_ira", "Willow Traditional IRA", "Willow Investments",
            "maya", "30000.00", "100");

    private static Stream<Kind> kinds() {
        return Stream.of(K401, HSA, ROTH, TRAD);
    }

    private static Stream<Arguments> invalidRows() {
        return kinds().flatMap(kind -> Stream.of(
                Arguments.of(kind, "cash -$1.00", opening(null, "-1.00"), "Cash must be zero or greater"),
                Arguments.of(kind, "quantity 0",
                        opening(null, "100.00", holding("HOME", "0", "100.00", "2026-09-01")),
                        "Enter more than zero shares"),
                Arguments.of(kind, "quantity -2",
                        opening(null, "100.00", holding("HOME", "-2", "100.00", "2026-09-01")),
                        "Enter more than zero shares"),
                Arguments.of(kind, "price -$1.00",
                        opening(null, "100.00", holding("HOME", "1", "-1.00", "2026-09-01")),
                        "Holding market price must be zero or greater"),
                Arguments.of(kind, "value date 2026-10-04",
                        opening(null, "100.00", holding("HOME", "1", "100.00", "2026-10-04")),
                        "Future values are not completed account history"),
                Arguments.of(kind, "value date 2026-08-31",
                        opening(null, "100.00", holding("HOME", "1", "100.00", "2026-08-31")),
                        "Review the earlier tracking start before saving. The Setup date is 2026-09-01.")));
    }

    private String body(Kind kind, String name, String openedOn, String opening) {
        String owner = "sam".equals(kind.owner()) ? samId : mayaId;
        String components = opening == null ? "" : ", \"opening\": " + opening;
        return """
                {"type": "%s", "name": "%s", "institution": "%s", "ownerMemberIds": ["%s"],
                 "openedOn": "%s", "enteredByMemberId": "%s"%s}""".formatted(kind.wire(), name, kind.institution(),
                owner, openedOn, mayaId, components);
    }

    private WebTestClient.ResponseSpec post(String path, Kind kind, String name, String opening) {
        return webTestClient.post().uri(path).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body(kind, name, "2026-09-01", opening)).exchange();
    }

    @Order(0)
    @Test
    @DisplayName("V2_401K_002 set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @ParameterizedTest(name = "V2_401K_002 V2_HSA_002 V2_ROTH_IRA_002 V2_TRAD_IRA_002 {0}: a blank setup saves cash "
            + "$0.00 on the setup date and records nothing else")
    @MethodSource("kinds")
    void emptySetup(Kind kind) {
        AtomicReference<String> id = new AtomicReference<>();
        post("/api/v1/accounts/opening-preview", kind, kind.name(), null).expectStatus().isOk().expectBody()
                .jsonPath("$.state").isEqualTo("complete").jsonPath("$.cash").isEqualTo("0.00")
                .jsonPath("$.calculatedBalance").isEqualTo("0.00").jsonPath("$.holdings.length()").isEqualTo(0);
        post("/api/v1/accounts", kind, kind.name(), null).expectStatus().isCreated().expectBody()
                .jsonPath("$.type").isEqualTo(kind.wire()).jsonPath("$.status").isEqualTo("active")
                .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.institution").isEqualTo(kind.institution()).jsonPath("$.id")
                .value(String.class, id::set);
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id.get()).exchange().expectBody()
                .jsonPath("$.noStartingAmount").isEqualTo(true).jsonPath("$.holdings.length()").isEqualTo(0);
        webTestClient.get().uri("/api/v1/accounts/{id}/events", id.get()).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].action").isEqualTo("set_up");
        assertNoMoneyRecords(id.get());
        assertAccountNamed(kind.name(), true);
    }

    @Order(2)
    @ParameterizedTest(name = "V2_401K_003 V2_HSA_003 V2_ROTH_IRA_003 V2_TRAD_IRA_003 {0}: the review asks for cash, "
            + "the draft adds nothing to wealth, Cancel leaves no account")
    @MethodSource("kinds")
    void incompleteDraft(Kind kind) {
        String name = kind.name() + " Draft";
        String components = opening(kind.total(), null,
                holding("HOME", kind.shares(), "100.00", "2026-09-01"));
        post("/api/v1/accounts/opening-preview", kind, name, components).expectStatus().isOk().expectBody()
                .jsonPath("$.state").isEqualTo("draft").jsonPath("$.missing[0]").isEqualTo("cash")
                .jsonPath("$.cash").doesNotExist().jsonPath("$.calculatedBalance").doesNotExist()
                .jsonPath("$.openingTotal").isEqualTo(kind.total());
        assertAccountNamed(name, false);
        AtomicReference<String> id = new AtomicReference<>();
        post("/api/v1/accounts", kind, name, components).expectStatus().isCreated().expectBody()
                .jsonPath("$.status").isEqualTo("draft").jsonPath("$.id").value(String.class, id::set);
        assertAccountNamed(name, true);
        assertWealthAssets("0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id.get()).exchange().expectBody()
                .jsonPath("$.cash").doesNotExist().jsonPath("$.total").isEqualTo(kind.total());
        webTestClient.get().uri("/api/v1/accounts/{id}/events", id.get()).exchange().expectBody()
                .jsonPath("$[0].action").isEqualTo("drafted");
        discard(id.get()).expectStatus().isOk();
        assertAccountNamed(name, false);
        webTestClient.get().uri("/api/v1/accounts/{id}", id.get()).exchange().expectStatus().isNotFound();
        assertRefused(act(id.get(), "undo-delete"), "cannot be brought back");
    }

    @Order(3)
    @ParameterizedTest(name = "V2_401K_005 V2_HSA_005 V2_ROTH_IRA_005 V2_TRAD_IRA_005 {0} {1} is refused in the "
            + "review and at save, and nothing is added")
    @MethodSource("invalidRows")
    void invalidOpening(Kind kind, String input, String components, String message) {
        int before = accountCount();
        post("/api/v1/accounts/opening-preview", kind, kind.name() + " Invalid", components).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo(message);
        post("/api/v1/accounts", kind, kind.name() + " Invalid", components).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo(message);
        assertThat(accountCount()).isEqualTo(before);
        assertAccountNamed(kind.name() + " Invalid", false);
    }

    @Order(4)
    @ParameterizedTest(name = "V2_401K_006 V2_HSA_006 V2_ROTH_IRA_006 V2_TRAD_IRA_006 {0}: a total that differs "
            + "from cash plus holdings is shown, not saved and not made cash")
    @MethodSource("kinds")
    void mismatch(Kind kind) {
        String components = opening(kind.total(), "100.00", holding("HOME", "1", "100.00", "2026-09-01"));
        int before = accountCount();
        post("/api/v1/accounts/opening-preview", kind, kind.name() + " Mismatch", components).expectStatus().isOk()
                .expectBody().jsonPath("$.state").isEqualTo("mismatch").jsonPath("$.canSave").isEqualTo(false)
                .jsonPath("$.calculatedBalance").isEqualTo("200.00").jsonPath("$.openingTotal")
                .isEqualTo(kind.total()).jsonPath("$.cash").isEqualTo("100.00");
        post("/api/v1/accounts", kind, kind.name() + " Mismatch", components).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("$200.00"));
        assertThat(accountCount()).isEqualTo(before);
        assertAccountNamed(kind.name() + " Mismatch", false);
    }

    private int accountCount() {
        AtomicReference<Integer> count = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()")
                .value(Integer.class, count::set);
        return count.get();
    }
}
