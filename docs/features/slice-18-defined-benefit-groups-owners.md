# Slice 18: Defined benefit, wealth groups, individual owners

- Slice: 18 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/defined-benefit/setup.feature`, `household/overview/understand-wealth.feature`, `investments/holdings.feature`, `investments/retirement-health.feature`, `household/setup/set-up-household.feature`, `household/members/manage-members.feature`, `accounts/{401k,hsa,roth-ira,traditional-ira}/setup.feature` (007), `accounts/{property,other-assets}/setup.feature` (001)
- Status: in-progress (18a built and proven; Checkpoint 2 next). 18b and 18c are later sessions (Q-057)
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
