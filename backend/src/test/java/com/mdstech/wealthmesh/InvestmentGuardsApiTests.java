package com.mdstech.wealthmesh;

import java.util.List;
import java.util.function.Function;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Slice 17a, group 2: the state matrix of a draft, and the type gate of an investment account (no activity until
 * slices 20 to 23). Every writer is tried against a draft and an active investment account through the raw API; each
 * cell must be refused with a 4xx and leave no money record and the same Balance. Allowed on a draft: edit details,
 * Finish setup, discard, delete and Undo (InvestmentDraftApiTests, InvestmentDeleteApiTests).
 */
class InvestmentGuardsApiTests extends InvestmentTestBase {

    private static final String TYPE = "brokerage";
    private static String draft;
    private static String active;
    private static String checking;
    private static String loan;
    private static String card;

    @Order(0)
    @Test
    @DisplayName("V2_BROKERAGE_003 set up a household, accounts, a draft and an active brokerage")
    void setUp() {
        household();
        checking = account("Everyday Checking", "1000.00");
        loan = loan("Car Loan", "5000.00", "2026-09-01");
        card = card("Visa", "100.00", "owed", "2026-09-01");
        draft = investment(TYPE, "Draft Brokerage", "2026-09-01", opening("5000.00", null));
        active = investment(TYPE, "Active Brokerage", "2026-09-01", opening(null, "500.00"));
        assertStatus(draft, "draft");
        assertStatus(active, "active");
    }

    private static final String NO_MONEY = "Money in and out cannot be recorded on this type of account yet";
    private static final String NO_MOVE = "Money cannot be moved to or from this type of account yet";
    private static final String NO_CORRECTION = "The Balance of this type of account cannot be corrected yet";
    private static final String NO_START = "An investment account's opening cash and holdings are corrected in a "
            + "later release";
    private static final String NO_VALUE = "Only a property or other asset has dated values";
    private static final String NO_BILL = "A recurring bill is paid from a checking or savings account";

    /** One writer and the sentence its refusal must carry on a draft and on an active investment account. */
    private record Cell(String name, Function<String, WebTestClient.ResponseSpec> writer, String onDraft,
            String onActive) {
        Cell(String name, Function<String, WebTestClient.ResponseSpec> writer, String both) {
            this(name, writer, both, both);
        }
    }

    private List<Cell> writers() {
        return List.of(
                new Cell("expense", id -> post(id, "expenses", "g-e-" + id,
                        entry(mayaId, "Fee", "10.00", "2026-09-07", "Dining")), NO_MONEY),
                new Cell("income", id -> post(id, "income", "g-i-" + id,
                        entry(mayaId, "Pay", "10.00", "2026-09-07", "Salary")), NO_MONEY),
                new Cell("batch", id -> webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", id)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-b-" + id)
                        .bodyValue("""
                                {"enteredByMemberId": "%s", "entries": [{"description": "Rent", "amount": "1.00",
                                 "occurredOn": "2026-09-05", "category": "Rent"}]}""".formatted(mayaId)).exchange(),
                        NO_MONEY),
                new Cell("historical", id -> webTestClient.post()
                        .uri("/api/v1/accounts/{id}/historical-entries", id)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-h-" + id)
                        .bodyValue("""
                                {"kind": "expense", "entry": {"description": "Rent", "amount": "6.00",
                                 "occurredOn": "2026-08-03", "category": "Rent", "enteredByMemberId": "%s"},
                                 "startRevision": {"openingAmount": "100.00", "openedOn": "2026-08-01",
                                 "reason": "Earlier", "enteredByMemberId": "%s"}}""".formatted(mayaId, mayaId))
                        .exchange(), NO_MONEY),
                new Cell("reminder", id -> post(id, "reminders", "g-r-" + id,
                        entry(mayaId, "Bill", "10.00", "2026-10-20", "Utilities")),
                        "Draft Brokerage is a draft. Finish setting it up first.", NO_MONEY),
                new Cell("balance correction", id -> post(id, "balance-corrections", "g-c-" + id, """
                        {"requestedBalance": "1.00", "asOn": "2026-09-10", "reason": "Fee",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)), NO_CORRECTION),
                new Cell("starting-balance correction", id -> post(id, "starting-balance-corrections",
                        "g-s-" + id, """
                        {"openingAmount": "150.00", "openedOn": "2026-09-01", "reason": "Fix",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)), NO_START),
                new Cell("transfer out", id -> postTransfer("g-t1-" + id, id, checking, "5.00", "2026-09-10",
                        mayaId), NO_MOVE),
                new Cell("transfer in", id -> postTransfer("g-t2-" + id, checking, id, "5.00", "2026-09-10",
                        mayaId), NO_MOVE),
                new Cell("card payment", id -> postPayment("g-p-" + id, id, card, "5.00", "2026-09-10", mayaId),
                        NO_MOVE),
                new Cell("loan payment from it", id -> postLoanPayment("g-l1-" + id, id, loan, "5.00", "4.00",
                        "1.00", "2026-09-10", mayaId), NO_MOVE),
                new Cell("loan payment into it", id -> postLoanPayment("g-l2-" + id, checking, id, "5.00", "4.00",
                        "1.00", "2026-09-10", mayaId), NO_MOVE),
                new Cell("recurring bill", id -> createSchedule("g-sc-" + id,
                        schedule("Fee", "10.00", "monthly", "2026-10-20", id, "Utilities")), NO_BILL),
                new Cell("dated value", id -> saveValue(id, "g-v-" + id,
                        valueBody(mayaId, "100.00", "2026-09-10", "Fix", false)), NO_VALUE),
                new Cell("earlier start", id -> extendStart(id, "g-x-" + id, """
                        {"openedOn": "2026-08-01", "reason": "Earlier", "enteredByMemberId": "%s"}"""
                        .formatted(mayaId)), NO_VALUE));
    }

    /** Every writer is refused with its own sentence (a draft may be refused by the type gate first), nothing saved. */
    private void everyWriterRefused(String account, String balance, boolean isDraft) {
        for (Cell cell : writers()) {
            byte[] body = cell.writer().apply(account).returnResult(byte[].class).getResponseBodyContent();
            String text = new String(body == null ? new byte[0] : body);
            org.assertj.core.api.Assertions.assertThat(text)
                    .as("%s on %s: refused with %s".formatted(cell.name(), isDraft ? "a draft" : "an active account",
                            isDraft ? cell.onDraft() : cell.onActive()))
                    .contains("\"status\":4").contains(isDraft ? cell.onDraft() : cell.onActive());
        }
        assertNoMoneyRecords(account);
        assertBalance(account, balance);
    }

    @Order(1)
    @Test
    @DisplayName("V2_BROKERAGE_003 every writer of money, a statement-less record or a start is refused on a draft")
    void draftRefusesEveryWriter() {
        everyWriterRefused(draft, "0.00", true);
    }

    @Order(2)
    @Test
    @DisplayName("V2_BROKERAGE_002 an active investment account takes no activity until purchases and funding exist")
    void activeRefusesEveryWriter() {
        everyWriterRefused(active, "500.00", false);
    }

    @Order(3)
    @Test
    @DisplayName("V2_BROKERAGE_003 archive, close, restore and reopen are refused on a draft, with the same sentence")
    void draftRefusesLifecycle() {
        for (String action : new String[] { "archive", "close", "restore", "reopen" }) {
            assertRefused(act(draft, action), "Finish setting up Draft Brokerage or discard it");
        }
        assertStatus(draft, "draft");
    }

    @Order(4)
    @Test
    @DisplayName("V2_BROKERAGE_003 a statement cannot be attached to a draft; its opening is not complete")
    void draftRefusesStatement() {
        post(draft, "statements", "g-st-d", """
                {"statementOn": "2026-09-01", "balance": "100.00", "enteredByMemberId": "%s"}""".formatted(mayaId))
                .expectStatus().is4xxClientError();
        assertNoMoneyRecords(draft);
    }

    @Order(6)
    @Test
    @DisplayName("V2_BROKERAGE_002 closing a brokerage with a Balance does not point to a move that is not there")
    void closeWording() {
        assertRefused(act(active, "close"), "needs a zero Balance");
        webTestClient.post().uri("/api/v1/accounts/{id}/close", active).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectBody()
                .jsonPath("$.message").value(text -> org.assertj.core.api.Assertions
                        .assertThat(String.valueOf(text)).doesNotContain("move it or pay it"));
    }

    @Order(7)
    @Test
    @DisplayName("V2_BROKERAGE_003 the Finish setup review does not refuse a draft because its owner was deactivated")
    void finishReviewKeepsInactiveOwner() {
        String owned = investment(TYPE, "Sam's Draft", "2026-09-01", opening("100.00", null));
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        webTestClient.post().uri("/api/v1/accounts/opening-preview?accountId=" + owned)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(investmentBody(TYPE, "Sam's Draft", "2026-09-01", opening("100.00", "100.00")))
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.state").isEqualTo("complete");
        webTestClient.post().uri("/api/v1/accounts/opening-preview").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(investmentBody(TYPE, "Sam's Draft", "2026-09-01", opening("100.00", "100.00")))
                .exchange().expectStatus().isBadRequest();
    }

    @Order(5)
    @Test
    @DisplayName("V2_BROKERAGE_003 edit details is allowed on a draft and changes only name, institution, owners")
    void draftEditDetails() {
        webTestClient.put().uri("/api/v1/accounts/{id}", draft).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Draft Renamed", "institution": "Other Benefits", "ownerMemberIds": ["%s"]}"""
                        .formatted(mayaId)).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.name").isEqualTo("Draft Renamed").jsonPath("$.status").isEqualTo("draft");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", draft).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("5000.00");
    }
}
