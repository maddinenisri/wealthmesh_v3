# Slice 13: Budgets

- Slice: 13 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/spending/budgets/manage-budgets.feature` (all 7), `spending/monthly-review/review-spending.feature` (003 of 5 here; 004 and 005 are other slices)
- Status: in-progress (checkpoint 1 approved)
- Started: 2026-10-06 10:46 (session clock)  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 13 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Owner answers, 2026-10-06: Q-040 is yes, fix it as the first small group (a retry of a saved entry after its account was archived replays the original result, per D-024, for entry writers as for transfers and payments). Also make enteredByMemberId required on the lifecycle writes, like every other write.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

What to watch for in slice 13:
- Spending definition: budgets compare against spending, so they must use the single shared spending function and the effective-category expression (D-042). A budget on a category that is later merged or archived is the likely trap.
- Seeded names: the inventory from slices 09 and 10 says budgets look up Groceries and Travel by name.
- Classes: Essential and Discretionary totals may matter for budget scenarios.
- Cowork: report the count against 8, 8, 5 and 5.
```

- Preflight (2026-10-06 10:46): JDK 25 default, Node 26.4, Docker up; ports 5434, 5180, 8081 held by this project (`wm-backend`, `wm-frontend`). Majors behind: `@types/node`, `msw` 3, `typescript` 7 (Q-004, still open, not touched).
- 2026-10-06 Checkpoint 1 answer: approved groups 0 to 6 and the design. Q-041 (b): refuse only a merged category on a save, archived allowed (existing or new target). Q-042 yes. Q-043 yes: soft remove with Undo only, repeat Undo idempotent (D-044), Undo returns the original category targets. Addition: one test that a split payment and a refund give the same figure for a category on the budget line, the Spending page and the Month review (shared read uses `activity_part` and nets refunds). One commit per group, local only, no push, no Claude trailer; run each new e2e assertion alone against the unfixed code; Cowork count against 8, 8, 5, 5 and 5.
- 2026-10-06 Checkpoint 2 answer: (pending)

## Scope

`@V2_BUDGET_001` to `007`, `@V2_MONTHLY_003`. Plus group 0 (owner: Q-040 fix, lifecycle `enteredByMemberId`).

## Repository facts that shape the plan

- **`enteredByMemberId` on the lifecycle writes is already required.** `AccountController.memberOf` answers 400 "Choose who entered this" without it (commit `0b0e4ff`, D-045). Two things remain: `LifecycleRequest`'s Javadoc still says "Optional for raw API callers" (stale), and group 0 will list one raw-API test per lifecycle write to prove it (grep first; add any missing).
- **Q-040 today.** The key is looked up before the state gate in `EntryService.record` (`loadOpen` first, then the lock, then `save` finds the key), `BatchEntryService.record` (`load` maps `requireOpen`), `HistoricalEntryService` (`load`, no gate shown but `requireOpen` at the end of `load`), `ReminderService.save` (`requireOpen` before `saveLocked`) and `StatementService.save` (`requireNotClosed` before the lookup, so a retry after Close, not Archive, is refused). Transfers, payments, edits, corrections and the starting balance already look the key up first. The fix: under the lock, find the key first and replay; only a new key meets the state gate.
- **Spending is defined once**: `ActivityStore.Counted.of(kind, prefix)` (D-039: expenses minus refunds), read through the `activity_part` view (split portions) and `COALESCE(oc.merged_into_id, oc.id)` (D-042). `totalsByCategory` already returns one row per effective category with an `archived` flag. `SpendingService.summary` is the only caller that builds a month figure. Budgets will call `ActivityStore.totalsByCategory("expense", …)`; no budget SQL repeats the spending expression.
- **Nothing budget-related exists** (no table, no service, no screen). Latest migration is V19, so budgets are V20. `MonthReview` has no budget fields; the Spending page (`SpendingPage.tsx`) is where the month and the category drill-down already live.
- **Seeded names**: Rent, Utilities, Insurance, Groceries, Dining, Travel, Entertainment are seeded (V3). **Subscriptions is not seeded** (BUDGET_005 needs it): the test creates it through the app (Given met through the app, D-021) with no collision. No budget scenario creates or renames a seeded name, so D-041 does not apply. Budgets reference a category by id, never by name; tests find Groceries and Travel by name through `GET /categories`.
- **Classes**: no budget scenario mentions Essential or Discretionary, so budgets carry no class figures and `classTotals` is untouched.

## Decisions (proposed, to confirm at checkpoint 1)

1. **Shape.** `budget` (`household_id` FK; one per month while not removed: partial unique index on `(household_id, month)` where `removed_at IS NULL`; `total`, `removed_at`, `created_at`) and `budget_target` (budget, category, amount ≥ 0, unique per budget and category). Month is the first day of the month. A budget is household-wide like spending. **Lock anchor:** every budget write takes the household row `FOR UPDATE` first (new `lockHousehold`, same shape as `lockAccount`), so two first saves of a month serialize instead of racing the unique index; then the key is read, then the checks.
2. **Reads resolve targets through the merge pointer.** A target stored on category X, read after X is merged into Y, counts as a Y target (several targets that land on one category add). Nothing is rewritten, so Undo of the merge restores the old view (D-042: a merge never rewrites rows). Spending comes from the shared function, so target and spending always meet in the same effective category. Categories with spending but no target appear as "No target set" (BUDGET_002).
3. **Archived category.** A saved target on a category archived later stays and shows with the archived label (as spending does). A save may keep such a target but not add one on an archived or merged category (400, like an entry). (Q-041.)
4. **Save is one keyed write** `PUT /api/v1/budgets/{month}` with `total`, `targets[]`, `enteredByMemberId` and the idempotency key: replace the target set. Under the lock (household row; then the target categories `FOR SHARE`, lowest id first; the member `FOR SHARE`), the key is read first (D-024; the lesson of Q-040), then the rule checks. A review is informational: `POST /budgets/{month}/review` returns category total, total, difference, gap and the lines (D-028: the save recomputes). Cancel saves nothing.
5. **Totals disagree on purpose.** Target total and Budget total may differ (BUDGET_002, 003); the review states both and the difference and never changes the total. A zero target is valid (005); a negative one is 400 "Enter zero or a positive amount" (007), checked on the server first.
6. **Status words.** Month: "$X over Budget" / "$X under Budget" / "On Budget" (spending vs total). Category: "$X over target", "$X left to target", "No target set", "$X unplanned spending" (target 0 with spending), "No spending" (target 0, none). Percent used is `null` when the target is zero (shown "Not applicable").
7. **Copy** `POST /budgets/{month}/copy` with `fromMonth`: copies the total and the targets (resolved through merges; archived targets are left out and named in the review). Copy does not copy expenses and does not change the source. Refused 409 if the month already has a budget.
8. **Remove and Undo** (BUDGET_006), all addressed by month: `POST /budgets/{month}/remove` sets `removed_at` (missing budget 404; a repeat remove returns 200 with the same result); `POST /budgets/{month}/undo` clears it on the latest removed budget of that month, refuses 409 when the month got another budget meanwhile, and a repeat Undo returns the same result with no second event (D-044). Every real change writes a `budget_event` (who, when, saved/copied/removed/restored) shown as history.
9. **Required who.** Every budget write takes `enteredByMemberId` (400 "Choose who entered this"), read under a share lock so a deactivate cannot slip in (D-025, D-034).
10. **Month review (MONTHLY_003).** `GET /api/v1/review?month=` (in `IncomeController`) gains `budget` (null when the month has none): total, difference, status. Only that month's budget is used. With the Spending page's account filter on, no budget line is shown (a budget is household-wide).
11. **Screen.** A **Budget** section on the existing Spending page (`/spending`, same month chooser), below the month review: status line, category table (target, spending, status, percent), "Edit Budget" (form, then review panel, then Confirm), and for a month with none "No Budget for <month>" with Create and "Copy <earlier month> Budget". Remove and Undo sit on the section; history (who, when) under it. No new route.
12. **Uncategorized and refunds.** Spending with no category counts in the month total and shows as a line "Uncategorized" with "No target set" (a target cannot be placed on it). A category below zero (refunds exceed purchases, D-039) shows "Refunds exceed purchases" with the status "$X left to target" computed on the signed figure; the percent used is still shown.
13. **E2E data.** The e2e database is shared and September already has expenses from earlier specs, so `14-budgets.spec.ts` uses a month no earlier spec writes to, and builds its own spending there with the exact figures of the scenarios (fixed today is checked first; October for BUDGET_004 must have no entries).

## Task list (for approval at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 Q-040 and lifecycle who: every keyed writer finds its key first under the lock, then meets the state gate; raw-API test per lifecycle write for the missing who; fix the stale Javadoc | cites `V2_ACCOUNT_LIFECYCLE_001`, `003` (D-024, D-045) | API (Testcontainers) | todo |
| 1 Budget base (V20, `lockHousehold`): V20, shared spending read, status per month and category, zero target, "No target set", merged and archived categories | `V2_BUDGET_005`, supports 001 and 002 | API + UI (MSW) | todo |
| 2 Save with review: build, gap, difference, cancel, negative target | `V2_BUDGET_001`, `V2_BUDGET_002`, `V2_BUDGET_003`, `V2_BUDGET_007` | API + UI + e2e | todo |
| 3 Month review shows the budget (`GET /review`, Spending page line) | `V2_MONTHLY_003` | API + UI + e2e | todo |
| 4 Copy to a month | `V2_BUDGET_004` | API + UI + e2e | todo |
| 5 Remove and Undo | `V2_BUDGET_006` | API + UI + e2e | todo |
| 6 Guards, races, focus and layout at 710px and 1280px (Confirm, Cancel, Back, Undo, remove) with `useStateChangeFocus`; Cowork list | cites 001 to 007 | API + e2e | todo |

Order: 0, 1, 2, 3, 4, 5, 6, one commit per group, local only (D-002). Gap analysis: all 8 IDs are citeable now (spending, categories and member checks exist; no blocked or deferred ID).

Build-time checks (not owner decisions): group 0 moves the key lookup first, so `EntryService.loadOpen` (before the lock, line 67), `BatchEntryService.load` and `HistoricalEntryService.load` must stop gating before the lock, and a replay must be judged on what was saved, not on today's category, member or date rules (precedent: `HistoricalEntryService.withNoDateCheck`); grep `ArchivedAccountGuardsApiTests` first, only the new cell is "same key, same body, after Archive or Close, 200 with the original id". Copy writes targets on the effective category and the copy review says so.

Group 0 test matrix (one cell each): entry, batch, historical entry, reminder, statement × state (archived, closed) × (same key same body replays 200 with the original id; same key other body 409 "already used"; new key 409 archived or closed), plus the already-correct writers (transfer, payment, edit, correction, starting balance) as a regression row. Each cell red when the key lookup is moved back after the gate (planted).

### Inventory

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `budget`, `budget_target`, `budget_event` (new) | `BudgetService` (read, review), `SpendingService.review` (month budget), `BudgetPage` and `SpendingPage` (UI) | `BudgetService.save`, `copy`, `remove`, `undo` | save held vs save (same month, unique index and row lock), save held vs remove, remove held vs Undo, copy held vs save onto the target month; each fails when the lock is removed |
| `category` (id, `merged_into_id`, `archived_at`) | every budget read resolves `COALESCE(merged_into_id, id)`; `CategoryStore.usage` (extend: a category with a budget target counts as in use? see Q-042); `EntryValidator.findByName` (unchanged) | `CategoryLifecycleService` (merge, archive, Undo) | save held (categories `FOR SHARE`) vs merge and archive of a target category; merge then read budget; Undo of merge restores the old view |
| Spending figures (`activity_part`, `Counted`) | `ActivityStore.totalsByCategory` (budgets, month review, Spending page) | every entry writer (unchanged) | none new; one test that a budget status and the Spending page show the same figure for the same month, with a split, a refund, a merged category |
| `household_member` (who entered) | `BudgetService` (share lock) | `HouseholdMemberService.deactivate` | deactivate held vs budget save, and the reverse |
| Keyed writers (group 0): `EntryService.record`, `BatchEntryService.record`, `HistoricalEntryService.record`, `ReminderService.save`, `StatementService.save` | the `activity`, `reminder`, `statement` key columns | `AccountLifecycleService` (archive, close) | retry held vs archive (the retry sees the committed state and still replays) |
| `MonthReview` shape | `SpendingController`, `SpendingPage`, `MonthReview.test.tsx` | `SpendingService.review` | none (read) |

Writer by state, for the budget row: save, copy, remove, Undo × (month has no budget, has an active budget, has a removed budget): one raw-API test per cell (checklist).

## Coverage

(filled by `npm run coverage -- --slice 13`)

## Open questions

| # | Question | Recommended |
| --- | --- | --- |
| Q-041 | A target on a category archived later stays and shows. On a save: (a) keep it but add no new target on an archived or merged category (server diffs against stored targets), or (b) refuse only a merged category (400 "use <target>"), archived allowed? | (b), simpler, no diff |
| Q-042 | May a category with a budget target be archived or merged (it stays in use by the target)? Today nothing blocks it. | Yes: allowed, read through the pointer (decision 2) |
| Q-043 | Budget remove: soft-remove with Undo only (the scenario), no permanent delete? | Yes |

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |

Count against 8, 8, 5 and 5: (pending)

## How it works

(written at Land)
