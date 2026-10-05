# Slice 04: starting-balance recovery, tracking start, statements

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: 04 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/checking/setup.feature`, `accounts/checking/activity.feature`, `household/journeys/manage-household-finances.feature`, `household/history/manage-supporting-records.feature`, `household/overview/understand-wealth.feature`
- Status: done (3 of 5 IDs; `V2_CHECKING_006` and `V2_WEALTH_005` deferred, Q-030)
- Started: 2026-10-04 19:53  Finished: 2026-10-04  Commit: `3c63dd0` (pushed)

## Prompts and directions

Paste, verbatim, the kickoff prompt that started this session (see `docs/process/prompts.md`, note its version), then
add each instruction or answer the product owner gave at a checkpoint, with the date. No transcripts, no secrets.

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 04 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

Owner's extra directions: scope CHECKING_006 and 016, JOURNEY_004, SUPPORTING_RECORD_003, WEALTH_005; adds L8, L9, P6; resolves deferred CHECKING_006. Slice 04 alone adds 3 capabilities, so it runs by itself; merging slice 05 (3 IDs, 8 total) only if the owner asks.
- <date> Checkpoint 1 answer:
- <date> Checkpoint 2 answer:

- 2026-10-04 Checkpoint 1 answer: Q-027 no (no seed for a legacy file). Group D dropped; slice shrinks to 3 IDs; `opening_amount` stays NOT NULL; decisions 4 and 6 not needed. CHECKING_006 and WEALTH_005 deferred (Q-030). Q-028 and Q-029 taken as recommended (metadata statements; pre-start Update balance routes to the review).

## Scope

In this session: `@V2_CHECKING_016`, `@V2_JOURNEY_004`, `@V2_SUPPORTING_RECORD_003`. Deferred whole (D-016): `@V2_CHECKING_006`, `@V2_WEALTH_005`. Capabilities: L8 tracking-start review, L9 starting-balance recovery, P6 supporting statements. Preflight 2026-10-04: JDK 25, docker, db 5434, `wm-backend` 8081, `wm-frontend` 5180 up; git clean; typescript 7, msw 3 and @types/node 26 are majors behind (Q-004 still open, kept).

## Gap analysis (2026-10-04)

Have: opening amount and date on the account row (D-017, `opening_amount NOT NULL`); Balance as of a date, correction preview and save, replacement, idempotent saves, history with an Initial Balance row (slice 03); entry date before `opened_on` is refused in `EntryValidator`; the Update balance form (new correction only).

Missing:
- `opening_amount` is NOT NULL, so no account can show "Starting balance needed" (006, WEALTH_005); wealth, list, detail and as-of all assume a number.
- No way to change the opening amount or date, and no record of the earlier one (JOURNEY_004 and 016: "original zero starting amount and its correction remain in history").
- A dated-before-start expense is refused outright; 016 needs a reviewed path that moves the start and saves the expense with it, once.
- No statement record at all (006 attaches one, 003 revises and cancels).
- Update balance has no "correct the starting balance" choice.
- **Blocker for 006 and WEALTH_005:** "a file saved by an older application version" cannot be produced through the app, and D-021 forbids direct database seeding. See question 1.

All 5 are citeable once L8, L9 and P6 exist, apart from that Given.

## Decisions (proposed, for approval)

1. Opening revisions: new table `opening_revision` keeps each earlier (amount, opened_on) with reason, entered-by, time and a link to what replaced it. The account row stays the current opening (D-017). History shows Initial Balance, then "Starting balance corrected" rows. Balance is still opening plus signed activity; a correction here is never income or spending.
2. One review for starting-balance changes (amount and date): shows original, corrected, date, Balance before and after, and for 006 the difference to review against the statement. Confirm posts with an idempotency key; save locks the account row and computes the figures at save time (D-028 pattern).
3. Tracking-start review (016): saving an expense dated before `opened_on` is refused by the plain entry save (400); the UI sends it to the review from the account's current start, and Maya chooses the new start and initial Balance; the review shows the expense, new start date, initial Balance (entered by Maya) and resulting Balance, then one confirm saves the opening revision and the expense in one transaction.
4. (dropped with group D) `opening_amount` stays NOT NULL.
6. Update balance dated before the start (refused in slice 03) routes to the same review now that it exists (confirm at checkpoint 1).
7. (dropped with group D: legacy seed and statement-vs-balance comparison)
5. Statements: a record (statement date, balance shown, note), optional, never part of Balance or wealth. Attach, revise (the new version becomes latest, the original stays linked), remove and Undo, using the slice 02 replacement and soft-remove mechanics. Revision is a review with Cancel that saves nothing (003). No file upload in this slice. Only 003 cites statements here (001 is slice 08, 002 slice 19): attach and revise with confirm and cancel are built; **remove and Undo are not built here and move to slice 19** (002).


Choices made that the feature file does not settle, each with the reason. Keep feature-local choices here; promote
a choice to `docs/decisions/decisions.md` only when other features will rely on it. Foundation rules live in
`docs/guides/domain-foundations.md`; do not restate them, only link.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A statements (races: concurrent revise, retry after change): attach, revise as a reviewed replacement, cancel saves nothing, remove, Undo | `V2_SUPPORTING_RECORD_003` | unit + API + UI (MSW) + e2e | todo |
| B correct the starting balance (races: concurrent and retried correction): Update balance choice, review (original, corrected, date, Balance before and after), history of the original and its correction, salary and rent unchanged, no new income | `V2_JOURNEY_004` | API + UI (MSW) + e2e | todo |
| C tracking-start review (races: one transaction for start move + expense, concurrent and retried confirm; no `@Transactional` self-call): expense dated before the start asks for reviewed history; preview; one confirm saves start move and expense; previous start stays in history | `V2_CHECKING_016` | API + UI (MSW) + e2e | todo |
| ~~D~~ dropped: `V2_CHECKING_006`, `V2_WEALTH_005` deferred (Q-030) | - | - | deferred |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

## Coverage

`npm run coverage -- --require --slice 04`: 3/5 covered, 2 deferred (`V2_CHECKING_006`, `V2_WEALTH_005`, Q-030). No feature file is completed by this slice.

| ID | API | UI (MSW) | e2e |
| --- | --- | --- | --- |
| `V2_SUPPORTING_RECORD_003` | `StatementApiTests` | `Statements.test.tsx` | `08-statements.spec.ts` |
| `V2_JOURNEY_004` | `StartingBalanceApiTests` | `StartingBalance.test.tsx` | `09-starting-balance.spec.ts` |
| `V2_CHECKING_016` | `HistoricalEntryApiTests` | `HistoricalEntry.test.tsx` | `10-tracking-start.spec.ts` |

Also tested: retry after the ledger changed and concurrent saves for all three keyed saves (same key twice gives 201 and 200; two keys apply one after the other with a clean previous-amount chain; two revisions of one statement give 201 and 409); all-or-nothing for the combined save (invalid expense or a start after the entry leaves neither). Mutation checks: Cancel in the statement review saving the revision failed the cancel test; removing the account lock failed the starting-balance concurrency test; removing the transaction failed the atomic and concurrent historical tests. The ordering bug (equal timestamps under the fixed test clock) was found by the starting-balance test and fixed with a `seq` column.

Validator (2026-10-04) found three bugs after the build, all fixed with tests in `StartMoveGuardApiTests`: the combined save accepted any ledger kind (a refund or correction added money instead of spending it); a plain expense, a replacement or an Undo could land dated before a start that moved at the same time (the plain save and the replacement now lock the account row and read it again; Undo is refused with 409 when the entry predates the current start); the same statement key sent twice at once returned 409 instead of replaying (statement saves now lock the account). Also fixed: history showed the corrected opening as the original while corrections loaded; the combined save now expires its key in `opening_revision` too. Risks left as they are: an earlier dated correction's stored requested Balance no longer matches the Balance on its date after the opening changes (consistent with the amount being computed from the opening); the account row is overwritten in place with the replaced values kept in `opening_revision`; amounts accept a negative starting balance as account setup already does.

Checkpoint 2 (owner's click-through, 2026-10-04): all four paths passed with no off-screen panel, no sideways scroll at 710px or 1280px and matching figures. Fixed from the findings: a visible note when Update balance flips to the starting-balance form; "Replaced by <name> <time>" on replaced starting rows; "Tracking start moved (from <date>)" for a correction that moves the date; the reason shown on the "Review setup and expense" screen; the mode choice locked while a review shows. Not changed (owner to decide): flag a statement that differs from the calculated Balance on its date; a Review step before attaching a statement. Layout left for later: at 710px the history table still scrolls inside its card and the Activity table is 7px too wide (from slice 03).

## Open questions

1. Q-027 resolved no. Q-030 (statement import, post-MVP) is the feature that may later create such an account.
2. Statement shape: metadata record without a file upload (recommended), or real file storage.
3. Keep slice 04 alone (recommended) or merge slice 05.

## Handoff

- Built: `statement/` (attach, revise, list; V7), `opening/` (`OpeningRevisionService`, preview, save, list; V8), `HistoricalEntryService` and `POST /accounts/{id}/historical-entries`; UI: `StatementsCard`/`StatementForm`, `UpdateBalance` (choice), `StartingBalanceCorrection`, `HistoricalSetup`, history rows for the original start, corrections and "Tracking start moved". `EntryService`, `EntryChangeService` and `BalanceCorrectionService` now lock the account row and read it again.
- Decisions: D-030, D-031, D-032. Open: Q-031 (stored requested Balance of an older correction after the opening changes), Q-030 (statement import, post-MVP, the feature that may create accounts without an opening).
- Deferred whole: `V2_CHECKING_006` (the legacy-file Given cannot be created through the app; D-021 stands, Q-027) and `V2_WEALTH_005`. `opening_amount` stays NOT NULL.
- Left for later: statement remove and Undo (slice 19, SUPPORTING_RECORD_002); flag a statement that differs from the calculated Balance on its date, and a Review step before attaching one (owner to decide); at 710px the history table scrolls inside its card and the Activity table is 7px too wide; annual estimate counts a lone early month as a recorded month.
- Watch for: statement and opening-revision lists order by a `seq` column because test-clock timestamps tie; a writer of the account's entries must lock the account row (`ActivityStore.lockAccount`) and check the date on the current row; the combined save expires its key in both `activity` and `opening_revision`.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator found races after the build a third time, this time between a new capability (start move) and other writers of the same row; a saved kind was unchecked; I skipped the 710px and 1280px Playwright check until the commit.
- What went well: tests first on all three groups, mutation checks that failed the right tests, the owner's click-through found only wording and display gaps (five fixed the same day).
- Process change to try: when a capability changes a row that other saves read, list every writer of that row and race each against it (added to the Build step).
