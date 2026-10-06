# Slice 15: Property and other assets, dated values

- Slice: 15 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/property/setup.feature` (002 to 006), `accounts/other-assets/setup.feature` (002 to 006), `accounts/lifecycle/dated-values.feature` (002, 004)
- Status: in-progress (checkpoint 1)
- Started: 2026-10-06 17:30 EDT (session clock)  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 15 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Owner answers, 2026-10-06: do group 0 first, with its own commit: (1) a database unique constraint so a schedule cannot have two occurrences for the same due date, with a raw-API test and a race test; (2) a by-name retry after a category rename replays instead of answering 400 (D-049, EntryValidator.parseForReplay). Log the untested inventory cells and the shorter-batch retry in the notes as open; do not fix them. Q-004 stays deferred.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

- Preflight (2026-10-06 17:30): JDK 25 default, Node 26.4, npm 11.17, Docker up; ports 5434, 5180, 8081 held by this project (`wm-backend`, `wm-frontend`); git clean on `main`; v1 (3000) not running, not needed. Majors behind latest (Q-004, stays deferred, not asked): TypeScript 6 to 7, msw 2 to 3, `@types/node` 24 to 26.
- 2026-10-06 Checkpoint 1 answer: task list (groups 0 to 5) and design approved. Q1 yes: minimal planned value (flagged, never counted in Balance, wealth, as-of or the change identity, listed, removable; a test proves the reader excludes it). Q2 yes: 30 days, one named constant, recorded as a decision. Q3 yes: Reschedule and Resume onto a date with a paid or dismissed occurrence are refused 409 with a clear message. Q4 yes: keep group 5; `partial` only if a stop rule hits. Additions: (1) the group 0 migration handles duplicate occurrences already in the dev database, with a test; (2) say what Close means for a valued account, cover archive, close and delete in the inventory, and extend the slice 12 deleted-account sweep test to `account_value`; (3) one identity test: the change components sum to the difference between two as-of wealth figures. One commit per group, local only, no push, no trailer; each new e2e assertion run alone against unfixed code; Cowork count against 8, 8, 5, 5, 5, 7 and 9.
- <date> Checkpoint 2 answer: (pending)

## Scope

All 12 IDs: `@V2_DATED_VALUE_002`, `@V2_DATED_VALUE_004`, `@V2_OTHER_ASSET_002` to `@V2_OTHER_ASSET_006`, `@V2_PROPERTY_002` to `@V2_PROPERTY_006`. `PROPERTY_001` and `OTHER_ASSET_001` (create, edit, Property assets group) belong to slice 18: slice 15 builds account creation because every Given needs it (API setup, D-021) but does not cite 001. `DATED_VALUE_001` and `003` (loans, mortgages) are slice 16.

## Gap analysis

All 12 are citeable now (the map is right): nothing blocks any ID. What exists and what does not:

| Need | Today | Gap |
| --- | --- | --- |
| Account types | `AccountType` has CHECKING, SAVINGS, CREDIT_CARD; `holdsActivity(wire)` is "the enum knows this type" and gates ~10 writers (Entry, Batch, Historical, Movement, MoveTarget, Correction, TransferPreview, Recurring) | Adding PROPERTY and OTHER_ASSET to the enum would make them ledger accounts. The gate must become an explicit set (foundations 5: kind derived from type) |
| Balance | Always `openingAmount + signed activity` (`AccountMapper.balance`, `WealthService.line`, `AccountService` list, `AccountLifecycleService`, `OpeningRevisionService`, ~20 sites) | A valued account's Balance is the latest effective dated value on or before the date (foundations 3). One place decides |
| Dated value | none | New table; save, correct (replacement), remove, Undo, history |
| Wealth as of a date, stale dates | `GET /wealth` is today only; no as-of, no value dates | `GET /wealth?asOf=` with each line's value date; a line is flagged when its value is older than the as-of date by more than its own date shows (rule below) |
| Wealth change explanation | none | `GET /wealth/change?from=&to=` (identity below) |
| Tracking start of a valued account | `OpeningRevisionService` assumes opening plus deltas | Extending history for a valued account (DATED_VALUE_002) turns the old opening into a dated value and moves the opening |
| Future plan (PROPERTY_006) | entries have reminders (P5, `reminder` table); values have none | See question 1 |
| Frontend | `accountTypes.ts` lists Property and Other asset as "(coming soon)" (D-027) | Enable them; value form, history, review, Undo; wealth date chooser and "what changed" |

## Decisions (feature-local until promoted)

1. **A valued account holds no activity.** `AccountType` gets a `kind` (ledger, card, valued) and `holdsActivity` is true for checking, savings and card only. Every money-in, money-out, transfer, correction and reminder writer already refuses a type that does not hold activity; one raw-API test per writer proves property and other asset are refused (checklist: a rule needs a raw-API test).
2. **Dated values, not delta rows.** New table `account_value` (V24): `account_id`, `value_on`, `amount`, `reason`, `entered_by_member_id`, `replaces_id`, `removed_at`, `removed_by_member_id`, `planned` (see question 1), `created_at`, idempotency key. The setup amount stays on the account row as the opening value (D-017). Effective value on date D = the row with the latest `value_on <= D` that is neither removed nor replaced, ties broken by `created_at`; with none, the opening. A delta row would shift every later value when a middle estimate is removed; a value row cannot.
3. **One reader.** A `BalanceReader`-style method on the account side (`valuedBalanceAsOf`) is the only place that applies the strategy; `AccountMapper.balance`, `WealthService`, the list and lifecycle checks call it for a valued type and keep the ledger path for the rest.
4. **Correct = replacement; Remove = soft; Undo = restore** (as entries, D-035, D-044): a correction of an estimate writes a new row with `replaces_id`, the original stays in history with its reason; Remove sets `removed_at`; a repeat Undo is idempotent.
5. **Wealth change identity** (written once, before code): `wealth at end - wealth at start = income - spending + asset value change + corrections + accounts added`, where asset value change is the change of effective value of valued accounts over the period (shown as "value change", never income), corrections are signed correction rows on ledger accounts, accounts added are opening amounts dated inside the period, and transfers and card payments cancel. A balancing line "Other" must be zero; a test asserts the identity. "Shared events counted once" (dividends, fees) is a hook for slice 23, not built.
6. **Stale rule.** A wealth line carries `valueDate` (valued: the date of its effective value; ledger: the as-of date, since activity is continuous). A valued line is flagged "older value date" when `valueDate` is more than 30 days before the as-of date. Owner to confirm (question 2).
7. **Messages** are the scenario strings: "Enter zero or a positive property value", "Enter zero or a positive asset value", "Enter a valid amount". Blank is $0.00 on the setup date with the review sentence "Land will start at $0.00 on that date" and no zero-confirmation step.
8. **DB constraint and reschedule (group 0).** `UNIQUE (schedule_id, due_on)` on `recurring_occurrence`. Reschedule and Resume can move `next_due_on` back to a date that already has a paid or dismissed occurrence, and a Record on it would then violate the constraint. Recommended rule: Reschedule and Resume refuse such a date with 409 ("that occurrence was already paid" or "dismissed") (question 3). A violation of the constraint from a race is mapped to 409, never 500.
9. **By-name retry after a rename (group 0).** `category_event` keeps `oldName` and `newName` per category. In replay mode a name that is no category's current name but is a former name of the stored category resolves to the stored id; a name that is a different existing category still resolves to that category and the existing "same key, different content" 409 applies. Applies to `replayCategory` and `replayPortion`.

9. **Close for a valued account** (owner addition 2): the same rule as every account, Balance exactly zero, read from the effective value. The message tells the person to record a $0.00 value first (a sale or disposal), and a close also refuses while a planned value exists. Archive keeps the value in wealth; delete is refused while the account holds a starting value or any dated value, removed ones included, and works for an unused account with Undo.
10. **One reader (D-050 draft).** A valued account's effective value enters every `opening + delta` reader as a Delta (`ActivityStore.EFFECTIVE_VALUES`), so list, detail, wealth, lifecycle and recurring keep their code; the as-of reader (group 5) reads the same rows by date.

11. **Value rules built** (feature-local): a new value's reason is optional, a correction's is required; the date of a correction may be left out (it keeps the original's); two values on one date are allowed and the later save is the effective one; a value before the account's start is refused with a pointer to the group 4 extension; a plan is dated after today, is never corrected in place (remove and save a new one), is never effective, and blocks Close while it exists; Undo of a value never removed is 409 and a repeat Undo is the same result (D-044); a correction replaces once (`UNIQUE (replaces_id)`) and removing the correction does not revive the original.

12. **Choosers and statements** (found by the advisor before the validator): `usableAccounts` and the Spending account filter leave out a property or other asset (`accountChoice.test.ts`); supporting statements belong to accounts that hold money activity, so a statement save or list on a valued account is 400 (`ValuedSetupApiTests`). No writer stores the kinds `interest` or `fee` today (only the schema and `SIGNED` name them), so the wealth change identity covers every kind that is written; slice 16 adds principal and interest kinds and must grow `WealthStore.flowsBetween` and the identity test with them.
13. **Open, not fixed:** the "Value when tracking began" row an earlier start creates can be removed like any value, which quietly undoes what the review promised (the effective value then falls back to the new opening). Log for a later session.

## Open questions for checkpoint 1

1. **PROPERTY_006 "she can save a future plan".** Build a minimal planned value (saved with `planned = true`, never counted in Balance or wealth, listed under "Planned values", can be removed, not promoted automatically), or defer `PROPERTY_006` whole (D-016) and only refuse a future date with guidance? Recommended: build it (one flag on the same table, about half a group). Also settles `DATED_VALUE_001` for slice 16.
2. **Stale rule:** flag a value older than 30 days before the as-of date? Recommended: yes, as the default until a scenario says otherwise.
3. **Reschedule or Resume onto an already-paid or dismissed date:** refuse with 409 (recommended), or allow and skip the occurrence row?
4. **Size and stop point.** 12 IDs, size L plus group 0. Proposed stop if time runs out: finish groups 0 to 4, mark `partial` with wealth as-of and change explanation (group 5) deferred? Recommended: no, group 5 carries `PROPERTY_003`, `OTHER_ASSET_003` and `DATED_VALUE_002/004` assertions, so keep it in.

## Task list (pending approval at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 (own commit) recurring: unique occurrence per (schedule, due date) with 409 mapping and Reschedule and Resume guard; by-name retry after a category rename replays (`replayCategory`, `replayPortion`) | cites existing `V2_RECURRING_00x` IDs | API (raw-API refusal, `holdUncommitted` race on Record, same-key retry after rename, different-category reuse still 409) | done (V23; `RecurringOccurrenceApiTests`, `ReplayRulesApiTests` 7 and 8; the rename tests seen red without the fix; full backend 520 green; a filtered run of `*Category*` with the recurring classes fails 4 unrelated tests through shared-database order, the full run does not) |
| 1 type model and setup: `AccountType` kinds and explicit `holdsActivity`; V24 `account_value`; create property and other asset (owners, blank is zero, validation); one valued Balance reader; lists, detail and lifecycle checks (delete rule counts values, archive and close) | `V2_PROPERTY_002`, `V2_PROPERTY_004`, `V2_OTHER_ASSET_002`, `V2_OTHER_ASSET_004` | API + UI + e2e; per-writer refusal tests for a valued account | done (V24; `ValuedSetupApiTests`, `ValuedSetup.test.tsx`, `16-valued-assets.spec.ts`; the reminder writer had no type gate, found by the per-writer refusal test and fixed) |
| 2 record and correct an estimate, cancel, future date, repeat confirmation | `V2_PROPERTY_003` (value part), `V2_OTHER_ASSET_003` (value part), `V2_OTHER_ASSET_005`, `V2_PROPERTY_006`, `V2_DATED_VALUE_004` | API (races, same key, retry after change, state matrix) + UI + e2e | done with group 3 in one commit (the two groups share `ValueService` and the UI; `ValueApiTests`, `ValueStateApiTests`, `ValueRaceApiTests` with the account lock and the member share lock planted away and seen red, `DeletedAccountSweepApiTests` extended to the value readers and writers, `Values.test.tsx`, e2e `16-valued-assets`; the review-to-form swap lost focus until the two Panels were keyed, seen red in Vitest) |
| 3 remove an estimate and Undo | `V2_PROPERTY_005` (value part), `V2_OTHER_ASSET_006` | API + UI + e2e | done (with group 2) |
| 4 extend a valued account's tracking start | `V2_DATED_VALUE_002` (history part) | API + UI + e2e | done (`ValueStartApiTests` with the account lock planted away and seen red, `Values.test.tsx`, e2e `Earlier start`; the old opening becomes a value on its own date and `opening_revision` keeps what it replaced) |
| 5 wealth as of a date, stale dates, change explanation; wealth page chooser and "what changed" | completes `V2_PROPERTY_003`, `V2_PROPERTY_005`, `V2_OTHER_ASSET_003`, `V2_DATED_VALUE_002`, `V2_DATED_VALUE_004` | API (identity test) + UI + e2e | done (`WealthAsOfApiTests` with the identity test over four periods and `other` always 0.00, the plan excluded by every reader seen red when planted away, the stale boundary at 30 and 31 days; `WealthOverTime.test.tsx`; e2e `Wealth on a date`) |

An ID is cited only when its last group is green (a split ID is cited by the group that completes it).

### Inventory

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account.type` gate (`holdsActivity`) | EntryService, BatchEntryService, HistoricalEntryService, MovementService, MoveTarget, TransferPreviewService, BalanceCorrectionService, RecurringService, AccountMapper, WealthService (to be confirmed by grep at build) | AccountService create | n/a (a pure rule): raw-API refusal per writer |
| `account_value` (new) | AccountMapper/list, account detail, WealthService (as of), change explanation, AccountLifecycleService (close needs zero, delete needs unused), AccountUsageStore | save, correct, remove, undo, extend-start | one per writer on the account row `FOR UPDATE`; key read under the lock; member `FOR SHARE`; `requireOpen` under the lock |
| `account.opening_amount`, `opened_on` | AccountMapper, WealthService, lifecycle, OpeningRevisionService | OpeningRevisionService (ledger), extend-start (valued) | extend-start vs save-value race |
| `recurring_occurrence` (group 0) | RecurringStore, RecurringService | `addOccurrence` (Record, Dismiss) | two different-key Records for one due date; plant the lock away and the constraint turns it red |
| `category_event` names (group 0) | CategoryStore, CategoryService | rename, merge | n/a (read in replay) |

### Open from slice 14 (logged, not fixed this session, owner 2026-10-06)

- Untested inventory cells: record vs removal of its entry, record held vs archive, category merge; matrix cells archived or closed by deleted and by paused (except Resume); same-key concurrency only for Record.
- A shorter retry of a batch replays.
- Q-004 stays deferred.

## Coverage

(Filled at Prove.)

## Cowork findings

Count against 8, 8, 5, 5, 5, 7 and 9.

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |

## How it works

(Written after Land.)

## Handoff

(Written at Land.)

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session:
- What went well:
- Process change to try:
