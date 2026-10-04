# Dependency map: capabilities, citeable slices and build order

Status: **adopted 2026-10-04** (D-018 to D-021; owner answers Q-016 to Q-023). Analysis only; the board is `INDEX.md`, IDs per session are in `slices.txt`.
Date: 2026-10-04. Sources: all 39 files in `docs/requirements/v2` (262 scenarios), `docs/features/*.md`, `domain-foundations.md`, decisions D-001 to D-017, questions Q-001 to Q-014 (Q-015 is pending in the untracked row 03 notes).

## Findings

- 5 of 262 scenarios are citeable today (all in `checking/setup`). Every other scenario needs at least one capability that does not exist.
- 49 capabilities are missing. 4 exist (household and members, account record, amount parsing, clock).
- Rows fail by file because files cut across capabilities: the 11 scenarios of `checking/activity` land in 6 different slices (1, 2, 3, 4, 7, 12); `record-expenses` in 5; `understand-wealth` in 7. Row 02 and row 03 failed the same way.
- The order below makes 25 sessions, each ending with every listed scenario citeable. Cumulative, counting the 5 done: 16 after slice 1, 35 after slice 5, 73 after slice 8 (milestone A), 117 after slice 14, 188 after slice 18, 262 after slice 25.
- Savings is the biggest hidden dependency of wave 1: 38 scenarios need it, 27 of them outside the savings files, 16 of them inside rows 03 to 07 of the current board. See Q-B.
- Cards are the second: 32 scenarios need them, 18 outside the card files.
- Five investment account types are one capability. The 34 IDs across the five files are near copies (setup, empty, draft, validation, mismatch, owner). Slice 17 cites 20 of them plus 2 others.
- The acceptance-shaped files are not all late: HOUSEHOLD_SETUP_003 is citeable in slice 1, JOURNEY_004 in slice 4, JOURNEY_002 in slice 7. MEMBERS 001, 003, 005, 006 are citeable by slice 5.
- Basic wealth (assets, debts, net worth) is needed by 65 scenarios and is small. Leaving it inside row 06 is one reason rows 02 and 03 stalled. It moves into slice 1.

## Citeability rule and scoring

A scenario is citeable when every Given, When and Then step can be built and passed without a later row (D-016, row 03 notes). Whole-ID deferral stays (D-016). Scoring conventions, applied the same way to all 262 rows so the counts are reproducible:

| Soft step | Scored as |
| --- | --- |
| "across list, detail and household wealth" | needs W1 (basic wealth) |
| "with Maya, time and reason" | needs P4 (entered-by) and P2 (history) |
| "can choose money in, money out, transfer, Update balance" | satisfied by a visible action that may be inactive (Q-010 precedent). Flag **J1** |
| "is not counted as income or spending" with no figure shown | structural proof counts (Q-008 precedent). Flag **J2** |
| "income is $X, spending is $Y" or "Income minus spending" | needs S1 (month summary) |
| Scenario Outline | every example row must pass; the ID is one unit |
| "Review the earlier tracking start" and "Future values are not completed account history" validation rows | need L8 and P5 (detection and message) |
| A Given that names an account type, entry or price | needs that capability (conservative: no direct database seeding). See Q-D |
| Missing UI element (Q-012 precedent) | not citeable until it exists |

Flags in the scenario table: **J1**, **J2** as above; **U** = least certain mapping, review first; **deferred** = in `deferred.txt` now.

## Capability list

One shared list. "Needed by" counts scenarios that list the code. "Slice" is where this map builds it.

| Code | Capability | What it covers | Requires | Needed by | Slice |
| --- | --- | --- | --- | ---: | ---: |
| B1 | Household and member basics | Household create/rename; members add/rename/delete-guard (409) | - | 0 | built |
| B2 | Account record | Create, list, detail, edit; owner join; checking only; edit never touches money | - | 0 | built |
| B3 | Amount parsing and message | Money strings, "Enter a valid amount" | - | 0 | built |
| B4 | Clock and today | Injectable clock, GET /today, fixed e2e date | - | 0 | built |
| P1 | Review, confirm, cancel | Preview what will change; Cancel leaves records; repeated Confirm acts once (slow-response repeat) | - | 122 | 1 |
| P2 | Edit as replacement + history | Original and new values kept; shows member, time, reason | P1 | 47 | 2 |
| P3 | Soft remove and Undo | Removal keeps history; Undo (twice) restores exactly one effective entry | P1 | 19 | 2 |
| P4 | Entered-by chooser | Selected member annotation on every saved record; not a sign-in | B1 | 32 | 1 |
| P5 | Reminder for future dates | "Save reminder" instead of completed activity; not counted in Balance or reports | P1 | 15 | 2 |
| P6 | Supporting statements | Attach, revise (latest version), remove, Undo; statement never replaces the calculated Balance | P1, P3 | 9 | 4 |
| L1 | Activity ledger and dated Balance | activity table; Balance = opening + activity up to a date; account activity list; earlier-date view | B2 | 25 | 1 |
| L2 | Category catalog | Seeded spending and income categories chosen on an entry (Rent, Groceries, Salary, Interest...); no management UI | L1 | 42 | 1 |
| L3 | Income entry | Record received money; amount > 0; received into an account | L1, L2, P1, P4 | 21 | 1 |
| L4 | Expense, refund and charge entry | Pay from bank, card or HSA cash; refund; card interest and fees; overdraft warning; amount > 0 | L1, L2, P1, P4 | 63 | 1 |
| L5 | Balance correction | Update balance review (current, requested, difference, reason, as-of date); never income or spending; replace a correction with the actual fee | L1, P1, P2, P4 | 19 | 3 |
| L6 | Linked movement | Transfer and card payment as one pair: create, edit, remove, Undo; two different accounts; convert an expense to a transfer | L1, P1 | 39 | 7 |
| L7 | Batch entry | Save and add another; review several entries; all or none; no double save | L4 | 4 | 9 |
| L8 | Tracking-start review | Activity or value dated before the account began: guide to reviewed history, extend the start | L1, P1, P2 | 13 | 4 |
| L9 | Starting-balance recovery | Legacy "Starting balance needed" (nullable opening) and correcting an omitted starting amount | L1, P1, P2 | 4 | 4 |
| S1 | Month summary | Income, spending, Income minus spending for a month; by category; account filter; open the entries; spending history and annual estimate | L1 | 71 | 1 |
| S2 | Category management | Create with default, rename, merge, archive, income categories, blank and duplicate names | L2, P1 | 7 | 10 |
| S3 | Essential/Discretionary and review flag | Default class, per-expense choice, uncategorized flag, class totals | L4, S1 | 7 | 10 |
| S4 | Split expense | Portions that must equal the payment; correct, remove, cancel | L4, S3, P1 | 6 | 11 |
| S5 | Budgets | Monthly total and category targets, copy to a month, remove, over/under status | S1 | 10 | 13 |
| S6 | Recurring estimates | Suggestions, schedules, occurrences, early payment, pause, overdue, dismiss | L4, P1 | 11 | 14 |
| T1 | Savings account | Savings type with the checking setup shape; interest is income | B2 | 38 | 6 |
| T2 | Credit card account | Owed or Card credit meaning of one Balance; setup, edit; sign flips on overpayment | B2 | 32 | 8 |
| T3 | Valued asset | Property and other asset: manual dated value, estimates, correct, remove, Undo | B2 | 17 | 15 |
| T4 | Debt account | Loan and mortgage: amount owed, lender, setup, edit | B2 | 12 | 16 |
| T5 | Debt payment with portions | Bank payment split into principal and interest, linked to the debt | T4, L6, S4 | 6 | 16 |
| T6 | Defined benefit plan | Plan-reported dated value; pay and interest credits; separate pension promise | B2 | 17 | 18 |
| T7 | Investment account | Brokerage, 401k, IRAs, HSA: complete opening cash plus holdings, mismatch review, empty setup, edit, validation messages | B2 | 81 | 17 |
| T8 | Draft account | Incomplete investment setup kept as a draft; "Finish setup"; not in wealth | T7 | 7 | 17 |
| A1 | Archive and restore | Hidden from active list, Balance stays in wealth, archived label, restore | B2 | 6 | 12 |
| A2 | Close and reopen | Close only at an accounted-for zero Balance | A1 | 4 | 12 |
| A3 | Delete with Undo | Unused accounts and drafts only; history-bearing accounts refuse | B2, P3 | 3 | 12 |
| M1 | Member lifecycle | Deactivate/restore, "inactive member" label, rename keeps earlier name | B1 | 3 | 5 |
| M2 | Joint owners | More than one owner on an account; owner text; owner choice from active members | B2 | 8 | 5 |
| M3 | Per-person account view | Whole household / each member filter; joint appears in each view, counts once | M2, W1 | 1 | 18 |
| M4 | Individual-owner rule | Retirement, HSA, plan: exactly one member; owner change reviewed with history | B2, P1, P2 | 13 | 18 |
| W1 | Household total | Assets, debts, net worth over built account types, each counted once; a negative bank balance (overdraft) counts as debt; empty state; same Balance in list, detail, wealth | L1 | 65 | 1 |
| W2 | Bank money and Debts groups | Card credit as asset, archived label, open an account behind a total | W1 | 8 | 12 |
| W3 | Investment, Retirement, Health, Property groups | Group membership, overlap explanation, never added to wealth | W1 | 17 | 18 |
| W4 | As-of date, trend, stale dates | Wealth on an earlier date, trend, mixed value dates noticed | W1 | 7 | 15 |
| W5 | Wealth change explanation | Income minus spending, growth, value change, corrections, shared events counted once | W1, S1 | 12 | 15 |
| I1 | Holdings, prices and views | Securities, quantities, dated prices, zero price review, partial cost and coverage, selected vs group, statement vs calculated | T7 | 33 | 19 |
| I2 | Purchases | Cash to shares, fee, same-day separate, funded from cash only | I1 | 15 | 20 |
| I3 | Sales | Lot choice, realized gain, unknown cost, incomplete sale as draft | I2 | 10 | 20 |
| I4 | Investment funding | Transfers with household accounts, external (employer) funding, withdrawals, repeated-transfer confirmation | T7, L6 | 25 | 21 |
| I5 | Dividends, interest, fees | Earnings entries, reinvestment as linked pair, unfunded fee refusal | I1 | 10 | 23 |
| I6 | Performance | Opening + funding + earnings = ending; simple return; exact period-end prices; selected vs group; boundary dates | I1, I4 | 31 | 22 |
| I7 | Investment corrections | Removal with dependency review, price removal, extend tracking, combined Undo | I2, P3 | 7 | 24 |
| I8 | Retirement and health activity | Employee and employer contributions beside take-home pay; HSA medical payment and linked reimbursement | I4, L3 | 7 | 25 |

Built means row 00 and row 01 delivered it for checking only (`account.type` has one value so far; the owner form offers one owner).

## Slices in build order

Derived from the scenario table: a scenario lands in the first slice whose cumulative capabilities cover all of its codes. Size follows the board rule on scenario count (S up to 5, M 6 to 8, L 9 or more); the number of new capabilities is shown beside it. Counts include the 5 scenarios already done.

| Slice | Session | New capabilities | IDs | Size | Cumulative |
| ---: | --- | --- | ---: | :-: | ---: |
| 1 | Checking money in and out | P1 P4 L1 L2 L3 L4 S1 W1 | 11 | L | 16 |
| 2 | Edit, remove, Undo and reminders | P2 P3 P5 | 6 | M | 22 |
| 3 | Balance corrections | L5 | 5 | S | 27 |
| 4 | Starting-balance recovery, tracking start, statements | L8 L9 P6 | 5 | S | 32 |
| 5 | Member lifecycle and joint owners | M1 M2 | 3 | S | 35 |
| 6 | Savings accounts | T1 | 9 | L | 44 |
| 7 | Linked transfers and card payments | L6 | 13 | L | 57 |
| 8 | Credit cards | T2 | 16 | L | 73 |
| 9 | Batch entry | L7 | 4 | S | 77 |
| 10 | Category management and classes | S2 S3 | 8 | M | 85 |
| 11 | Split expenses | S4 | 5 | S | 90 |
| 12 | Bank and debt groups, account lifecycle | W2 A1 A2 A3 | 9 | L | 99 |
| 13 | Budgets | S5 | 8 | M | 107 |
| 14 | Recurring bills | S6 | 10 | L | 117 |
| 15 | Property and other assets, dated values | T3 W4 W5 | 12 | L | 129 |
| 16 | Loans and mortgages | T4 T5 | 16 | L | 145 |
| 17 | Investment accounts, generic setup | T7 T8 | 22 | L | 167 |
| 18 | Defined benefit, wealth groups, individual owners | T6 W3 M3 M4 | 21 | L | 188 |
| 19 | Holdings and prices | I1 | 13 | L | 201 |
| 20 | Purchases and sales | I2 I3 | 13 | L | 214 |
| 21 | Investment funding | I4 | 6 | M | 220 |
| 22 | Performance | I6 | 19 | L | 239 |
| 23 | Dividends, interest, fees | I5 | 9 | L | 248 |
| 24 | Investment corrections | I7 | 7 | M | 255 |
| 25 | Retirement and health activity | I8 | 7 | M | 262 |

### Slice 1: Checking money in and out

- Adds: P1 Review, confirm, cancel, P4 Entered-by chooser, L1 Activity ledger and dated Balance, L2 Category catalog, L3 Income entry, L4 Expense, refund and charge entry, S1 Month summary, W1 Household total
- Becomes citeable (11): CHECKING 002, 011, 015; EXPENSE 001, 010; HOUSEHOLD_SETUP 003; INCOME 001, 005; MEMBERS 001; MONTHLY 004, 005
- Note: Smallest set that makes any ledger scenario passable. Heavy on capabilities (8), light per capability. Resolves deferred CHECKING_002 and MEMBERS_001 (Q-012: the entered-by chooser now has a form to live in). Runs as two sessions (D-023): 01a without income entry (CHECKING 011; EXPENSE 001, 010; MEMBERS 001; MONTHLY 005) and 01b with income and basic wealth (CHECKING 002, 015; HOUSEHOLD_SETUP 003; INCOME 001, 005; MONTHLY 004).

### Slice 2: Edit, remove, Undo and reminders

- Adds: P2 Edit as replacement + history, P3 Soft remove and Undo, P5 Reminder for future dates
- Becomes citeable (6): CHECKING 008; EXPENSE 006, 009, 011; INCOME 004, 006
- Note: Edit as replacement, soft remove, Undo, reminders, applied to income and expenses on checking.

### Slice 3: Balance corrections

- Adds: L5 Balance correction
- Becomes citeable (5): CHECKING 009, 013, 014, 018; MEMBERS 003
- Note: Update balance with review, reason, backdating and replace-with-fee. Applies to checking now; savings, card, debt and investment cash reuse it.

### Slice 4: Starting-balance recovery, tracking start, statements

- Adds: L8 Tracking-start review, L9 Starting-balance recovery, P6 Supporting statements
- Becomes citeable (5): CHECKING 006, 016; JOURNEY 004; SUPPORTING_RECORD 003; WEALTH 005
- Note: Resolves deferred CHECKING_006. Nullable opening amount migration (row 01 handoff).

### Slice 5: Member lifecycle and joint owners

- Adds: M1 Member lifecycle, M2 Joint owners
- Becomes citeable (3): HOUSEHOLD_SETUP 001; MEMBERS 005, 006
- Note: Parked row 02 resumes here: MEMBERS 001, 003, 005, 006 are citeable by this slice. 002 and 004 wait for slices 18 and 21.

### Slice 6: Savings accounts

- Adds: T1 Savings account
- Becomes citeable (9): EXPENSE 007; HOUSEHOLD_SETUP 004; INCOME 002, 003; SAVINGS 001, 003, 004, 008, 011
- Note: Savings is a type value plus interest income. Needed by 38 scenarios (see Q-B).

### Slice 7: Linked transfers and card payments

- Adds: L6 Linked movement
- Becomes citeable (13): CHECKING 007, 010; EXPENSE 008; JOURNEY 002; SAVINGS 002, 005, 006, 007, 009, 010; TRANSFER 001, 002, 003
- Note: Transfers and card payments share one linked-movement mechanism (foundations 7). Card payments are exercised in slice 8.

### Slice 8: Credit cards

- Adds: T2 Credit card account
- Becomes citeable (16): CARD 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014; MONTHLY 002; SUPPORTING_RECORD 001
- Note: Needed by 32 scenarios. Setup 6, activity 8, plus MONTHLY_002 and SUPPORTING_RECORD_001. May split setup and activity.
- Milestone A: checking, savings and cards with income, expenses, transfers, corrections and members. A usable everyday-money product.

### Slice 9: Batch entry

- Adds: L7 Batch entry
- Becomes citeable (4): EXPENSE 002, 003, 004, 005
- Note: Small; three of four need a card.

### Slice 10: Category management and classes

- Adds: S2 Category management, S3 Essential/Discretionary and review flag
- Becomes citeable (8): CATEGORIES 001, 002, 003, 004, 005, 006, 007, 008
- Note: Thin: category management only needs checking.

### Slice 11: Split expenses

- Adds: S4 Split expense
- Becomes citeable (5): SPLITS 001, 002, 003, 004, 005
- Note: Thin: splits only need checking.

### Slice 12: Bank and debt groups, account lifecycle

- Adds: W2 Bank money and Debts groups, A1 Archive and restore, A2 Close and reopen, A3 Delete with Undo
- Becomes citeable (9): ACCOUNT_LIFECYCLE 001, 002, 003, 004, 005, 006; CHECKING 012; WEALTH 003, 011
- Note: Wealth groups for bank money and debts, archive, close, delete. Card credit shows here; the overdraft-as-debt rule moved into W1 (D-022).

### Slice 13: Budgets

- Adds: S5 Budgets
- Becomes citeable (8): BUDGET 001, 002, 003, 004, 005, 006, 007; MONTHLY 003
- Note: Thin: budgets only need the month summary.

### Slice 14: Recurring bills

- Adds: S6 Recurring estimates
- Becomes citeable (10): RECURRING 001, 002, 003, 004, 005, 006, 007, 008, 009, 010
- Note: Thin: recurring only needs checking and expenses.
- Milestone B: everyday money complete (categories, splits, groups, lifecycle, budgets, recurring).

### Slice 15: Property and other assets, dated values

- Adds: T3 Valued asset, W4 As-of date, trend, stale dates, W5 Wealth change explanation
- Becomes citeable (12): DATED_VALUE 002, 004; OTHER_ASSET 002, 003, 004, 005, 006; PROPERTY 002, 003, 004, 005, 006
- Note: Manual dated values and the as-of and explanation views of wealth.

### Slice 16: Loans and mortgages

- Adds: T4 Debt account, T5 Debt payment with portions
- Becomes citeable (16): DATED_VALUE 001, 003; LOAN 001, 002, 003, 004, 005, 006; MORTGAGE 001, 002, 003, 004, 005, 006, 007, 008
- Note: Loans, mortgages, and principal/interest portions linked from checking.

### Slice 17: Investment accounts, generic setup

- Adds: T7 Investment account, T8 Draft account
- Becomes citeable (22): 401K 002, 003, 005, 006; ACCOUNT_LIFECYCLE 007; BROKERAGE 002, 003, 005, 006; HSA 002, 003, 005, 006; INV_CORRECTION 005; ROTH_IRA 002, 003, 005, 006; TRAD_IRA 002, 003, 005, 006
- Note: Five account types share one capability. Build brokerage first, parameterise the rest by type. 22 IDs are mechanical copies (002, 003, 005, 006 per type) plus LIFECYCLE_007 and INV_CORRECTION_005.

### Slice 18: Defined benefit, wealth groups, individual owners

- Adds: T6 Defined benefit plan, W3 Investment, Retirement, Health, Property groups, M3 Per-person account view, M4 Individual-owner rule
- Becomes citeable (21): 401K 007; DB 001, 002, 003, 004, 005, 006; HOLDINGS 001, 007; HOUSEHOLD_SETUP 002, 005; HSA 007; MEMBERS 002; OTHER_ASSET 001; PROPERTY 001; RETIREMENT_ACTIVITY 007; ROTH_IRA 007; TRAD_IRA 007; WEALTH 002, 008, 009
- Note: Plan value, Retirement/Investments/Health/Property groups, per-person view, individual-owner rule. Unlocks MEMBERS_002 and WEALTH_002, 008, 009.
- Milestone C: every account type can be set up and appears in its wealth group; per-person views work.

### Slice 19: Holdings and prices

- Adds: I1 Holdings, prices and views
- Becomes citeable (13): 401K 001; BROKERAGE 001; HOLDINGS 002, 003, 004, 005, 008; HSA 001; ROTH_IRA 001; SUPPORTING_RECORD 002; TRAD_IRA 001; WEALTH 001, 004
- Note: Prices, holdings, partial cost, selected vs group views. First slice that shows investment value, so the five types cite their 001 here.

### Slice 20: Purchases and sales

- Adds: I2 Purchases, I3 Sales
- Becomes citeable (13): PURCHASE 001, 002, 003, 004, 005, 006; SALE 001, 002, 003, 004, 005, 006, 007
- Note: Cash to shares and shares to cash; lot selection.

### Slice 21: Investment funding

- Adds: I4 Investment funding
- Becomes citeable (6): FUNDING 004, 005; INV_CORRECTION 008; MEMBERS 004; MONTHLY 001; WEALTH 006
- Note: Small by count, but unlocks MEMBERS_004 and INV_CORRECTION_008 and the performance slice.

### Slice 22: Performance

- Adds: I6 Performance
- Becomes citeable (19): 401K 004; BROKERAGE 004; FUNDING 001, 002, 003; HOLDINGS 006; HSA 004; JOURNEY 001, 003, 005; PERFORMANCE 001, 002, 003, 004, 007, 008; ROTH_IRA 004; TRAD_IRA 004; WEALTH 007
- Note: Performance explanation unlocks FUNDING 001 to 003, the cash-correction scenario (004) of each investment type, WEALTH_007 and JOURNEY 001, 003, 005.

### Slice 23: Dividends, interest, fees

- Adds: I5 Dividends, interest, fees
- Becomes citeable (9): EARNINGS 001, 002, 003, 004, 005, 006; PERFORMANCE 005, 006; WEALTH 010
- Note: Dividends, interest, fees, reinvestment.

### Slice 24: Investment corrections

- Adds: I7 Investment corrections
- Becomes citeable (7): INV_CORRECTION 001, 002, 003, 004, 006, 007, 009
- Note: Dependency-aware removal and Undo.

### Slice 25: Retirement and health activity

- Adds: I8 Retirement and health activity
- Becomes citeable (7): JOURNEY 006; RETIREMENT_ACTIVITY 001, 002, 003, 004, 005, 006
- Note: Payroll contribution and HSA medical flows. Last because they cross income, expenses, funding and performance.
- Milestone D: investments complete; the journey scenarios pass.

## Scenario table

Capabilities needed beyond the four built ones. "Slice" 0 means done in row 01.

| ID | Feature file | Capabilities | Slice | Flag |
| --- | --- | --- | ---: | --- |
| V2_401K_001 | accounts/401k/setup | I1, M4, P2, P4, T7, W1 | 19 |  |
| V2_401K_002 | accounts/401k/setup | T7 | 17 | J2 |
| V2_401K_003 | accounts/401k/setup | P1, T7, T8 | 17 |  |
| V2_401K_004 | accounts/401k/setup | I6, L5, P1, P2, P4, T7, W1 | 22 |  |
| V2_401K_005 | accounts/401k/setup | L8, P5, T7 | 17 |  |
| V2_401K_006 | accounts/401k/setup | P1, T7 | 17 |  |
| V2_401K_007 | accounts/401k/setup | M4, P1, P2 | 18 |  |
| V2_BROKERAGE_001 | accounts/brokerage/setup | I1, M2, P2, P4, T7, W1 | 19 |  |
| V2_BROKERAGE_002 | accounts/brokerage/setup | T7 | 17 | J2 |
| V2_BROKERAGE_003 | accounts/brokerage/setup | P1, T7, T8 | 17 |  |
| V2_BROKERAGE_004 | accounts/brokerage/setup | I6, L5, P1, P2, P4, T7, W1 | 22 |  |
| V2_BROKERAGE_005 | accounts/brokerage/setup | L8, P5, T7 | 17 |  |
| V2_BROKERAGE_006 | accounts/brokerage/setup | P1, T7 | 17 |  |
| V2_CHECKING_007 | accounts/checking/activity | L1, L2, L3, L4, L6, S1, T1, P1 | 7 |  |
| V2_CHECKING_008 | accounts/checking/activity | L1, L2, L4, P1, P2, P4, S1 | 2 |  |
| V2_CHECKING_009 | accounts/checking/activity | L1, L2, L4, L5, P1, P2, P4, S1, W1 | 3 |  |
| V2_CHECKING_010 | accounts/checking/activity | L6, P1, T1 | 7 |  |
| V2_CHECKING_011 | accounts/checking/activity | L2, L4, P1 | 1 |  |
| V2_CHECKING_012 | accounts/checking/activity | A1, L1, L6, T1 | 12 |  |
| V2_CHECKING_013 | accounts/checking/activity | L1, L2, L4, L5, P1, P2, P4, S1 | 3 |  |
| V2_CHECKING_014 | accounts/checking/activity | L1, L2, L4, L5, P1, P2, S1 | 3 |  |
| V2_CHECKING_015 | accounts/checking/activity | L2, L4, P1, S1, W1 | 1 |  |
| V2_CHECKING_016 | accounts/checking/activity | L1, L2, L4, L8, P1, P2, S1 | 4 |  |
| V2_CHECKING_018 | accounts/checking/activity | L1, L3, L5, P1, P2, P4, S1 | 3 |  |
| V2_CHECKING_001 | accounts/checking/setup | - | 0 |  |
| V2_CHECKING_002 | accounts/checking/setup | L1, L2, L3, S1 | 1 | deferred |
| V2_CHECKING_003 | accounts/checking/setup | - | 0 |  |
| V2_CHECKING_004 | accounts/checking/setup | - | 0 |  |
| V2_CHECKING_005 | accounts/checking/setup | - | 0 |  |
| V2_CHECKING_006 | accounts/checking/setup | L1, L2, L4, L9, P6, S1, W1 | 4 | deferred |
| V2_CHECKING_017 | accounts/checking/setup | - | 0 |  |
| V2_TRANSFER_001 | accounts/checking/transfers | L6, P1, P2, P4, T1 | 7 |  |
| V2_TRANSFER_002 | accounts/checking/transfers | L6, P1, P3, P4, T1 | 7 |  |
| V2_TRANSFER_003 | accounts/checking/transfers | L6, P1, S1, T1 | 7 |  |
| V2_CARD_006 | accounts/credit-cards/activity | L2, L4, L6, S1, T2, W1 | 8 |  |
| V2_CARD_007 | accounts/credit-cards/activity | L6, P1, T2 | 8 |  |
| V2_CARD_008 | accounts/credit-cards/activity | L2, L4, S1, T2 | 8 |  |
| V2_CARD_009 | accounts/credit-cards/activity | L2, L4, P1, T2 | 8 |  |
| V2_CARD_010 | accounts/credit-cards/activity | L2, L4, L5, L6, P1, P2, P4, P6, S1, T2 | 8 |  |
| V2_CARD_011 | accounts/credit-cards/activity | L2, L4, S1, T2 | 8 |  |
| V2_CARD_012 | accounts/credit-cards/activity | L4, L6, P1, S1, T2 | 8 |  |
| V2_CARD_013 | accounts/credit-cards/activity | L6, P1, P2, P3, S1, T2 | 8 |  |
| V2_CARD_001 | accounts/credit-cards/setup | T2 | 8 | J1 J2 |
| V2_CARD_002 | accounts/credit-cards/setup | L2, L4, S1, T2 | 8 |  |
| V2_CARD_003 | accounts/credit-cards/setup | T2, W1 | 8 | J2 |
| V2_CARD_004 | accounts/credit-cards/setup | T2 | 8 |  |
| V2_CARD_005 | accounts/credit-cards/setup | T2 | 8 |  |
| V2_CARD_014 | accounts/credit-cards/setup | T2 | 8 |  |
| V2_DB_001 | accounts/defined-benefit/setup | M4, P4, T6, W1 | 18 |  |
| V2_DB_002 | accounts/defined-benefit/setup | T6 | 18 | J2 |
| V2_DB_003 | accounts/defined-benefit/setup | T6, W1, W3, W5 | 18 |  |
| V2_DB_004 | accounts/defined-benefit/setup | P1, P2, T6, W3 | 18 |  |
| V2_DB_005 | accounts/defined-benefit/setup | L8, P5, T6 | 18 |  |
| V2_DB_006 | accounts/defined-benefit/setup | A1, M4, T6, W1, W3 | 18 |  |
| V2_HSA_001 | accounts/hsa/setup | I1, M4, P2, P4, T7, W1 | 19 |  |
| V2_HSA_002 | accounts/hsa/setup | T7 | 17 | J2 |
| V2_HSA_003 | accounts/hsa/setup | P1, T7, T8 | 17 |  |
| V2_HSA_004 | accounts/hsa/setup | I6, L5, P1, P2, P4, T7, W1 | 22 |  |
| V2_HSA_005 | accounts/hsa/setup | L8, P5, T7 | 17 |  |
| V2_HSA_006 | accounts/hsa/setup | P1, T7 | 17 |  |
| V2_HSA_007 | accounts/hsa/setup | M4, P1, P2 | 18 |  |
| V2_DATED_VALUE_001 | accounts/lifecycle/dated-values | P5, T3, T4, W1 | 16 |  |
| V2_DATED_VALUE_002 | accounts/lifecycle/dated-values | L8, P1, P2, P4, T3, W4 | 15 |  |
| V2_DATED_VALUE_003 | accounts/lifecycle/dated-values | L5, P1, P2, P3, T4 | 16 |  |
| V2_DATED_VALUE_004 | accounts/lifecycle/dated-values | P1, S1, T3, W5 | 15 |  |
| V2_ACCOUNT_LIFECYCLE_001 | accounts/lifecycle/manage-accounts | A1, T1, W1, W2 | 12 |  |
| V2_ACCOUNT_LIFECYCLE_002 | accounts/lifecycle/manage-accounts | A1, T2, W1, W2 | 12 |  |
| V2_ACCOUNT_LIFECYCLE_003 | accounts/lifecycle/manage-accounts | A2, L6, P1, S1, T1, W1 | 12 |  |
| V2_ACCOUNT_LIFECYCLE_004 | accounts/lifecycle/manage-accounts | A2, L6, P1, S1, T2, W1 | 12 |  |
| V2_ACCOUNT_LIFECYCLE_005 | accounts/lifecycle/manage-accounts | A3, P3, T1, W1 | 12 |  |
| V2_ACCOUNT_LIFECYCLE_006 | accounts/lifecycle/manage-accounts | A1, A2, A3, L6, P1, T1 | 12 |  |
| V2_ACCOUNT_LIFECYCLE_007 | accounts/lifecycle/manage-accounts | A3, P1, P3, T7, T8, W1 | 17 |  |
| V2_LOAN_001 | accounts/loans/manage-loans | M2, P1, T4, W1, W2 | 16 |  |
| V2_LOAN_002 | accounts/loans/manage-loans | P1, T4, W1 | 16 |  |
| V2_LOAN_003 | accounts/loans/manage-loans | L1, L4, L6, S1, S4, T4, T5, W1 | 16 |  |
| V2_LOAN_004 | accounts/loans/manage-loans | L5, P1, P2, P4, T4, W5 | 16 |  |
| V2_LOAN_005 | accounts/loans/manage-loans | T4 | 16 |  |
| V2_LOAN_006 | accounts/loans/manage-loans | P1, T5 | 16 |  |
| V2_MORTGAGE_001 | accounts/mortgage/manage-mortgage | M2, P1, T3, T4, W1 | 16 |  |
| V2_MORTGAGE_002 | accounts/mortgage/manage-mortgage | P1, T4, W1 | 16 |  |
| V2_MORTGAGE_003 | accounts/mortgage/manage-mortgage | S1, T3, T4, T5, W1 | 16 |  |
| V2_MORTGAGE_004 | accounts/mortgage/manage-mortgage | P1, P2, T5 | 16 |  |
| V2_MORTGAGE_005 | accounts/mortgage/manage-mortgage | P1, P3, S1, T5 | 16 |  |
| V2_MORTGAGE_006 | accounts/mortgage/manage-mortgage | P1, T5 | 16 |  |
| V2_MORTGAGE_007 | accounts/mortgage/manage-mortgage | T4 | 16 |  |
| V2_MORTGAGE_008 | accounts/mortgage/manage-mortgage | L5, P1, P2, T4, W5 | 16 |  |
| V2_OTHER_ASSET_001 | accounts/other-assets/setup | M2, P1, T3, W3 | 18 |  |
| V2_OTHER_ASSET_002 | accounts/other-assets/setup | P1, T3, W1 | 15 |  |
| V2_OTHER_ASSET_003 | accounts/other-assets/setup | P1, P2, P4, T3, W4, W5 | 15 |  |
| V2_OTHER_ASSET_004 | accounts/other-assets/setup | T3 | 15 |  |
| V2_OTHER_ASSET_005 | accounts/other-assets/setup | P1, T3, W1 | 15 |  |
| V2_OTHER_ASSET_006 | accounts/other-assets/setup | P1, P3, T3 | 15 |  |
| V2_PROPERTY_001 | accounts/property/setup | M2, P1, T3, W1, W3 | 18 |  |
| V2_PROPERTY_002 | accounts/property/setup | P1, T3, W1 | 15 |  |
| V2_PROPERTY_003 | accounts/property/setup | P1, P2, T3, W4, W5 | 15 |  |
| V2_PROPERTY_004 | accounts/property/setup | T3 | 15 |  |
| V2_PROPERTY_005 | accounts/property/setup | P1, P3, T3, W1, W4 | 15 |  |
| V2_PROPERTY_006 | accounts/property/setup | P5, T3, W1 | 15 |  |
| V2_ROTH_IRA_001 | accounts/roth-ira/setup | I1, M4, P2, P4, T7, W1 | 19 |  |
| V2_ROTH_IRA_002 | accounts/roth-ira/setup | T7 | 17 | J2 |
| V2_ROTH_IRA_003 | accounts/roth-ira/setup | P1, T7, T8 | 17 |  |
| V2_ROTH_IRA_004 | accounts/roth-ira/setup | I6, L5, P1, P2, P4, T7, W1 | 22 |  |
| V2_ROTH_IRA_005 | accounts/roth-ira/setup | L8, P5, T7 | 17 |  |
| V2_ROTH_IRA_006 | accounts/roth-ira/setup | P1, T7 | 17 |  |
| V2_ROTH_IRA_007 | accounts/roth-ira/setup | M4, P1, P2 | 18 |  |
| V2_SAVINGS_006 | accounts/savings/activity | L1, L3, L6, S1, T1 | 7 |  |
| V2_SAVINGS_007 | accounts/savings/activity | L6, S1, T1 | 7 |  |
| V2_SAVINGS_008 | accounts/savings/activity | L5, P1, T1, W1 | 6 |  |
| V2_SAVINGS_009 | accounts/savings/activity | L5, L6, P1, P2, P4, S1, T1, W1 | 7 |  |
| V2_SAVINGS_010 | accounts/savings/activity | L6, P1, T1 | 7 |  |
| V2_SAVINGS_001 | accounts/savings/setup | T1 | 6 | J1 J2 |
| V2_SAVINGS_002 | accounts/savings/setup | L1, L6, T1 | 7 | J2 |
| V2_SAVINGS_003 | accounts/savings/setup | T1 | 6 |  |
| V2_SAVINGS_004 | accounts/savings/setup | T1 | 6 |  |
| V2_SAVINGS_005 | accounts/savings/setup | L1, L6, L9, P6, T1 | 7 |  |
| V2_SAVINGS_011 | accounts/savings/setup | T1 | 6 |  |
| V2_TRAD_IRA_001 | accounts/traditional-ira/setup | I1, M4, P2, P4, T7, W1 | 19 |  |
| V2_TRAD_IRA_002 | accounts/traditional-ira/setup | T7 | 17 | J2 |
| V2_TRAD_IRA_003 | accounts/traditional-ira/setup | P1, T7, T8 | 17 |  |
| V2_TRAD_IRA_004 | accounts/traditional-ira/setup | I6, L5, P1, P2, P4, T7, W1 | 22 |  |
| V2_TRAD_IRA_005 | accounts/traditional-ira/setup | L8, P5, T7 | 17 |  |
| V2_TRAD_IRA_006 | accounts/traditional-ira/setup | P1, T7 | 17 |  |
| V2_TRAD_IRA_007 | accounts/traditional-ira/setup | M4, P1, P2 | 18 |  |
| V2_SUPPORTING_RECORD_001 | household/history/manage-supporting-records | P1, P2, P4, P6, T2 | 8 |  |
| V2_SUPPORTING_RECORD_002 | household/history/manage-supporting-records | I1, P1, P3, P6, T7 | 19 | U |
| V2_SUPPORTING_RECORD_003 | household/history/manage-supporting-records | P1, P6 | 4 |  |
| V2_JOURNEY_001 | household/journeys/manage-household-finances | I1, I4, I6, L1, L2, L3, L4, L6, S1, S3, S5, T1, T2, T6, T7, W1, W2, W3 | 22 |  |
| V2_JOURNEY_002 | household/journeys/manage-household-finances | L1, L2, L3, L4, L6, S1, T1 | 7 |  |
| V2_JOURNEY_003 | household/journeys/manage-household-finances | I1, I6, S1, T6, T7, W3 | 22 |  |
| V2_JOURNEY_004 | household/journeys/manage-household-finances | L1, L2, L3, L4, L9, P1, P2, S1, W1 | 4 |  |
| V2_JOURNEY_005 | household/journeys/manage-household-finances | I1, I4, I6, L1, L2, L3, L4, L6, S1, S5, S6, T1, T2, T6, T7, W1, W2, W3, W4, W5 | 22 |  |
| V2_JOURNEY_006 | household/journeys/manage-household-finances | I1, I4, I6, I8, L3, T7, W1, W5 | 25 |  |
| V2_MEMBERS_001 | household/members/manage-members | P4 | 1 |  |
| V2_MEMBERS_002 | household/members/manage-members | M2, M3, M4, T7, W1, W3 | 18 | U |
| V2_MEMBERS_003 | household/members/manage-members | L1, L5, P1, P2, P4 | 3 |  |
| V2_MEMBERS_004 | household/members/manage-members | I4, L5, M1, M4, P4, T7, W3 | 21 | U |
| V2_MEMBERS_005 | household/members/manage-members | L2, L4, M1, P2, P4 | 5 |  |
| V2_MEMBERS_006 | household/members/manage-members | M1, M2, P1 | 5 |  |
| V2_WEALTH_001 | household/overview/understand-wealth | I1, T1, T2, T6, T7, W1, W2 | 19 |  |
| V2_WEALTH_002 | household/overview/understand-wealth | T6, T7, W1, W3 | 18 |  |
| V2_WEALTH_003 | household/overview/understand-wealth | T1, T2, W1, W2 | 12 |  |
| V2_WEALTH_004 | household/overview/understand-wealth | I1, T7, W1, W4 | 19 |  |
| V2_WEALTH_005 | household/overview/understand-wealth | L2, L4, L9, P1, W1 | 4 |  |
| V2_WEALTH_006 | household/overview/understand-wealth | I4, L2, L3, L4, L5, L6, P1, P2, S1, T1, T2, T7, W1 | 21 |  |
| V2_WEALTH_007 | household/overview/understand-wealth | I6, L6, S1, T1, T2, T6, T7, W1, W5 | 22 | U |
| V2_WEALTH_008 | household/overview/understand-wealth | T1, T2, T6, T7, W1, W3 | 18 |  |
| V2_WEALTH_009 | household/overview/understand-wealth | T1, T2, T6, T7, W1, W4 | 18 | U |
| V2_WEALTH_010 | household/overview/understand-wealth | I5, I6, S1, T7, W1, W5 | 23 |  |
| V2_WEALTH_011 | household/overview/understand-wealth | L2, L4, T1, T2, W1, W2 | 12 |  |
| V2_HOUSEHOLD_SETUP_001 | household/setup/set-up-household | M2, W1 | 5 |  |
| V2_HOUSEHOLD_SETUP_002 | household/setup/set-up-household | L1, T1, T2, T6, T7, W1 | 18 | J2 |
| V2_HOUSEHOLD_SETUP_003 | household/setup/set-up-household | L3, W1 | 1 |  |
| V2_HOUSEHOLD_SETUP_004 | household/setup/set-up-household | T1 | 6 | J2 |
| V2_HOUSEHOLD_SETUP_005 | household/setup/set-up-household | M4, T7, W1, W3 | 18 |  |
| V2_INV_CORRECTION_001 | investments/corrections | I2, I7, P1, P2, P3 | 24 |  |
| V2_INV_CORRECTION_002 | investments/corrections | I3, I4, I7, L6, P1, P3 | 24 |  |
| V2_INV_CORRECTION_003 | investments/corrections | I1, I2, I6, I7, P2 | 24 |  |
| V2_INV_CORRECTION_004 | investments/corrections | I1, I6, I7, P1, P3 | 24 |  |
| V2_INV_CORRECTION_005 | investments/corrections | P1, P3, P6, T7 | 17 |  |
| V2_INV_CORRECTION_006 | investments/corrections | I2, I7, L8, P1, P2 | 24 |  |
| V2_INV_CORRECTION_007 | investments/corrections | I2, I5, I7, P1, P3 | 24 |  |
| V2_INV_CORRECTION_008 | investments/corrections | A1, A2, I4, L6, P1, T7, W3 | 21 |  |
| V2_INV_CORRECTION_009 | investments/corrections | I2, I3, I7, P1 | 24 |  |
| V2_EARNINGS_001 | investments/dividends-fees | I4, I5, I6, L6, S1, T7, W5 | 23 |  |
| V2_EARNINGS_002 | investments/dividends-fees | I2, I5, I6, P1 | 23 |  |
| V2_EARNINGS_003 | investments/dividends-fees | I1, I5, I6, T7 | 23 |  |
| V2_EARNINGS_004 | investments/dividends-fees | I5, L5, P2 | 23 |  |
| V2_EARNINGS_005 | investments/dividends-fees | I5, P1 | 23 |  |
| V2_EARNINGS_006 | investments/dividends-fees | I5, L8, P5 | 23 |  |
| V2_FUNDING_001 | investments/funding | I4, I6, L6, P4, T7, W1 | 22 |  |
| V2_FUNDING_002 | investments/funding | I4, I6, T7 | 22 |  |
| V2_FUNDING_003 | investments/funding | I4, I6, L6, T7, W1 | 22 |  |
| V2_FUNDING_004 | investments/funding | I4, L6, P1 | 21 |  |
| V2_FUNDING_005 | investments/funding | I4, L8, P1, P5 | 21 |  |
| V2_HOLDINGS_001 | investments/holdings | T7, T8, W1, W3 | 18 | U |
| V2_HOLDINGS_002 | investments/holdings | I1, T7 | 19 |  |
| V2_HOLDINGS_003 | investments/holdings | I1, T7 | 19 |  |
| V2_HOLDINGS_004 | investments/holdings | I1, T7 | 19 |  |
| V2_HOLDINGS_005 | investments/holdings | I1, P1, P6, T7 | 19 |  |
| V2_HOLDINGS_006 | investments/holdings | I1, I6, T7 | 22 |  |
| V2_HOLDINGS_007 | investments/holdings | T6, T7, W3 | 18 |  |
| V2_HOLDINGS_008 | investments/holdings | I1, P1, T7, W1 | 19 |  |
| V2_PERFORMANCE_001 | investments/performance | I1, I4, I6, L1, L6, T7 | 22 |  |
| V2_PERFORMANCE_002 | investments/performance | I1, I4, I6, T6, T7 | 22 | U |
| V2_PERFORMANCE_003 | investments/performance | I1, I4, I6, L6, T7 | 22 |  |
| V2_PERFORMANCE_004 | investments/performance | I1, I4, I6, T7 | 22 |  |
| V2_PERFORMANCE_005 | investments/performance | I5, I6, T7 | 23 |  |
| V2_PERFORMANCE_006 | investments/performance | I1, I5, I6, T7 | 23 |  |
| V2_PERFORMANCE_007 | investments/performance | I4, I6, L6, T7 | 22 |  |
| V2_PERFORMANCE_008 | investments/performance | I4, I6, T7 | 22 |  |
| V2_PURCHASE_001 | investments/purchases | I1, I2, P1, T7, W1 | 20 |  |
| V2_PURCHASE_002 | investments/purchases | I1, I2 | 20 |  |
| V2_PURCHASE_003 | investments/purchases | I1, I2, T7 | 20 |  |
| V2_PURCHASE_004 | investments/purchases | I1, I2, T7 | 20 |  |
| V2_PURCHASE_005 | investments/purchases | I2, P1, P6 | 20 |  |
| V2_PURCHASE_006 | investments/purchases | I2, L8, P5 | 20 |  |
| V2_RETIREMENT_ACTIVITY_001 | investments/retirement-health | I4, I6, I8, L1, L3, T7, W5 | 25 |  |
| V2_RETIREMENT_ACTIVITY_002 | investments/retirement-health | I4, I8, P5 | 25 |  |
| V2_RETIREMENT_ACTIVITY_003 | investments/retirement-health | I4, I6, I8, L2, L4, S1, T7 | 25 |  |
| V2_RETIREMENT_ACTIVITY_004 | investments/retirement-health | I4, I6, I8, L2, L4, L6, S1, T7 | 25 |  |
| V2_RETIREMENT_ACTIVITY_005 | investments/retirement-health | I4, I8, L2, L4, S1 | 25 | U |
| V2_RETIREMENT_ACTIVITY_006 | investments/retirement-health | I3, I8, L2, L4, P1, T7 | 25 |  |
| V2_RETIREMENT_ACTIVITY_007 | investments/retirement-health | T7, W3 | 18 |  |
| V2_SALE_001 | investments/sales | I1, I2, I3, P1 | 20 |  |
| V2_SALE_002 | investments/sales | I1, I3, T7 | 20 |  |
| V2_SALE_003 | investments/sales | I2, I3, P1 | 20 |  |
| V2_SALE_004 | investments/sales | I3, L8, P5 | 20 |  |
| V2_SALE_005 | investments/sales | I3, P1 | 20 |  |
| V2_SALE_006 | investments/sales | I2, I3, P1 | 20 |  |
| V2_SALE_007 | investments/sales | I1, I3 | 20 |  |
| V2_BUDGET_001 | spending/budgets/manage-budgets | L2, L4, S1, S5 | 13 |  |
| V2_BUDGET_002 | spending/budgets/manage-budgets | L2, L4, S1, S5 | 13 |  |
| V2_BUDGET_003 | spending/budgets/manage-budgets | L2, L4, P1, S1, S5 | 13 |  |
| V2_BUDGET_004 | spending/budgets/manage-budgets | L2, L4, S1, S5 | 13 |  |
| V2_BUDGET_005 | spending/budgets/manage-budgets | L2, L4, S1, S5 | 13 |  |
| V2_BUDGET_006 | spending/budgets/manage-budgets | L2, L4, P1, P3, S1, S5 | 13 |  |
| V2_BUDGET_007 | spending/budgets/manage-budgets | L2, L4, S1, S5 | 13 |  |
| V2_CATEGORIES_001 | spending/categories/manage-categories | L1, L2, L4, S1, S2, S3 | 10 |  |
| V2_CATEGORIES_002 | spending/categories/manage-categories | L1, L4, P1, S1, S2, S3 | 10 |  |
| V2_CATEGORIES_003 | spending/categories/manage-categories | L4, P1, P2, S1, S2 | 10 |  |
| V2_CATEGORIES_004 | spending/categories/manage-categories | P1, P3, S1, S2, S3 | 10 |  |
| V2_CATEGORIES_005 | spending/categories/manage-categories | L4, P1, S1, S2 | 10 |  |
| V2_CATEGORIES_006 | spending/categories/manage-categories | L4, P1, S1, S3 | 10 |  |
| V2_CATEGORIES_007 | spending/categories/manage-categories | L3, S1, S2 | 10 |  |
| V2_CATEGORIES_008 | spending/categories/manage-categories | S2 | 10 |  |
| V2_SPLITS_001 | spending/categories/split-expenses | L4, S1, S3, S4 | 11 |  |
| V2_SPLITS_002 | spending/categories/split-expenses | P1, P2, P4, S4 | 11 |  |
| V2_SPLITS_003 | spending/categories/split-expenses | L4, P1, S4 | 11 |  |
| V2_SPLITS_004 | spending/categories/split-expenses | P1, P3, S4 | 11 |  |
| V2_SPLITS_005 | spending/categories/split-expenses | P1, S4 | 11 |  |
| V2_EXPENSE_001 | spending/expenses/record-expenses | L2, L4, S1 | 1 |  |
| V2_EXPENSE_002 | spending/expenses/record-expenses | L4, L7, T2 | 9 |  |
| V2_EXPENSE_003 | spending/expenses/record-expenses | L4, L7, P1, T2 | 9 |  |
| V2_EXPENSE_004 | spending/expenses/record-expenses | L7, P1 | 9 |  |
| V2_EXPENSE_005 | spending/expenses/record-expenses | L7, T2 | 9 |  |
| V2_EXPENSE_006 | spending/expenses/record-expenses | L2, L4, P1, P2, S1 | 2 |  |
| V2_EXPENSE_007 | spending/expenses/record-expenses | L4, P1, P2, P4, S1, T1 | 6 |  |
| V2_EXPENSE_008 | spending/expenses/record-expenses | L6, P1, P2, S1, T1 | 7 |  |
| V2_EXPENSE_009 | spending/expenses/record-expenses | L4, P1, P3, S1 | 2 |  |
| V2_EXPENSE_010 | spending/expenses/record-expenses | L4 | 1 |  |
| V2_EXPENSE_011 | spending/expenses/record-expenses | L4, P5, S1 | 2 |  |
| V2_INCOME_001 | spending/income/record-income | L2, L3, P4, S1, W1 | 1 |  |
| V2_INCOME_002 | spending/income/record-income | L3, S1, T1 | 6 |  |
| V2_INCOME_003 | spending/income/record-income | L3, P1, P2, P4, S1, T1 | 6 |  |
| V2_INCOME_004 | spending/income/record-income | L3, P1, P3, S1 | 2 |  |
| V2_INCOME_005 | spending/income/record-income | L3 | 1 |  |
| V2_INCOME_006 | spending/income/record-income | L3, P5, S1 | 2 |  |
| V2_MONTHLY_001 | spending/monthly-review/review-spending | I4, L2, L3, L4, L6, S1, S3, T1, T2, T7 | 21 |  |
| V2_MONTHLY_002 | spending/monthly-review/review-spending | L2, L4, L6, S1, T2 | 8 |  |
| V2_MONTHLY_003 | spending/monthly-review/review-spending | S1, S5 | 13 |  |
| V2_MONTHLY_004 | spending/monthly-review/review-spending | L1, L3, L4, S1 | 1 |  |
| V2_MONTHLY_005 | spending/monthly-review/review-spending | S1 | 1 |  |
| V2_RECURRING_001 | spending/recurring/manage-recurring | L2, L4, S6 | 14 |  |
| V2_RECURRING_002 | spending/recurring/manage-recurring | L4, P1, S6 | 14 |  |
| V2_RECURRING_003 | spending/recurring/manage-recurring | L4, P1, S1, S6 | 14 |  |
| V2_RECURRING_004 | spending/recurring/manage-recurring | L4, P1, S6 | 14 |  |
| V2_RECURRING_005 | spending/recurring/manage-recurring | L4, P1, S6 | 14 |  |
| V2_RECURRING_006 | spending/recurring/manage-recurring | S6 | 14 |  |
| V2_RECURRING_007 | spending/recurring/manage-recurring | L4, P1, S6 | 14 |  |
| V2_RECURRING_008 | spending/recurring/manage-recurring | L4, P1, S6 | 14 |  |
| V2_RECURRING_009 | spending/recurring/manage-recurring | L4, P1, S6 | 14 |  |
| V2_RECURRING_010 | spending/recurring/manage-recurring | L4, S6 | 14 |  |

## Current board against this map

Where the scenarios of each current row land. A row that spreads over many slices cannot be built as one session.

| Row | Feature file | IDs | Lands in slices (count) | Last slice |
| --- | --- | ---: | --- | ---: |
| 01 | accounts/checking/setup.feature | 7 | done (5), 1 (1), 4 (1) | 4 |
| 02 | household/members/manage-members.feature | 6 | 1 (1), 3 (1), 5 (2), 18 (1), 21 (1) | 21 |
| 03 | accounts/checking/activity.feature | 11 | 1 (1), 2 (1), 3 (4), 4 (1), 7 (2), 12 (2) | 12 |
| 04 | spending/income/record-income.feature | 6 | 1 (2), 2 (2), 6 (2) | 6 |
| 05 | spending/expenses/record-expenses.feature | 11 | 1 (2), 2 (3), 6 (1), 7 (1), 9 (4) | 9 |
| 06 | household/overview/understand-wealth.feature | 11 | 4 (1), 12 (2), 18 (3), 19 (2), 21 (1), 22 (1), 23 (1) | 23 |
| 07 | household/setup/set-up-household.feature | 5 | 1 (1), 5 (1), 6 (1), 18 (2) | 18 |
| 08 | accounts/checking/transfers.feature | 3 | 7 (3) | 7 |
| 09 | accounts/savings/setup.feature | 6 | 6 (4), 7 (2) | 7 |
| 10 | accounts/savings/activity.feature | 5 | 6 (1), 7 (4) | 7 |
| 11 | accounts/credit-cards/setup.feature | 6 | 8 (6) | 8 |
| 12 | accounts/credit-cards/activity.feature | 8 | 8 (8) | 8 |
| 13 | spending/categories/manage-categories.feature | 8 | 10 (8) | 10 |
| 14 | spending/categories/split-expenses.feature | 5 | 11 (5) | 11 |
| 15 | spending/monthly-review/review-spending.feature | 5 | 1 (2), 8 (1), 13 (1), 21 (1) | 21 |
| 16 | spending/budgets/manage-budgets.feature | 7 | 13 (7) | 13 |
| 17 | spending/recurring/manage-recurring.feature | 10 | 14 (10) | 14 |
| 18 | accounts/lifecycle/manage-accounts.feature | 7 | 12 (6), 17 (1) | 17 |
| 19 | household/history/manage-supporting-records.feature | 3 | 4 (1), 8 (1), 19 (1) | 19 |
| 20 | accounts/property/setup.feature | 6 | 15 (5), 18 (1) | 18 |
| 21 | accounts/other-assets/setup.feature | 6 | 15 (5), 18 (1) | 18 |
| 22 | accounts/loans/manage-loans.feature | 6 | 16 (6) | 16 |
| 23 | accounts/mortgage/manage-mortgage.feature | 8 | 16 (8) | 16 |
| 24 | accounts/lifecycle/dated-values.feature | 4 | 15 (2), 16 (2) | 16 |
| 25 | accounts/brokerage/setup.feature | 6 | 17 (4), 19 (1), 22 (1) | 22 |
| 26 | accounts/401k/setup.feature | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| 27 | accounts/traditional-ira/setup.feature | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| 28 | accounts/roth-ira/setup.feature | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| 29 | accounts/hsa/setup.feature | 7 | 17 (4), 18 (1), 19 (1), 22 (1) | 22 |
| 30 | accounts/defined-benefit/setup.feature | 6 | 18 (6) | 18 |
| 31 | investments/holdings.feature | 8 | 18 (2), 19 (5), 22 (1) | 22 |
| 32 | investments/purchases.feature | 6 | 20 (6) | 20 |
| 33 | investments/sales.feature | 7 | 20 (7) | 20 |
| 34 | investments/funding.feature | 5 | 21 (2), 22 (3) | 22 |
| 35 | investments/dividends-fees.feature | 6 | 23 (6) | 23 |
| 36 | investments/retirement-health.feature | 7 | 18 (1), 25 (6) | 25 |
| 37 | investments/corrections.feature | 9 | 17 (1), 21 (1), 24 (7) | 24 |
| 38 | investments/performance.feature | 8 | 22 (6), 23 (2) | 23 |
| 39 | household/journeys/manage-household-finances.feature | 6 | 4 (1), 7 (1), 22 (3), 25 (1) | 25 |

## Proposed INDEX.md

Adopted as `docs/features/INDEX.md`. Rows became sessions (slices), each with the scenario IDs in scope. The per-file view is kept as a second table (file status is derived: a file is `done` when its last slice lands).

Changes made on adoption (2026-10-04):

1. `scripts/scenario-coverage.sh` takes `--slice NN`, reading IDs from `slices.txt`, with a self-test. `--require <path>` still works once a file's last slice has landed. Existing tests are unaffected.
2. `feature-session` skill and `docs/process/prompts.md`: "one row" means one slice; the kickoff names the slice number; notes file is `docs/features/slice-NN-<name>.md` (the template is unchanged).
3. `decisions.md`: D-018 (slice is the unit, refines D-008), D-019 (savings to slice 06, supersedes D-015), D-020, D-021.
4. `deferred.txt`: reasons now point to slices 01 and 04; the IDs leave when those slices land.

## Questions raised (answered 2026-10-04: Q-A to Q-H are Q-016 to Q-023 in `questions.md`)

| # | Question | Evidence | Recommendation |
| --- | --- | --- | --- |
| Q-A | Replace one-row-per-file with one-row-per-slice (the order in this map)? | 11 of 11 `checking/activity` scenarios needed 6 different sessions; rows 02 and 03 stalled for this reason | Yes. Keeps D-009, D-012, D-016 unchanged |
| Q-B | Reopen D-015 and move savings to slice 6 (before transfers, cards, categories)? | 38 scenarios need savings, 27 outside the savings files, 16 inside current rows 03 to 07. It is a type value plus interest income | Yes; savings is cheaper than the deferrals it causes |
| Q-C | Seed a default category catalog in slice 1 (L2)? | Scenarios use Rent, Utilities, Insurance, Groceries, Dining, Travel, Salary, Interest, Bonus, Bank fees, Healthcare, Gifts, Subscriptions, Entertainment, Loan interest, Mortgage interest, Other without creating them | Yes, seeded and read-only until slice 10. Alternative: type a category on first use, which changes S2 |
| Q-D | May tests seed Givens (accounts, prices, past entries) through the API or database instead of the UI? | The map is conservative: a Given needs its capability. Seeding would move some scenarios earlier (for example budgets would not need expense entry). Not computed | Keep conservative; reconsider if a slice looks too heavy |
| Q-E | Which file opens the build: record-income, record-expenses or checking/activity? | None is citeable alone. Slice 1 spans 7 files: expenses 2, income 2, monthly-review 2, checking setup 1, checking activity 1, set-up-household 1, members 1 | Open with slice 1, not a file |
| Q-F | Answer pending Q-015 (row 03): dissolve row 03 and fold its notes into slices 1, 2, 3, 4, 7, 12? | Its 11 IDs land in those 6 slices; 0 of 11 citeable as a row, as the notes found | Yes; keep the gap analysis as input to slice 1 |
| Q-G | Five investment account types in one session (slice 17: 22 IDs, most mechanical)? | Same scenario text with other names and amounts | Yes: build brokerage, then parameterise tests by type; count is large, effort is not |
| Q-H | Keep MONTHLY_005 (annual estimate, one month) in slice 1 or move it to the budgets slice? | It needs only the month summary | Optional; moving it trims slice 1 to 9 IDs |

## Least certain mappings

Review these first; a different reading changes the slice by one or two.

- MEMBERS_002: "total assets" per person needs W3 and the individual-owner rule; read as needing 401k and IRA existing.
- MEMBERS_004: "contribution history" read as an external funding entry (I4) plus a cash correction (L5).
- CHECKING_015: "household wealth treats the overdraft as debt" read as W2 (not W1).
- WEALTH_007, WEALTH_009: read as needing the whole account set (types T1, T2, T6, T7), prices and the explanation view.
- HOLDINGS_001: draft shown under "Finish setup" in the Investments view read as W3 plus T8.
- PERFORMANCE_002: "defined-benefit value is not mixed in" read as requiring T6 to exist to be shown.
- RETIREMENT_ACTIVITY_005: an August expense with no August account setup read as L4 on checking.
- SUPPORTING_RECORD_002: opening review linked to a statement read as T7 with P6, not I1 history.
- Slice order within the same capability set (for example 10 and 11) is a free choice; the map orders by value.
## Verification

Run on this file when it was written (repository root):

```bash
# 1. every scenario ID in the requirements appears once in the table, and nothing else
grep -rhoE '@V2_[A-Za-z0-9_]+' docs/requirements/v2 | tr -d @ | sort -u > /tmp/ids.req
grep -oE '^\| V2_[A-Za-z0-9_]+' docs/features/dependency-map.md | tr -d '| ' | sort > /tmp/ids.map
diff /tmp/ids.req /tmp/ids.map && wc -l < /tmp/ids.map          # 262, no diff
# 2. no ID twice
uniq -d /tmp/ids.map                                              # empty
```

Also checked by script on the written tables: every capability code in the scenario table exists in the capability list and every unbuilt capability is used by at least one scenario; each capability is built no earlier than the capabilities it requires; each scenario's slice equals the latest slice among its capabilities; slice counts sum to 262 including the 5 done.

## Review corrections (2026-10-04)

Found when the owner reviewed the adopted map. The slice order and every other mapping are unchanged.

- `V2_CHECKING_015` moves from slice 12 to slice 1 (part 01b). The step "household wealth treats the overdraft as debt" only needs W1 to count a negative bank balance as debt (D-022). Slice 1 becomes 11 scenarios, slice 12 becomes 9, and the cumulative counts before slice 12 rise by one.
- `V2_MONTHLY_004` now lists L3 and L4. Its Givens ("September Salary income is $6,000.00 and recorded expenses total $3,660.00") need income and expense entry, so it belongs to part 01b, not 01a. Its slice is unchanged.
- Slice 1 is split into 01a (5 IDs) and 01b (6 IDs) in `slices.txt` (D-023).
