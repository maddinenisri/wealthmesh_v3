package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 19b: a price write takes the account row lock first (the same as every other writer of an account), reads its
 * key under that lock, then the state gate. Race tests hold a conflicting write uncommitted on another connection and
 * fail when the lock is taken out of `HoldingPriceService.save`; replay tests cover the same key twice, at once and
 * after the account changed (D-024, D-049).
 */
class HoldingPriceRaceApiTests extends PriceTestBase {

    private static final String BODY = "{\"symbol\": \"HOME\", \"price\": \"130.00\", \"valueOn\": \"2026-09-30\", "
            + "\"enteredByMemberId\": \"%s\"}";

    private String body() {
        return BODY.formatted(mayaId);
    }

    @Order(0)
    @Test
    @DisplayName("V2_HOLDINGS_008 set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_HOLDINGS_008 a price save waits for the account row lock, then saves: two writers take turns")
    void saveWaitsForTheAccountLock() throws Exception {
        String account = redwood("Race Lock", samId);
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.account SET updated_at = updated_at WHERE id = $1", account);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(savePrice(account, "lock-1", body())));
            Thread.sleep(600);
            assertThat(status).as("the price save waits for the account row").isNotDone();
            commit(other);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            close(other);
        }
        assertBalance(account, "21500.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_HOLDINGS_008 Q-070 an Archive committed while the save waits is seen: the save answers 409 and "
            + "no price is saved")
    void archiveWhileSaving() throws Exception {
        String account = redwood("Race Archive", samId);
        assertThat(afterUncommitted(account, ARCHIVED, () -> savePrice(account, "arch-1", body()))).isEqualTo(409);
        assertThat(priceRows(account)).isZero();
    }

    @Order(3)
    @Test
    @DisplayName("V2_HOLDINGS_008 a Close committed while the save waits is seen: the save answers 409")
    void closeWhileSaving() throws Exception {
        String account = held("brokerage", "Race Close", samId, "2026-09-01", "0.00",
                holding("HOME", "1", "100.00", "2026-09-01"));
        assertThat(afterUncommitted(account, CLOSED, () -> savePrice(account, "close-1", body()))).isEqualTo(409);
        assertThat(priceRows(account)).isZero();
    }

    @Order(4)
    @Test
    @DisplayName("V2_HOLDINGS_008 a delete committed while the save waits is seen: the save answers 404")
    void deleteWhileSaving() throws Exception {
        String account = redwood("Race Delete", samId);
        assertThat(afterUncommitted(account, "UPDATE wealthmesh.account SET deleted_at = now() WHERE id = $1",
                () -> savePrice(account, "del-1", body()))).isEqualTo(404);
    }

    @Order(5)
    @Test
    @DisplayName("V2_HOLDINGS_008 D-024 the same key sent twice at once saves one price: 201 and 200, one row")
    void sameKeyAtOnce() throws Exception {
        String account = redwood("Race Same Key", samId);
        CompletableFuture<Integer> first = async(() -> statusOf(savePrice(account, "twin", body())));
        CompletableFuture<Integer> second = async(() -> statusOf(savePrice(account, "twin", body())));
        List<Integer> statuses = new java.util.ArrayList<>(List.of(first.get(20, TimeUnit.SECONDS),
                second.get(20, TimeUnit.SECONDS)));
        java.util.Collections.sort(statuses);
        assertThat(statuses).containsExactly(200, 201);
        assertThat(priceRows(account)).isEqualTo(1);
        assertBalance(account, "21500.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_HOLDINGS_008 Q-069 two different keys for the same holding and date at once: both save, one "
            + "counts and the other is kept as replaced, and the Balance follows the one that counts")
    void sameDateAtOnce() throws Exception {
        String account = redwood("Race Same Date", samId);
        CompletableFuture<Integer> first = async(() -> statusOf(savePrice(account, "day-1", body())));
        CompletableFuture<Integer> second = async(() -> statusOf(savePrice(account,
                "day-2", priceBody("HOME", "140.00", "2026-09-30", mayaId))));
        assertThat(first.get(20, TimeUnit.SECONDS)).isEqualTo(201);
        assertThat(second.get(20, TimeUnit.SECONDS)).isEqualTo(201);
        prices(account).expectBody().jsonPath("$.prices.length()").isEqualTo(2)
                .jsonPath("$.prices[?(@.replaced == false)].length()").value(List.class,
                        found -> assertThat(found).hasSize(1));
    }

    @Order(7)
    @Test
    @DisplayName("V2_HOLDINGS_008 D-024 a retry of a saved price returns it (200) with no second row; the same key "
            + "with other details is 409")
    void retryAndDifferentDetails() {
        String account = redwood("Replay Plain", samId);
        String id = record(account, "rp-1", "HOME", "130.00", "2026-09-30");
        savePrice(account, "rp-1", body()).expectStatus().isOk().expectBody().jsonPath("$.price.id").isEqualTo(id);
        assertThat(priceRows(account)).isEqualTo(1);
        assertRefusedWith(savePrice(account, "rp-1", priceBody("HOME", "131.00", "2026-09-30", mayaId)), 409,
                "different details");
        assertRefusedWith(savePrice(account, "rp-1", priceBody("HOME", "130.00", "2026-09-29", mayaId)), 409,
                "different details");
        assertRefusedWith(savePrice(account, "rp-1", priceBody("HOME", "130.00", "2026-09-30", samId)), 409,
                "different details");
        assertThat(priceRows(account)).isEqualTo(1);
    }

    @Order(8)
    @Test
    @DisplayName("V2_HOLDINGS_008 D-049 a retry is judged on what was saved: after the ledger changed (a later price) "
            + "and after the account was archived it still replays, and a new key meets the gate")
    void retryAfterTheAccountChanged() {
        String account = redwood("Replay After", samId);
        String id = record(account, "ra-1", "HOME", "130.00", "2026-09-30");
        // The ledger changed: a later price now counts, so the first price is no longer today's Balance.
        record(account, "ra-2", "HOME", "150.00", "2026-10-01");
        savePrice(account, "ra-1", body()).expectStatus().isOk().expectBody().jsonPath("$.price.id").isEqualTo(id);
        assertThat(priceRows(account)).isEqualTo(2);
        act(account, "archive").expectStatus().isOk();
        savePrice(account, "ra-1", body()).expectStatus().isOk().expectBody().jsonPath("$.price.id").isEqualTo(id);
        assertRefusedWith(savePrice(account, "ra-3", priceBody("HOME", "160.00", "2026-10-02", mayaId)), 409,
                "archived. Restore it first.");
        assertThat(priceRows(account)).isEqualTo(2);
    }

    @Order(9)
    @Test
    @DisplayName("V2_HOLDINGS_008 D-034 the entering member is read under a share lock: a price save waits for that "
            + "member's row (not the account's), then saves")
    void saveWaitsForTheMemberRow() throws Exception {
        String account = redwood("Race Member", mayaId);
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.household_member SET updated_at = updated_at WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(savePrice(account, "mem-1",
                    priceBody("HOME", "130.00", "2026-09-30", samId))));
            Thread.sleep(600);
            assertThat(status).as("the price save waits for the member row").isNotDone();
            commit(other);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            close(other);
        }
    }

    @Order(10)
    @Test
    @DisplayName("V2_HOLDINGS_008 D-034 D-049 a member deactivated while the save waits is refused (400); a retry of "
            + "a price that member saved earlier still replays")
    void memberDeactivatedWhileSaving() throws Exception {
        String account = redwood("Race Member Gone", mayaId);
        String earlier = priceBody("HOME", "125.00", "2026-09-20", samId);
        savePrice(account, "gone-0", earlier).expectStatus().isCreated();
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(savePrice(account, "gone-1",
                    priceBody("HOME", "130.00", "2026-09-30", samId))));
            Thread.sleep(600);
            assertThat(status).as("the price save waits for the member row").isNotDone();
            commit(other);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(other);
        }
        assertThat(priceRows(account)).isEqualTo(1);
        // Judged on what was saved: Sam is inactive now, and the retry of his earlier save still replays.
        savePrice(account, "gone-0", earlier).expectStatus().isOk();
        assertThat(priceRows(account)).isEqualTo(1);
    }
}
