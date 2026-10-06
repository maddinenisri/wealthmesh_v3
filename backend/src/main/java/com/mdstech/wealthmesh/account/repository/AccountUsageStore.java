package com.mdstech.wealthmesh.account.repository;

import java.time.Instant;
import java.util.UUID;

import com.mdstech.wealthmesh.account.dto.AccountEvent;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * What an account holds that a delete would lose, and the delete mark itself (slice 12, A3). Plain SQL, run under
 * the account lock.
 */
@Repository
public class AccountUsageStore {

    /** Saved history by kind. `entries` counts every activity row, removed and replaced ones too. */
    public record Usage(long entries, long reminders, long statements, long revisions, long schedules) {

        public boolean unused() {
            return entries == 0 && reminders == 0 && statements == 0 && revisions == 0 && schedules == 0;
        }
    }

    private final DatabaseClient client;

    public AccountUsageStore(DatabaseClient client) {
        this.client = client;
    }

    public Mono<Usage> usageOf(UUID accountId) {
        return client.sql("""
                        SELECT (SELECT COUNT(*) FROM activity WHERE account_id = :id) AS entries,
                               (SELECT COUNT(*) FROM reminder WHERE account_id = :id) AS reminders,
                               (SELECT COUNT(*) FROM statement WHERE account_id = :id) AS statements,
                               (SELECT COUNT(*) FROM opening_revision WHERE account_id = :id) AS revisions,
                               (SELECT COUNT(*) FROM recurring_schedule
                                WHERE account_id = :id AND removed_at IS NULL) AS schedules""")
                .bind("id", accountId)
                .map((row, meta) -> new Usage(row.get("entries", Long.class), row.get("reminders", Long.class),
                        row.get("statements", Long.class), row.get("revisions", Long.class),
                        row.get("schedules", Long.class)))
                .one();
    }

    /** Records a change of state; the caller runs it in the same transaction as the change. */
    public Mono<Void> recordEvent(UUID accountId, String action, UUID memberId, Instant at) {
        DatabaseClient.GenericExecuteSpec spec = client.sql(
                        "INSERT INTO account_event (account_id, action, member_id, at) "
                                + "VALUES (:id, :action, :member, :at)")
                .bind("id", accountId).bind("action", action).bind("at", at);
        spec = memberId == null ? spec.bindNull("member", UUID.class) : spec.bind("member", memberId);
        return spec.then();
    }

    /** The account's changes of state, newest first. */
    public Flux<AccountEvent> eventsOf(UUID accountId) {
        return client.sql("SELECT action, member_id, at FROM account_event WHERE account_id = :id "
                        + "ORDER BY at DESC, seq DESC")
                .bind("id", accountId)
                .map((row, meta) -> new AccountEvent(row.get("action", String.class), row.get("member_id", UUID.class),
                        row.get("at", Instant.class)))
                .all();
    }

    /** Marks the account deleted (rows touched: 1) or clears the mark (Undo). Run under the account lock. */
    public Mono<Long> setDeleted(UUID accountId, Instant at) {
        DatabaseClient.GenericExecuteSpec spec = client.sql(at == null
                        ? "UPDATE account SET deleted_at = NULL WHERE id = :id AND deleted_at IS NOT NULL"
                        : "UPDATE account SET deleted_at = :at WHERE id = :id AND deleted_at IS NULL")
                .bind("id", accountId);
        return (at == null ? spec : spec.bind("at", at)).fetch().rowsUpdated();
    }
}
