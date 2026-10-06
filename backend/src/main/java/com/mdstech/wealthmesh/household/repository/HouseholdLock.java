package com.mdstech.wealthmesh.household.repository;

import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import reactor.core.publisher.Mono;

/**
 * The household row lock that serializes writes which belong to the whole household, not to one account (a Budget,
 * a recurring schedule). Lock order for a write that also moves money: household row, then the account row, then the
 * category and member rows `FOR SHARE`.
 */
@Repository
public class HouseholdLock {

    private final DatabaseClient client;

    public HouseholdLock(DatabaseClient client) {
        this.client = client;
    }

    /** Waits for the household row, holds it until the transaction ends, and returns its id. */
    public Mono<UUID> lock() {
        return client.sql("SELECT id FROM household FOR UPDATE").map((row, meta) -> row.get("id", UUID.class)).one();
    }
}
