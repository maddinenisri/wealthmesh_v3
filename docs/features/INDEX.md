# Feature status board

Order and rationale: `dependency-map.md` (D-018). IDs per session: `slices.txt`. Replaces the one-row-per-feature-file board; old rows 02 and 03 are dissolved into the sessions below (their notes keep the gap analyses).

One **session** per row. Each row is a slice: the capabilities it adds and the scenario IDs that become fully citeable when they exist (D-016). Order follows capabilities, not folders (see the map for the table of every scenario and what it needs).

Check a session with `npm run coverage -- --require --slice NN`; a file is complete when `--require <path>` passes after its last slice.

**Updating:** the session that works a row edits it (status, date, commit) and links its notes file. Statuses: `todo`, `in-progress`, `partial` (some scenarios deferred, see `deferred.txt`), `done`. Done means the coverage script reports no missing IDs for the row, the validator report is clean, `npm run e2e` passes and the work is pushed.

**Size** follows the scenario count (S up to 5, M 6 to 8, L 9 or more).

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
| 09 | Batch entry | L7 | EXPENSE 002, 003, 004, 005 | 4 | S | in-progress | 2026-10-05 | | Merged with 10 into one session (merge rule, 12 IDs). Notes: `slice-09-10-batch-and-categories.md`. Also holds the "Pay a card" extra (Q-034 yes) |
| 10 | Category management and classes | S2, S3 | CATEGORIES 001, 002, 003, 004, 005, 006, 007, 008 | 8 | M | in-progress | 2026-10-05 | | Merged with 09 (same session and notes file) |
| 11 | Split expenses | S4 | SPLITS 001, 002, 003, 004, 005 | 5 | S | todo | | | Thin: splits only need checking |
| 12 | Bank and debt groups, account lifecycle | W2, A1, A2, A3 | ACCOUNT_LIFECYCLE 001, 002, 003, 004, 005, 006; CHECKING 012; WEALTH 003, 011 | 9 | L | todo | | | Wealth groups for bank money and debts, archive, close, delete |
| 13 | Budgets | S5 | BUDGET 001, 002, 003, 004, 005, 006, 007; MONTHLY 003 | 8 | M | todo | | | Thin: budgets only need the month summary |
| 14 | Recurring bills | S6 | RECURRING 001, 002, 003, 004, 005, 006, 007, 008, 009, 010 | 10 | L | todo | | | Thin: recurring only needs checking and expenses |
| | **Milestone B** | | everyday money complete (categories, splits, groups, lifecycle, budgets, recurring). | | | | | | |
| 15 | Property and other assets, dated values | T3, W4, W5 | DATED_VALUE 002, 004; OTHER_ASSET 002, 003, 004, 005, 006; PROPERTY 002, 003, 004, 005, 006 | 12 | L | todo | | | Manual dated values and the as-of and explanation views of wealth |
| 16 | Loans and mortgages | T4, T5 | DATED_VALUE 001, 003; LOAN 001, 002, 003, 004, 005, 006; MORTGAGE 001, 002, 003, 004, 005, 006, 007, 008 | 16 | L | todo | | | Loans, mortgages, and principal/interest portions linked from checking |
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
| `accounts/lifecycle/dated-values.feature` | 4 | 15 (2), 16 (2) | 16 |
| `accounts/loans/manage-loans.feature` | 6 | 16 (6) | 16 |
| `accounts/mortgage/manage-mortgage.feature` | 8 | 16 (8) | 16 |
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
