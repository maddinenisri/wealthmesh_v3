# Slice 02: edit, remove, Undo and reminders

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: 02 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/checking/activity.feature`, `spending/expenses/record-expenses.feature`, `spending/income/record-income.feature`
- Status: in-progress (built and proved; waiting for checkpoint 2)
- Started: 2026-10-04  Finished:  Commit:

## Prompts and directions

Paste, verbatim, the kickoff prompt that started this session (see `docs/process/prompts.md`, note its version), then
add each instruction or answer the product owner gave at a checkpoint, with the date. No transcripts, no secrets.

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 02 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

Slice 02 covers CHECKING_008, EXPENSE_006, 009, 011 and INCOME_004, 006.

Before you start it, two things from 01b are still open: board row 01 still said "01b todo"; no 01b retro row; the 01b commits were not pushed.
```

- 2026-10-04 Pre-start answer: board row and retro row fixed, commits pushed (`470021f`).
- 2026-10-04 Checkpoint 1 answer: approved as proposed (six decisions, groups A, B, C).
- <date> Checkpoint 2 answer:

## Scope

Scenario IDs: `@V2_CHECKING_008`, `@V2_EXPENSE_006`, `@V2_EXPENSE_009`, `@V2_EXPENSE_011`, `@V2_INCOME_004`, `@V2_INCOME_006`. All 6 are citeable now (needs only slice 01 capabilities); none deferred.

Capabilities added: P2 (edit as replacement with history), P3 (soft remove and Undo), P5 (reminders for future-dated entries).

## Gap analysis (2026-10-04)

Have: `activity` has `replaces_id`, `reason`, `removed_at`, `removed_by_member_id`; SQL already filters `removed_at IS NULL`; `EntryService` (save by kind, key replay D-024); today's clock; the entered-by chooser (D-025); the review-then-confirm form. Missing: no edit, remove or Undo endpoint or UI; no history view; no reminder storage (no table, no code); future dates are refused with "Future activity is not saved as completed history yet" (EXPENSE_011 and INCOME_006 need Save reminder instead); no member shown on a removal.

## Decisions (proposed, for approval)

- Edit = replacement row. `PUT`-like `POST /activity/{id}/replacement` inserts a row with `replaces_id`, `reason`, `entered_by`, and sets `removed_at` on the original in one transaction, so Balance and totals count only the new row. The original stays in history, shown as "replaced". A replaced row cannot be removed or undone; edit the replacement instead. Amount, date, category and description can change; the account cannot (account moves land with EXPENSE_007 in slice 06).
- Remove = soft: `POST /activity/{id}/removal` sets `removed_at` and who; `POST /activity/{id}/undo` clears them. Both are previews first in the UI (cancel changes nothing). Removed rows and replaced originals are listed in a "History" view with Undo only on removed rows.
- Reminders: new table `reminder` (account, kind expense or income, amount, due date, category, entered by, created). Not in `activity`, so Balance, income and spending never see it. Saving a future date through the existing entry forms offers "Save reminder" instead of an error. `GET /reminders` lists them. Turning a reminder into an actual entry is a separate confirmed action and out of scope (the scenarios stop at "awaiting a separately confirmed actual expense"); a Confirm button is not built.
- The server keeps refusing future dates on the entry endpoints (400) and the form calls the reminder endpoint when the date is after today (from `/today`).
- Edit and remove apply to income and expenses alike (one entry service, D-026).
- The "history" in CHECKING_008 shows old amount, new amount, who, time and reason; Edit requires a reason (the scenario gives one); Remove takes an optional reason.

## Task list (approved at checkpoint 1, 2026-10-04)

Each ID is cited only by the commit that makes it fully pass (D-016).

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A edit as replacement: endpoint, review step (old to new), history with old amount, new amount, who, time, reason; works for expense and income; category-only change keeps account, amount, date | `V2_CHECKING_008`, `V2_EXPENSE_006` | API + UI (MSW) + e2e | built, proved |
| B remove and Undo: removal preview and cancel, removal history, merchant-refund / bank-deposit notes, Undo, replaced rows not undoable; also tests for removed rows excluded from Balance, income and spending (owed from 01b) | `V2_EXPENSE_009`, `V2_INCOME_004` | API + UI (MSW) + e2e | built, proved |
| C reminders: `reminder` table (V4 migration), `POST` and `GET /reminders`, "Save reminder" on both forms, reminders list on the account; Balance and month totals unchanged | `V2_EXPENSE_011`, `V2_INCOME_006` | API + UI (MSW) + e2e | built, proved |

Commit order: A, B, C. Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright).

## Data plan

e2e files run in order on one database (`05-edit-remove.spec.ts`, `06-reminders.spec.ts`). Use new accounts opened in the spec so figures are exact; exact household totals stay in API tests on `LedgerApiTestBase`.

## Pre-session housekeeping

Board row 01 corrected, 01b retro row added, three 01b commits pushed (`470021f`).



## Coverage

`npm run coverage -- --require --slice 02`: 6/6 covered. Nothing deferred. No feature file is completed by this slice.

| ID | API | UI (MSW) | e2e |
| --- | --- | --- | --- |
| `V2_CHECKING_008` | `EditEntryApiTests` | `EditEntry.test.tsx` | `05-edit-remove.spec.ts` |
| `V2_EXPENSE_006` | `EditEntryApiTests` | `EditEntry.test.tsx` | `05-edit-remove.spec.ts` |
| `V2_EXPENSE_009` | `RemoveEntryApiTests` | `RemoveEntry.test.tsx` | `05-edit-remove.spec.ts` |
| `V2_INCOME_004` | `RemoveEntryApiTests` | `RemoveEntry.test.tsx` | `05-edit-remove.spec.ts` |
| `V2_EXPENSE_011` | `ReminderApiTests` | `Reminders.test.tsx` | `06-reminders.spec.ts` |
| `V2_INCOME_006` | `ReminderApiTests` | `Reminders.test.tsx` | `06-reminders.spec.ts` |

Also tested: income edit (`EditEntryApiTests`), a replaced row cannot be removed or undone, and removed rows leave Balance, spending and income (`RemoveEntryApiTests`), reminders never reach Balance or totals (`ReminderApiTests`). Mutation check: dropping `removed_at IS NULL` from `ActivityStore.deltaOf` failed 5 tests; restored.

## Open questions

Anything that needs the product owner. Add it to `docs/decisions/questions.md` as well (that is the register the
next session reads), and mark the answer and date in both places when resolved.

## Handoff

- Built: `EntryChangeService` (edit as replacement in one transaction, soft remove, Undo, history), `EntryValidator` (rules shared by entries, replacements and reminders), `ReminderService` plus `V4__reminders.sql`. Endpoints under `/api/v1/accounts/{id}`: `POST activity/{activityId}/replacement`, `.../removal`, `.../undo`, `GET activity/history`, `POST reminders`; `GET /reminders`. UI: Edit and Remove per row, "Show history" with Undo, `ChangeEntry` review (removal and Undo), "Save reminder" when the date is after today, Reminders card on the account page, `EnteredBy` extracted from `AddEntry`.
- Checkpoint 2 review (2026-10-04): fixed panels opening off-screen (`Panel` scrolls and focuses), history overflow (scroll wrapper, fewer columns), who and when for replace, remove and Undo (`activity_event`, V5; history shows "Removed by Sam 2026-10-04 17:50"), one date and amount format, "after removal" labels, nowrap dates and actions. Not changed: the button stays "Save reminder" (the scenarios name it; a Confirm step follows). Reminder edit, remove and mark-paid go to slice 14. Still open, from slice 01a: the "Entering as" header select overflows the page by 3px at 710px wide.
- Replaced rows are marked with `removed_at` too; history tells them apart by a replacement row pointing at them (`status` is effective, replaced or removed). Undo refuses a replaced row (409).
- Deviations from the approved list (feature-local): the removal has no reason field, but who removed it and when is recorded (the scenarios ask for no reason; only the edit takes a reason, optional); Edit does not require a reason because `V2_EXPENSE_006` has no reason step.
- e2e today is fixed to 2026-10-03, so `06-reminders` uses 2026-10-30 as the future date; the API tests use the scenario dates with `clock.setToday(2026-09-10)`.
- Not built (out of scope): turning a reminder into an actual entry; editing or removing a reminder; reminders on the month review. Slice 14 (recurring) will likely need all three.
- Slice 03 owns the as-of Balance query and the backdated overdraft warning; edits and Undo can also overdraw an account with no warning (same advisory-only rule as 01b).
- Watch for: `getByText` on `Amount` figures fails because cents sit in a nested span (use `toHaveTextContent`); mock categories gained Dining (`…0005`).

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session:
- What went well:
- Process change to try:
