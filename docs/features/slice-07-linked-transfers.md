# Slice 07: Linked transfers and card-ready movements

- Slice: 07 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/checking/transfers.feature`, `accounts/checking/activity.feature`, `accounts/savings/activity.feature`, `accounts/savings/setup.feature`, `spending/expenses/record-expenses.feature`, `household/journeys/manage-household-finances.feature`
- Status: built and committed, not pushed (row turns done when the owner pushes, D-002). Cowork checks 4 to 6 and the whole 1280px pass were not reached (connection lost; owner confirmed no further pass)
- Started: 2026-10-05  Finished: 2026-10-05  Commit: `c0f4ea0` (five commits from `b2c7cf6`)

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 07 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

- Scope: CHECKING_007 and 010, EXPENSE_008, JOURNEY_002, SAVINGS_002, 005, 006, 007, 009 and 010, and TRANSFER_001, 002 and 003.
- Why it's the real test of the new process: a transfer writes to two accounts at once, so it is the strongest case for the checkpoint-1 inventory and the race tests. Expect the validator to look hard at lock order and at replay of a repeated save.
- Things to watch:
  - Foundations section 7 says transfers and card payments share one linked-movement mechanism. Card payments themselves arrive in slice 08, so this slice should leave the mechanism ready for them.
  - Transfers must never count as income or spending (the slice 01 note about kinds that stay out of spending).
  - The move-entry guard holdsActivity should be reused.
- Open product decision: Q (issue 4), showing the account type in the Accounts list and Household card. The checklist will flag it for this slice. Tell me yes or no and I'll relay it.
- Walkthrough: when it lands, ask me to run the walkthrough agent over the slice's commit range. Or let that session run it, since it is now in Land.
```

- 2026-10-05 Checkpoint 1 answer: approved (task list, decisions 1 to 12, defer SAVINGS_005). Q-033: owner asked for yes/no; my answer yes, relayed by owner later.
- 2026-10-05 Checkpoint 2 answer: Cowork pass at 710px reached checks 1, 2 and most of 3 (Undo review shown, not confirmed); everything reached passed. Findings: (1) page stays scrolled down after confirming a transfer, new row out of view; (2) edit accepted a blank Reason; (3) history tables scroll inside their card at 710px. Not checked: change an expense to a transfer, Spending account filter, account type on Accounts list and Household card, all of 1280px. Owner confirmed this is the whole Cowork response: no further pass will come, so those items rest on the e2e tests at 710px and 1280px only.

## Scope

`@V2_CHECKING_007`, `@V2_CHECKING_010`, `@V2_EXPENSE_008`, `@V2_JOURNEY_002`, `@V2_SAVINGS_002`, `@V2_SAVINGS_005`, `@V2_SAVINGS_006`, `@V2_SAVINGS_007`, `@V2_SAVINGS_009`, `@V2_SAVINGS_010`, `@V2_TRANSFER_001`, `@V2_TRANSFER_002`, `@V2_TRANSFER_003`. Capability L6 (linked movement). Completes `accounts/checking/transfers.feature` (3), `accounts/savings/activity.feature` and `accounts/savings/setup.feature`.

## Gap analysis (2026-10-05)

Preflight: JDK 25, Node 26, Docker, db 5434, backend 8081 and frontend 5180 up under pm2 (`wm-backend`, `wm-frontend`); git clean on `main`. Registry checks skipped (no dependency work; Q-004 still open).

12 of 13 citeable now. `V2_SAVINGS_005` is blocked: its Given is "a household file saved by an older application version" with an account whose initial amount is unknown and "Starting balance needed" shown. No feature can create an account with no opening amount, and Q-027 said no throwaway seed. Same blocker as `V2_CHECKING_006` and `V2_WEALTH_005` (Q-030). Proposed: defer whole in `deferred.txt` (D-016).

What exists (grep, not memory):

- `activity.kind` already allows `transfer_in`, `transfer_out`; `movement_id` column exists (no index); `ActivityStore.SIGNED` already signs `transfer_in` as plus and every other non-credit kind as minus, so Balance sums handle both sides.
- Income and spending sums (`monthTotal`, `totalsByCategory`, `spendingByMonth`, `monthEntries`) filter by `kind = 'income'/'expense'`, so a transfer is excluded structurally. Needs tests, not code.
- `forAccount` (activity list) selects all kinds, so a transfer row would show but with no label, and Edit/Remove would hit per-row endpoints. `history` selects only expense, income, correction.
- Per-row endpoints (`replacement`, `removal`, `undo`, `replacement/preview`) load the original with a filter on kind expense/income (correction for balance corrections), so a transfer row is 404 today. That is the guard that keeps a transfer from changing one side only; it gets a raw-API test.
- Detail page shows a disabled "Add transfer" button and the text "Transfers become available with a later feature" (`AccountDetailPage.tsx`).
- No account filter on Spending (`SpendingController`, `SpendingPage`): `V2_SAVINGS_007` says "excluded even when only savings is selected".
- `AccountResponse` already carries `type`; `AccountsPage` and the Household card do not show it.

| ID | Has | Needs |
| --- | --- | --- |
| `V2_TRANSFER_001` | replacement mechanism, locks, key replay (slice 02, 06) | edit of a pair: new amount, date, either account; preview of three Balances; history keeps the original |
| `V2_TRANSFER_002` | soft remove and Undo per row | remove and Undo as one pair; history shows who removed |
| `V2_TRANSFER_003` | form errors keep entered values | same-account refusal ("Choose a different account"), Cancel of the edit review |
| `V2_CHECKING_010` | review panel pattern | transfer review (names, amount, date), Cancel saves nothing |
| `V2_CHECKING_007` | income, expense, month summary | transfer in the same flow; activity list label; month figures |
| `V2_SAVINGS_002` | blank/0.00 savings setup (slice 06) | transfer from checking; no income or spending |
| `V2_SAVINGS_006` | interest income (slice 06) | transfers both ways; household Income 25.00, spending 0.00 |
| `V2_SAVINGS_007` | nothing | open a transfer from either account, link to the other account's activity, Spending account filter |
| `V2_SAVINGS_009` | Update balance review (slice 06) | transfer rows in history beside initial amount and correction |
| `V2_SAVINGS_010` | nothing | same-account refusal on create keeps amount and date; Cancel saves nothing |
| `V2_EXPENSE_008` | expense replacement | convert an expense to a transfer: preview (Balances, spending 0.00), reason, history of the expense |
| `V2_JOURNEY_002` | setup, edit name, salary, expense, month review | the transfer step; clock moving from Sept 1 to Sept 7 (API test with `MutableClock`) |
| `V2_SAVINGS_005` | none | blocked (see above) |

## Decisions (proposed; mine until the owner answers)

1. **One movement service, transfer kind only for now.** `MovementService` takes a `MovementKind` (out-kind, in-kind); `TRANSFER` = `transfer_out`/`transfer_in`. Slice 08 adds `CARD_PAYMENT` as a second constant; nothing in create, replace, remove, Undo, preview or lock order is transfer-specific. Endpoints under `/api/v1/transfers`; slice 08 decides its own path or generalises it.
2. **Pair shape.** Two `activity` rows sharing one `movement_id` (foundations 7), written in one transaction. The save key sits on the `transfer_out` row only (`idempotency_key` is unique). New migration: index on `movement_id` and a partial unique index on `(movement_id, kind) WHERE removed_at IS NULL`, so the database also refuses a second live row of one side.
3. **Lock order.** Every movement writer locks all accounts it touches, lowest id first (the S06 `lockBoth`, widened to a list), then re-reads the rows under the locks. The member is checked with `memberLocked` after the locks.
4. **Edit of a transfer is a replacement pair.** The old pair is marked replaced (both rows `removed_at`), a new pair with a new `movement_id` is written; each new row has `replaces_id` pointing to the old row of the same side. History therefore needs no new table: it reuses the `replaces`/`replacedBy` shape of S06, which already crosses accounts. Replaced pairs cannot be Undone (same rule as entries).
5. **Remove and Undo act on the pair** (`POST /transfers/{movementId}/removal` and `/undo`). A removed pair that was replaced cannot be Undone. Undo checks both accounts' tracking start under the locks. Per-row endpoints keep refusing transfer rows.
6. **Convert an expense to a transfer** (EXPENSE_008): `POST /accounts/{id}/activity/{activityId}/transfer`, same account stays the source, destination in the body, reason required. The expense is marked replaced; the new `transfer_out` row carries `replaces_id` to the expense; the `transfer_in` row has none. Expenses only; converting income is refused (400), no scenario asks for it.
7. **Rules enforced in the server, each with a raw-API test:** different accounts ("Choose a different account"); both accounts hold activity (`AccountType.holdsActivity`, reused); same household (404 for another); date not after today and not before either account's tracking start (400; no historical-entry path for transfers); active member under the lock; amount > 0.
8. **Overdraft** follows the entry rule: a transfer may take a Balance negative and the review shows the existing overdraft warning (D-022, Q-026). No new copy.
9. **Review figures.** `GET /transfers/preview` (new transfer, or `movementId` for an edit, or expense id for a conversion) returns each affected account's name and Balance after, and the month spending after. Informational like D-028; the save recomputes under the locks.
10. **Spending account filter.** `GET /spending/...` takes an optional `accountId`; the Spending page gets an "Account" chooser (default "All accounts"). Transfers stay out in every case (kinds), so `V2_SAVINGS_007` has a real reader to assert on.
11. **Open decision Q (issue 4): show the account type in the Accounts list and Household card.** Recommend **yes**, in this slice: the transfer account choosers list several accounts of two types, and the build checklist already requires anything that tells accounts apart to show in the lists. Small, no scenario ID. Needs the owner's yes or no.
12. **`V2_SAVINGS_005` deferred whole** (Q-027, Q-030).

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A. Create a transfer: `MovementService` (create), migration, endpoint, key replay, rules (decision 7), transfer button live on checking and savings, review (names, amount, date, Balances after), Cancel, same-account error keeps entered values, activity list label, account type in lists (decision 11) | `V2_CHECKING_010`, `V2_SAVINGS_010`, `V2_SAVINGS_002` | API + UI (MSW) + e2e at 710px and 1280px | todo |
| B. Transfers in the money picture: not income or spending (kinds), month summary, Spending account filter, open both sides, history lists transfers, Balance correction beside a transfer | `V2_CHECKING_007`, `V2_SAVINGS_006`, `V2_SAVINGS_007`, `V2_SAVINGS_009` | API + UI + e2e | todo |
| C. Change a transfer: edit pair (preview of three Balances), Cancel, same-account refusal on edit, remove and Undo as a pair, history on both accounts | `V2_TRANSFER_001`, `_002`, `_003` | API (race tests) + UI + e2e at 710px and 1280px | todo |
| D. Convert an expense to a transfer | `V2_EXPENSE_008` | API (race tests) + UI + e2e | todo |
| E. Journey: no accounts to salary, transfer and expense across September 1 to 7 | `V2_JOURNEY_002` | API with `MutableClock` + e2e | todo |
| Deferred | `V2_SAVINGS_005` | none | `deferred.txt` after approval |

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep of `backend/src/main` for `activity` SQL, `lockAccount`, `.kind()`):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account` row lock (both sides of a movement) | all writers below | `ActivityStore.lockAccount` callers: `EntryService.record`, `EntryChangeService` (undo via `lockedStart`, `swap`; plain remove takes no lock, its conditional UPDATE `removed_at IS NULL` settles the race), `HistoricalEntryService`, `BalanceCorrectionService`, `OpeningRevisionService`, `StatementService`, `AccountService` (edit), new `MovementService` | each writer waits behind a held movement lock and the movement waits behind each writer, on two accounts, both directions (`holdUncommitted`); fails if the lock is removed |
| `activity` rows, kinds `transfer_in`/`transfer_out`, `movement_id` | `SIGNED` Balance sums: `deltasByAccount`, `deltaOf`, `changeUpTo`; `earliestOf` (feeds the start-move guard in `OpeningRevisionService`); `forAccount`; `history`; wealth/account Balance via deltas | new `MovementService` only | transfer date earlier than a start move is refused; transfer after a start move is refused |
| Income and spending totals | `monthTotal`, `totalsByCategory`, `spendingByMonth`, `monthEntries`, `SpendingService`, month review | none (read by kind) | assert 0.00 income/spending after create, edit, remove, Undo, convert, for all accounts and one account |
| Replace/remove/undo state of a row (`removed_at`, `replaces_id`) | `history` (status, `replaces`, `replacedBy`), `clearRemoved`, `ReplacementPreviewService` | `markRemoved`, `clearRemoved` via `EntryChangeService` and `MovementService` | remove vs replace of one pair: one 200, one 409; two Undo at once: one wins; Undo of a replaced pair refused |
| Per-row entry endpoints (`replacement`, `removal`, `undo`, `replacement/preview`) | `EntryChangeService.original` (kind filter) | n/a | raw API: each returns 404 for a transfer row |
| Expense row converted to a transfer | `history`, month spending, `ReplacementPreviewService` | `MovementService.convert` | convert vs edit of the same expense: one wins; convert vs remove of it; convert vs a start move on the source account |
| Save key (`idempotency_key`) | `findByIdempotencyKeyAndCreatedAtAfter` in each save path | create, replace, convert | same key twice at once: one pair, second replays; same key different body: 409; retry after the ledger changed replays the stored pair |
| Household member state (entered-by) | `EntryValidator.member`, `memberLocked` | member writes | deactivate during a transfer save: refused under the lock |
| Spending query account filter (new reader) | `SpendingController`, `SpendingService`, `ActivityStore` | none | filtered to one account still excludes a transfer; another household's account id is 404 |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Every test cites its scenario ID.

## Coverage

`npm run coverage -- --require --slice 07`: 12/13 covered, 1 deferred (`V2_SAVINGS_005`, Q-030). `--require` passes for `accounts/checking/transfers.feature` (3/3), `accounts/savings/activity.feature` (5/5) and `accounts/savings/setup.feature` (5/6, one deferred).

| ID | API | UI (MSW) | e2e |
| --- | --- | --- | --- |
| `V2_CHECKING_010` | `TransferApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` (710px and 1280px) |
| `V2_SAVINGS_010` | `TransferApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` (710px and 1280px) |
| `V2_SAVINGS_002` | `TransferApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` |
| `V2_CHECKING_007` | `TransferApiTests` | | `11b-transfers.spec.ts` |
| `V2_SAVINGS_006` | `TransferApiTests` | | |
| `V2_SAVINGS_007` | `TransferApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` |
| `V2_SAVINGS_009` | `TransferApiTests` | | |
| `V2_TRANSFER_001` | `TransferApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` (710px and 1280px) |
| `V2_TRANSFER_002` | `TransferApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` |
| `V2_TRANSFER_003` | `TransferApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` |
| `V2_EXPENSE_008` | `TransferConversionApiTests` | `Transfer.test.tsx` | `11b-transfers.spec.ts` (710px and 1280px) |
| `V2_JOURNEY_002` | `HouseholdJourneyApiTests` (clock moves from 2026-09-01 to 09-07) | | none (see deviations) |
| `V2_SAVINGS_005` | deferred | | |

Race tests (`TransferRaceApiTests`, each holds a lock or an uncommitted write on a second connection): create, change, removal, Undo and conversion wait for the lock on each account they touch; the date is judged against a start that moved while waiting (create, change, convert); a member deactivated while waiting is refused; opposite and circular transfers never deadlock (fails when `.sorted()` is removed); same key at once gives 201 and 200 for create, change and convert; retry after the ledger changed and the member left replays; two removals, two Undos and a removal against a change give one winner; conversion against an edit or removal of the expense gives one winner; a start-date move against a transfer never leaves a transfer before the start. With `lockAccounts` emptied 7 of the 11 race tests fail (the rest are held by the foreign-key share lock or the member lock, which still wait); with `.sorted()` removed the deadlock test fails.

Deviations from the approved plan: (1) `V2_JOURNEY_002` has no e2e, because e2e runs on a fixed today of 2026-10-03 and the scenario moves the date from September 1 to 7; the API test moves the clock. (2) `V2_CHECKING_007` and `V2_SAVINGS_006`, `V2_SAVINGS_009` are API-level only beyond the shared transfer UI; the UI path they add (Salary, Rent, Interest, Update balance) is already covered by slices 01 to 06. (3) The activity list orders rows by date then time; under the test clock all rows share one instant, so tests find history rows by filter, not by position.

## Open questions

- Q-033 (new): show the account type in the Accounts list and Household card? Recommended yes, in this slice (decision 11).

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |
| 1 | Add transfer, confirm (710px) | Fixed | The page stayed scrolled to the button; the new row at the top of Activity was out of view | `11b-transfers.spec.ts`: after Confirm the Activity heading is fully in view, with 12 earlier rows so the table is long. It failed before the fix (ratio 0). Fix: `AccountDetailPage.closeTransfer` scrolls to the table after a save |
| 2 | Edit transfer | Kept as is | A blank Reason is accepted on an edit | none: the reason is optional on every edit of an entry (slice 02 onward); only the change of an expense to a transfer requires one, as the scenario says. Owner may overrule |
| 3 | Show history (710px) | Open, known | History tables scroll inside their card (644px in a 620px card) | none: same open item as slice 06 finding 5, not caused by this slice |
| 4 to 6, 1280px | Not reached | Pending | Change an expense to a transfer, Spending account filter, account type in lists, the whole 1280px pass | covered by e2e at 710px and 1280px, not yet by the owner's eyes |

## How it works

Written by a read-only agent over `e7f2fd7..HEAD`; the builder checked its claims against `MovementService.java` and `MovementStore.java` (lock order, key replay before member and date checks, household 404, the date rules). It did not open the UI files or run anything.

**What the user can do now**

1. On a checking or savings account, Add transfer to another account, review it (both Balances after), then confirm or cancel.
2. The same account in From and To shows "Choose a different account"; what was typed stays.
3. Edit a transfer's amount, date or either account, with a review of every Balance affected. Remove it and Undo it; both sides move together.
4. Edit an expense and choose Change to transfer: pick the destination, review, give a reason. The expense stays in history.
5. Spending has an Account chooser. A transfer is never income or spending, for all accounts or for one.
6. The Accounts list and Household card show each account's type (Q-033, built on a recommended yes).

**What changed**

- Database: `V11__linked_movements.sql` (transfer rows need a `movement_id`; one live row per side of a movement).
- API: `TransferController.java` (`/api/v1/transfers`: create, get, preview, replacement, removal, undo; conversion at `/accounts/{id}/activity/{activityId}/transfer`), `MovementService.java`, `MovementStore.java`, `TransferPreviewService.java`; `SpendingController.java` and `IncomeController.java` take `accountId`.
- UI: `frontend/src/features/transfers/*`, `AccountDetailPage.tsx`, `ActivityList.tsx`, `EntryHistory.tsx`, `SpendingPage.tsx`, `AccountsPage.tsx`, `HouseholdPage.tsx`.

**How a transfer is saved**

1. The server needs a save key, two different accounts and a valid amount.
2. Both accounts must exist, share a household (another household's is 404) and hold activity.
3. It locks both accounts, lowest id first, so opposite transfers cannot deadlock.
4. Under the locks a repeated key replays the stored transfer (200); otherwise it checks the member (`FOR SHARE`) and the date (not in the future, not before either account's start).
5. It writes `transfer_out` and `transfer_in` with one `movement_id` in one transaction (201).

An edit marks the old pair replaced and writes a new pair that points back at it; remove and Undo act on both rows and answer 409 if the pair was already changed; Undo re-checks both accounts' start dates; a replaced pair cannot be Undone. Converting an expense needs a reason and works for expenses only.

**Decisions and open items:** D-036 (one mechanism, `MovementKind` seam for card payments), D-037 (Spending account filter). `V2_SAVINGS_005` is deferred (Q-030). Open: Q-033, history tables scrolling inside their card at 710px, Cowork checks 4 to 6 and 1280px.

**How to verify:** `npm run coverage -- --require --slice 07`, `npm test`, `npm run e2e`, `npm run lint`, `npm run check`; by hand at 710px and 1280px: add, edit, remove, Undo, change an expense, the Spending Account chooser.

## Handoff

- Built: `MovementService` (create, replace, remove, Undo, convert from an expense) over `MovementStore`; `TransferPreviewService`; `TransferController`; V11 (transfer rows need a movement id, one live row per side); account filter on Spending, income and the month review; account type in the Accounts list and Household card (pending Q-033); `features/transfers/*`.
- Slice 08 (card payments): add a `MovementKind` constant (the card side's kind is not fixed in foundations 7), widen `AccountType.holdsActivity` and `accountTypes.ts` together, and note `MovementService.legs` now returns 404 for a movement whose rows are not a `transfer_out`/`transfer_in` pair, so a card movement needs its own kind check there. `EntryChangeService.original` already refuses every kind but expense, income and correction.
- Watch for: a transfer writes two rows with the same `created_at`, so anything that orders history by time alone is unstable (tests find rows by filter). `mockApi.ts` replays 200 on a reused key with a different body; the server returns 409. Convert in the mock does not refuse income or a removed expense.
- Left open: Q-033 (type in lists, built on a recommended yes), history tables scrolling inside their card at 710px, no test for a transfer into another household (single household), Q-004.
- Next: slice 08 (credit cards).

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator again found gaps after the build (sixth session), though fewer and none that corrupt data: the member-row lock was never proven by a test (the race tests held the account lock too), a reused key with another reason replayed instead of 409, tests without scenario IDs, long DisplayName lines failing Checkstyle only at lint, and a Cowork scroll fault my e2e could not reproduce on a short table.
- What went well: the checkpoint-1 inventory named every writer and reader, no defect corrupted data, lock order and replay were sound, and mutation runs showed which tests really depend on each lock.
- Process change to try: a race test for a row lock holds only that row, not the account too; a layout e2e seeds a long list before it asserts a position; scenario IDs are checked in titles of every new test class before the validator runs.
