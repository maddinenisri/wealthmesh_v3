package com.mdstech.wealthmesh.activity.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** SQL for linked movements: the rows that share a movement_id are written, removed and restored together. */
@Repository
public class MovementStore {

    /** One row of a movement with the names the person sees. */
    public record Leg(UUID id, UUID movementId, UUID accountId, String accountName, String kind, BigDecimal amount,
            LocalDate occurredOn, String description, UUID memberId, String memberName, Instant createdAt,
            String reason, Instant removedAt, UUID replacesId, UUID replacedById) {
    }

    private final DatabaseClient client;
    private final ActivityStore store;

    public MovementStore(DatabaseClient client, ActivityStore store) {
        this.client = client;
        this.store = store;
    }

    /** Locks the accounts one at a time, lowest id first, so two movements in opposite directions cannot deadlock. */
    public Mono<Void> lockAccounts(Collection<UUID> accountIds) {
        return Flux.fromStream(accountIds.stream().distinct().sorted()).concatMap(store::lockAccount).then();
    }

    /** The rows of a movement, kinds in alphabetical order (transfer_in before transfer_out). */
    public Flux<Leg> legs(UUID movementId) {
        return client.sql("""
                SELECT a.id, a.movement_id, a.account_id, ac.name AS account_name, a.kind, a.amount, a.occurred_on,
                       a.description, a.entered_by_member_id, m.name AS member_name, a.created_at, a.reason,
                       a.removed_at, a.replaces_id, r.id AS replaced_by_id
                FROM activity a JOIN account ac ON ac.id = a.account_id
                LEFT JOIN household_member m ON m.id = a.entered_by_member_id
                LEFT JOIN activity r ON r.replaces_id = a.id
                WHERE a.movement_id = :movement ORDER BY a.kind""")
                .bind("movement", movementId)
                .map((row, meta) -> new Leg(row.get("id", UUID.class), row.get("movement_id", UUID.class),
                        row.get("account_id", UUID.class), row.get("account_name", String.class),
                        row.get("kind", String.class), row.get("amount", BigDecimal.class),
                        row.get("occurred_on", LocalDate.class), row.get("description", String.class),
                        row.get("entered_by_member_id", UUID.class), row.get("member_name", String.class),
                        instant(row.get("created_at", java.time.OffsetDateTime.class)), row.get("reason", String.class),
                        instant(row.get("removed_at", java.time.OffsetDateTime.class)),
                        row.get("replaces_id", UUID.class), row.get("replaced_by_id", UUID.class)))
                .all();
    }

    /** The movement a stored save key belongs to, when the key is still within its lifetime. */
    public Mono<UUID> movementOfKey(String key, Instant cutoff) {
        return client.sql("SELECT movement_id FROM activity WHERE idempotency_key = :key AND created_at > :cutoff "
                        + "AND movement_id IS NOT NULL")
                .bind("key", key).bind("cutoff", cutoff)
                .map((row, meta) -> row.get("movement_id", UUID.class)).one();
    }

    /** Writes one row of a movement; the save key goes on one row only (it is unique). */
    public Mono<UUID> insertLeg(UUID movementId, UUID accountId, String kind, BigDecimal amount, LocalDate on,
            String description, UUID memberId, String key, Instant at, String reason, UUID replacesId) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("""
                INSERT INTO activity (account_id, kind, amount, occurred_on, description, entered_by_member_id,
                    idempotency_key, created_at, reason, replaces_id, movement_id)
                VALUES (:account, :kind, :amount, :on, :description, :member, :key, :at, :reason, :replaces, :movement)
                RETURNING id""")
                .bind("account", accountId).bind("kind", kind).bind("amount", amount).bind("on", on)
                .bind("member", memberId).bind("at", at).bind("movement", movementId);
        spec = description == null ? spec.bindNull("description", String.class) : spec.bind("description", description);
        spec = key == null ? spec.bindNull("key", String.class) : spec.bind("key", key);
        spec = reason == null ? spec.bindNull("reason", String.class) : spec.bind("reason", reason);
        spec = replacesId == null ? spec.bindNull("replaces", UUID.class) : spec.bind("replaces", replacesId);
        return spec.map((row, meta) -> row.get("id", UUID.class)).one();
    }

    /** Removes both live rows at once. A count other than two means someone else changed the pair first. */
    public Mono<Long> removePair(UUID movementId, UUID byMemberId, Instant at) {
        return client.sql("UPDATE activity SET removed_at = :at, removed_by_member_id = :by "
                        + "WHERE movement_id = :movement AND removed_at IS NULL")
                .bind("at", at).bind("by", byMemberId).bind("movement", movementId).fetch().rowsUpdated();
    }

    /** Brings back both rows of a removed pair that nothing replaced. A count other than two means it was not so. */
    public Mono<Long> restorePair(UUID movementId) {
        return client.sql("UPDATE activity SET removed_at = NULL, removed_by_member_id = NULL "
                        + "WHERE movement_id = :movement AND removed_at IS NOT NULL AND NOT EXISTS "
                        + "(SELECT 1 FROM activity r WHERE r.replaces_id = activity.id)")
                .bind("movement", movementId).fetch().rowsUpdated();
    }

    private static Instant instant(java.time.OffsetDateTime value) {
        return value == null ? null : value.toInstant();
    }
}
