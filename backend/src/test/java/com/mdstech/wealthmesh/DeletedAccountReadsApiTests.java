package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

import io.r2dbc.spi.Connection;

/** A row marked deleted is hidden from reads (slice 12, group 0; the delete endpoint arrives in group 4). */
class DeletedAccountReadsApiTests extends LedgerApiTestBase {

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
        accountId = account("Test Savings", "0.00");
        account("Everyday Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 an account marked deleted leaves the list, its detail and wealth")
    void deletedRowIsHidden() {
        Connection connection = holdUncommitted("UPDATE account SET deleted_at = now() WHERE id = $1", accountId);
        commit(connection);
        close(connection);
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(1);
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectStatus().isNotFound();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo("5000.00");
    }
}
