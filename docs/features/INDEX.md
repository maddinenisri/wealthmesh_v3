# Feature status board

Order and rationale: `dependency-map.md` (D-018). IDs per session: `slices.txt`. Replaces the one-row-per-feature-file board; old rows 02 and 03 are dissolved into the sessions below (their notes keep the gap analyses).

One **session** per row. Each row is a slice: the capabilities it adds and the scenario IDs that become fully citeable when they exist (D-016). Order follows capabilities, not folders (see the map for the table of every scenario and what it needs).

Check a session with `npm run coverage -- --require --slice NN`; a file is complete when `--require <path>` passes after its last slice.

**Updating:** the session that works a row edits it (status, date, commit) and links its notes file. Statuses: `todo`, `in-progress`, `partial` (some scenarios deferred, see `deferred.txt`), `done`. Done means the coverage script reports no missing IDs for the row, the validator report is clean, `npm run e2e` passes and the work is pushed.

**Size** follows the scenario count (S up to 5, M 6 to 8, L 9 or more).

## Where we are (2026-10-07)

- **Done:** slices 00a to 16b (Milestones A and B complete, property and other assets with dated values, loans and mortgages with payments, corrections and plans). `npm run coverage`: 133 of 262 scenarios covered, 3 deferred, 126 missing. 
- **Next:** slices 17 and 18 (Milestone C), then 19 to 25 (investments, Milestone D).
- **Tests on `main`:** frontend 343, e2e 257, backend suite green on the final code (run it with the dev stack stopped, pitfall 35).
- **Open for the owner:** reviews of a property still say "Balance now/after" (decisions use Balance across the app); Q-004 (TypeScript 7, msw 3, Gradle 9.8) deferred; a process review is scheduled for the start of Milestone D (the Cowork fault count has been 8, 8, 5, 5, 5, 7, 9, 9, and slice 15 added a `visual-reviewer` screenshot step to lower it).
- **Open in the code:** the removable "Value when tracking began" row; slice 14's untested inventory cells and the shorter-batch retry; three unexplained backend flakes (`scripts/flake-check.sh`, pitfall 33).
- **Slice 16a must:** extend `WealthStore.flowsBetween` and the wealth change identity test with principal and interest kinds.

## Starting a session

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice <NN> in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

One row per session. Do not start a second row, even if time remains.

**Merge rule:** a session may take consecutive slices until it covers at least 8 scenarios or 3 new capabilities (about 19 sessions instead of 25). Record the merge in the row and in `slices.txt`. Slice 01 runs as 01a first (5 scenarios, no income entry: CHECKING 011; EXPENSE 001, 010; MEMBERS 001; MONTHLY 005), then 01b (D-023).

**Strict Givens (D-021):** revisit after slice 08 with evidence of how often a Given was the only blocker.

## Sessions

| # | Session | Adds | Scenarios in scope | IDs | Size | Status | Date | Commit | Notes |
| --- | --- | --- | --- | ---: | :-: | --- | --- | --- | --- |
| 00a | foundations: `docs/guides/domain-foundations.md` | - | - | - | - | done | 2026-10-04 | see git log | Notes: `00-foundations.md` |
| 00b | checking setup, old row 01 | B1 to B4 | CHECKING 001, 003, 004, 005, 017 | 5 | S | done | 2026-10-04 | see git log | 002 returns in 01, 006 in 04. Notes: `accounts-checking-setup.md` |
| 01 | Checking money in and out | P1, P4, L1, L2, L3, L4, S1, W1 | CHECKING 002, 011, 015; EXPENSE 001, 010; HOUSEHOLD_SETUP 003; INCOME 001, 005; MEMBERS 001; MONTHLY 004, 005 | 11 | L | done | 2026-10-04 | `b4956f4` (01b), pushed | 01a and 01b done (notes: `slice-01a-checking-money-out.md`, `slice-01b-checking-money-in.md`). Runs as 01a (5 IDs: CHECKING 011; EXPENSE 001, 010; MEMBERS 001; MONTHLY 005) then 01b (6 IDs: CHECKING 002, 015; HOUSEHOLD_SETUP 003; INCOME 001, 005; MONTHLY 004) (D-023). Resolves deferred CHECKING_002 and MEMBERS_001. Seeded category list (D-020). Input: `accounts-checking-activity.md` gap analysis |
| 02 | Edit, remove, Undo and reminders | P2, P3, P5 | CHECKING 008; EXPENSE 006, 009, 011; INCOME 004, 006 | 6 | M | done | 2026-10-04 | `844763a`, pushed | Notes: `slice-02-edit-remove-reminders.md`. Edit as replacement, soft remove, Undo, reminders, applied to income and expenses on checking |
| 03 | Balance corrections | L5 | CHECKING 009, 013, 014, 018; MEMBERS 003 | 5 | S | done | 2026-10-04 | `4ddb5b8`, pushed | Notes: `slice-03-balance-corrections.md`. Update balance with review, reason, backdating and replace-with-fee |
| 04 | Starting-balance recovery, tracking start, statements | L8, L9, P6 | CHECKING 006, 016; JOURNEY 004; SUPPORTING_RECORD 003; WEALTH 005 | 3 of 5 (006, WEALTH 005 deferred, Q-030) | S | done | 2026-10-04 | `3c63dd0`, pushed | Notes: `slice-04-starting-balance-statements.md`. Group D dropped (Q-027 no); `opening_amount` stays NOT NULL |
| 05 | Member lifecycle and joint owners | M1, M2 | HOUSEHOLD_SETUP 001; MEMBERS 005, 006 | 3 | S | done | 2026-10-05 | `95df2af`, pushed | Old row 02 resumes (gap analysis: `household-members-manage-members.md`); 002 and 004 land in 18 and 21 |
| 06 | Savings accounts | T1 | EXPENSE 007; HOUSEHOLD_SETUP 004; INCOME 002, 003; SAVINGS 001, 003, 004, 008, 011 | 9 | L | done | 2026-10-05 | `0d2726f`, pushed | Notes: `slice-06-savings-accounts.md`. Supersedes D-015 (D-019) |
| 07 | Linked transfers and card payments | L6 | CHECKING 007, 010; EXPENSE 008; JOURNEY 002; SAVINGS 002, 005, 006, 007, 009, 010; TRANSFER 001, 002, 003 | 12 of 13 (SAVINGS 005 deferred, Q-030) | L | done | 2026-10-05 | `90e61f6`, pushed | Notes: `slice-07-linked-transfers.md`. Transfers built on a card-ready `MovementService` (D-036); Cowork checks 4 to 6 and 1280px were not reached; owner confirmed no further pass. Card payments themselves arrive in 08 |
| 08 | Credit cards | T2 | CARD 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014; MONTHLY 002; SUPPORTING_RECORD 001 | 16 | L | done | 2026-10-05 | `5caca17`, pushed | Notes: `slice-08-credit-cards.md`. Owner's Cowork pass at 710px done (1280px rests on e2e); Q-034 open. Card stored with the asset sign (D-038), refunds and one spending definition (D-039), card payments on the transfer mechanism (D-040) |
| | **Milestone A** | | checking, savings and cards with income, expenses, transfers, corrections and members. A usable everyday-money product. | | | | | | |
| 09 | Batch entry | L7 | EXPENSE 002, 003, 004, 005 | 4 | S | done | 2026-10-05 | `4e8aa02`, pushed | Merged with 10 into one session (merge rule, 12 IDs). Notes: `slice-09-10-batch-and-categories.md`. One keyed all-or-none save (`<key>:i` per row), Save and add another. Also holds the Q-034 "Pay a card" extra (answered yes) |
| 10 | Category management and classes | S2, S3 | CATEGORIES 001, 002, 003, 004, 005, 006, 007, 008 | 8 | M | done | 2026-10-05 | `d6add20`, pushed | Merged with 09 (same session and notes file). Owner's Cowork pass at 710px: 8 findings, all fixed; 1280px panels on account pages rest on e2e. D-041 (seeded-name deviation), D-042 (class on the entry, merge as a pointer) |
| 11 | Split expenses | S4 | SPLITS 001, 002, 003, 004, 005 | 5 | S | done | 2026-10-06 | `57f43bf`, pushed | Notes: `slice-11-split-expenses.md`. One payment with portions (D-043, V16 and V17); a repeated Undo is idempotent for entries and transfers (D-044). Owner's Cowork pass at 710px: 5 faults (down from 8 and 8), all fixed; positions by eye and 1280px by eye not verified (window in the background) |
| 12 | Bank and debt groups, account lifecycle | W2, A1, A2, A3 | ACCOUNT_LIFECYCLE 001, 002, 003, 004, 005, 006; CHECKING 012; WEALTH 003, 011 | 9 | L | done | 2026-10-06 | `0b0e4ff`, pushed | Notes: `slice-12-groups-and-account-lifecycle.md`. Bank money, Cards and debt groups with net worth (D-046); archive, restore, close, reopen, delete with Undo, one state gate and a race test per writer (D-045); owner's Cowork pass at 710px: 5 faults (down from 8, 8, 5), none focus; Q-040 open |
| 13 | Budgets | S5 | BUDGET 001, 002, 003, 004, 005, 006, 007; MONTHLY 003 | 8 | M | done | 2026-10-06 | `6754add`, pushed | Notes: `slice-13-budgets.md`. Monthly Budget on the Spending page from the one shared spending read, targets read through category merges (D-047); Q-040 fixed first (five keyed writers replay after Archive or Close); owner's Cowork pass at 710px: 7 faults (against 8, 8, 5, 5, 5), 5 fixed and tested, 2 (focus after Create, Remove and Undo; review top in a short month) changed but not reproducible in headless Chromium, owner to confirm; Q-044 open |
| 14 | Recurring bills | S6 | RECURRING 001, 002, 003, 004, 005, 006, 007, 008, 009, 010 | 10 | L | done | 2026-10-06 | `ee6d388`, pushed | Notes: `slice-14-recurring-bills.md`. Schedules and expected amounts that never move money (D-048); suggestions from recorded bills; record the actual expense through the entry rules; pause, resume, overdue, dismiss, delete; Q-044 fixed first with one replay path (D-049); owner's Cowork pass: 9 faults (against 8, 8, 5, 5, 5 and 7), all fixed |
| | **Milestone B** | | everyday money complete (categories, splits, groups, lifecycle, budgets, recurring). | | | | | | |
| 15 | Property and other assets, dated values | T3, W4, W5 | DATED_VALUE 002, 004; OTHER_ASSET 002, 003, 004, 005, 006; PROPERTY 002, 003, 004, 005, 006 | 12 | L | done | 2026-10-06 | `b776e07`, pushed | Notes: `slice-15-property-other-assets-dated-values.md`. Property and other assets as dated values (D-050), plans, earlier start, wealth on a date and the change explanation (D-051); group 0 first: one occurrence per due date, by-name replay after a rename (D-052); owner's Cowork pass: 9 faults (against 8, 8, 5, 5, 5, 7 and 9), all fixed |
| 16a | Loans, debt corrections | T4 | DATED_VALUE 003; LOAN 001, 002, 003, 004, 005, 006 | 7 | M | done | 2026-10-07 | `6a14bad`, pushed | Notes: `slice-16-loans-mortgages.md`. A loan is a debt (D-053), a payment has principal and interest portions (D-054); property reviews say "Value"; any Balance correction is removable. Owner's Cowork pass: 8 faults (22 more found and fixed by the screenshot step), all fixed; Q-031 still open |
| 16b | Mortgages, planned debt values | T5 | DATED_VALUE 001; MORTGAGE 001, 002, 003, 004, 005, 006, 007, 008 | 9 | M | done | 2026-10-07 | `5aae319`..`ba61aed`, not pushed | Notes: `slice-16-loans-mortgages.md`. A mortgage is a debt type with its own wealth group; payments reuse the loan payment and count Mortgage interest by type (D-055); a future amount on a debt is a plan nothing counts. Cowork found 5 faults. |
| 17 | Investment accounts, generic setup | T7, T8 | 401K 002, 003, 005, 006; ACCOUNT_LIFECYCLE 007; BROKERAGE 002, 003, 005, 006; HSA 002, 003, 005, 006; INV_CORRECTION 005; ROTH_IRA 002, 003, 005, 006; TRAD_IRA 002, 003, 005, 006 | 22 | L | todo | | | Five account types share one capability |
| 18 | Defined benefit, wealth groups, individual owners | T6, W3, M3, M4 | 401K 007; DB 001, 002, 003, 004, 005, 006; HOLDINGS 001, 007; HOUSEHOLD_SETUP 002, 005; HSA 007; MEMBERS 002; OTHER_ASSET 001; PROPERTY 001; RETIREMENT_ACTIVITY 007; ROTH_IRA 007; TRAD_IRA 007; WEALTH 002, 008, 009 | 21 | L | todo | | | Plan value, Retirement/Investments/Health/Property groups, per-person view, individual-owner rule |
| | **Milestone C** | | every account type can be set up and appears in its wealth group; per-person views work. | | | | | | |
| 19 | Holdings and prices | I1 | 401K 001; BROKERAGE 001; HOLDINGS 002, 003, 004, 005, 008; HSA 001; ROTH_IRA 001; SUPPORTING_RECORD 002; TRAD_IRA 001; WEALTH 001, 004 | 13 | L | todo | | | Prices, holdings, partial cost, selected vs group views |
| 20 | Purchases and sales | I2, I3 | PURCHASE 001, 002, 003, 004, 005, 006; SALE 001, 002, 003, 004, 005, 006, 007 | 13 | L | todo | | | Cash to shares and shares to cash; lot selection |
| 21 | Investment funding | I4 | FUNDING 004, 005; INV_CORRECTION 008; MEMBERS 004; MONTHLY 001; WEALTH 006 | 6 | M | todo | | | Small by count, but unlocks MEMBERS_004 and INV_CORRECTION_008 and the performance slice |
| 22 | Performance | I6 | 401K 004; BROKERAGE 004; FUNDING 001, 002, 003; HOLDINGS 006; HSA 004; JOURNEY 001, 003, 005; PERFORMANCE 001, 002, 003, 004, 007, 008; ROTH_IRA 004; TRAD_IRA 004; WEALTH 007 | 19 | L | todo | | | Performance explanation unlocks FUNDING 001 to 003, the cash-correction scenario (004) of each investment type, WEALTH_007 and JOURNEY 001, 003, 005 |
| 23 | Dividends, interest, fees | I5 | EARNINGS 001, 002, 003, 004, 005, 006; PERFORMANCE 005, 006; WEALTH 010 | 9 | L | todo | | | Dividends, interest, fees, reinvestment |
| 24 | Investment corrections | I7 | INV_CORRECTION 001, 002, 003, 004, 006, 007, 009 | 7 | M | todo | | | Dependency-aware removal and Undo |
| 25 | Retirement and health activity | I8 | JOURNEY 006; RETIREMENT_ACTIVITY 001, 002, 003, 004, 005, 006 | 7 | M | todo | | | Payroll contribution and HSA medical flows |
| | **Milestone D** | | investments complete; the journey scenarios pass. | | | | | | |

## Feature files (derived)

Status of each file follows from its sessions. A file is complete after its last session; run `npm run coverage -- --require <path>` then.

| Feature file | IDs | Sessions (IDs) | Complete after |
| --- | ---: | --- | ---: |
| `accounts/checking/setup.feature` | 7 | 00b (5), 01 (1), 04 (1) | 04 |
| `spending/income/record-income.feature` | 6 | 01 (2), 02 (2), 06 (2) | 06 |
| `accounts/checking/transfers.feature` | 3 | 07 (3) | 07 |
| `accounts/savings/activity.feature` | 5 | 06 (1), 07 (4) | 07 |
| `accounts/savings/setup.feature` | 6 | 06 (4), 07 (2) | 07 |
| `accounts/credit-cards/activity.feature` | 8 | 08 (8) | 08 |
| `accounts/credit-cards/setup.feature` | 6 | 08 (6) | 08 |
| `spending/expenses/record-expenses.feature` | 11 | 01 (2), 02 (3), 06 (1), 07 (1), 09 (4) | 09 |
| `spending/categories/manage-categories.feature` | 8 | 10 (8) | 10 |
| `spending/categories/split-expenses.feature` | 5 | 11 (5) | 11 |
| `accounts/checking/activity.feature` | 11 | 01 (2), 02 (1), 03 (4), 04 (1), 07 (2), 12 (1) | 12 |
| `spending/budgets/manage-budgets.feature` | 7 | 13 (7) | 13 |
| `spending/recurring/manage-recurring.feature` | 10 | 14 (10) | 14 |
| `accounts/lifecycle/dated-values.feature` | 4 | 15 (2), 16a (1), 16b (1) | 16b |
| `accounts/loans/manage-loans.feature` | 6 | 16a (6) | 16a |
| `accounts/mortgage/manage-mortgage.feature` | 8 | 16b (8) | 16b |
| `accounts/lifecycle/manage-accounts.feature` | 7 | 12 (6), 17 (1) | 17 |
| `accounts/defined-benefit/setup.feature` | 6 | 18 (6) | 18 |
| `accounts/other-assets/setup.feature` | 6 | 15 (5), 18 (1) | 18 |
| `accounts/property/setup.feature` | 6 | 15 (5), 18 (1) | 18 |
| `household/setup/set-up-household.feature` | 5 | 01 (1), 05 (1), 06 (1), 18 (2) | 18 |
| `household/history/manage-supporting-records.feature` | 3 | 04 (1), 08 (1), 19 (1) | 19 |
| `investments/purchases.feature` | 6 | 20 (6) | 20 |
| `investments/sales.feature` | 7 | 20 (7) | 20 |
| `household/members/manage-members.feature` | 6 | 01 (1), 03 (1), 05 (2), 18 (1), 21 (1) | 21 |
| `spending/monthly-review/review-spending.feature` | 5 | 01 (2), 08 (1), 13 (1), 21 (1) | 21 |
| `accounts/401k/setup.feature` | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| `accounts/brokerage/setup.feature` | 6 | 17 (4), 19 (1), 22 (1) | 22 |
| `accounts/hsa/setup.feature` | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| `accounts/roth-ira/setup.feature` | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| `accounts/traditional-ira/setup.feature` | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| `investments/funding.feature` | 5 | 21 (2), 22 (3) | 22 |
| `investments/holdings.feature` | 8 | 18 (2), 19 (5), 22 (1) | 22 |
| `household/overview/understand-wealth.feature` | 11 | 04 (1), 12 (2), 18 (3), 19 (2), 21 (1), 22 (1), 23 (1) | 23 |
| `investments/dividends-fees.feature` | 6 | 23 (6) | 23 |
| `investments/performance.feature` | 8 | 22 (6), 23 (2) | 23 |
| `investments/corrections.feature` | 9 | 17 (1), 21 (1), 24 (7) | 24 |
| `household/journeys/manage-household-finances.feature` | 6 | 04 (1), 07 (1), 22 (3), 25 (1) | 25 |
| `investments/retirement-health.feature` | 7 | 18 (1), 25 (6) | 25 |
