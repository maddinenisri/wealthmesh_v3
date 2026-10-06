package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Correcting a split is a replacement: the new split counts, the original and its reason stay (V2_SPLITS_002). */
class SplitCorrectApiTests extends SplitTestBase {

    private static String account;
    private static String savings;
    private static String payment;
    private static String corrected;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00, savings and a $120.00 split of 90.00 Groceries and 30.00 Gifts")
    void setUp() {
        household();
        createCategory("Gifts", "spending");
        account = account("Correct Checking", "5000.00");
        savings = savings("Correct Savings", "1000.00", "2026-09-01");
        payment = saveSplit(account, "c1", split(mayaId, "Mixed shop", "120.00", "2026-09-10",
                p("Groceries", "essential", "90.00"), p("Gifts", "discretionary", "30.00")));
        assertBalance(account, "4880.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_SPLITS_002 changing to $80.00 Groceries and $40.00 Gifts keeps the payment and the Balance")
    void correctThePortions() {
        String body = replacement(samId, "Mixed shop", "120.00", "2026-09-10", "Gift receipt was ten dollars higher",
                p("Groceries", "essential", "80.00"), p("Gifts", "discretionary", "40.00"));
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        replace(account, payment, "fix-1", body).expectStatus().isCreated().expectBody()
                .jsonPath("$.amount").isEqualTo("120.00")
                .jsonPath("$.reason").isEqualTo("Gift receipt was ten dollars higher")
                .jsonPath("$.portions[0].amount").isEqualTo("80.00")
                .jsonPath("$.portions[1].amount").isEqualTo("40.00")
                .jsonPath("$.id").value(String.class, id::set);
        corrected = id.get();
        assertBalance(account, "4880.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("120.00")
                .jsonPath("$.categories[?(@.name=='Groceries')].total").isEqualTo("80.00")
                .jsonPath("$.categories[?(@.name=='Gifts')].total").isEqualTo("40.00");
        assertActivityCount(account, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_SPLITS_002 the original split and the reason remain in history")
    void historyKeepsTheOriginal() {
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange().expectBody()
                .jsonPath("$[?(@.id=='" + payment + "')].status").isEqualTo("replaced")
                .jsonPath("$[?(@.id=='" + payment + "')].portions[0].amount").isEqualTo("90.00")
                .jsonPath("$[?(@.id=='" + payment + "')].portions[1].amount").isEqualTo("30.00")
                .jsonPath("$[?(@.id=='" + corrected + "')].status").isEqualTo("effective")
                .jsonPath("$[?(@.id=='" + corrected + "')].reason").isEqualTo("Gift receipt was ten dollars higher")
                .jsonPath("$[?(@.id=='" + corrected + "')].portions[0].amount").isEqualTo("80.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_SPLITS_002 the same key replays the correction; other portions with it are a 409")
    void replayAndConflict() {
        String same = replacement(samId, "Mixed shop", "120.00", "2026-09-10", "Gift receipt was ten dollars higher",
                p("Groceries", "essential", "80.00"), p("Gifts", "discretionary", "40.00"));
        replace(account, payment, "fix-1", same).expectStatus().isOk().expectBody()
                .jsonPath("$.id").isEqualTo(corrected);
        String other = replacement(samId, "Mixed shop", "120.00", "2026-09-10", "x",
                p("Groceries", "essential", "70.00"), p("Gifts", "discretionary", "50.00"));
        replace(account, payment, "fix-1", other).expectStatus().isEqualTo(409);
        assertActivityCount(account, 1);
    }

    @Order(4)
    @Test
    @DisplayName("V2_SPLITS_002 a correction with portions that do not add up is refused and changes nothing")
    void unbalancedCorrection() {
        String body = replacement(samId, "Mixed shop", "120.00", "2026-09-10", "x",
                p("Groceries", "essential", "80.00"), p("Gifts", "discretionary", "30.00"));
        replace(account, corrected, "fix-2", body).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").value(m -> assertThat((String) m).contains("$10.00 is still to assign"));
        assertBalance(account, "4880.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[0].id").isEqualTo(corrected).jsonPath("$[0].portions[0].amount").isEqualTo("80.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_SPLITS_002 a correction that names no portions keeps the split, so re-dating carries it")
    void omittedPortionsAreCarried() {
        String body = """
                {"description": "Mixed shop", "amount": "120.00", "occurredOn": "2026-09-11",
                 "enteredByMemberId": "%s", "reason": "Wrong day"}""".formatted(mayaId);
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        replace(account, corrected, "fix-3", body).expectStatus().isCreated().expectBody()
                .jsonPath("$.occurredOn").isEqualTo("2026-09-11")
                .jsonPath("$.portions.length()").isEqualTo(2)
                .jsonPath("$.portions[0].amount").isEqualTo("80.00")
                .jsonPath("$.portions[1].amount").isEqualTo("40.00")
                .jsonPath("$.id").value(String.class, id::set);
        corrected = id.get();
        assertBalance(account, "4880.00");
        String wrongAmount = """
                {"description": "Mixed shop", "amount": "130.00", "occurredOn": "2026-09-11",
                 "enteredByMemberId": "%s"}""".formatted(mayaId);
        replace(account, corrected, "fix-4", wrongAmount).expectStatus().isBadRequest();
        assertBalance(account, "4880.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_SPLITS_005 moving a split to another account carries its portions and moves the Balance once")
    void moveCarriesPortions() {
        String body = """
                {"accountId": "%s", "description": "Mixed shop", "amount": "120.00", "occurredOn": "2026-09-11",
                 "enteredByMemberId": "%s", "reason": "Wrong account"}""".formatted(savings, mayaId);
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        replace(account, corrected, "fix-5", body).expectStatus().isCreated().expectBody()
                .jsonPath("$.accountId").isEqualTo(savings)
                .jsonPath("$.portions.length()").isEqualTo(2)
                .jsonPath("$.portions[1].amount").isEqualTo("40.00")
                .jsonPath("$.id").value(String.class, id::set);
        corrected = id.get();
        assertBalance(account, "5000.00");
        assertBalance(savings, "880.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("120.00")
                .jsonPath("$.categories[?(@.name=='Gifts')].total").isEqualTo("40.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_SPLITS_002 an archived portion category may be kept by a correction, but not newly chosen")
    void archivedCategoryKeptNotChosen() {
        String gifts = categoryId("spending", "Gifts");
        webTestClient.post().uri("/api/v1/categories/{id}/archive", gifts).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        String redate = """
                {"description": "Mixed shop", "amount": "120.00", "occurredOn": "2026-09-12",
                 "enteredByMemberId": "%s"}""".formatted(mayaId);
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        replace(savings, corrected, "fix-6", redate).expectStatus().isCreated().expectBody()
                .jsonPath("$.portions[1].categoryName").isEqualTo("Gifts")
                .jsonPath("$.portions[1].categoryArchived").isEqualTo(true)
                .jsonPath("$.id").value(String.class, id::set);
        corrected = id.get();
        String viaId = """
                {"description": "x", "amount": "120.00", "occurredOn": "2026-09-12", "enteredByMemberId": "%s",
                 "portions": [{"category": "Groceries", "amount": "60.00"}, {"categoryId": "%s", "amount": "60.00"}]}
                """.formatted(mayaId, gifts);
        replace(savings, corrected, "fix-7", viaId).expectStatus().isCreated();
    }

    @Order(8)
    @Test
    @DisplayName("V2_SPLITS_002 an empty portions list turns the split into one uncategorized expense")
    void emptyListRemovesTheSplit() {
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", savings).exchange().expectBody()
                .jsonPath("$[0].portions.length()").isEqualTo(2);
        String latest = latestId(savings);
        String body = """
                {"description": "Mixed shop", "amount": "120.00", "occurredOn": "2026-09-12",
                 "enteredByMemberId": "%s", "portions": []}""".formatted(mayaId);
        replace(savings, latest, "fix-8", body).expectStatus().isCreated().expectBody()
                .jsonPath("$.portions.length()").isEqualTo(0).jsonPath("$.categoryId").isEmpty();
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&uncategorized=true").exchange()
                .expectBody().jsonPath("$.length()").isEqualTo(1);
    }

    @Order(9)
    @Test
    @DisplayName("V2_SPLITS_002 a split that was really a transfer is replaced by one; its split stays in history")
    void splitChangedToTransfer() {
        String split = saveSplit(account, "conv-1", split(mayaId, "Was a transfer", "50.00", "2026-09-14",
                p("Groceries", null, "30.00"), p("Dining", null, "20.00")));
        assertBalance(account, "4950.00");
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/transfer", account, split)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "conv-key")
                .bodyValue("{\"toAccountId\": \"%s\", \"enteredByMemberId\": \"%s\", \"reason\": \"Moved money\"}"
                        .formatted(savings, mayaId)).exchange().expectStatus().isCreated();
        assertBalance(account, "4950.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00").jsonPath("$.categories.length()").isEqualTo(0);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange().expectBody()
                .jsonPath("$[?(@.id=='" + split + "')].status").isEqualTo("replaced")
                .jsonPath("$[?(@.id=='" + split + "')].portions.length()").isEqualTo(2);
    }

    private String latestId(String accountId) {
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", accountId).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, id::set);
        return id.get();
    }
}
