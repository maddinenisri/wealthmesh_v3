package com.mdstech.wealthmesh.account.repository;

import java.time.Instant;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import reactor.core.publisher.Mono;

/**
 * What an account holds that a delete would lose, and the delete mark itself (slice 12, A3). Plain SQL, run under
 * the account lock.
 */
@Repository
public class AccountUsageStore {

    /** Saved history by kind. `entries` counts every activity row, removed and replaced ones too. */
    public record Usage(long entries, long reminders, long statements, long revisions) {

        public boolean unused() {
            return entries == 0 && reminders == 0 && statements == 0 && revisions == 0;
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
                               (SELECT COUNT(*) FROM opening_revision WHERE account_id = :id) AS revisions""")
                .bind("id", accountId)
                .map((row, meta) -> new Usage(row.get("entries", Long.class), row.get("reminders", Long.class),
                        row.get("statements", Long.class), row.get("revisions", Long.class)))
                .one();
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
