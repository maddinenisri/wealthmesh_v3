package com.mdstech.wealthmesh.account.repository;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Owner links have a composite key, so they are written with plain SQL instead of a CRUD repository. */
@Repository
public class AccountOwnerStore {

    private static final String INSERT =
            "INSERT INTO account_owner (account_id, member_id, household_id) VALUES (:account, :member, :household)";

    private final DatabaseClient client;

    public AccountOwnerStore(DatabaseClient client) {
        this.client = client;
    }

    /** Replaces the owners of an account. Run inside the caller's transaction. */
    public Mono<Void> replace(UUID householdId, UUID accountId, Collection<UUID> memberIds) {
        Mono<Void> clear = client.sql("DELETE FROM account_owner WHERE account_id = :account")
                .bind("account", accountId).then();
        Flux<Void> inserts = Flux.fromIterable(memberIds).concatMap(member -> client.sql(INSERT)
                .bind("account", accountId).bind("member", member).bind("household", householdId).then());
        return clear.thenMany(inserts).then();
    }

    /** Owner member ids per account, in a stable order. */
    public Mono<Map<UUID, List<UUID>>> ownersByAccount() {
        return client.sql("SELECT account_id, member_id FROM account_owner ORDER BY member_id")
                .map((row, meta) -> Map.entry(row.get("account_id", UUID.class), row.get("member_id", UUID.class)))
                .all()
                .collect(Collectors.groupingBy(Map.Entry::getKey,
                        Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
    }

    /** Owner member ids of one account. */
    public Mono<List<UUID>> ownersOf(UUID accountId) {
        return client.sql("SELECT member_id FROM account_owner WHERE account_id = :account ORDER BY member_id")
                .bind("account", accountId)
                .map((row, meta) -> row.get("member_id", UUID.class))
                .all().collectList();
    }
}
