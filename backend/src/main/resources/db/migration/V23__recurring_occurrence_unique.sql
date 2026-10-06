-- Slice 15 group 0: a schedule has at most one occurrence (paid or dismissed) for a due date. The household lock
-- already serialises schedule writes; this is the database's own guard, so a writer that ever skips the lock fails
-- instead of paying a bill twice.
--
-- Existing rows: a duplicate dismissal, or a dismissal beside a payment for the same date, carries no money, so the
-- extra rows are removed (the payment, or else the earliest dismissal, stays). Two payments for one date each point at
-- an entry; they cannot be merged without a decision, so the migration stops with a message naming the schedule and
-- date instead of dropping either.
DELETE FROM wealthmesh.recurring_occurrence d
 WHERE d.outcome = 'dismissed'
   AND EXISTS (SELECT 1 FROM wealthmesh.recurring_occurrence k
                WHERE k.schedule_id = d.schedule_id AND k.due_on = d.due_on AND k.id <> d.id
                  AND (k.outcome = 'paid' OR (k.outcome = 'dismissed' AND (k.at, k.id) < (d.at, d.id))));

DO $$
DECLARE
    clash RECORD;
BEGIN
    SELECT schedule_id, due_on INTO clash
      FROM wealthmesh.recurring_occurrence
     GROUP BY schedule_id, due_on HAVING COUNT(*) > 1 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'V23: recurring schedule % has two paid occurrences for %. Delete the extra recurring_occurrence row (and its entry if it is a mistake), then start the app again.', clash.schedule_id, clash.due_on;
    END IF;
END $$;

DROP INDEX wealthmesh.recurring_occurrence_schedule_idx;
ALTER TABLE wealthmesh.recurring_occurrence
    ADD CONSTRAINT recurring_occurrence_one_per_due_date UNIQUE (schedule_id, due_on);
