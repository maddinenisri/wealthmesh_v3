package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Linked transfers between checking and savings (slice 07, groups A to C): create, review, change, remove and Undo as
 * a pair, and the rules the server enforces on its own (a UI that hides an option is not the guard).
 */
class TransferApiTests extends TransferTestBase {

    private static String checking;
    private static String emergency;
    private static String holiday;
    private static String current;

    @Order(0)
    @Test
    @DisplayName("set up checking 5000.00, Emergency Savings 10000.00 and Holiday Savings 500.00 on 2026-09-01")
    void setUp() {
        household();
        checking = account("Everyday Checking", "5000.00");
        emergency = savings("Emergency Savings", "10000.00", "2026-09-01");
        holiday = savings("Holiday Savings", "500.00", "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CHECKING_010 the review names both accounts and the Balances after; cancelling saves nothing")
    void reviewThenCancel() {
        previewTransfer("fromAccountId=%s&toAccountId=%s&amount=2000.00&occurredOn=2026-09-04"
                .formatted(checking, emergency)).expectStatus().isOk().expectBody()
                .jsonPath("$.accounts.length()").isEqualTo(2)
                .jsonPath("$.accounts[0].name").isEqualTo("Everyday Checking")
                .jsonPath("$.accounts[0].balanceAfter").isEqualTo("3000.00")
                .jsonPath("$.accounts[1].name").isEqualTo("Emergency Savings")
                .jsonPath("$.accounts[1].balanceAfter").isEqualTo("12000.00")
                .jsonPath("$.spending").doesNotExist();
        // Cancel is the absence of a save: both Balances stay and neither account has new activity.
        assertBalance(checking, "5000.00");
        assertBalance(emergency, "10000.00");
        assertActivityCount(checking, 0);
        assertActivityCount(emergency, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_SAVINGS_010 a same-account transfer is refused with 'Choose a different account'; "
            + "nothing is saved")
    void sameAccountIsRefused() {
        postTransfer("k-same", emergency, emergency, "500.00", "2026-09-20", mayaId).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose a different account");
        previewTransfer("fromAccountId=%s&toAccountId=%s&amount=500.00&occurredOn=2026-09-20"
                .formatted(emergency, emergency)).expectStatus().isBadRequest();
        assertBalance(emergency, "10000.00");
        assertBalance(checking, "5000.00");
        assertActivityCount(emergency, 0);
        assertActivityCount(checking, 0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_SAVINGS_002 savings starts at zero from a blank or $0.00 Balance, then takes a transfer: "
            + "no income, no spending")
    void startAtZeroThenTransfer() {
        for (String balance : new String[] { "", ", \"openingBalance\": \"0.00\"" }) {
            AtomicReference<String> id = new AtomicReference<>();
            webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("""
                            {"type": "savings", "name": "Zero %s", "ownerMemberIds": ["%s"],
                             "openedOn": "2026-09-01"%s}""".formatted(balance.isEmpty() ? "blank" : "zero", mayaId,
                            balance))
                    .exchange().expectStatus().isCreated().expectBody()
                    .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                    .jsonPath("$.id").value(String.class, id::set);
            String movement = transfer("k-zero-" + balance.length(), checking, id.get(), "2000.00", "2026-09-04");
            assertBalance(id.get(), "2000.00");
            assertBalance(checking, "3000.00");
            noIncomeOrSpending("2026-09");
            // Put it back for the next scenario.
            removeTransfer(movement, mayaId).expectStatus().isOk();
            assertBalance(checking, "5000.00");
        }
    }

    @Order(4)
    @Test
    @DisplayName("V2_TRANSFER_003 changing the destination to the source is refused and a cancelled review changes "
            + "nothing")
    void rejectOrCancelCorrection() {
        String movement = transfer("k-t3", checking, emergency, "2000.00", "2026-09-04");
        current = movement;
        assertBalance(checking, "3000.00");
        assertBalance(emergency, "12000.00");
        replaceTransfer(movement, "k-t3-same", checking, checking, "2000.00", "2026-09-04", null).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose a different account");
        assertBalance(checking, "3000.00");
        assertBalance(emergency, "12000.00");
        // A review of 1500.00 to savings is only a preview; cancelling is not sending the save.
        previewTransfer("fromAccountId=%s&toAccountId=%s&amount=1500.00&occurredOn=2026-09-05&movementId=%s"
                .formatted(checking, emergency, movement)).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/transfers/{id}", movement).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo("effective").jsonPath("$.amount").isEqualTo("2000.00");
        assertBalance(checking, "3000.00");
        assertBalance(emergency, "12000.00");
        noIncomeOrSpending("2026-09");
    }

    @Order(5)
    @Test
    @DisplayName("V2_TRANSFER_001 amount, date and destination change together: preview of three Balances, history "
            + "keeps the original")
    void changeAsAPair() {
        String movement = current;
        previewTransfer("fromAccountId=%s&toAccountId=%s&amount=1500.00&occurredOn=2026-09-05&movementId=%s"
                .formatted(checking, holiday, movement)).expectStatus().isOk().expectBody()
                .jsonPath("$.accounts.length()").isEqualTo(3)
                .jsonPath("$.accounts[0].name").isEqualTo("Everyday Checking")
                .jsonPath("$.accounts[0].balanceAfter").isEqualTo("3500.00")
                .jsonPath("$.accounts[1].name").isEqualTo("Emergency Savings")
                .jsonPath("$.accounts[1].balanceAfter").isEqualTo("10000.00")
                .jsonPath("$.accounts[2].name").isEqualTo("Holiday Savings")
                .jsonPath("$.accounts[2].balanceAfter").isEqualTo("2000.00");
        replaceTransfer(movement, "k-t1", checking, holiday, "1500.00", "2026-09-05", "Wrong savings account")
                .expectStatus().isCreated().expectBody()
                .jsonPath("$.movementId").value(String.class, id -> current = id)
                .jsonPath("$.from.accountName").isEqualTo("Everyday Checking")
                .jsonPath("$.to.accountName").isEqualTo("Holiday Savings")
                .jsonPath("$.amount").isEqualTo("1500.00").jsonPath("$.occurredOn").isEqualTo("2026-09-05")
                .jsonPath("$.status").isEqualTo("effective");
        assertBalance(checking, "3500.00");
        assertBalance(emergency, "10000.00");
        assertBalance(holiday, "2000.00");
        // One effective transfer is visible from each side it touches.
        assertActivityCount(checking, 1);
        assertActivityCount(emergency, 0);
        assertActivityCount(holiday, 1);
        noIncomeOrSpending("2026-09");
        // History keeps the original details on both accounts it touched.
        // Two removed rows from the V2_SAVINGS_002 scenario, the replaced original and its replacement.
        history(checking).expectStatus().isOk().expectBody()
                .jsonPath("$.length()").isEqualTo(4)
                .jsonPath("$[?(@.status=='effective')].kind").isEqualTo("transfer_out")
                .jsonPath("$[?(@.status=='effective')].reason").isEqualTo("Wrong savings account")
                .jsonPath("$[?(@.status=='effective')].counterAccountName").isEqualTo("Holiday Savings")
                .jsonPath("$[?(@.status=='replaced')].amount").isEqualTo("2000.00")
                .jsonPath("$[?(@.status=='replaced')].occurredOn").isEqualTo("2026-09-04")
                .jsonPath("$[?(@.status=='replaced')].counterAccountName").isEqualTo("Emergency Savings")
                .jsonPath("$[?(@.status=='replaced')].events[0].action").isEqualTo("replaced")
                .jsonPath("$[?(@.status=='replaced')].events[0].byName").isEqualTo("Maya");
        history(emergency).expectBody().jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].kind").isEqualTo("transfer_in").jsonPath("$[0].status").isEqualTo("replaced")
                .jsonPath("$[0].replacedBy.accountName").isEqualTo("Holiday Savings");
    }

    @Order(6)
    @Test
    @DisplayName("V2_TRANSFER_002 removing a transfer returns both Balances, history shows who removed it, Undo "
            + "restores exactly one transfer on its original date")
    void removeAndUndo() {
        String movement = current;
        removeTransfer(movement, mayaId).expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("removed");
        assertBalance(checking, "5000.00");
        assertBalance(holiday, "500.00");
        assertActivityCount(checking, 0);
        history(checking).expectBody().jsonPath("$[0].status").isEqualTo("removed")
                .jsonPath("$[0].events[0].action").isEqualTo("removed").jsonPath("$[0].events[0].byName")
                .isEqualTo("Maya");
        history(holiday).expectBody().jsonPath("$[0].status").isEqualTo("removed")
                .jsonPath("$[0].events[0].byName").isEqualTo("Maya");
        // Removing again is the loser of a race: 409.
        removeTransfer(movement, mayaId).expectStatus().isEqualTo(409);

        undoTransfer(movement, mayaId).expectStatus().isOk().expectBody().jsonPath("$.status")
                .isEqualTo("effective");
        assertBalance(checking, "3500.00");
        assertBalance(holiday, "2000.00");
        assertActivityCount(checking, 1);
        assertActivityCount(holiday, 1);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$[0].occurredOn").isEqualTo("2026-09-05");
        undoTransfer(movement, mayaId).expectStatus().isEqualTo(409);
        noIncomeOrSpending("2026-09");
    }

    @Order(7)
    @Test
    @DisplayName("V2_TRANSFER_001 V2_TRANSFER_002 a replayed save returns the stored transfer; the same key with "
            + "other details is 409; a replaced "
            + "transfer can be neither undone nor changed again")
    void keysAndReplacedPairs() {
        String a = savings("Key A", "100.00", "2026-09-01");
        String b = savings("Key B", "100.00", "2026-09-01");
        String movement = transfer("k-rep", a, b, "10.00", "2026-09-06");
        postTransfer("k-rep", a, b, "10.00", "2026-09-06", mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.movementId").isEqualTo(movement);
        postTransfer("k-rep", a, b, "11.00", "2026-09-06", mayaId).expectStatus().isEqualTo(409);
        assertBalance(a, "90.00");
        assertBalance(b, "110.00");
        assertActivityCount(a, 1);

        replaceTransfer(movement, "k-rep2", a, b, "20.00", "2026-09-06", "More").expectStatus().isCreated();
        replaceTransfer(movement, "k-rep2", a, b, "20.00", "2026-09-06", "More").expectStatus().isOk();
        replaceTransfer(movement, "k-rep3", a, b, "30.00", "2026-09-06", "Again").expectStatus().isEqualTo(409);
        removeTransfer(movement, mayaId).expectStatus().isEqualTo(409);
        undoTransfer(movement, mayaId).expectStatus().isEqualTo(409);
        assertBalance(a, "80.00");
        assertBalance(b, "120.00");
        assertActivityCount(a, 1);
    }

    @Order(8)
    @Test
    @DisplayName("V2_SAVINGS_010 V2_CHECKING_010 the server refuses what the form hides: dates, amounts, members, "
            + "unknown accounts, missing key")
    void guards() {
        String young = savings("Young", "100.00", "2026-09-20");
        postTransfer("k-g-future", checking, emergency, "5.00", "2026-10-04", mayaId).expectStatus().isBadRequest();
        postTransfer("k-g-early", checking, young, "5.00", "2026-09-10", mayaId).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").value(m -> org.assertj.core.api.Assertions.assertThat((String) m)
                        .contains("Young"));
        postTransfer("k-g-zero", checking, emergency, "0.00", "2026-09-10", mayaId).expectStatus().isBadRequest();
        postTransfer("k-g-neg", checking, emergency, "-5.00", "2026-09-10", mayaId).expectStatus().isBadRequest();
        postTransfer("k-g-text", checking, emergency, "ten", "2026-09-10", mayaId).expectStatus().isBadRequest();
        postTransfer("k-g-cents", checking, emergency, "1.005", "2026-09-10", mayaId).expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/transfers").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "k-g-number").bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": 5, "occurredOn": "2026-09-10",
                         "enteredByMemberId": "%s"}""".formatted(checking, emergency, mayaId))
                .exchange().expectStatus().isBadRequest();
        postTransfer("k-g-nobody", checking, emergency, "5.00", "2026-09-10", java.util.UUID.randomUUID().toString())
                .expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/transfers").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "k-g-nomember").bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": "5.00", "occurredOn": "2026-09-10"}"""
                        .formatted(checking, emergency)).exchange().expectStatus().isBadRequest();
        postTransfer("k-g-ghost", checking, java.util.UUID.randomUUID().toString(), "5.00", "2026-09-10", mayaId)
                .expectStatus().isNotFound();
        webTestClient.post().uri("/api/v1/transfers").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body(checking, emergency, "5.00", "2026-09-10", mayaId, null)).exchange().expectStatus()
                .isBadRequest();
        webTestClient.get().uri("/api/v1/transfers/{id}", java.util.UUID.randomUUID()).exchange().expectStatus()
                .isNotFound();
        previewTransfer("fromAccountId=%s&toAccountId=%s&amount=5.00&occurredOn=2026-09-10&movementId=%s"
                .formatted(checking, emergency, java.util.UUID.randomUUID())).expectStatus().isNotFound();
        assertActivityCount(young, 0);
    }

    @Order(9)
    @Test
    @DisplayName("V2_TRANSFER_002 the per-entry endpoints refuse a transfer row, so one side can never change alone")
    void perRowEndpointsRefuseTransferRows() {
        String a = savings("Row A", "100.00", "2026-09-01");
        String b = savings("Row B", "100.00", "2026-09-01");
        String movement = transfer("k-row", a, b, "10.00", "2026-09-07");
        AtomicReference<String> row = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", a).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, row::set);
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", a, row.get())
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k-row-r")
                .bodyValue("""
                        {"description": "x", "amount": "5.00", "occurredOn": "2026-09-07", "category": "Dining",
                         "enteredByMemberId": "%s"}""".formatted(mayaId))
                .exchange().expectStatus().isNotFound();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", a, row.get())
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .exchange().expectStatus().isNotFound();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/undo", a, row.get())
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .exchange().expectStatus().isNotFound();
        webTestClient.get().uri(
                "/api/v1/accounts/{a}/activity/{id}/replacement/preview?amount=5.00&occurredOn=2026-09-07",
                a, row.get()).exchange().expectStatus().isNotFound();
        post(a, "balance-corrections", "k-row-c", """
                {"requestedBalance": "50.00", "asOn": "2026-09-07", "reason": "x", "enteredByMemberId": "%s",
                 "replacesId": "%s"}""".formatted(mayaId, row.get())).expectStatus().is4xxClientError();
        webTestClient.get().uri("/api/v1/transfers/{id}", movement).exchange().expectBody()
                .jsonPath("$.status").isEqualTo("effective");
        assertBalance(a, "90.00");
        assertBalance(b, "110.00");
    }

    @Order(10)
    @Test
    @DisplayName("V2_TRANSFER_002 a starting-date move cannot pass a transfer, and Undo of a removed transfer is "
            + "refused when "
            + "the start moved past it")
    void startMoveAndUndo() {
        String a = savings("Start A", "100.00", "2026-09-01");
        String b = savings("Start B", "100.00", "2026-09-01");
        String movement = transfer("k-start", a, b, "10.00", "2026-09-10");
        post(a, "starting-balance-corrections", "k-start-late", """
                {"openingAmount": "100.00", "openedOn": "2026-09-15", "reason": "x", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().is4xxClientError();
        removeTransfer(movement, mayaId).expectStatus().isOk();
        post(a, "starting-balance-corrections", "k-start-late2", """
                {"openingAmount": "100.00", "openedOn": "2026-09-15", "reason": "x", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().is2xxSuccessful();
        undoTransfer(movement, mayaId).expectStatus().isEqualTo(409);
        assertBalance(b, "100.00");
        assertActivityCount(b, 0);
    }

    @Order(11)
    @Test
    @DisplayName("V2_TRANSFER_001 an inactive member cannot be named on a transfer, change or removal")
    void inactiveMember() {
        String a = savings("Member A", "100.00", "2026-09-01");
        String b = savings("Member B", "100.00", "2026-09-01");
        String movement = transfer("k-member", a, b, "10.00", "2026-09-08");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            postTransfer("k-member2", a, b, "5.00", "2026-09-08", samId).expectStatus().isBadRequest();
            AtomicReference<String> next = new AtomicReference<>();
            replaceTransfer(movement, "k-member3", a, b, "5.00", "2026-09-08", "x").expectStatus().isCreated()
                    .expectBody().jsonPath("$.movementId").value(String.class, next::set);
            removeTransfer(next.get(), samId).expectStatus().isBadRequest();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
        assertActivityCount(a, 1);
    }

    @Order(12)
    @Test
    @DisplayName("V2_CHECKING_007 salary, rent and a transfer: both Balances, the activity, and Income minus spending "
            + "ignore the transfer")
    void salaryRentAndTransfer() {
        String c = accountOpenedOn("Journey Checking", "5000.00", "2026-08-01");
        String s = savings("Journey Savings", "10000.00", "2026-08-01");
        // August is empty of other households' figures: use a month nothing else wrote to.
        post(c, "income", "k-007-salary", entry(mayaId, "Salary", "6000.00", "2026-08-02", "Salary"))
                .expectStatus().isCreated();
        post(c, "expenses", "k-007-rent", entry(mayaId, "Rent", "1500.00", "2026-08-03", "Rent")).expectStatus()
                .isCreated();
        transfer("k-007-move", c, s, "2000.00", "2026-08-04");
        assertBalance(c, "7500.00");
        assertBalance(s, "12000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", c).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.length()").isEqualTo(3)
                .jsonPath("$[?(@.kind=='transfer_out')].occurredOn").isEqualTo("2026-08-04")
                .jsonPath("$[?(@.kind=='transfer_out')].amount").isEqualTo("2000.00")
                .jsonPath("$[?(@.kind=='transfer_out')].counterAccountName").isEqualTo("Journey Savings")
                .jsonPath("$[?(@.categoryName=='Rent')].amount").isEqualTo("1500.00")
                .jsonPath("$[?(@.categoryName=='Salary')].amount").isEqualTo("6000.00");
        webTestClient.get().uri("/api/v1/review?month=2026-08").exchange().expectBody()
                .jsonPath("$.income").isEqualTo("6000.00").jsonPath("$.spending").isEqualTo("1500.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("4500.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-08").exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1);
    }

    @Order(13)
    @Test
    @DisplayName("V2_SAVINGS_006 saving, interest and a transfer back: Balances, names and household Income 25.00")
    void savingInterestAndBack() {
        String s = savings("Interest Savings", "10000.00", "2026-07-01");
        String c = accountOpenedOn("Interest Checking", "5000.00", "2026-07-01");
        transfer("k-006-in", c, s, "2000.00", "2026-07-04");
        post(s, "income", "k-006-interest", entry(samId, "Interest", "25.00", "2026-07-15", "Interest"))
                .expectStatus().isCreated();
        transfer("k-006-back", s, c, "500.00", "2026-07-20");
        assertBalance(s, "11525.00");
        assertBalance(c, "3500.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", s).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(3)
                .jsonPath("$[0].kind").isEqualTo("transfer_out").jsonPath("$[0].counterAccountName")
                .isEqualTo("Interest Checking")
                .jsonPath("$[1].categoryName").isEqualTo("Interest").jsonPath("$[1].amount").isEqualTo("25.00")
                .jsonPath("$[2].kind").isEqualTo("transfer_in").jsonPath("$[2].counterAccountName")
                .isEqualTo("Interest Checking");
        monthIs("income", "2026-07", "25.00", null);
        monthIs("spending", "2026-07", "0.00", null);
    }

    @Order(14)
    @Test
    @DisplayName("V2_SAVINGS_007 a savings transfer opens from either side with both names; the Spending filter "
            + "excludes it for savings alone")
    void openBothSides() {
        String s = savings("Open Savings", "10000.00", "2026-06-01");
        String c = accountOpenedOn("Open Checking", "5000.00", "2026-06-01");
        String movement = transfer("k-007-open", s, c, "500.00", "2026-06-20");
        webTestClient.get().uri("/api/v1/transfers/{id}", movement).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.from.accountName").isEqualTo("Open Savings").jsonPath("$.from.accountId").isEqualTo(s)
                .jsonPath("$.to.accountName").isEqualTo("Open Checking").jsonPath("$.to.accountId").isEqualTo(c)
                .jsonPath("$.amount").isEqualTo("500.00").jsonPath("$.occurredOn").isEqualTo("2026-06-20");
        // The matching checking activity is one request away: the row names the other account and movement.
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", s).exchange().expectBody()
                .jsonPath("$[0].movementId").isEqualTo(movement).jsonPath("$[0].counterAccountId").isEqualTo(c);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", c).exchange().expectBody()
                .jsonPath("$[0].movementId").isEqualTo(movement).jsonPath("$[0].counterAccountId").isEqualTo(s);
        for (String account : new String[] { s, c, null }) {
            monthIs("spending", "2026-06", "0.00", account);
            monthIs("income", "2026-06", "0.00", account);
            webTestClient.get().uri("/api/v1/review?month=2026-06" + (account == null ? "" : "&accountId=" + account))
                    .exchange().expectBody().jsonPath("$.incomeMinusSpending").isEqualTo("0.00");
            webTestClient.get().uri("/api/v1/spending/entries?month=2026-06"
                    + (account == null ? "" : "&accountId=" + account)).exchange().expectBody()
                    .jsonPath("$.length()").isEqualTo(0);
        }
        // The filter really filters: an expense on checking counts for checking and not for savings.
        post(c, "expenses", "k-007-exp", entry(mayaId, "Dining", "40.00", "2026-06-21", "Dining")).expectStatus()
                .isCreated();
        monthIs("spending", "2026-06", "40.00", c);
        monthIs("spending", "2026-06", "0.00", s);
        monthIs("spending", "2026-06", "40.00", null);
        webTestClient.get().uri("/api/v1/spending?month=2026-06&accountId={id}", java.util.UUID.randomUUID())
                .exchange().expectStatus().isNotFound();
    }

    @Order(15)
    @Test
    @DisplayName("V2_SAVINGS_009 a Balance update beside a transfer adds no interest; history lists the transfer and "
            + "the correction with who and why")
    void correctionBesideTransfer() {
        String s = savings("Correction Savings", "10000.00", "2026-05-01");
        String c = accountOpenedOn("Correction Checking", "5000.00", "2026-05-01");
        transfer("k-009", c, s, "2000.00", "2026-05-04");
        webTestClient.get().uri(
                "/api/v1/accounts/{id}/balance-corrections/preview?requested=12025.00&asOn=2026-05-30", s)
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.balanceOnDate").isEqualTo("12000.00").jsonPath("$.requested")
                .isEqualTo("12025.00").jsonPath("$.difference").isEqualTo("25.00");
        post(s, "balance-corrections", "k-009-corr", """
                {"requestedBalance": "12025.00", "asOn": "2026-05-30", "reason": "Correct to reviewed account amount",
                 "enteredByMemberId": "%s"}""".formatted(samId)).expectStatus().isCreated();
        assertBalance(s, "12025.00");
        history(s).expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.kind=='correction')].enteredByName").isEqualTo("Sam")
                .jsonPath("$[?(@.kind=='correction')].reason").isEqualTo("Correct to reviewed account amount")
                .jsonPath("$[?(@.kind=='transfer_in')].enteredByName").isEqualTo("Maya");
        monthIs("income", "2026-05", "0.00", null);
        monthIs("spending", "2026-05", "0.00", null);
    }
}
