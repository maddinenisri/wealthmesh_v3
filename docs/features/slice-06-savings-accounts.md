# Slice 06: Savings accounts

- Slice: 06 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/savings/setup.feature`, `accounts/savings/activity.feature`, `spending/income/record-income.feature`, `spending/expenses/record-expenses.feature`, `household/setup/set-up-household.feature`
- Status: built and committed, not pushed (row turns done when the owner pushes, D-002)
- Started: 2026-10-05  Finished: 2026-10-05  Commit: `4de1712` (five commits from `65acfd8`)

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 06 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

- Scope: EXPENSE_007, HOUSEHOLD_SETUP_004, INCOME_002 and 003, and SAVINGS_001, 003, 004, 008 and 011. It supersedes D-015 under D-019, so savings comes before transfers.
- Retro pattern: the validator found gaps after the build for the fourth session in a row. The same two causes are repeating.
  - Other writers of the same row (a plain expense, Undo, replacement) weren't raced against the new feature.
  - A guard was enforced only in the UI.

  The slice-05 session already added a Build-step rule. I'd tell the slice-06 session to apply it and to run the validator before checkpoint 2.
- Push: five slices are now unpushed. Say when you want them pushed (D-002). The board says "done" means pushed, so the rows will show "not pushed" until then.
```

- 2026-10-05 Checkpoint 1 answer: approved (task list, decisions 1 to 10). Owner: do not hardcode today's value. Code and tests take today from the injected clock / `GET /today` (`MutableClock` in API tests, the `/today` mock in UI tests, the server's today in e2e); no literal dates standing in for "today" in app code, and Given dates in tests are derived from it where the scenario says "today".
- 2026-10-05 Checkpoint 2 answer: owner click-through passed all five paths (savings setup and validation, edit and cancel, Update balance review, interest, move of a $6,000 Salary to savings as Bonus) with every figure matching across account cards, Accounts list, Household card and Spending. Faults found: (1) the move review opened with its top cut off at 710px; (2) Cancel on an entry edit dropped focus to the page body; (3) the moved entry's history note was a ten-line column in the Description cell; (4) the Accounts list and Household card do not show the account type; (5) history tables scroll inside their card at 710px. Owner: fix 1 before commit, 2 and 3 with it.

## Scope

`@V2_EXPENSE_007`, `@V2_HOUSEHOLD_SETUP_004`, `@V2_INCOME_002`, `@V2_INCOME_003`, `@V2_SAVINGS_001`, `@V2_SAVINGS_003`, `@V2_SAVINGS_004`, `@V2_SAVINGS_008`, `@V2_SAVINGS_011`. Capability T1 (savings account). `spending/income/record-income.feature` completes here (sessions 01, 02, 06), so `--require spending/income/record-income.feature` must pass at Prove.

## Gap analysis (2026-10-05)

Preflight: JDK 25, Node 26, Docker, db 5434, backend 8081 and frontend 5180 already up under pm2 (`wm-backend`, `wm-frontend`). Behind latest (not blocking, Q-004 open): `typescript` 6 to 7, `msw` 2 to 3, `@types/node` 24 to 26. Registry checks for react, vite, spring and gradle skipped; no dependency work in this slice.

`npm run coverage -- --slice 06`: 0/9 covered. All 9 are citeable once savings exists and a correction can change an entry's account (needs T1, L3, L4, L5, P1, P2, P4: all built except T1 and the account move).

What exists and what is missing:

- Account type: `AccountType` enum has only `CHECKING`; the database CHECK already allows `savings`; `AccountForms.tsx` lists Savings as "coming soon" (D-027); `api/accounts.ts` types `type: 'checking'`.
- Four writers hard-code `"checking".equals(account.type())`: `EntryService.load`, `HistoricalEntryService.load`, `BalanceCorrectionService.load` (and `EntryChangeService` through them). A savings account is refused 400 today. These are the guards the retro warns about: they live on the server already, so the work is to widen them in one place (an `AccountType` capability, not four string compares).
- Seeded categories (D-020): `Interest` (income) exists. `Bonus` (income) does not, and INCOME_003 corrects Salary to Bonus. `Rent` exists.
- Edit as replacement (`EntryChangeService.replace`, `POST /accounts/{id}/activity/{activityId}/replacement`): the replacement always lands on the same account (`original.accountId`). EXPENSE_007 and INCOME_003 move the entry to another account and show both accounts' Balances and both months' totals before confirm. This is the one real new mechanism of the slice.
- Edit review (`AddEntry.tsx`, `editing`): shows changed fields for one account; no account chooser, no figure for a second account, no month-income figure.

| ID | Has | Needs |
| --- | --- | --- |
| `V2_SAVINGS_001` | account create/list/detail, activity list, actions row | savings type selectable; the detail actions (money in, money out, transfer inactive, Edit account, Update balance) on savings; no income from the opening |
| `V2_SAVINGS_003` | account edit (name, owners, institution) never touches money (B2) | savings accepted by edit; same behaviour |
| `V2_SAVINGS_004` | edit cancel on checking | same on savings |
| `V2_SAVINGS_008` | Update balance review and Cancel on checking (L5) | savings accepted by `BalanceCorrectionService`; "across list, detail and wealth" shows one Balance |
| `V2_SAVINGS_011` | setup validation and Cancel on checking | savings type in the setup form; message and entered fields kept |
| `V2_HOUSEHOLD_SETUP_004` | balance date defaults to today from `/today` | same default on the savings form; saved start date shown; opening not income |
| `V2_INCOME_002` | income entry, Interest category, month income | income on savings; savings detail and the monthly Income view show the dated Interest entry; no correction or spending row |
| `V2_INCOME_003` | edit-as-replacement within one account | Bonus category; move to another account; preview of both Balances and the old and new month Income; Cancel leaves everything; history keeps the original account, details, who, when and reason |
| `V2_EXPENSE_007` | same | same move for an expense with both months' spending and a reason |

## Decisions

Proposed for checkpoint 1 (each is mine until the owner answers):

1. **Which types may carry activity**: one place, `AccountType.holdsActivity()` (checking and savings), used by every writer's `load`. A later type adds itself there. Replaces the four string compares.
2. **Savings is the checking shape** (T1): name, bank, owners (joint allowed, foundations 9), balance and date, same optional balance rule as checking. No interest rate or other field (no scenario asks for one).
3. **Cross-account replacement** (EXPENSE_007, INCOME_003): the replacement request gains `accountId` (omitted means the same account). Both account rows are locked in id order (avoids a deadlock between two opposite moves), the original is marked removed once, the new row lands on the target account. Target must be in the same household, hold activity, and the date must not be before the target's tracking start (D-031, checked on the current row under the lock). Replay by key as today (D-024).
4. **Review figures**: a read-only preview endpoint returns, for the original account and the target, the Balance after, and the month totals before and after for the old and new month. It is informational like D-028; the confirm recomputes under the locks. The confirm returns the entry only; the UI refreshes both accounts from the server.
5. **History across accounts**: the replaced row stays on the original account's history (marked replaced, with who, when, reason); the new row on the target account links back ("Replaced an entry on <account>"). The edit form starts from the current values, shows the original (slice 03 rule), and gets an "Account" chooser limited to accounts that hold activity.
6. **Seed `Bonus`** as an income category (migration, D-020 read-only list).
7. **Wording**: remove "for now / checking only" copy from forms and errors; the type chooser enables Savings (D-027); Credit card and the rest stay "(coming soon)".
8. **Undo and a moved entry** (checked in code): a replaced original cannot be Undone (`clearRemoved` skips a row that has a replacement; the code comment says to edit or remove the replacement instead). Undo and remove of the replacement touch only its own row on the target account, so no cross-account Undo exists and none is added. Remove of the original racing the move is settled by the single-row guard (`removed_at IS NULL`, 409 for the loser); the move still takes both account locks for the date check. The server enforces all of it; the chooser only hides.
9. **History across accounts** (checked in code: `history` selects by `account_id` and joins `replaces_id` as `replaced_by_id` only): the target's history lists the new row with a "Replaced" block carrying the original's account name, date, amount, category, who and when (new fields on `HistoryEntry`); the source's history keeps the original row, status replaced, with who, when, reason and the target account name. The scenarios' "history retains the original account, date, Maya, time and reason" is asserted on the target's history; the source's side is asserted in the API test.
10. **Type gate in the UI too**: `AccountDetailPage` hard-codes "Checking account" (line 53); it, `AccountForms` `TYPES` and the Add-entry/Update-balance copy read the same list (`holdsActivity`) so the server and the UI cannot drift. `ActivityController` only mentions checking in a comment.

## Task list (awaiting approval at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A. Savings type: enum and `holdsActivity`, setup form (type chooser, date default today, invalid Balance keeps the fields, Cancel adds nothing), list and detail, edit and cancel, Update balance review and Cancel | `V2_SAVINGS_001`, `_003`, `_004`, `_008`, `_011`, `V2_HOUSEHOLD_SETUP_004` | API + UI (MSW) + e2e at 710px and 1280px | todo |
| B. Interest income on savings: widen entry writers, Interest entry visible on savings and the monthly Income view, not a correction or spending | `V2_INCOME_002` | API + UI + e2e | todo |
| C. Move an entry to another account: `Bonus` seed, replacement with `accountId`, preview endpoint, review with both accounts and both months, Cancel, history across accounts | `V2_INCOME_003`, `V2_EXPENSE_007` | API (race tests) + UI + e2e at 710px and 1280px | todo |

Build-step rule applied to C (the retro's two causes). Writers of an account row: plain expense/income save, replacement (now two rows), remove, Undo, balance correction, opening revision (start move), historical entry, account edit. Each gets a race test against a cross-account move: an uncommitted write on a second connection that holds the lock, and the test fails when the lock is removed. Server-side guards, not UI-only: target account type, household, start date, removed or already-replaced original (409), same-account omitted `accountId`, key replay with a different target (409). Also a retry-after-the-ledger-changed test and a concurrent-save test for the keyed save. Validator runs before checkpoint 2.

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Every test cites its scenario ID.

## Validator (before checkpoint 2)

Found after the build, again: (1) HIGH, a Balance correction could be moved to another account through the raw API (only the UI prevented it); fixed server-side (400), test `correctionStaysOnItsAccount`. (2) The enterer was checked before the lock: now re-read `FOR SHARE` under the locks (`EntryValidator.memberLocked`), test `inactiveEntererIsCheckedUnderTheLock`. (3) The same key sent twice at once gave 409: the key is now looked up again under the locks and replayed, test `sameKeyAtOnce`. (4) Remove racing a move: test `removeRacesMove`; writer-wait test now requires 200/201. Each new test was shown to fail with its guard removed. Not covered: a target in another household (the household is a singleton, so no second household can exist yet). `npm run check` was not run by the validator (hooks rewrite files); I ran it.

## Coverage

`npm run coverage -- --require --slice 06`: 9/9 covered, none deferred. `--require spending/income/record-income.feature`: 6/6 covered (the file is complete).

| ID | API | UI (MSW) | e2e |
| --- | --- | --- | --- |
| `V2_SAVINGS_001` | `SavingsApiTests` | `SavingsSetup.test.tsx` | `11a-savings.spec.ts` |
| `V2_SAVINGS_003` | `SavingsApiTests` | `SavingsSetup.test.tsx` | `11a-savings.spec.ts` |
| `V2_SAVINGS_004` | (UI only: Cancel makes no request) | `SavingsSetup.test.tsx` | `11a-savings.spec.ts` |
| `V2_SAVINGS_008` | `SavingsApiTests` | `SavingsSetup.test.tsx` | `11a-savings.spec.ts` |
| `V2_SAVINGS_011` | `SavingsApiTests` | `SavingsSetup.test.tsx` | `11a-savings.spec.ts` |
| `V2_HOUSEHOLD_SETUP_004` | `SavingsApiTests` (clock set to 2026-09-05) | `SavingsSetup.test.tsx` (`/today` mock 2026-09-05) | `11a-savings.spec.ts` (default equals `GET /today`) |
| `V2_INCOME_002` | `SavingsApiTests` | `SavingsInterest.test.tsx` | `11a-savings.spec.ts` |
| `V2_INCOME_003` | `MoveEntryApiTests` | `MoveEntry.test.tsx` | `11a-savings.spec.ts` |
| `V2_EXPENSE_007` | `MoveEntryApiTests` | `MoveEntry.test.tsx` | `11a-savings.spec.ts` (710px and 1280px) |

Race tests in `MoveEntryApiTests` (each holds an uncommitted write or lock on a second connection): the move waits for the target's lock and then judges the target's start as it is now; it waits for the source's lock; two moves of one entry at once give one 201 and one 409; opposite moves between two accounts never deadlock (ids locked in order); every other writer of an account row (plain expense, Undo, start move, Balance correction, historical entry) waits for the lock a move holds; a retry after the target's ledger changed replays. Mutation checks done: locking only the source fails the target-start race and the deadlock test; locking source and target without the date check on the target fails the target-start race.

## Checkpoint 2 fixes (2026-10-05)

1 fixed: opening the review brings its heading into view and focuses it (`AddEntry`), asserted at 710px and 1280px in e2e (`toBeInViewport({ ratio: 1 })`, `toBeFocused`; shown to fail without the fix). 2 fixed: `useReturnFocus` returns focus to the button that opened any activity panel (Edit, Add money in/out, Update balance, Remove, Undo) on Cancel or Confirm. 3 fixed: the "Replaced ... on <account>" note is a full-width row under the history row. Open: 4 (the Accounts list and Household card show no account type; may be a product decision for the owner, not a bug) and 5 (history tables scroll inside their card at 710px, pre-existing since slice 02). 3 was fixed in the same pass (see above), so it is logged as fixed, not open.

## Open questions

Filled at checkpoint 1 if the owner raises any. Candidates: should an entry that moves to another account keep its original saved date when the date is not changed (yes, by the scenarios: date is part of the correction), and does a savings account allow a negative Balance warning like checking (same overdraft rule, no new copy).

## Handoff

- Built: savings type (T1) via `AccountType.holdsActivity` (one server gate; frontend `accountTypes.ts` mirrors it by hand, no test ties them); move of an entry to another account (`EntryChangeService.swap` under both account locks, `MoveTarget`, `ReplacementPreviewService`, `GET .../replacement/preview`, `HistoryEntry.replaces/replacedBy`); `Bonus` category (V10); account chooser in the edit form; `MoveFigures` review block; `useReturnFocus`.
- Decisions: D-035. No new questions to the owner except the two logged faults (4, 5).
- Existing screens that changed: the edit form has an Account chooser ("Paid from" / "Received into"); the review shows both Balances and both months; Savings is selectable on Add account and Credit card and the rest stay "coming soon"; history shows where a moved entry went and came from; focus returns to the opener on Cancel.
- Watch for: a transfer (slice 07) and a card (slice 08) will each need `holdsActivity` widened and the frontend list updated together; `11a-savings.spec.ts` must run before `12-members.spec.ts` (12 renames Alex Doe); the key lookup in `swap` happens under the locks, keep it there; any new writer of an activity row must take the account lock (`MoveEntryApiTests.otherWritersTakeTheSameLock` lists the writers) and check its member with `memberLocked`.
- Left for later (open): Accounts list and Household card show no account type (4, possibly a product decision); history table inner scroll at 710px (5); other-household target has no test (singleton household); Q-004 upgrades still open.
- Next: slice 07 (linked transfers and card payments, 13 IDs), which also adds savings-side activity SAVINGS 002, 005 to 007, 009, 010.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator again found gaps after the build (a guard only in the UI: a correction could be moved; an enterer checked before the lock; a keyed retry that raced itself); two e2e failures were my own selectors and a navigation that aborted an in-flight save; the owner found the review's top cut off at 710px.
- What went well: held-lock race tests with mutation checks for each writer, cross-account design settled at checkpoint 1 (locks in id order, history on both sides), every figure matched across surfaces in the owner's click-through.
- Process change to try: for every rule, test the raw API for the forbidden case, not just the UI path; when a panel's content swaps in place (form to review), scroll and focus the new content, not only on mount; an e2e that leaves a page must first wait for the save to finish.

## How it works

Trial of the post-slice walkthrough (read-only agent over `bdb4830..0d2726f`, checked against the code by the builder of
this review: files, test counts, the 404 and 400 rules and the lock order were confirmed; no tests were re-run).

**What the user can do now**

1. Accounts, Add account, choose **Savings** (Credit card, Brokerage, Loan and Mortgage still say "coming soon"). Enter name, bank, owners, Balance and date. A bad Balance keeps what you typed; Cancel adds nothing. The starting amount is not income.
2. Open the account: Money in, Money out, Edit account and Update balance work as on checking. The Update balance review shows the new Balance before you confirm.
3. Add money in with the Interest category: it shows on the savings account and under Spending, Income, as income.
4. Move an entry: Edit it, pick another account in the **Account** chooser. The review shows both Balances and both months' totals. Cancel changes nothing; Confirm needs a reason. History on both accounts shows where it went and where it came from (for example a $6,000 Salary moved to savings as Bonus).

**What changed**

- Database: `V10__bonus_category.sql` adds the income category Bonus.
- API: `AccountType.java` gains SAVINGS and `holdsActivity`; `ActivityController.java` gains `GET /activity/{activityId}/replacement/preview`; the replacement request takes an optional `accountId`; new `MoveTarget.java`, `ReplacementPreviewService.java`; `EntryChangeService.java` updated; history entries carry `replaces` and `replacedBy`.
- UI: `features/accounts/accountTypes.ts`, `AccountForms.tsx`, `AccountDetailPage.tsx`; `features/activity/AddEntry.tsx`, `EntryHistory.tsx`, `MoveFigures.tsx`, `useReturnFocus.ts` (focus returns to the button that opened a panel).
- Tests: `SavingsApiTests` (7), `MoveEntryApiTests` (15), `SavingsSetup.test.tsx`, `MoveEntry.test.tsx`, `SavingsInterest.test.tsx`, `e2e/tests/11a-savings.spec.ts`.

**How a move works**

1. The edit form sends the replacement with a target `accountId` and a save key.
2. `MoveTarget.resolve` checks the target: another household or unknown id is 404; a type that cannot hold activity is 400.
3. The entry is checked as before; a Balance correction cannot move (400).
4. Both account rows are locked, lowest id first, so opposite moves cannot deadlock.
5. Under the locks: replay the result if the key already finished; re-check who entered it; check the date against the target's tracking start; mark the original replaced exactly once (the loser of a race gets 409).
6. The new entry is written on the target in the same transaction; the UI reloads both accounts.

The one server gate for "can this account hold activity" is `AccountType.holdsActivity`, used by the entry, historical-entry and balance-correction writers and by `MoveTarget`. The UI list in `accountTypes.ts` mirrors it by hand.

**Decisions and open items:** D-035 (savings has the checking shape; one server gate; moves lock both accounts; history shows both sides). Open: no account type in the Accounts list or Household card (product decision); history tables scroll inside their card at 710px (since slice 02); no test for a target in another household (the household is a singleton); Q-004 upgrades.

**How to verify:** `npm run coverage -- --require --slice 06`, `npm test`, `npm run e2e`, `npm run check`. Screens: Add account (Savings); savings detail (Edit, Update balance, Interest); an entry's Edit, then the move review and both histories; Accounts list, Household card and Spending (figures agree).
