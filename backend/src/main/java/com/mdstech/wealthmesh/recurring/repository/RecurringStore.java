package com.mdstech.wealthmesh.recurring.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.recurring.dto.EventView;
import com.mdstech.wealthmesh.recurring.dto.OccurrenceView;
import com.mdstech.wealthmesh.recurring.service.Suggestions;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Plain SQL over the recurring tables (slice 14). Every write runs under `HouseholdLock.lock()`. A schedule's category
 * is read through the merge pointer, as every category reader does (D-042); a deleted account hides its schedules.
 */
@Repository
public class RecurringStore {

    /** A saved schedule with its account and effective category. `removed` schedules are never returned by lists. */
    public record Schedule(UUID id, UUID accountId, String accountName, String accountStatus, String accountType,
            String description, UUID categoryId, String categoryName, boolean categoryArchived, BigDecimal amount,
            String frequency, String status, LocalDate nextDueOn, int anchorDay, Instant removedAt) {
    }

    /** A stored key: the schedule it made or changed, and the fingerprint of the request. */
    public record KeyHit(UUID scheduleId, String fingerprint) {
    }

    private static final String SCHEDULE = """
            SELECT s.id, s.account_id, ac.name AS account_name, ac.status AS account_status, ac.type AS account_type,
                   s.description, c.id AS category_id, c.name AS category_name,
                   (c.archived_at IS NOT NULL) AS category_archived, s.amount, s.frequency, s.status, s.next_due_on,
                   s.anchor_day, s.removed_at
            FROM recurring_schedule s JOIN account ac ON ac.id = s.account_id AND ac.deleted_at IS NULL
            JOIN category c0 ON c0.id = s.category_id
            JOIN category c ON c.id = COALESCE(c0.merged_into_id, c0.id)""";

    private final DatabaseClient client;

    public RecurringStore(DatabaseClient client) {
        this.client = client;
    }

    /** The saved schedules (not deleted), soonest due first. */
    public Flux<Schedule> schedules() {
        return client.sql(SCHEDULE + " WHERE s.removed_at IS NULL ORDER BY s.next_due_on, s.created_at")
                .map((row, meta) -> schedule(row)).all();
    }

    /** One saved schedule by id; empty when it was deleted or its account was. */
    public Mono<Schedule> schedule(UUID id) {
        return client.sql(SCHEDULE + " WHERE s.id = :id AND s.removed_at IS NULL").bind("id", id)
                .map((row, meta) -> schedule(row)).one();
    }

    /** One schedule by id even when it was deleted (a replay of a delete reads it). */
    public Mono<Schedule> scheduleAnyState(UUID id) {
        return client.sql(SCHEDULE + " WHERE s.id = :id").bind("id", id).map((row, meta) -> schedule(row)).one();
    }

    public Mono<UUID> insert(UUID householdId, UUID accountId, String description, UUID categoryId, BigDecimal amount,
            String frequency, LocalDate nextDueOn, UUID memberId, Instant now) {
        return client.sql("INSERT INTO recurring_schedule (household_id, account_id, description, category_id, "
                        + "amount, frequency, next_due_on, anchor_day, entered_by_member_id, created_at) "
                        + "VALUES (:household, :account, :description, :category, :amount, :frequency, :due, :anchor, "
                        + ":member, :now) RETURNING id")
                .bind("household", householdId).bind("account", accountId).bind("description", description)
                .bind("category", categoryId).bind("amount", amount).bind("frequency", frequency)
                .bind("due", nextDueOn).bind("anchor", nextDueOn.getDayOfMonth()).bind("member", memberId)
                .bind("now", now).map((row, meta) -> row.get("id", UUID.class)).one();
    }

    /** Replaces the amount, frequency and next due date of a schedule (a change; the anchor follows the date). */
    public Mono<Void> update(UUID id, BigDecimal amount, String frequency, LocalDate nextDueOn) {
        return client.sql("UPDATE recurring_schedule SET amount = :amount, frequency = :frequency, "
                        + "next_due_on = :due, anchor_day = :anchor WHERE id = :id")
                .bind("amount", amount).bind("frequency", frequency).bind("due", nextDueOn)
                .bind("anchor", nextDueOn.getDayOfMonth()).bind("id", id).then();
    }

    public Mono<Void> setStatus(UUID id, String status) {
        return client.sql("UPDATE recurring_schedule SET status = :status WHERE id = :id")
                .bind("status", status).bind("id", id).then();
    }

    /** Moves the next occurrence and the day a monthly bill returns to, and sets the status (Resume, Reschedule). */
    public Mono<Void> setNextDue(UUID id, LocalDate nextDueOn, String status) {
        return client.sql("UPDATE recurring_schedule SET next_due_on = :due, anchor_day = :anchor, status = :status "
                        + "WHERE id = :id").bind("due", nextDueOn).bind("anchor", nextDueOn.getDayOfMonth())
                .bind("status", status).bind("id", id).then();
    }

    /** Moves the next occurrence after an occurrence was paid or dismissed; the anchor day stays. */
    public Mono<Void> advance(UUID id, LocalDate nextDueOn) {
        return client.sql("UPDATE recurring_schedule SET next_due_on = :due WHERE id = :id")
                .bind("due", nextDueOn).bind("id", id).then();
    }

    /** True when that occurrence of the schedule already has this outcome (a repeat of a dismissal). */
    public Mono<Boolean> hasOccurrence(UUID scheduleId, LocalDate dueOn, String outcome) {
        return client.sql("SELECT EXISTS (SELECT 1 FROM recurring_occurrence WHERE schedule_id = :id "
                        + "AND due_on = :due AND outcome = :outcome) AS found")
                .bind("id", scheduleId).bind("due", dueOn).bind("outcome", outcome)
                .map((row, meta) -> Boolean.TRUE.equals(row.get("found", Boolean.class))).one();
    }

    /** Records that an occurrence was paid (with the entry that paid it) or dismissed. */
    public Mono<Void> addOccurrence(UUID scheduleId, LocalDate dueOn, String outcome, LocalDate paidOn,
            UUID activityId, UUID memberId, Instant at) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO recurring_occurrence "
                        + "(schedule_id, due_on, outcome, paid_on, activity_id, member_id, at) "
                        + "VALUES (:schedule, :due, :outcome, :paid, :activity, :member, :at)")
                .bind("schedule", scheduleId).bind("due", dueOn).bind("outcome", outcome)
                .bind("member", memberId).bind("at", at);
        spec = paidOn == null ? spec.bindNull("paid", LocalDate.class) : spec.bind("paid", paidOn);
        spec = activityId == null ? spec.bindNull("activity", UUID.class) : spec.bind("activity", activityId);
        return spec.then();
    }

    /** Deletes a schedule softly: it leaves every list, its bills and history stay. */
    public Mono<Void> softDelete(UUID id, Instant at) {
        return client.sql("UPDATE recurring_schedule SET removed_at = :at WHERE id = :id AND removed_at IS NULL")
                .bind("at", at).bind("id", id).then();
    }

    /** The latest event of a schedule: what was done last and the date it named, for a repeat of the same action. */
    public Mono<String> latestAction(UUID scheduleId) {
        return client.sql("SELECT action FROM recurring_event WHERE schedule_id = :id ORDER BY at DESC, seq DESC "
                        + "LIMIT 1").bind("id", scheduleId).map((row, meta) -> row.get("action", String.class)).one();
    }

    /** The occurrences that were paid or dismissed, newest due date first. */
    public Flux<OccurrenceView> occurrences(UUID scheduleId) {
        // A removed entry with no replacement is a removed payment; a replaced one was corrected, not removed.
        return client.sql("SELECT o.due_on, o.outcome, o.paid_on, o.activity_id, "
                        + "(a.removed_at IS NOT NULL AND NOT EXISTS "
                        + "(SELECT 1 FROM activity r WHERE r.replaces_id = a.id)) AS payment_removed "
                        + "FROM recurring_occurrence o LEFT JOIN activity a ON a.id = o.activity_id "
                        + "WHERE o.schedule_id = :id ORDER BY o.due_on DESC, o.at DESC").bind("id", scheduleId)
                .map((row, meta) -> new OccurrenceView(row.get("due_on", LocalDate.class),
                        row.get("outcome", String.class), row.get("paid_on", LocalDate.class),
                        row.get("activity_id", UUID.class),
                        Boolean.TRUE.equals(row.get("payment_removed", Boolean.class)))).all();
    }

    public Flux<EventView> events(UUID scheduleId) {
        return client.sql("SELECT action, member_id, at, detail FROM recurring_event WHERE schedule_id = :id "
                        + "ORDER BY at DESC, seq DESC").bind("id", scheduleId)
                .map((row, meta) -> new EventView(row.get("action", String.class), row.get("member_id", UUID.class),
                        row.get("at", Instant.class), row.get("detail", String.class))).all();
    }

    public Mono<Void> recordEvent(UUID scheduleId, String action, UUID memberId, Instant at, String key,
            String fingerprint, String detail) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO recurring_event "
                        + "(schedule_id, action, member_id, at, idempotency_key, fingerprint, detail) "
                        + "VALUES (:schedule, :action, :member, :at, :key, :fingerprint, :detail)")
                .bind("schedule", scheduleId).bind("action", action).bind("at", at).bind("detail", detail);
        spec = memberId == null ? spec.bindNull("member", UUID.class) : spec.bind("member", memberId);
        spec = key == null ? spec.bindNull("key", String.class) : spec.bind("key", key);
        spec = fingerprint == null ? spec.bindNull("fingerprint", String.class)
                : spec.bind("fingerprint", fingerprint);
        return spec.then();
    }

    /** Frees a key past its lifetime so a new save may use it again (D-024). */
    public Mono<Long> expireKey(String key, Instant cutoff) {
        return client.sql("UPDATE recurring_event SET idempotency_key = NULL "
                        + "WHERE idempotency_key = :key AND at <= :cutoff")
                .bind("key", key).bind("cutoff", cutoff).fetch().rowsUpdated();
    }

    public Mono<KeyHit> findKey(String key) {
        return client.sql("SELECT schedule_id, fingerprint FROM recurring_event WHERE idempotency_key = :key")
                .bind("key", key)
                .map((row, meta) -> new KeyHit(row.get("schedule_id", UUID.class),
                        row.get("fingerprint", String.class))).one();
    }

    /** The dismissed suggestions, as the keys they match (account, category, description). */
    public Flux<String> dismissedKeys() {
        return client.sql("SELECT account_id, category_id, description_key FROM recurring_dismissal")
                .map((row, meta) -> Suggestions.key(row.get("account_id", UUID.class),
                        row.get("category_id", UUID.class), row.get("description_key", String.class))).all();
    }

    /** Dismisses a suggestion; a repeat changes nothing. */
    public Mono<Void> dismiss(UUID accountId, UUID categoryId, String descriptionKey, UUID memberId, Instant at) {
        return client.sql("INSERT INTO recurring_dismissal (account_id, category_id, description_key, member_id, at) "
                        + "VALUES (:account, :category, :description, :member, :at) ON CONFLICT DO NOTHING")
                .bind("account", accountId).bind("category", categoryId).bind("description", descriptionKey)
                .bind("member", memberId).bind("at", at).then();
    }

    private static Schedule schedule(io.r2dbc.spi.Readable row) {
        return new Schedule(row.get("id", UUID.class), row.get("account_id", UUID.class),
                row.get("account_name", String.class), row.get("account_status", String.class),
                row.get("account_type", String.class), row.get("description", String.class),
                row.get("category_id", UUID.class), row.get("category_name", String.class),
                Boolean.TRUE.equals(row.get("category_archived", Boolean.class)), row.get("amount", BigDecimal.class),
                row.get("frequency", String.class), row.get("status", String.class),
                row.get("next_due_on", LocalDate.class), row.get("anchor_day", Integer.class),
                row.get("removed_at", Instant.class));
    }
}
