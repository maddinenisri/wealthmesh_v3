# Slice 18: Defined benefit, wealth groups, individual owners

- Slice: 18 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/defined-benefit/setup.feature`, `household/overview/understand-wealth.feature`, `investments/holdings.feature`, `investments/retirement-health.feature`, `household/setup/set-up-household.feature`, `household/members/manage-members.feature`, `accounts/{401k,hsa,roth-ira,traditional-ira}/setup.feature` (007), `accounts/{property,other-assets}/setup.feature` (001)
- Status: in-progress (18a and 18b done and pushed; 18c, owner correction and the per-person view, at Checkpoint 1)
- Started: 2026-10-08 09:32 EDT (session clock)  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v2, slice 18), summarized, no transcript: run `feature-session` for slice 18 (size L, 21 IDs: defined benefit DB 001 to 006, wealth groups WEALTH 002, 008, 009, the one-owner rule for retirement and health types, the per-person view). Propose a split (18a, 18b, ...) with IDs, test level and what each leaves for the next; the owner suggests defined benefit as its own part and groups + per-person view + owner rule as another, to be settled from the code. Carry in: D-061 split, the Owners hint ("joint account") on retirement and health types, and the logged items "two reviews can be open at once", "creation records no creator for other account types", "Add account subtitle says first date". Every wealth reader counts an account once after the group split (net worth, Household total, each group total, per-person view, change explanation), tested with a total that adds up, every reader in the inventory. An owner rule that refuses at Confirm also refuses in the review; every lock has a test that fails when planted away (restore from a copy); one helper for type branches in the UI. Checklist lines in force: every Confirm, removal, Undo and Back ends with a sentence and the right focus; a form for a new type is read against that type's own vocabulary; a status line is dropped when its state changes. Validator, then visual-reviewer, before Checkpoint 2; `scripts/flake-check.sh` and the Vitest loop before Land; advisor at Checkpoint 1 and before Land. Do not stop between groups; stop at the task-list approval and when the app is ready to look at (or blocked 15 minutes). Report the Cowork finding count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6 and 2.
- 2026-10-08 Checkpoint 1 answer: approved the 18a task list and the 18a/18b/18c split. Q-057 yes (18a this session). Q-055 yes (overlap confirmed by WEALTH_002 and RETIREMENT_ACTIVITY_007; top-level figures come from account lines, never from a group total; a test that a defined benefit is in Retirement and not in Investments). Q-056 not built, logged. Q-058 refuse a future-dated value, in the review as well as at Confirm. Pay and interest credits never appear as income in the change explanation (a test). Inventory lists every reader of the old grouping. Flake check and Vitest loop at Land only. Do not stop between groups; stop at the app-ready checkpoint.
- Checkpoint 2 answer (2026-10-08): all nine steps pass, totals add up, the plan is in Retirement only. 5 faults (against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6 and 2); four wording or flow, one focus claim. Not verified by Cowork: 1280px by eye, Remove/Undo, Close/Delete on a plan.

## Scope

`@V2_DB_001 002 003 004 005 006`, `@V2_HOUSEHOLD_SETUP_002 005`, `@V2_WEALTH_002 008 009`, `@V2_HOLDINGS_001 007`, `@V2_RETIREMENT_ACTIVITY_007`, `@V2_OTHER_ASSET_001`, `@V2_PROPERTY_001`, `@V2_MEMBERS_002`, `@V2_401K_007`, `@V2_HSA_007`, `@V2_ROTH_IRA_007`, `@V2_TRAD_IRA_007` (21). The split below says which part carries which.

## Gap analysis (2026-10-08, from the code)

| Fact in the code | Consequence |
| --- | --- |
| `AccountType` has no defined benefit. `Kind.VALUED` (property, other asset) already gives dated values, history, Undo, corrections with a reason, a start moved earlier, the wealth line with value date and staleness, archive and close rules, and `ValueService` | A plan value is a valued type with two extra figures on a statement (pay credit, interest credit). Reuses ten readers of `isValued` instead of a new kind |
| `WealthService.summarize` puts every `isValued` line in `propertyAndOther` and every investment-kind line in `investments`. There is no Retirement, Health, Property or Other group | A defined benefit would land in "Property and other assets": a reader to fix before the type exists |
| `account_owner` is a plain list; `AccountService.update` replaces owners inside a plain edit with no review and no history. The Owners hint says "joint account" for any type with two or more owners | 401K/HSA/ROTH/TRAD_007 need: one-owner rule on create and edit, a reviewed owner correction, ownership history, cash/holdings/Balance unchanged |
| `GET /wealth` has no member filter. `GET /wealth?asOf=` and `/wealth/change` exist (slice 15) | MEMBERS_002 needs a member view; WEALTH_009 (earlier net worth, trend) is probably built (slice 15, `WealthOverTime`) and only needs a citing test and a check |
| `WealthService.line/balance` read `isValued` and `Kind` statics; the front end branches on `typeTraits(type).kind` | One helper for group membership on each side (below) |

**The scenarios overlap on purpose** (WEALTH_002, WEALTH_008, RETIREMENT_ACTIVITY_007, HOLDINGS_007): Investments holds brokerage, 401(k), IRAs, Roth IRA and HSA ($131,500 = 21,500 + 80,000 + 30,000; $140,550 with Roth and HSA); Retirement holds 401(k), Traditional IRA, Roth IRA and the defined benefit ($150,000 / $156,000); Health savings holds the HSA ($3,050). A 401(k) is in two groups; the groups are views and are never added to financial assets. The kickoff's "count an account once" is read as: net worth, financial assets, the Household total, the per-person total and the change explanation count each account once; a group total is a view and is not added to anything. The test is a partition: one `accountsOnce` set, the sum of the disjoint base parts (Bank money, Cards, Loans, Mortgages, Brokerage-and-retirement-investments, Plan value, Property, Other) equals financial assets minus debts; and each overlapping group total equals the sum of its lines. (Q-055 asks the owner to confirm this reading.)

## Proposed split (for checkpoint 1)

| Part | IDs | Test level | Leaves for the next |
| --- | --- | --- | --- |
| 18a defined benefit | DB 001, 002, 003, 004, 005, 006; HOUSEHOLD_SETUP_002 (7) | API (create with plan value, blank start, statement with pay and interest credits, correction with review and cancel, three refusals, archive with a nonzero value, owner choices; races for statement, correction, archive) + Vitest (Add account form for the type, detail, statement form, correction review) + e2e (001, 003, 004) | Health group, Property and Other assets as separate groups, the Investments overlap (401k, IRAs, Roth, HSA) and the person view. 18a ships the group helper on `AccountType`, a `retirement` group holding the plan value only, and the one-owner trait (true for DB; 401(k), IRAs, HSA flip in 18c) |
| 18b wealth groups and every reader | WEALTH 002, 008, 009; HOLDINGS 001, 007; RETIREMENT_ACTIVITY_007; HOUSEHOLD_SETUP_005; OTHER_ASSET_001; PROPERTY_001 (9) | API (groups on a total that adds up, as-of and change identity with the new groups) + Vitest (Household groups, Retirement list with owners) + e2e | The one-owner rule, the owner correction, the per-person view |
| 18c owner correction and per-person view | 401K_007, HSA_007, ROTH_IRA_007, TRAD_IRA_007; MEMBERS_002 (5) | API (the trait on four more types, reviewed owner correction with a preview that refuses what Confirm refuses, ownership history table, races vs edit and member deactivate; person view) + Vitest (owner chooser, review, person chooser) + e2e | nothing (slice 19) |

DB_006 ("cannot choose joint participation") is the one-owner rule on the defined benefit, so the server refusal on create and edit lands in 18a as a type trait; 18c flips it for the four investment types and adds the reviewed correction and its history.

Why this order: WEALTH_002 and HOLDINGS_007 need the defined benefit to exist, and the per-person view needs the finished groups, so a defined benefit first, groups second, owners and people last. The owner suggestion (groups + per-person view + owner rule together) is 14 IDs and two large reviews; the owner rule has no dependency on the groups, so it can move without breaking order. **Recommended for this session: 18a only**, then the same prompt for 18b and 18c.

Carry-in items:

| Item | Where | Reason |
| --- | --- | --- |
| Creation records no creator for other account types | 18a (the new type records `set_up` through D-062) | A new type, so no new gap. Older types stay unrecorded; the owner is asked (Q-056) |
| "Add account subtitle says first date" | 18a (Add account form is edited for the new type) | Same file, the typeTraits `dateLabel` answers it |
| Owners hint says "joint account" on retirement and health types | 18c (the rule lands there) | The hint changes with the rule |
| Two reviews can be open at once | 18c (a second review, the owner correction, is added) | Fix with one `activeReview` guard in the page, not per form |
| D-061 split | 18b | |

## Decisions

Promoted to `docs/decisions/decisions.md`: **D-064** (a defined benefit: plan statements, credits, no future plan, one participant), **D-065** (groups decided once on the type; groups are views; top-level figures from lines) and **D-066** (credits are their own terms of the change explanation). Feature-local notes:

- A defined benefit (`defined_benefit`, `Kind.VALUED`, noun "plan") is a dated value with a plan statement. It reuses `ValueService`; one new thing: a statement may carry a pay credit and an interest credit, stored as two nullable columns on `account_value` (V30), and the saved Balance is the previous effective value plus both credits (reviewed first). A correction restates the Balance with a reason and carries no credits.
- DB_002: no pension-promise field exists. The structural proof is the "No starting amount was entered; the plan's promise is not recorded here" note on a blank start and a test that no promise figure reaches any wealth reader (Q-008 pattern).
- A defined benefit takes no future plan (PROPERTY_006 only); a future date is refused with "Future values are not completed account history".
- The change explanation reads a credit as its own lines, `payCredit` and `benefitInterest`, never income and never inside "asset value change" (so the identity holds with two more terms).
- The one-owner rule is a trait of the type (`AccountType.singleOwner()`, front end `typeTraits().singleOwner`), enforced in `AccountService.checkOwners` for create and update, and in the Add and Edit forms by choosing one member (radio) with no "joint" wording. The refusal text: "A defined benefit has one participant. Choose one member."
- Group membership lives on `AccountType` once (`groups()`), and `WealthService.summarize`, the front end and the partition test all read it. `financialAssets` and `netWorth` come from the lines, never from a group total.
- WEALTH_009 and the as-of figures are checked against the file's own Background (Oct 31 needs price values, slice 19): see the gap table; an ID that cannot pass is deferred whole (D-016) at 18b.

## Task list (approval pending; 18a)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 helpers: `AccountType.groups()` (retirement group in `WealthSummary`, plan value in it and in no other group), `singleOwner` trait (server + `typeTraits`), partition test (every `AccountType` in exactly one base group), Add account subtitle names the type's own date word, creator recorded for the new type (D-062) | none alone (supports all) | unit + API | done |
| 1 create and read a plan value: Add account form for the type (Institution, Participant, Plan-reported value, As of), list, detail ("Plan-reported benefit value", no cash or holdings asked), household wealth, edit name and institution; a blank start with its note; the seven-account setup totals | DB_001, DB_002, HOUSEHOLD_SETUP_002 | API + Vitest + e2e | done |
| 2 plan statement with pay and interest credits, review of the resulting Balance, history keeps the earlier value, explanation separates the credits, no salary, cash or purchase row | DB_003 | API (+ wealth change identity) + Vitest + e2e | done |
| 3 correct a statement (reason, review shows the reduction and the household and retirement totals, Cancel leaves it, repeat and save, history keeps both with reasons and members); invalid values (negative, future, before tracking start) | DB_004, DB_005 | API + Vitest + e2e (004) | done |
| 4 participation and archive: one participant only (server refuses two, on create and edit); archive after a review of its nonzero value; it stays in wealth and retirement | DB_006 | API + Vitest + e2e | done |
| 5 prove: coverage, tests, e2e, lint, check, validator, visual-reviewer (flake check and Vitest loop at Land) | | | in progress |

Tests that must fail when the guard is planted away: the one-owner refusal (create and edit), each lock below, the group membership (a type moved to two groups), and the two statement refusals.

### Inventory (18a; every reader and writer found by grep on 2026-10-08)

New shared state: `account.type = 'defined_benefit'` (already allowed by the V2 type check), `account_value.pay_credit` and `.interest_credit` (V30, nullable).

| Row or state | Readers (grep) | Writers | Race test |
| --- | --- | --- | --- |
| `isValued` branches the type now reaches | `WealthService` 88, 114, 121, 132; `BalanceCorrectionService` 65; `OpeningRevisionService` 254; `ValueService` 550, 557; `AccountService` 115 (zero-or-positive message names the noun); `AccountLifecycleService` 159, 229, 258 (archive, close, delete reasons); `ActivityStore.VALUED_DELTAS`; front end `accountTypes.isValued/valuedNoun`, `AccountStatusCard` 66-199, `AccountDetailPage` 90-167, `AccountFormPages` 70, `AccountForms` 138, 193, 424-436, `ValueForm` 50, `HouseholdPage` 185 | create (`AccountService`), statement save and correction (`ValueService`), edit, archive, close, restore, delete | statement vs correction, statement vs archive, create vs member deactivate (`FOR SHARE`) |
| Wealth readers (net worth, financial assets, each group, as-of, change) | `GET /wealth` summary, `GET /wealth?asOf`, `GET /wealth/change`; `WealthStore.balancesAsOf`, `notYetTracked`, `flowsBetween`, `correctionsBetween`, `restatementsBetween`; front end `api/wealth.ts`, `useWealth`, `HouseholdPage`, `WealthOverTime`, and the 7 hooks that invalidate wealth (`useAccounts`, `useActivity`, `useInvestments`, `useStartingBalance`, `useTransfers`, `useValues`, `useWealth`); `mockApi.ts`; Maya's e2e specs 12, 13, 21, 22 | `WealthService.summarize` (one place) | none (read-only); the partition test is the proof |
| `account_owner` for the type | `AccountService.findAll/findById/update`, `ownerNames`, `AccountsPage`, `HouseholdPage`, `MembersCard` | `AccountService.create/update` via `AccountOwnerStore.replace`; `InvestmentSetupService` (own copy of the owner check: grep, same trait) | create/edit vs member deactivate |
| `account_value` row with credits | `ValueStore`, `ValueService.history`, `WealthStore` lateral join (effective value) | `ValueService.record/correct/remove/undo` | statement vs statement on one date (tie test), statement vs correction |
| Wealth group membership (the old grouping) | Backend: `WealthService.summarize` (was five type filters: `paysCards`, `isCard`, `LOAN` and `MORTGAGE` wire names, `isValued`, `isInvestment`), now `AccountType.inGroup`. Front end: `HouseholdPage` (six `AccountGroup` filters by `typeTraits().kind`, `isCard`, `type === 'loan'`, `type === 'mortgage'`, `isValued`, plus a draft test for investments), now `accountsIn(accounts, wealth.<group>)`. Test double: `mockApi.ts` `GET */wealth` (its own type filters: `typeTraits().kind`, `credit_card`, `loan`, `mortgage`, `investment`, `property`/`other_asset`) and `*/wealth/change` (valued types); `api/wealth.ts` (`Wealth.retirement`, `WealthChange.payCredits`), `WealthOverTime` (rows and lines for credits). Not groupings (activity gates that look alike): `holdsActivity`, `paysCards`, `accountChoice`, `SpendingPage` account chooser, `isInvestment` in `AccountController` and `takesStatements` | `AccountType` constructor argument only | `WealthPartitionApiTests`, `AccountGroupsTest` (a type moved to a second base group fails both); Vitest `Q-055` test of the Household page |
| Net worth, financial assets, debts | `GET /wealth`, `GET /wealth?asOf`, Household card, `WealthOverTime` ("Show wealth on"), the review of a statement (`netWorthBefore/After`), `WealthStore.balancesAsOf` | `WealthService.summarize` (from the lines) | `WealthPartitionApiTests` (base groups add up to net worth, now and as of a date) |
| Change explanation | `GET /wealth/change`, `WealthOverTime` Explanation | `WealthService.explain`, `WealthStore.creditsBetween` | `DefinedBenefitStatementApiTests` (credits not income; identity with `other` zero before and after a correction) |
| `activity` / transfers / entries | none: the type is not `holdsActivity` (type gate refuses; guard matrix test on the new type) | none | |

## Coverage

18a: `npm run coverage -- --require --slice 18` reports 7 of 21: all seven 18a IDs (DB 001 to 006, HOUSEHOLD_SETUP_002); the other 14 belong to 18b and 18c. WEALTH_002 and HOLDINGS_007 are named in no test title on purpose: 18a proves only that a plan is in Retirement and not Investments, which does not make those scenarios built (D-016).

## Open questions

- Q-055: 18b/18c overlap reading (Investments includes the 401(k), IRAs, Roth IRA and HSA; groups are views, never summed) and how the kickoff's "count once" is tested.
- Q-056: record the creator for other account types too (D-062 covers investments and the defined benefit only)? Default: not built.
- Q-057: run only 18a this session, then 18b and 18c as separate sessions? Default: yes.
- Q-058: a defined benefit refuses a future-dated value (no plan), unlike a property. Default: refuse.

## Validator report (18a, before the visual review)

Seven findings; all acted on or logged with a reason.

| # | Finding | Result |
| --- | --- | --- |
| 1 | A correction accepted credits, against D-064 | Fixed: refused in the review and at save ("A correction restates the plan value. Enter the corrected value"); test `correctionCarriesNoCredits`; the race test uses a plain-amount correction |
| 2 | The member lock on the create path is not proven alone (`checkOwners` reads every member FOR SHARE first, so `createWaitsForMemberRow` stays green with `memberLocked` unlocked) | Logged, not fixable by a test: the two reads are in one transaction on the same rows. The household-wide read is proven (plant red) and `memberLocked` is covered where it is the only read (`ValueRaceApiTests`, `InvestmentSetupApiTests`) |
| 3 | Missing tests: tie on one date, removed credits, same key with changed credits, credits on a property at save | Added (`twoStatementsOnOneDate` with the clock moved between saves, `removedCreditsDoNotCount`, `retryWithChangedCredits`, `creditsOnPropertyRefusedAtSave`). A statement racing an archive uses the same `keyed` path and gate as the property writer (`ValueRaceApiTests.archiveDecidesAfterTheLock`); no separate plan test |
| 4 | UI: Back focus, Remove and Undo of a statement, second-row panel | Added three Vitest tests. Back found a real fault: focus did not return to the form heading. Fixed in `ValueForm` (effect on leaving the review, save error cleared) for every valued type |
| 5 | Archived banner said "value" on a plan | Fixed ("statement") |
| 6 | `accountsIn` lists nothing while `/wealth` loads or fails | Logged: the card shows its totals and the error; the lists appear with the totals. Revisit if the Cowork pass sees an empty flash |
| 7 | Account create has no server preview, so the one-participant refusal is at save and in the radio | Q-059 |

Plants (validator): lock A, FOR SHARE reads, `checkOwners`, `checkDate`, credits folded into income or value change, plan in a second group: all red. Mock note: `mockApi.ts` picks groups by type literal (a test double; the e2e run covers the real server).

## Visual review (screenshots at 710px and 1280px, before Checkpoint 2)

Ten faults; the report's sentence and focus table matched the checklist for every step it reached.

| # | Fault | Result |
| --- | --- | --- |
| 1 | Setup sentence below the fold with a 90-character name (710) | Fixed: the arrival sentence is scrolled to the middle with its focus |
| 2 | Dates broke over two lines in the setup sentence and the Retirement row | Fixed (`withDates` for a plan's sentence, a no-wrap date in the row) |
| 3 | The early-date alert stayed beside a corrected date | Fixed: the alert goes when the date or amount changes; test added |
| 4 | Focus fell on the body after "Enter the plan-reported value instead" (and back) | Fixed: focus goes to the new first field; test added |
| 5 | Edit account on a plan: subtitle said "owner" and "value"; no sentence or history after Save | Subtitle fixed. The missing sentence and history after a plain edit is the same for every type (logged below) |
| 6 | "Asset value change" caption named only property and other assets | Fixed |
| 7 | Future and earlier date refusals left focus on Review | Fixed: the alert takes focus; test added |
| 8 | Review said "asset value increase", repeated the credits line on a correction, name ran into the label at 1280 | Fixed ("plan value", correction line, "Plan value now/after") |
| 9 | Archive sentence dropped "and in Retirement" | Fixed |
| 10 | Retirement rows said "Value dated" | Fixed ("As of") |

Not seen by the reviewer: Cancel on the setup and archive reviews, Remove and Undo of a statement (Vitest covers those), the Accounts list (Vitest). Logged, not built: a sentence and history row after a plain Edit account, for every account type.

## What to click (Checkpoint 2, 18a)

At 710px and 1280px, with `docs/process/ui-checklist.md` beside you. Read the defined benefit against its own words (Plan-reported value, Participant, Institution, As of, Statement date, Pay credit, Benefit interest credit), not a property's or a bank account's.

1. Accounts > Add account > Defined benefit. Check: Account type list has it between Other asset and Loan; Participant is a choice of one (radio), no Owners boxes, no cash or holdings, no Bank; Entered by shows. Subtitle no longer says "first date".
2. Name Harbor Cash Balance, Institution Harbor Benefits, Participant Sam, As of 2026-09-01, value 40,000.00 > Review. Check the review sentence, Back keeps the details and puts focus on the name, then Confirm. Check the sentence on the plan's page, that focus is on it, "Plan-reported benefit value", Participant.
3. Add another plan with the value blank. Check the review and page both say no starting amount was entered and that the zero is not the pension promise.
4. Edit account on the plan: name and institution change, the Balance does not, the participant is one choice.
5. Record plan statement: pay credit 1,000.00, benefit interest credit 200.00, date 2026-09-30 > Review. Check the plan value 41,200.00, the household net worth and Retirement total now and after, Back, then Confirm: one sentence, focus on "Plan statements", the history row with both credits.
6. Correct that statement to 41,100.00 with reason "Corrected statement" > Review: Replaces 41,200.00, a 100.00 decrease, totals. Cancel (focus returns to Correct), repeat, Confirm.
7. Statement dated tomorrow (a date after the app's today): the form explains and offers only another date. Dated 2026-08-31: it explains and offers the earlier-start review. Negative plan value: "Plan value must be zero or greater".
8. Archive account on the plan: the review names Retirement and the 41,100.00; Confirm; the status sentence, then Restore.
9. Household page: Retirement group holds the plan (with the note), Property and other assets does not, net worth counts it once. "What changed" 2026-09-01 to 2026-09-30: after step 6 the correction replaced the credited statement (D-064), so no credit rows show; add a second statement with credits (for example pay 500.00, interest 25.00 on 2026-09-15) to see Pay credits and Benefit interest rows, with Income unchanged.

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |
| 1 | 3 | Fixed | Credits dated before the start said "Review the earlier tracking start" but offered only "Choose another date" | e2e V2_DB_005: names the rule, offers "Report a plan value instead", focus on the alert then the value field (failed before) |
| 2 | 6 | Fixed | A correction review did not say the replaced statement's credits stop counting | e2e V2_DB_004: review says the credits stop counting (failed before) |
| 3 | wording | Fixed | What changed: "increase of $575.00 ($40,000.00 to $41,100.00)" did not say the rest is credits | e2e V2_DB_003 "Range Plan": "$150.00 of that range is the credits above" (failed before; the first run failed on a missing Idempotency-Key, fixed, then planted to prove it) |
| 4 | 1 | Not reproduced | Focus on the body after Archive and Restore (scripted click) | e2e V2_DB_006 restore: real click, status line focused after Archive and after Restore (passes before and after; the scripted click was the cause) |
| 5 | wording | Fixed | "active again" stayed beside the next statement's sentence | e2e V2_DB_006 restore: the sentence is gone once a statement panel opens, one status line after Confirm (failed before). Status card takes `staleAfter` from the values card |

## How it works

Written after Land by a read-only agent and checked against the code.

**The account and its statements**
- `AccountType.DEFINED_BENEFIT` is a valued type like a property (dated values, correction, remove and Undo, archive, close at zero) with plan wording ("Plan value", "Participant").
- A statement reports a pay credit and a benefit interest credit instead of a typed amount. They sit on the value row (`pay_credit`, `interest_credit`, `V30__plan_credits.sql`, both set or both null by a check constraint).
- `PlanStatements` holds the plan rules for the review and the save, so Confirm refuses nothing the review allowed: credits only on a plan, never with an amount or on a correction, at least one credit (the other counts as $0.00), no negatives, no future date, and a date before the start is refused.

**Working out the plan value**
- `ValueService` locks the account row first, then reads the save key. `resolve()` saves the value in force on the statement date plus both credits. `reviewOf`/`totals()` show net worth and Retirement now and after, from `WealthService`.

**Groups and net worth**
- Each `AccountType` has one `baseGroup()` (`WealthGroup`); `groups()` can add overlapping views later (18b). `AccountType.inGroup` is the one membership test, used by `WealthService.summarize`.
- Net worth, financial assets and debts are summed from the account lines, never from a group total, so an overlap cannot count an account twice. The Household page lists a group's accounts by the ids the server counted (`accountsIn`).

**One participant**
- Server: `AccountType.singleOwner()` and `AccountService.checkOwners` refuse several owners on create and edit. UI: `typeTraits().singleOwner` makes the form a single choice ("Choose one participant").

**What changed**
- `payCredits`, `benefitInterest` and `creditLines` are their own terms of the change identity, taken out of each account's value move, so they are never income, spending or value change. A line for a plan says how much of its range is credits.

**Focus and sentences**
- Confirm on a new plan opens its page with a notice that takes focus. A statement, correction, Back, Cancel and the date alerts each return focus (`ValueForm`, `ValuedAccount`). The status card drops its sentence when a statement panel opens (`staleAfter`).
- A date before the start on a credits statement explains the rule and offers "Report a plan value instead" (the earlier-start review needs a value).

## Handoff

- 18a built: 7 of 21 IDs covered (`npm run coverage -- --require --slice 18`: 14 missing, all planned for 18b and 18c, none deferred).
- 18b: WEALTH 002, 008, 009; HOLDINGS 001, 007; RETIREMENT_ACTIVITY 007; HOUSEHOLD_SETUP 005; OTHER_ASSET 001; PROPERTY 001. `AccountType.groups()` is ready for overlapping views (nothing overlaps yet); cite WEALTH_002 and HOLDINGS_007 only when the whole scenario is built (D-016). Per-person view reads the same account lines.
- 18c: 401K/HSA/ROTH_IRA/TRAD_IRA 007 and MEMBERS 002. Also carries the owner hint wording ("joint account" on retirement and health types), the "two reviews open at once" guard, and the reviewed owner correction with ownership history. `singleOwner()` is true only for a defined benefit so far (`AccountGroupsTest` says so).
- Logged, not built: Q-056 (older types record no creator), Q-059 (no create preview, so the one-participant refusal is at save and in the radio), a plain Edit account ends with no sentence or history row (every type), `accountsIn` lists nothing while `/wealth` loads, create-path member lock cannot be proven alone (`checkOwners` also locks members), `mockApi.ts` picks groups by type literal.
- Dev data: the visual review and Cowork left "VR18a …", "CW Harbor Cash Balance" and "CW Blank Pension" plans in the dev database.
- Proof run: backend 810 tests x 3 (`scripts/flake-check.sh`), Vitest 427 x 8, full Playwright.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: e2e helpers that hid a 400 (missing `Idempotency-Key`), a short label that collided only on the shared database, a lint warning on my own effect, and a scripted-click focus claim that did not reproduce.
- What went well: groups decided once on the type with a total that adds up; credits kept out of income by a test; each Cowork fault got a test that failed first.
- Process change to try: reproduce a Cowork fault with a real click at the reported width before changing code.

---

# 18b: wealth groups and every reader

Session started 2026-10-08 (after 18a was pushed at `4a17225`).

## 18b prompts and directions

- Kickoff (summarized, no transcript): run `feature-session` for slice 18b, the uncovered IDs of slice 18 planned for it: WEALTH 002, 008, 009; HOLDINGS 001, 007; RETIREMENT_ACTIVITY_007; HOUSEHOLD_SETUP_005; OTHER_ASSET_001; PROPERTY_001. Owner answers 2026-10-08: Q-055 overlap reading stands (Investments, Retirement and Health savings overlap on purpose; a group total is a view, never added; net worth and financial assets come from account lines); Q-058 stands; Q-056 stays not built. Every reader needs a "counted once" test (net worth, financial assets, Household total, each group total, change explanation) on a partition of disjoint base groups and on the overlaps (401(k) in Investments and Retirement, HSA in Investments and Health savings, a defined benefit in Retirement and not Investments); list every reader of the 18a group helper. WEALTH_009 may need slice 19 prices: check, and defer whole with a reason in `deferred.txt` if so. Carry in: focus after Archive and Restore on the defined-benefit page did not reproduce with a real click (keep on the not-verified list, look again with the visual-reviewer); "two reviews open at once" waits for 18c. Every lock has a test that fails when planted away; every Confirm, removal, Undo and Back ends with a sentence and focus; a rule that refuses at Confirm also refuses in the review. Validator then visual-reviewer before Checkpoint 2; flake check and Vitest loop before Land; advisor at Checkpoint 1 and before Land. Do not stop between groups. Report the Cowork count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2 and 5.
- 18b Checkpoint 1 answer (2026-10-08): approved. Q-060 defer WEALTH_009 whole (deferred.txt line, and a line in slice 19's notes so it comes back with the as-of reads). Q-061 yes. Q-062 yes: sentence and focus after a plain Edit save on every account type, and a history row for a rename; the owner-change history stays in 18c. Test that an owner change creates no income and does not change the Balance. D-067 as proposed (an amendment of D-065). Check that the plain Edit locks the account row; if not, fix it and prove it with a plant, not a log entry. Do not stop between groups.
- Checkpoint 2 answer (18b, 2026-10-08): all six steps pass; the groups add up (financial assets equals the sum of every account's positive Balance); 1 fault, a wording one, against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2 and 5 (the lowest so far). Q-063: keep a plain Edit allowed on a closed account, and change the closed card's wording because "no changes" is what the app now contradicts. Not verified by Cowork: 1280px Edit and Archive by eye, any save at 1280px, a small household built from scratch.

## 18b gap analysis (from the code, 2026-10-08)

| ID | What the scenario needs | In the code now | Citeable in 18b? |
| --- | --- | --- | --- |
| WEALTH_002 | Investments $131,500 and Retirement $150,000 overlap (401k and Traditional IRA in both), plan value in Retirement only, net worth unchanged, an explanation | `AccountType.groups()` is the base group only; the 401k and IRAs are in Investments only; no explanation | Yes |
| WEALTH_008 | Roth in Investments and Retirement, HSA in Investments and a Health savings group, not in Retirement; membership explained | No Health savings group | Yes |
| RETIREMENT_ACTIVITY_007 | Same with Roth $6,000 and HSA $3,050; HSA not in Retirement or Bank money | Same gap | Yes |
| HOLDINGS_007 | Investments three accounts $131,500; Retirement three accounts $150,000; plan not investment cash | Same gap | Yes |
| HOLDINGS_001 | Empty completed Investments group; a draft offered under "Finish setup"; no draft amount in wealth; no known shares, cost or return | The group is hidden when empty; drafts never count (`WealthStore`); `GET /accounts` returns drafts (`AccountsPage` lists them) so the Household page can read them; Finish setup is on the account page | Yes (empty state and draft links on the Household page) |
| HOUSEHOLD_SETUP_005 | The Retirement list shows both accounts and owners, total $110,000; Sam's 401k opens with Sam and $80,000; no second account from another list | Group lists show owners and link to the one account; the 401k is not in Retirement | Yes |
| OTHER_ASSET_001 | Car in the account list, details and the Other assets group once; Bank money and Investments exclude it; edit name and make it joint, **"confirms"**, without changing Balance or creating income | Built in slice 15 (create, edit, valued lines); no test cites the group and edit together. **A plain Edit account ends with no sentence and no history row (logged in 18a, every type)**; both scenarios end the edit with "confirms" | Yes, once the Edit-save sentence is fixed (Q-062); otherwise it stays logged and the two IDs are not cited |
| PROPERTY_001 | Home once in the property list and details; rename keeps owners, Balance and date; mortgage is separate debt | Same | Same |
| WEALTH_009 | Net worth as of Sept 30 without later transactions or prices; a trend through Oct 31 with the October increase | The feature file has no Background (checked in `understand-wealth.feature`, `holdings.feature` and `retirement-health.feature`). As-of exists. A trend is only two as-of reads and is buildable now. What cannot be shown is "only account activity and price values effective on or before September 30": no price can be recorded after setup until slice 19, so the exclusion is vacuous and a test of it proves nothing (WEALTH_004 and 007 wait on the same thing). D-016: a partly built scenario is not cited | **No: defer whole to slice 19** (owner to confirm, Q-060) |

8 of 9 citeable. The map listed WEALTH_009 under 18; it is the only one that does not hold.

## 18b proposed split of work (groups of tasks, in order; do not stop between them)

| Group | IDs | Test level | What it builds |
| --- | --- | --- | --- |
| 0 Groups on the type | WEALTH_002, 008; RETIREMENT_ACTIVITY_007; HOLDINGS_007 | Unit (`AccountGroupsTest`: every type has one base, views listed), API (`WealthPartitionApiTests`, `WealthOverlapApiTests`: counted-once on net worth, financial assets, each group total, as-of, change explanation) | `WealthGroup` gains `HEALTH_SAVINGS`; the base group is a partition tag (brokerage Investments, 401k/IRAs Retirement, HSA Health savings, plan Retirement); `groups()` adds the views; `Line` carries `groups`; `WealthSummary` gains `healthSavings` |
| 1 Household page | WEALTH_002, 008; RETIREMENT_ACTIVITY_007; HOLDINGS_001, 007; HOUSEHOLD_SETUP_005 | Vitest (`WealthGroups.test.tsx`: lists, owners, "also in", empty state, drafts), e2e at 710px and 1280px | Health savings section, overlap note naming the accounts in both groups, "also in Retirement" on the row, Investments empty state with drafts under "Finish setup", mock mirrors the server |
| 2 Property and other assets, and the Edit-save sentence | OTHER_ASSET_001, PROPERTY_001 | API (create, view, edit, joint, no income, group membership once), Vitest, e2e | Tests plus the Household assertions; if Q-062 is yes, a plain Edit account Save ends with a sentence ("<name> was updated") and focus on it, for every account type, and a history row for a rename or an owner change; no new rule on the server |
| 3 Prove | all 8 | validator, then visual-reviewer (focus and the status sentence after each step, Archive and Restore on the plan page again) | |

No new writer and no new lock in 18b (every change reads existing rows), so there is no new race; the inventory says which existing locks the readers share. Nothing new refuses at Confirm.

## 18b decisions to make (feature-local unless noted)

- **D-067 (cross-cutting, proposed as an amendment of D-065, since it reassigns the base tags D-065 introduced):** the base group is a partition tag, not what the owner sees. Brokerage is Investments; 401(k), Traditional and Roth IRAs and the defined benefit are Retirement; the HSA is Health savings. `groups()` lists the views: every investment account is also in Investments; the four retirement types are also in Retirement; the HSA is also in Health savings. Net worth and financial assets are summed from the lines, so a view cannot count an account twice. This changes 18a's base of the 401k from Investments to Retirement. After it, no displayed set partitions the accounts (Investments overlaps Retirement), so a test never sums displayed groups: it collects every `accountId` across all groups and `debtLines`, de-duplicates, sums the signed balances and asserts that equals `netWorth`; and separately asserts each account's `groups` equal its type's `groups()`. The blast radius was grepped: the Investments view keeps every investment-kind account, so `InvestmentSetupApiTests.investmentsGroup`, `InvestmentTypesApiTests` and the Investments assertions in `21-investments.spec.ts`, `InvestmentSetup.test.tsx` and `InvestmentTypes.test.tsx` stay true. What moves: `WealthPartitionApiTests.baseGroupsAddUp` (sums the JSON groups), `AccountGroupsTest` (base tags), `DefinedBenefit.test.tsx` (the mock's group literals), `mockApi.ts`, and the `WealthSummary` Javadoc (says the base groups add up).
- One combined "Property and other assets" group stays (README says "Property and Other assets"; the scenarios say "Property assets" and "Other assets group" of the same list). Not split.
- Investments shows on the Household page when the household has any investment-kind account, draft or completed (HOLDINGS_001's Given is a brokerage draft), with "No completed investment accounts" when none is completed and each draft offered under "Finish setup". A household with only a checking account shows no Investments line. The other empty groups stay hidden.
- WEALTH_009 is deferred whole to slice 19 (see the gap table).

## 18b inventory

Writers of the shared state: none new. Account type, owners and status are written by `AccountService`, `InvestmentSetupService`, `ValueService`, `AccountLifecycleService` (all unchanged and locked in 17 and 18a).

Readers of the 18a group helper (`AccountType.baseGroup()` / `groups()` / `inGroup`, `WealthSummary` groups), found by grep:

| Reader | File | What it does with groups | 18b change |
| --- | --- | --- | --- |
| Wealth summary | `WealthService.summarize`, `in()` | Filters lines by `inGroup` | Adds Health savings; group lines carry `groups` |
| Net worth and financial assets | `WealthService.summarize` | Sums the lines | Unchanged; the test proves it equals the independent sum |
| Household total and debts | `HouseholdPage` `AccountsAndWealth` | Prints the server's three figures | Unchanged |
| Each group total | `WealthSummary.Group` | `group(lines)` per view | A view total, never added |
| Group lists | `HouseholdPage` `AccountGroup`, `wealthGroups.ts accountsIn` | Lists the accounts the server counted | Health savings, "also in", overlap note, Investments empty state and drafts |
| Wealth on a date | `WealthOverTime` (uses `propertyAndOther` and the summary) | Property lines with value dates | Counted once test as of 2026-09-01; no other change |
| Change explanation | `WealthService.change` (start and end wealth, `accountsAdded`, `valueMoves`, credits) | Reads lines and rows, never a group | Test: a 401k and an HSA added in the period are counted once, `other` stays 0 |
| Plan review totals | `ValueService.totals` (`summary.retirement().total()`) | Retirement before and after | The Retirement total now includes retirement investment accounts; the after is before plus the move, so the check stays right; test |
| Value form review | `ValueForm.tsx` "Retirement total" | Prints the two totals | Unchanged |
| Archive sentence | `AccountStatusCard.tsx` ("stays in wealth and in Retirement") | Plan only | Unchanged; a 401k archive keeps its own wording (checked) |
| API client | `api/wealth.ts` (`parseGroup`, `WealthSummary`) | Parses the groups | Adds `healthSavings` and `groups` |
| Test double | `test/mockApi.ts` | Picks groups by type literal | Mirrors the new views (logged in 18a; fixed here) |
| Per-person view | does not exist | | 18c must read the same lines |
| `WealthSummary` Javadoc | `WealthSummary.java` | Says the base groups add up to net worth | Rewritten with D-067 |
| Pages that list or pick accounts by type | `AccountsPage.tsx`, the transfer and payment pickers (`accountChoice.ts`), Spending | Grepped: none reads a wealth group; they use `typeTraits` kind | No change |

Existing tests that already cite IDs near these (so 18b does not duplicate them): `WealthGroupsApiTests` and `WealthGroups.test.tsx` (WEALTH_003), `WealthApiTests` and `HouseholdOverview.test.tsx` (HOUSEHOLD_SETUP_003), `HouseholdSetupAccountsApiTests`, `DefinedBenefitSetupApiTests` and `DefinedBenefit.test.tsx` (HOUSEHOLD_SETUP_002). No test cites a 18b ID yet.

## 18b open questions

| # | Question | Default |
| --- | --- | --- |
| Q-060 | Defer WEALTH_009 whole to slice 19 (no price can be recorded after setup, no trend view exists)? | Yes, defer |
| Q-061 | Investments shows on the Household page when the household has any investment-kind account, draft or completed, with an empty sentence and drafts under "Finish setup" (HOLDINGS_001)? | Yes |
| Q-062 | OTHER_ASSET_001 and PROPERTY_001 end an edit with "confirms", and a plain Edit account Save ends with no sentence or history row today (logged in 18a). Fix it in 18b for every account type (a sentence with focus, and a history row for a rename or an owner change), or read "confirms" as a plain save and keep it logged? | Fix it |

## 18b task status and proof (written during the build)

| Group | State | Tests |
| --- | --- | --- |
| 0 Groups on the type | Done | `AccountGroupsTest` (overlaps per type), `WealthOverlapApiTests` (WEALTH_002 totals $150,000 / $131,500 / net worth $186,840; WEALTH_008 Roth and HSA; counted once across all groups, as of a date and in the change explanation; the plan review reads the Retirement total that now holds the 401k; draft counts nowhere; one account from either list), `WealthPartitionApiTests` rewritten to count each account once |
| 1 Household page | Done | `WealthGroups.test.tsx` (overlap, Roth and HSA, empty Investments with the draft, no Investments for a bank-only household, Retirement list with owners and one account), e2e `24-wealth-groups.spec.ts` at 710px and 1280px |
| 2 Property and other, Edit sentence | Done | `AccountEditApiTests` (car and home, rename history, entering member, account-row race), `AccountEdit.test.tsx`, e2e (car and home Edit at both widths) |

Plants (each restored from a copy, never `git checkout`):

| Lock or rule planted away | Test that went red |
| --- | --- |
| Financial assets summed from the group totals instead of the lines (double counting the overlaps) | `WealthOverlapApiTests`: WEALTH_002, WEALTH_008 and the as-of test |
| `activity.lockAccount` removed from `AccountService.update` | `AccountEditApiTests.editWaitsForTheAccountRow` (the edit overwrote a concurrent archive) |
| Both member `FOR SHARE` reads on the edit path removed (`checkOwners` and `memberLocked`) | `AccountEditApiTests.editWaitsForTheEnteringMemberRow` |
| "Also in" rendering and the arrival sentence removed from the UI | e2e `24-wealth-groups.spec.ts` (four tests, both widths) |

Limit found, not hidden: the member lock on the edit path cannot be proven alone, because `checkOwners` already reads every household member `FOR SHARE` in the same transaction (the same limit 18a logged for create). Removing either read alone leaves the test green; removing both turns it red.

**Lock on the plain Edit (the owner's mid-build ask):** `AccountService.update` already took the account row lock first (`activity.lockAccount`) before 18b. It had no test that failed without it. Now `AccountEditApiTests.editWaitsForTheAccountRow` holds an uncommitted archive and asserts the edit waits and then keeps the account archived; planting the lock away turned it red (`$.status expected archived but was active`, re-run by the validator and restored exact). No fix was needed. The edit also reads the entering member `FOR SHARE`: `editWaitsForTheEnteringMemberRow` turns red only when both member reads are removed (the limit above).

Existing assertions that moved with D-067: `WealthPartitionApiTests` (summed the groups), `AccountGroupsTest`, `mockApi.ts` (now one `mockGroups` double of the server rule). The Investments assertions of slices 17 and 18a stayed true.

## 18b validator report (before the visual review)

The validator (independent run) passed the readers of the group helper (none sums displayed groups), the lock on every writer of name and owners, V31 against the earlier check, `npm run coverage` (15 of 21, WEALTH_009 deferred, five 18c IDs missing), and re-ran two plants (account lock in `update`; the `investments` view in `mockGroups`), both red and restored exact. It could not run e2e (denied); the full e2e was run by me: 329 pass.

| # | Finding | Result |
| --- | --- | --- |
| 1 | The Edit sentence came back after a reload or Back (history state) | Fixed: the page clears its state once (`navigate('.', {replace: true, state: null})`); e2e reloads and expects no sentence (planted red) |
| 2 | The Edit sentence hid the Archived or Closed explanation | Fixed: the explanation shows beside the Edit sentence; Vitest on an archived car |
| 3 | No test for the plan wording, the loan wording, or an edit on an archived account | Fixed: `AccountEdit.test.tsx` (plan "Participant is now Sam", loan "Its amount of … owed", archived) |
| 4 | A foreign editor id was not tested | Fixed: `AccountEditApiTests.foreignEnteringMemberIsRefused` |
| 5 | The history list key collided for two renames at one instant | Fixed: key includes the index |
| 6 | Cancel on the Edit page ends with no sentence or stated focus | Logged: Cancel changes nothing and returns to the account page; the page opens at the top. Revisit if the Cowork pass finds it |
| 7 | Edit is offered on a closed account, whose card says "no changes until you reopen it"; the API has no status gate | Logged for the owner (Q-063): this predates 18b. Default: leave it (a rename changes no money) |
| 8 | The member lock on the edit cannot be proven alone | Logged above (both reads are removed together) |

## 18b visual review (real clicks at 710px and 1280px, before Checkpoint 2)

| # | Finding | Result |
| --- | --- | --- |
| F1 | The Edit page opens with focus on the page body | Fixed: focus on the name field (Vitest and e2e) |
| F2 | Cancel on the Edit page returns with focus on the body | Logged (validator #6): Cancel changes nothing |
| F3 | An owner or participant change has a sentence but no history row | Deferred to 18c by the owner (Q-062) |
| F4 | The overlap note listed 17 names in one paragraph (shared dev data) | Fixed: three names and "and N more" (Vitest) |
| F5 | A draft under Finish setup was only a name | Fixed: type and owner beside it (Vitest, e2e) |
| taste | Plan sentence said "value" where the card says "Plan-reported benefit value" | Fixed: "Its plan value of …" |
| taste | Loan sentence "amount of … owed" vs card "Balance owed"; owners "Maya, Sam" on the card vs "Maya and Sam" in the sentence; small tap targets in Finish setup | Left |
| carry-in | Archive and Restore on the defined benefit with real clicks: focus on the status line after each Confirm, at both widths | Did not reproduce; off the not-verified list for Chromium |

Not verified by the visual-reviewer: the "No completed investment accounts" wording (many investment accounts in the shared dev database; covered by Vitest), Edit on a Closed account (Q-063), the mortgage, card and savings types, and a real browser other than headless Chromium. The reviewer also saw gaps before punctuation in every picture (a headless-font artifact, not checked in a real browser).

## What to click (Checkpoint 2, 18b)

Use `docs/process/ui-checklist.md`. At 710px and 1280px, on `http://localhost:5180` (not 127.0.0.1). The dev database has many "VR18b …", "VR18a …" and "CW …" accounts, so the Investments note is long there; judge one small household in your head, or add a few accounts.

1. **Household, overlap.** Add a 401(k), a Roth IRA, an HSA, a brokerage and a defined benefit. Read Investments, Retirement and Health savings: the "Also in …" line on the 401(k), Roth and HSA rows, the plan in Retirement only, the sentences about both groups, "not added again". Check net worth and financial assets do not change when you open a group.
2. **Finish setup.** Save a brokerage as a draft. It appears under "Finish setup" in Investments with its type and owner, counts nowhere in wealth, and its link opens the draft.
3. **Retirement list.** Open a 401(k) from Retirement and from Investments: the same account, with its owner and balance.
4. **Edit account** for a car (make it joint), a home, a checking account, a plan (change the participant), a loan: opens with focus on the name; Save ends on the account page with one sentence on the status line (focus on it); the history shows "Renamed from …" for a rename; reload the page and the sentence does not return; open Archive and the sentence goes; on an archived account the "Archived:" line stays.
5. **Edit, Cancel and a refused save** (empty name): where does focus land.
6. **Archive then Restore** a defined benefit: sentence and focus after each.

## 18b Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |
| 1 | wording | Fixed | The loan's Edit sentence said "Its amount of $19,900.00 owed" where the loan page says "Balance owed" | Vitest `AccountEdit.test.tsx` (red first) and e2e `24-wealth-groups.spec.ts` loan Edit |

Q-063 is built: the closed card now reads "Closed: it takes no new … until you reopen it. Its name and owners can still be edited. Its history stays." (Vitest).

## Handoff (18b)

- 18b built: 15 of 21 IDs covered (`npm run coverage -- --require --slice 18`), WEALTH_009 deferred to slice 19 (`deferred.txt`, dependency map), five missing, all 18c.
- 18c: `401K_007`, `HSA_007`, `ROTH_IRA_007`, `TRAD_IRA_007` (the one-participant rule on the four investment types: flip `singleOwner` on `AccountType`, the UI follows `typeTraits().singleOwner`; `AccountType.singleOwnerMessage()` is hardcoded to "A defined benefit has one participant" and must name the type), `MEMBERS_002` (the per-person view must read the same account lines, once each, with a joint account in each member's view).
- Also 18c: the reviewed owner correction with ownership history (an owner or participant change has a sentence today but no history row: `account_event` gets an `owner_changed` action with a detail, V32); the "joint account" hint on retirement and health types; the "two reviews open at once" guard (one `activeReview` in the page); Q-059 (a create preview).
- Logged, not built: Cancel on the Edit page leaves focus on the body; the card, savings, mortgage and checking Edit sentence wording was read by the validator but not by the owner at 1280px; the member lock on the edit path cannot be proven alone (`checkOwners` also reads every member `FOR SHARE`); `accountsIn` lists nothing while `/wealth` loads; the loan sentence reads "Balance owed" and the owners "Maya and Sam" while the card says "Maya, Sam" (taste).
- Not verified: 1280px Edit and Archive by eye, a small household built from scratch, a real browser other than headless Chromium.
- Dev data: "VR18a", "VR18b", "CW" accounts remain in the dev database; the Investments note is long there.

## How it works (18b)

Written after the build by a read-only agent and checked against the code.

**Groups are decided on the type**
- `AccountType.baseGroup()` is a partition tag: brokerage Investments; 401(k), Traditional and Roth IRA Retirement; HSA `WealthGroup.HEALTH_SAVINGS`; a defined benefit Retirement. `groups()` returns the views: the base group plus Investments for every investment-kind type, so a 401(k) is in Investments and Retirement, an HSA in Investments and Health savings, and a defined benefit in Retirement only. `WealthGroup.key()` is the JSON name (`healthSavings`).
- `WealthService.line()` fills `Line.groups` from `groups()`; `summarize()` builds each group with `in(lines, group)` and adds `healthSavings`. Financial assets, debts and net worth are summed from the lines, one per account, so no overlap can count an account twice (D-067, amending D-065).

**The Household page**
- The server decides membership. `AccountGroup` lists accounts with `accountsIn` and prints "Also in …" through `alsoIn`. `overlapNote` and `overlapText` (`wealthGroups.ts`) name the accounts shared by two groups (three names, then "N more") and end with "a group total is a view and is not added again". Health savings has its own `AccountGroup`.
- Investments shows when it has completed accounts or any investment draft; with only drafts it says "No completed investment accounts". `FinishSetup` lists each draft with its type and owner as a link; a draft counts nowhere.

**The plain Edit account**
- `AccountService.update` locks the account row first, loads it, checks the owners, takes the entering member `FOR SHARE` (`editor`, `validator.memberLocked`), saves, and a rename (`renamed`) adds an `account_event` row `renamed` with the old name in `detail` (V31). The optional `enteredByMemberId` is on `AccountUpdateRequest`. An owner change has no history row until 18c.
- `editSentence.ts` builds the sentence; `AccountEditForm` focuses the name field, sends the entering member and navigates with `state: {updated}`. `AccountDetailPage` reads it once and clears the state (`navigate('.', {replace: true, state: null})`) so a reload or Back does not say it again, and passes it to `AccountStatusCard` as `arrivedWith`, which shows it on the status line with focus; its `explain` flag keeps the Archived or Closed explanation visible beside it.

**Tests:** `AccountGroupsTest`, `WealthPartitionApiTests`, `WealthOverlapApiTests`, `AccountEditApiTests` (backend); `WealthGroups.test.tsx`, `AccountEdit.test.tsx`, `mockApi.ts` (`mockGroups` mirrors the server); `e2e/tests/24-wealth-groups.spec.ts`.

---

# 18c: owner correction and the per-person view

Session started 2026-10-08 18:32 EDT (main at `b602ea5`, pushed).

## 18c prompts and directions

- Kickoff (summarized, no transcript): run `feature-session` for slice 18c: `401K_007`, `HSA_007`, `ROTH_IRA_007`, `TRAD_IRA_007`, `MEMBERS_002`. Build the individual-owner rule on the four investment types (each choice one named member, "Maya and Sam" not offered, both members can still view), a reviewed owner correction that leaves cash, holdings and Balance unchanged and keeps the previous owner in the ownership history, and the per-person view (an account counted once in the household and once in each owner's view, never split; totals add up; whole-household view). Carry in: the owner-change history row (the correction replaces the plain Edit path, no two paths), the "joint account" Owners hint changed with the rule, the "two reviews open at once" guard, Q-059 (decide from the code), Cancel focus on the Edit page, the one-participant message naming the type. A counted-once test across net worth, financial assets, each person's total, the Household total and the change explanation; every reader of owners in the inventory. The correction is a writer of the account row: lock, race test, raw-API refusal per type, rule refused in the review as well as at Confirm. Plants restored from a copy. Every Confirm, removal, Undo and Back ends with a sentence and the right focus. Validator, then visual-reviewer, before Checkpoint 2; flake check and Vitest loop before Land; advisor at Checkpoint 1 and before Land. Commit in logical pieces. Cowork count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5 and 1.
- 18c Checkpoint 1 answer (2026-10-08): approved. Q-064 yes: one reviewed owner-correction path for brokerage, the four retirement and health types and the defined benefit; the plain Edit refuses an owner change there; other types keep the plain Edit and gain the same history row. Q-065 yes: What changed stays household-wide and says so when a person is chosen. Add: MEMBERS_002's last line (joint checking appears in each person's view and is counted once for the household) is shown on the whole-household view and tested. Add a test with an existing joint row of one of the four types: it still shows, counts once, is editable for other fields, and its owner correction requires one named member. List the existing tests that move when singleOwner is turned on. Do not stop between groups.

## 18c gap analysis (from the code, 2026-10-08)

| Fact in the code | Consequence |
| --- | --- |
| `AccountType.singleOwner` is true for the defined benefit only; `checkOwners` already refuses several owners for a single-owner type on create, edit and Finish setup (`InvestmentSetupService` calls it), with `singleOwnerMessage()` hardcoded to "A defined benefit has one participant" | Flip the flag on `K401`, `TRADITIONAL_IRA`, `ROTH_IRA`, `HSA` (not brokerage: a brokerage can be joint). The message names the type. An existing joint row stays as it is until corrected |
| The plain Edit (`PUT /accounts/{id}`) replaces owners with no review and no history (a sentence only, 18b) | The owner correction becomes the only way to change owners of a type that records its creator (investment types and defined benefit). The plain Edit then refuses an owner change there. Other types keep the plain Edit (see Q-064) |
| `account_event` has `set_up`, `renamed` and the lifecycle actions, with a `detail` text (V31) | `owner_changed` with the detail "Sam → Maya" (names at the time, so a later rename of a member does not rewrite history). V32 widens the action check |
| Reviews exist for opening (`/opening-preview`), values, corrections, lifecycle; none for owners | One review endpoint for the owner correction only (Q-059 default: no preview for a create of other types; the create already refuses in the form and at save) |
| `GET /wealth` has no member filter; `WealthStore.balancesAsOf` and `notYetTracked` read all accounts; `account_owner` is read only by `AccountOwnerStore` | `GET /wealth?memberId=` filters the lines by an `EXISTS` on `account_owner`; groups, financial assets, debts and net worth come from the filtered lines (D-067), so a joint account is in each owner's view in full and once in the household |
| The Household page has the totals and groups from `useWealth()`; `MembersCard` lists members | A view selector on "Accounts and wealth" (Whole household, then each member who owns an account); the choice is in the URL (`?view=`) |
| `AccountDetailPage` has the status card (archive, restore, close, reopen, delete reviews) and, for an investment account, Finish setup and Cancel draft; the status card and `InvestmentAccount` each hold their own `review` state, and `reviewsOpened` only clears a sentence | Two reviews can be open at once. The guard: opening a review closes the other card's review (a signal both read), with a test |
| Edit page Cancel is a plain `Link` to the account page; focus ends on the body | Cancel returns with state and the account page focuses its heading |

## 18c decisions to make (feature-local unless noted)

| # | Choice | Recommendation |
| --- | --- | --- |
| Q-064 | The owner correction for which types? | Every type that records its creator (brokerage, 401(k), IRAs, Roth IRA, HSA, defined benefit), one path: the plain Edit refuses an owner change there. Not the others, because their scenarios change the owner inside the plain Edit in one step (`V2_OTHER_ASSET_001` "edits its name and changes ownership to Maya and Sam", checking/savings/card scenarios, `V2_CHECKING` cancel case), so a reviewed correction there would contradict a scenario. Owner changes on those types keep the 18b sentence and gain a history row in the same `owner_changed` action (no second review). So no type has two paths |
| Q-065 | Does the person view filter the change explanation too? | No. `GET /wealth` takes `memberId`; "What changed" stays for the whole household, and says so when a person is chosen. Its counted-once test is household-level |
| D-068 | The correction is a page (`/accounts/:id/owner`), like Edit, with a review before the save | A page has one form and one review, and cannot be open beside the status card |
| | No reason field | Moving a name changes no money; the history row says who made it and when |
| D-069 (feature-local) | What "sees checking once and the 401k once" means on the Household page, where a 401(k) is listed under Investments and Retirement | A new region "Accounts in this view" lists each account exactly once with its owners and Balance, above the groups, with a sentence "3 accounts, each counted once"; the groups stay as views with "Also in …". Counted-once e2e reads the flat list |
| | Owner label | "Owner" (not "Owners") for a single-owner type that is not a plan; "Participant" stays for the plan. Hints per type: "Choose the one member who owns this 401(k). Both members can still see it." |
| | Two-reviews guard | The correction is a page, so it adds no second review to the account page; the guard still lands for the status card vs `InvestmentAccount` (Cancel draft, Finish setup) overlap that is open since 17 |
| | Cancel focus | Cancel on Edit and on the owner page returns to the account page with the heading focused |
| | Existing joint 401(k), IRA or HSA rows | Left as they are; rename still works (owners unchanged skips the rule); the correction offers one owner |

## 18c proposed split of work (groups, in order; do not stop between them)

| Group | IDs | Test level |
| --- | --- | --- |
| 1 The rule on four types: flag, message naming the type, refusal in create, edit, correction and review per type, owner hint wording, radio on the form | `401K_007`, `HSA_007`, `ROTH_IRA_007`, `TRAD_IRA_007` (first half) | API per type; UI (Vitest); e2e |
| 2 The reviewed owner correction: review and save endpoints, lock, `owner_changed` history (V32), plain Edit refuses an owner change on those types, Balance/cash/holdings/income unchanged, previous owner in history; the page, the review, the sentence and focus | the four `_007` (second half) | API incl. race and per-type refusal; UI; e2e |
| 3 The per-person view: `memberId` on `/wealth`, selector, explanation sentence, drafts and not-tracked filtered, counted-once test | `MEMBERS_002` | API (counted once); UI; e2e |
| 4 Carry-ins: two-reviews guard; Cancel focus; Q-059 decision recorded | none | UI; e2e |

## 18c inventory

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account_owner` | `AccountOwnerStore.ownersByAccount/ownersOf` (list, get, response, edit, preview); `InvestmentSetupService.preview` (reads the draft's owners for the one-owner check; `finish` writes none, `FinishRequest` has no owners); `WealthStore.ownedBy` (the member filter); frontend `ownerNames`, `AccountsPage`, `AccountDetailPage`, `HouseholdPage` (`choices`, `jointNames`, draft filter, "Accounts in this view", `accountsIn`, `FinishSetup`), `investments/FinishSetup` (sends the account's owners to the preview, `api/investments.ts`), `MembersCard`, `editSentence`, `OwnerChoices`, `OwnerNote`, `OwnerCorrection` | `AccountService.create/update`, new `correctOwners`; `InvestmentSetupService.create` | owner correction vs an edit of the same account (account lock); member row `FOR SHARE` (limit as before: combined plant) |
| `account_event` | `AccountUsageStore.eventsOf` (status card history) | `recordEvent` from create, rename, lifecycle, new `owner_changed` | none new |
| `/wealth` lines and groups | `WealthService.summary`, Household page, WealthOverTime, `/wealth/change` (unchanged) | none | none |
| `singleOwner` flag | `checkOwners` (create, edit, finish, correction, review); frontend `typeTraits().singleOwner` | `AccountType` | none |

## 18c open questions (resolved at Checkpoint 1)

- Q-064 yes (one reviewed path for brokerage, the four retirement and health types and the defined benefit); Q-065 yes (What changed stays household-wide and says so). Q-059 decided from the code: the correction has its own review; no create preview for other types.

## 18c task status and proof (written during the build)

| Group | Status | Proof |
| --- | --- | --- |
| 1 The rule on four types | done | `AccountGroupsTest.singleOwnerTypes`; `OwnerCorrectionApiTests.twoOwnersAreRefusedPerType` (create, setup review and edit, each type, message names the type); `OwnerCorrection.test.tsx` (radios and hint per type); e2e `25` raw-API refusal per type |
| 2 The reviewed owner correction | done | `OwnerCorrectionApiTests` (13 tests: review writes nothing; Balance, opening, wealth and change unchanged; no money rows; `owner_changed` "Sam → Maya" with who; refusals the same in review and save; brokerage may be joint; plain Edit refuses an owner change; the legacy joint row; account-row lock; two at once; entering-member lock); `OwnerCorrection.test.tsx` (17); e2e `25` at 710 and 1280px |
| 3 The per-person view | done | `PersonViewApiTests` (9 tests, counted-once across net worth, financial assets, each person's total, the Household total and the change explanation: $85,000.00 / $35,000.00 / $115,000.00, 120,000.00 of people against 115,000.00); `PersonView.test.tsx` (6); e2e `25` person view at both widths |
| 4 Carry-ins | done | `TwoReviews.test.tsx` (both directions, planted red twice); Cancel focus in `OwnerCorrection.test.tsx` and e2e; Q-059 above |

**Plants (restored from a copy, `BUILD SUCCESSFUL` checked):** removing `activity.lockAccount` from `correctOwners` turned `correctionWaitsForTheAccountRow` and `twoCorrectionsTakeTurns` red; removing the member `FOR SHARE` reads (`validator.memberLocked` and `findByHouseholdIdForShare` together, as in 18b the two cover each other) turned `correctionWaitsForTheEnteringMemberRow` red; making `WealthStore.ownedBy` return no condition turned seven `PersonViewApiTests` red; removing the `closeWhen` effect, and separately the `setFinishing/setAsking(false)` closing, turned `TwoReviews.test.tsx` red.

**Existing tests that move when `singleOwner` is turned on and the owners leave the plain Edit** (listed, as asked at Checkpoint 1):

| Test | Why it moved |
| --- | --- |
| Backend `AccountGroupsTest.singleOwnerTypes` | Five one-owner types now, message names the type |
| Backend `AccountEditApiTests.renameIsInTheHistory` | The car's owner change adds an `owner_changed` row (two rows, not one) |
| Backend `DefinedBenefitSetupApiTests` V2_DB_006 two tests | The plain Edit refuses a participant change; the correction takes it (`correct` helper in `DefinedBenefitTestBase`) |
| Vitest `InvestmentTypes.test.tsx` (16 cases through `fill`) | The owner of the four types is a radio, a brokerage stays a checkbox |
| Vitest `AccountEdit.test.tsx`, `DefinedBenefit.test.tsx`, `InvestmentSetup.test.tsx` (one each) | The Edit page shows the owner and a Change owner link; its description changed |
| Vitest `MemberLifecycle.test.tsx` (4), `CardSetup.test.tsx` (1) | "Accounts in this view" repeats the names: queries are scoped to Bank money / Cards (pitfall 48) |
| e2e `22-investment-types` (owner helper), `23-defined-benefit` V2_DB_006, `01-household` (two assertions), `11b-transfers`, `11c-cards` | Radios for the four types; the refusal goes through the correction; names repeat in the view list |
| Backend `InvestmentGuardsApiTests.draftEditDetails` | Found by the validator: a draft's owner changed in the plain Edit and was refused, so a draft takes its owner in the plain Edit (no history yet) |

Full backend run after the build: 854 tests, 0 failures, three runs (`scripts/flake-check.sh`); Vitest 470 eight times in a row; e2e 338.

**Validator findings (18c, before the visual review), all addressed:** (1) a draft's owner could be changed nowhere (plain Edit refused, correction refuses drafts, Finish setup has no owners): a draft now takes its owner in the plain Edit as one choice (`checkEditOwners`), a draft that was joint opens with nobody chosen, `OwnerCorrectionApiTests.stateMatrix` and `InvestmentGuardsApiTests.draftEditDetails`; (2) seven checkstyle line lengths; (3) root typecheck on `e2e/tests/22` (a literal-type comparison); (4) the legacy joint draft can be corrected through the same plain Edit (UI test); (5) state matrix test: draft 409 in review and save, closed allowed, deleted 404; (6) inventory completed above; (7) per-type Vitest titles now carry explicit IDs; (8) logged: the view sentence calls a legacy joint 401(k) a joint account (true: it has two owners); (9) logged: on a legacy joint draft, Finish setup refuses "A 401(k) has one owner" without naming Edit as the way out (the path exists); the member filter accepts an inactive member and `memberExists` ignores the household (one household).

**Visual review (18c, 710px and 1280px, real clicks):** 8 faults, 6 taste items. Fixed with a Vitest test each: focus after a review closes another (`abandon`, planted red), the same-owner refusal and the missing Entered by (focus), the plan's refusal and history say participant, "stay" and "previous owners" for a joint row, no possessive on a long name ("Showing the accounts of …"), the Change owner link at the default size, the view list shows the type and a card's "Card credit". Logged, not fixed: 13px radio buttons and 32px status buttons (app-wide), a mortgage or house is called a "joint account" in the sentence, the View select cuts a very long name, the owner sentence and row sit in the status card, "Maya, Sam" against "Maya and Sam", the plan's review says "account". Not seen: Edit for the plan and the legacy joint 401(k), the brokerage owner page, a member with no accounts, an inactive owner.

## What to click (Checkpoint 2, 18c)

Run at 710px and 1280px with `docs/process/ui-checklist.md`. Dev data holds VR18c accounts (a 401(k), Traditional and Roth IRA, HSA, pension, a joint checking, a draft brokerage, and "VR18c Joint 401k legacy", which has Maya and Sam as owners again for step 4; the backend was restarted on the final code).

1. **Rule on the four types.** Add account → 401(k): Owner is a choice of one named member (no "Maya and Sam"), the hint says everyone in the household can still see it. Repeat for Traditional IRA, Roth IRA, HSA; a Brokerage still offers several owners; a defined benefit says Participant.
2. **Edit shows the owner, it does not edit it.** Open a 401(k) → Edit account: the owner is text with a Change owner button; rename it and save (sentence, focus). Cancel returns with the account name focused.
3. **Reviewed owner correction.** Change owner → pick the other member → Review (names the previous and new owner, "cash, holdings and Balance of $X stay the same") → Back (focus on your choice) → Review → Confirm: the account page opens on a sentence with focus; the Status history says "Owner changed: Sam → Maya by …"; the Balance and wealth did not move. Try naming the same owner, no Entered by, and Cancel from the review.
4. **The legacy joint 401(k).** It still shows once, can be renamed, and Change owner opens with nobody chosen and needs one member.
5. **Per-person view.** Household page → View: choose each person and Whole household. Each account appears once under "Accounts in this view"; the sentence names the joint accounts ("appear in each person's view and are counted once for the household"); the totals of two people are more than the household because a joint account is in both. Reload keeps the person. "Wealth on a date" says it is for the whole household.
6. **One review at a time.** On a draft investment account open Delete (or another status review), then Cancel draft: the first closes and focus is in the new one.

Report: faults only (count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5 and 1), with step, width and what you saw.

### Cowork findings (Checkpoint 2, 18c)

1 fault against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5 and 1.

| # | Step | Width | Saw | Fix |
| --- | --- | --- | --- | --- |
| 1 | 4 legacy joint 401(k) | 710 | Edit page said "Owner: Maya, Sam" for two people | `OwnerNote` says "Owners" when there is more than one; Vitest assertion failed first (`OwnerCorrection.test.tsx`); a plan reads "Participants" |

Data note: the legacy account's owners had been set back by SQL, so its history ended with "Owner changed: Maya → Sam". The two `owner_changed` rows were deleted from the dev data. Not an app fault.

Deviation: no e2e for this fault. A joint 401(k) cannot be created through the API any more and e2e has no seed path for a pre-rule row, so the red-first assertion is Vitest. A legacy-row e2e seed helper is a follow-up.

## Handoff (18c)

- 18c built: 5 of 5 IDs; slice 18 has 20 of 21 covered, WEALTH_009 deferred to slice 19.
- Proof: backend 854 × 3, Vitest 470 × 3 after the last change (8 earlier), e2e 338 before the wording fix, lint and typecheck clean.
- Logged, not built: 13px radios and 32px status buttons (app-wide); a mortgage or house reads "joint account"; the View select truncates a long name; "Maya, Sam" against "Maya and Sam"; Finish setup on a legacy joint draft refuses without naming Edit; the member filter accepts an inactive member; `ValuedAccount` and `Activity` reviews sit outside the one-review guard; no e2e seed path for a pre-rule joint row.
- Dev data: "VR18c" and "CW" accounts remain.
