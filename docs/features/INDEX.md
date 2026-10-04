# Feature status board

One feature file per session, in this order. Order follows dependencies, not the requirements README: the README
starts with the whole-journey file, but that is the acceptance thread, so it is built last and its e2e spec grows a
step in each session. After wave 1 there is a usable product; later waves add breadth.

**Order check:** files are ordered by reading their scenarios, not their folder names. The Notes column gives the
number of references to other account types (a grep for savings, credit card, brokerage, 401k, IRA, defined benefit,
HSA and holdings). A file with many is acceptance-shaped and goes late in its wave.

**Updating:** the session that works a row edits it (status, date, commit) and links the feature notes file in the Notes column. Statuses: `todo`, `in-progress`,
`partial` (some scenarios deferred or blocked, see `deferred.txt`), `done`. Done means the coverage script reports no
missing scenarios for the file, the validator report is clean, `npm run e2e` passes and the work is pushed.

**Size** is a budget hint from the scenario count: S up to 5, M 6 to 8, L 9 or more. An L file may be split at a
scenario-group boundary; note the split in the row.

## Starting a session

Open a new Claude Code session in the repo and paste the kickoff prompt from `docs/process/prompts.md`:

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for <row> below.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

Replace `<row>` with `00 foundations` or a feature path such as `household/setup/set-up-household.feature`.
One row per session. Do not start a second row, even if time remains; finish the handoff and retro instead.

## Rows

| # | Feature file | Scenarios | Size | Status | Date | Commit | Notes |
| --- | --- | ---: | :-: | --- | --- | --- | --- |
| 00 | foundations: `docs/guides/domain-foundations.md` | - | - | done | 2026-10-04 | see git log | Money, dated balance, clock, account model decided. Notes: `00-foundations.md` |
| | **Wave 1: walking skeleton (usable product after these)** | | | | | | |
| 01 | `accounts/checking/setup.feature` | 7 | M | partial | 2026-10-04 | see git log | 5 covered; 002 (salary needs income, row 04) and 006 (legacy file) deferred whole. Account, owner, clock, `/today` and money helpers exist. Notes: `accounts-checking-setup.md` |
| 02 | `household/members/manage-members.feature` | 6 | M | todo | | | Parked 2026-10-04: 4 of 6 need rows 03 and 05, 2 of 6 need wave 3; revisit after row 05. Gap analysis in `household-members-manage-members.md`. The member delete 500 was fixed separately (409). |
| 03 | `accounts/checking/activity.feature` | 11 | L | todo | | | 9 cross-type references: read before planning. |
| 04 | `spending/income/record-income.feature` | 6 | M | todo | | | 8 cross-type references: read before planning. |
| 05 | `spending/expenses/record-expenses.feature` | 11 | L | todo | | | 11 cross-type references: read before planning. |
| 06 | `household/overview/understand-wealth.feature` | 11 | L | todo | | | 35 cross-type references: acceptance-shaped. Expect heavy deferral until more account types exist. |
| 07 | `household/setup/set-up-household.feature` | 5 | S | todo | | | Acceptance-shaped (10 references). 002 and 005 need credit card, brokerage, 401k, IRA and defined benefit (wave 3); 001, 003 and 004 need checking and savings. |
| | **Wave 2: everyday money** | | | | | | |
| 08 | `accounts/checking/transfers.feature` | 3 | S | todo | | | |
| 09 | `accounts/savings/setup.feature` | 6 | M | todo | | | |
| 10 | `accounts/savings/activity.feature` | 5 | S | todo | | | |
| 11 | `accounts/credit-cards/setup.feature` | 6 | M | todo | | | |
| 12 | `accounts/credit-cards/activity.feature` | 8 | M | todo | | | |
| 13 | `spending/categories/manage-categories.feature` | 8 | M | todo | | | |
| 14 | `spending/categories/split-expenses.feature` | 5 | S | todo | | | |
| 15 | `spending/monthly-review/review-spending.feature` | 5 | S | todo | | | |
| 16 | `spending/budgets/manage-budgets.feature` | 7 | M | todo | | | |
| 17 | `spending/recurring/manage-recurring.feature` | 10 | L | todo | | | |
| 18 | `accounts/lifecycle/manage-accounts.feature` | 7 | M | todo | | | |
| 19 | `household/history/manage-supporting-records.feature` | 3 | S | todo | | | |
| | **Wave 3: assets, debts and investments** | | | | | | |
| 20 | `accounts/property/setup.feature` | 6 | M | todo | | | |
| 21 | `accounts/other-assets/setup.feature` | 6 | M | todo | | | |
| 22 | `accounts/loans/manage-loans.feature` | 6 | M | todo | | | |
| 23 | `accounts/mortgage/manage-mortgage.feature` | 8 | M | todo | | | |
| 24 | `accounts/lifecycle/dated-values.feature` | 4 | S | todo | | | |
| 25 | `accounts/brokerage/setup.feature` | 6 | M | todo | | | |
| 26 | `accounts/401k/setup.feature` | 7 | M | todo | | | |
| 27 | `accounts/traditional-ira/setup.feature` | 7 | M | todo | | | |
| 28 | `accounts/roth-ira/setup.feature` | 7 | M | todo | | | |
| 29 | `accounts/hsa/setup.feature` | 7 | M | todo | | | |
| 30 | `accounts/defined-benefit/setup.feature` | 6 | M | todo | | | |
| 31 | `investments/holdings.feature` | 8 | M | todo | | | |
| 32 | `investments/purchases.feature` | 6 | M | todo | | | |
| 33 | `investments/sales.feature` | 7 | M | todo | | | |
| 34 | `investments/funding.feature` | 5 | S | todo | | | |
| 35 | `investments/dividends-fees.feature` | 6 | M | todo | | | |
| 36 | `investments/retirement-health.feature` | 7 | M | todo | | | |
| 37 | `investments/corrections.feature` | 9 | L | todo | | | |
| 38 | `investments/performance.feature` | 8 | M | todo | | | |
| 39 | `household/journeys/manage-household-finances.feature` | 6 | M | todo | | | |
