package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import io.r2dbc.spi.Connection;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Slice 15, group 0 (owner, 2026-10-06): a schedule has at most one occurrence per due date (V23). The database is the
 * last guard, so there is a raw-SQL test of the constraint, a race test, a test of the mapping to 409, Reschedule and
 * Resume refusing a settled date, and a test of the migration over a database that already holds duplicates.
 */
class RecurringOccurrenceApiTests extends RecurringTestBase {

    private static final String DUE = "2026-10-05";
    private static String account;
    private static String household;

    @Order(0)
    @Test
    @DisplayName("set up the household and a checking account at 5000.00; today is 2026-10-03")
    void setUp() {
        household();
        household = householdId();
        account = account("Occurrence Checking", "5000.00");
    }

    private String schedule(String name, String key) {
        return created(key, schedule(name, "10.00", "monthly", DUE, account, "Utilities"));
    }

    private long run(String sql) {
        Connection connection = Mono.from(connectionFactory.create()).block();
        try {
            return Flux.from(connection.createStatement(sql).execute()).concatMap(r -> Mono.from(r.getRowsUpdated())
                    .defaultIfEmpty(0L)).reduce(0L, Long::sum).block();
        } finally {
            Mono.from(connection.close()).block();
        }
    }

    private long count(String where) {
        Connection connection = Mono.from(connectionFactory.create()).block();
        try {
            return Mono.from(connection.createStatement(
                            "SELECT COUNT(*) AS n FROM wealthmesh.recurring_occurrence WHERE " + where).execute())
                    .flatMap(r -> Mono.from(r.map((row, meta) -> row.get("n", Long.class)))).block();
        } finally {
            Mono.from(connection.close()).block();
        }
    }

    private String insertOccurrence(String schedule, String due, String outcome, String at) {
        return ("INSERT INTO wealthmesh.recurring_occurrence (schedule_id, due_on, outcome, member_id, at) "
                + "VALUES ('%s', '%s', '%s', '%s', '%s')").formatted(schedule, due, outcome, mayaId, at);
    }

    @Order(1)
    @Test
    @DisplayName("V2_RECURRING_010 the database refuses a second occurrence for one due date, paid or dismissed")
    void databaseRefusesTwoOccurrencesForOneDate() {
        String id = schedule("Raw", "o-raw");
        run(insertOccurrence(id, "2026-09-05", "dismissed", "2026-09-05T10:00:00Z"));
        for (String outcome : List.of("dismissed", "paid")) {
            try {
                run(insertOccurrence(id, "2026-09-05", outcome, "2026-09-05T11:00:00Z"));
                throw new AssertionError("a second " + outcome + " occurrence was accepted");
            } catch (io.r2dbc.spi.R2dbcDataIntegrityViolationException e) {
                assertThat(e.getMessage()).contains("recurring_occurrence_one_per_due_date");
            }
        }
        assertThat(count("schedule_id = '" + id + "'")).isEqualTo(1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_RECURRING_003 two Records of one occurrence with different keys wait for the household lock: one "
            + "saves, the other is refused 409, and one expense exists")
    void twoRecordsOfOneOccurrence() throws Exception {
        String own = account("Occurrence Race", "1000.00");
        String id = created("o-race", schedule("Race", "10.00", "monthly", DUE, own, "Utilities"));
        @SuppressWarnings("unchecked")
        List<Integer> statuses = afterHeld(HOUSEHOLD_LOCK, household,
                () -> record(id, "o-race-1", recordBody(DUE, "10.00", "2026-10-01")),
                () -> record(id, "o-race-2", recordBody(DUE, "10.00", "2026-10-02")));
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        assertActivityCount(own, 1);
        assertThat(count("schedule_id = '" + id + "'")).isEqualTo(1);
    }

    @Order(3)
    @Test
    @DisplayName("V2_RECURRING_003 when the constraint is the one that fires (another writer holds the same due date "
            + "uncommitted), Record answers 409 and saves no expense")
    void constraintViolationIs409() throws Exception {
        String own = account("Occurrence Constraint", "1000.00");
        String id = created("o-con", schedule("Constraint", "10.00", "monthly", DUE, own, "Utilities"));
        Connection other = holdUncommitted(insertOccurrence("%s", DUE, "dismissed", "2026-10-03T10:00:00Z")
                .replace("'%s'", "$1"), id);
        try {
            CompletableFuture<Integer> status = CompletableFuture.supplyAsync(() -> record(id, "o-con-1",
                    recordBody(DUE, "10.00", "2026-10-01")).returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            assertThat(status).as("the save waits for the uncommitted occurrence").isNotDone();
            commit(other);
            assertThat(status.get(15, TimeUnit.SECONDS)).isEqualTo(409);
        } finally {
            close(other);
        }
        assertActivityCount(own, 0);
    }

    @Order(4)
    @Test
    @DisplayName("V2_RECURRING_010 Reschedule and Resume refuse a due date that was already dismissed or paid (409, "
            + "named), and change nothing")
    void rescheduleOntoSettledDate() {
        String id = schedule("Settled", "o-set");
        act(id, "dismiss", DUE).expectStatus().isOk();
        assertRefused(act(id, "reschedule", DUE), "2026-10-05 occurrence of Settled was already dismissed");
        record(id, "o-set-1", recordBody("2026-11-05", "10.00", "2026-10-02")).expectStatus().isCreated();
        assertRefused(act(id, "reschedule", "2026-11-05"), "2026-11-05 occurrence of Settled was already paid");
        scheduleOf(id).expectBody().jsonPath("$.nextDueOn").isEqualTo("2026-12-05");

        act(id, "pause", null).expectStatus().isOk();
        assertRefused(act(id, "resume", DUE), "was already dismissed");
        assertRefused(act(id, "resume", "2026-11-05"), "was already paid");
        scheduleOf(id).expectBody().jsonPath("$.status").isEqualTo("paused").jsonPath("$.nextDueOn")
                .isEqualTo("2026-12-05");
        act(id, "resume", "2026-12-20").expectStatus().isOk();
        act(id, "reschedule", "2026-12-22").expectStatus().isOk();
    }

    private String migration() throws IOException {
        return new String(new ClassPathResource("db/migration/V23__recurring_occurrence_unique.sql").getInputStream()
                .readAllBytes(), StandardCharsets.UTF_8);
    }

    private void restoreBeforeMigration() {
        run("ALTER TABLE wealthmesh.recurring_occurrence DROP CONSTRAINT IF EXISTS "
                + "recurring_occurrence_one_per_due_date");
        run("CREATE INDEX IF NOT EXISTS recurring_occurrence_schedule_idx ON wealthmesh.recurring_occurrence "
                + "(schedule_id, due_on)");
    }

    @Order(5)
    @Test
    @DisplayName("V2_RECURRING_010 the migration removes duplicate dismissals and a dismissal beside a payment, keeps "
            + "the payment, and stops with a message when two payments share a date")
    void migrationOverExistingDuplicates() throws Exception {
        String id = schedule("Migrate", "o-mig");
        restoreBeforeMigration();
        run(insertOccurrence(id, "2026-01-05", "dismissed", "2026-01-05T10:00:00Z"));
        run(insertOccurrence(id, "2026-01-05", "dismissed", "2026-01-05T11:00:00Z"));
        run(insertOccurrence(id, "2026-02-05", "paid", "2026-02-05T10:00:00Z"));
        run(insertOccurrence(id, "2026-02-05", "dismissed", "2026-02-05T09:00:00Z"));
        run(insertOccurrence(id, "2026-03-05", "dismissed", "2026-03-05T09:00:00Z"));

        run(migration());

        assertThat(count("schedule_id = '" + id + "' AND due_on = '2026-01-05' AND outcome = 'dismissed'"))
                .as("the earliest of two dismissals stays").isEqualTo(1);
        assertThat(count("schedule_id = '" + id + "' AND due_on = '2026-02-05' AND outcome = 'paid'"))
                .as("the payment stays").isEqualTo(1);
        assertThat(count("schedule_id = '" + id + "' AND due_on = '2026-02-05'")).isEqualTo(1);
        assertThat(count("schedule_id = '" + id + "' AND due_on = '2026-03-05'")).as("a lone row is untouched")
                .isEqualTo(1);

        restoreBeforeMigration();
        run(insertOccurrence(id, "2026-04-05", "paid", "2026-04-05T10:00:00Z"));
        run(insertOccurrence(id, "2026-04-05", "paid", "2026-04-05T11:00:00Z"));
        String script = migration();
        try {
            run(script);
            throw new AssertionError("two payments for one date were accepted");
        } catch (RuntimeException e) {
            assertThat(e.getMessage()).contains("two paid occurrences for 2026-04-05");
        }
        assertThat(count("schedule_id = '" + id + "' AND due_on = '2026-04-05'")).as("neither payment is dropped")
                .isEqualTo(2);

        run("DELETE FROM wealthmesh.recurring_occurrence WHERE schedule_id = '" + id + "' AND due_on = '2026-04-05' "
                + "AND at = '2026-04-05T11:00:00Z'");
        run(script);
        assertThat(count("schedule_id = '" + id + "' AND due_on = '2026-04-05'")).isEqualTo(1);
    }
}
