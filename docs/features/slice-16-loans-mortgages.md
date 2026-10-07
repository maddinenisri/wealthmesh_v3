# Slice 16: Loans and mortgages

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: 16 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/loans/manage-loans.feature`, `accounts/mortgage/manage-mortgage.feature`, `accounts/lifecycle/dated-values.feature` (001, 003)
- Status: in-progress
- Started: 2026-10-06 21:40 EDT (session clock)  Finished:  Commit:

## Prompts and directions

Paste, verbatim, the kickoff prompt that started this session (see `docs/process/prompts.md`, note its version), then
add each instruction or answer the product owner gave at a checkpoint, with the date. No transcripts, no secrets.

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 16 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt.
Owner answers, 2026-10-06:
1. Valued accounts (property, other assets) say "Value" on screens, not "Balance"; ledger accounts keep "Balance". Fix the property review wording in this slice. For loans and mortgages, propose the wording at checkpoint 1 (for example "Balance owed") and apply it consistently.
2. Extend WealthStore.flowsBetween and the change-identity test with principal and interest kinds.
3. If the task list has more than 5 groups, propose a split at checkpoint 1 (loans first, then mortgages).
Run the visual-reviewer agent after Prove and before Checkpoint 2, and report the Cowork finding count against 8, 8, 5, 5, 5, 7, 9 and 9 so we can see whether the screenshot step helps.
Stop at the task-list approval and again when the app is ready to look at.

Owner note: the loan and mortgage wording is left open on purpose. An earlier line said "the same rule", but a loan is a debt with a balance owed, not a valued asset. The session proposes the wording; the owner checks it when checkpoint 1 is pasted.
```

- 2026-10-06 Checkpoint 1 answer: design, wording list and task list approved. Q1 split: this session is slice 16a (groups 0 to 3; IDs `LOAN_001` to `006` and `DATED_VALUE_003`), 16b (groups 4 to 8; the rest) next session; two rows in `INDEX.md` and `slices.txt`. Q2 yes: `DATED_VALUE_001` on a debt saves a planned value no reader counts; say where a debt's planned rows live and reuse slice 15's exclusion test (16b). Additions: (1) per-leg amounts must not weaken transfers and card payments: a raw-API test that a plain transfer and a card payment still refuse unequal legs, and the existing transfer, card payment and race suites run as regression; (2) one test that loan and mortgage interest spending shows the same figure on Spending, the Month review, budgets and the change explanation; both interest categories get default class Essential. Build in order, one commit per group, local only, no push, no trailer; each new e2e assertion run alone against unfixed code; visual-reviewer after Prove and before Checkpoint 2; Cowork count against 8, 8, 5, 5, 5, 7, 9 and 9.
- <date> Checkpoint 2 answer:

## Scope

All 16 IDs: `@V2_DATED_VALUE_001`, `003`; `@V2_LOAN_001` to `006`; `@V2_MORTGAGE_001` to `008`. Nothing cites `DATED_VALUE_001` or `003` today (slice 15 left them here); `001` is an Outline of 4 rows (Family Home, Family Car, Car Loan, Home Mortgage) and is cited only when all four pass.

## Gap analysis

All 16 are citeable once the debt type exists (the map is right); none is blocked. What exists and what does not:

| Need | Today | Gap |
| --- | --- | --- |
| Account type | `AccountType` kinds LEDGER, VALUED; `holdsActivity` = LEDGER only; frontend lists loan and mortgage as "(coming soon)" (D-027) | New `Kind.DEBT` (foundations 5 already names `debt`) |
| Balance | LEDGER: opening + SIGNED activity; card stored with the asset sign (D-038) | Debt is stored negative like a card, so SIGNED, `debtLines` and the debt sums need no new branch |
| Payment | `MovementService` writes two legs with **one shared amount** (`matches`, `toTransfer`, `legs` assume 2 rows, kinds `outKind` and `inKind`) | A loan payment has two different leg amounts (checking -total, debt +principal): `MovementKind` needs per-leg amounts; portions in `activity_portion` (V16 `CHECK (kind IN ('category'))` widened) |
| Interest as spending | Spending is `expense` minus `refund` in `ActivityStore.Counted` and again in `WealthStore.flowsBetween` | Interest portion enters both; categories "Loan interest" and "Mortgage interest" (V12 has "Interest charged"; "Interest" is income, so no name collision) |
| Corrections | `BalanceCorrectionService` (signed `correction` rows); a future date is refused ("The date cannot be in the future"), no reminder or plan | Debt accepted as a target; remove and Undo of a correction to verify (D-044) |
| Opening amount | `OpeningRevisionService` (D-030) | Debt accepted; shows in the change explanation (verify `accountsAdded`) |
| Wealth | `summarize` has bank, cards, valued groups; `debtLines` is any line below zero | Loans and Mortgages groups; README names the group "Debts" ("Card debt, overdrafts, loans and mortgages") |
| Frontend | Property review says "Balance now/after" (`ValueForm.tsx:160,164`) | Owner item 1; enable loan and mortgage; lender field; payment form with portions |

## Decisions (feature-local until promoted)

1. **Debt is ledger-shaped, not valued** (owner: a debt with a balance owed). `Kind.DEBT`: Balance = opening owed (stored negative) + SIGNED activity. `holdsActivity` stays LEDGER only. No `account_value` for debt: the "latest value plus later payments" hybrid is never built.
2. **Corrections reuse what exists.** `LOAN_004` (correct the initial amount) = `OpeningRevisionService` (D-030). `MORTGAGE_008` and `DATED_VALUE_003` (dated correction, remove, Undo twice) = `BalanceCorrectionService` rows. Wealth explanation "a $200.00 debt correction" = the `corrections` figure (label for a debt account); an opening revision dated inside the period must show up too (check `accountsAdded` at build).
3. **Row shapes, summed** (written before code, discriminates the design):

| | checking leg | debt leg | interest | after |
| --- | --- | --- | --- | --- |
| LOAN_003, $500 = 450 + 50 | -500.00 (`loan_payment`) | +450.00 principal (`loan_payment_in`) | 50.00 spending "Loan interest" | checking 4,500.00; loan owed 19,550.00; net worth 4,500 - 19,550 = **-15,050** (from 5,000 - 20,000 = -15,000) |
| MORTGAGE_003, $1,200 = 800 + 400 | -1,200.00 | +800.00 | 400.00 spending "Mortgage interest" | checking 3,800.00; debt 199,200.00; assets 300,000 + 3,800 = **303,800**; net worth **104,600** (fell by the 400) |

   The two legs do not cancel (-500 + 450 = -50). Identity: `flowsBetween` counts the movement's transfer part as principal only (checking leg less its interest portion, against the debt leg: net 0) and spending adds the interest portion; otherwise `other` is not zero. The identity test is written first with these two scenarios' numbers (owner item 2).
4. **Payment mechanism** stays D-040: one `MovementKind` bean `loanPayments` (a bean per noun: loan, mortgage) with per-leg amounts, one row per account ("one linked $500.00 payment and its portions"); portions `principal` and `interest` in `activity_portion` (V25 widens the check and `activity_kind_check` and `activity_movement_kind_has_movement`). Portions are in the replay fingerprint (slice 14 retro). Overpayment (`LOAN_006`: principal above the debt) and an unassigned remainder (`MORTGAGE_006`) are server rules at preview and under the lock, each with a raw-API test.
5. **Gate matrix for a debt account.** Accepted by: account edit, opening revision, balance correction (with remove and Undo), the loan payment (debt side only), lifecycle. Refused by every other writer (expense, income, refund, batch, historical, transfer, card payment, reminder, recurring, statement, value): one raw-API refusal test per writer (`ValuedSetupApiTests` pattern).
6. **Wording proposal (owner item 1).** Ledger accounts keep "Balance"; valued accounts say "Value": the property review becomes "Value now / Value after" (group 0). Loans and mortgages: the one figure is "Balance owed", shown as "$20,000.00 owed" (the scenarios' own label); setup field "Amount owed (optional)"; reviews "Balance owed now / after"; "Lender" for the institution field (cards use "Issuer"); wealth groups under Debts named "Loans" and "Mortgages"; the validation message is the scenario string "Enter zero or a positive amount owed".

## Task list (pending approval at checkpoint 1)

Nine groups, more than 5. Proposed split (owner item 3): see question 1.

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 (own commit) property review wording: "Value now / Value after", plus the other Balance words a property still shows | cites existing `V2_PROPERTY_00x` IDs | UI (Vitest red first) + e2e line | todo |
| 1 DEBT kind, loan setup, edit, blank is $0.00, validation, Lender, lists, Loans group in Debts | `V2_LOAN_001`, `002`, `005` | API + UI + e2e | todo |
| 2 loan payment: per-leg amounts, portions, V25, spending interest, `flowsBetween` and the identity test, overpayment review | `V2_LOAN_003`, `006` | API (identity, races, replay) + UI + e2e | todo |
| 3 debt correction and opening correction, remove and Undo, wealth explanation | `V2_LOAN_004`, `V2_DATED_VALUE_003` | API + UI + e2e | todo |
| 4 mortgage type and setup (a noun and group over group 1) | `V2_MORTGAGE_001`, `002`, `007` | API + UI + e2e | todo |
| 5 mortgage payment, sum rule | `V2_MORTGAGE_003`, `006` | API + UI + e2e | todo |
| 6 correct payment portions, remove and Undo a payment | `V2_MORTGAGE_004`, `005` | API + UI + e2e | todo |
| 7 dated lender correction, cancel | `V2_MORTGAGE_008` | API + UI + e2e | todo |
| 8 future-dated value for all four rows | `V2_DATED_VALUE_001` | API + UI + e2e | todo (question 2) |

An ID is cited only when its last group is green.

### Inventory

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account.type` gate (`Kind.DEBT`) | every `holdsActivity` caller (EntryService, BatchEntryService, HistoricalEntryService, BalanceCorrectionService, MoveTarget, MovementService, TransferPreviewService), `isCard`, `isValued` callers (WealthService, OpeningRevisionService, AccountLifecycleService, ValueService), AccountService (opening sign), frontend `accountTypes.ts` and the ~15 UI branches on type | AccountService create and edit | n/a (a pure rule): raw-API refusal per writer |
| loan payment legs and portions (`activity`, `activity_portion`) | MovementService, TransferPreviewService, ActivityStore (`SIGNED`, history kinds, `Counted`, `activity_part`), WealthStore.flowsBetween, month review, Budget spending, CategoryStore | loan payment create, replace, remove, Undo | payment vs payment on one debt (overpayment under the lock); payment vs correction; payment vs opening revision; same-key replay with portions; debt row `FOR UPDATE` |
| `account.opening_amount` (debt) | AccountMapper, WealthService, lifecycle | OpeningRevisionService | revision vs payment |
| `correction` rows (debt) | BalanceCorrectionService, WealthStore.flowsBetween | correct, remove, Undo | correction vs payment; double Undo |
| state matrix: archived and closed debt | all writers above | lifecycle | one test per writer by state (checklist) |

Cells to grep at build: `Counted`, `activity_part`, `SIGNED`, `kind IN (` in every repository.

## Open questions for checkpoint 1

1. **Split.** The owner asked for loans first, then mortgages. Loans and mortgages share every mechanism, so mortgage groups 4 to 7 are mostly tests and a noun. Recommended: one session for groups 0 to 3 (slice 16a: 4 groups, 7 IDs plus the debt mechanism) and a second for groups 4 to 8 (16b), with `INDEX.md` split into two rows. Fallback if you prefer one session: all nine groups and `partial` if a stop rule hits.
2. **DATED_VALUE_001 for a debt.** A future date on a correction is refused today with no reminder or plan. Options: (a) allow a `planned` `account_value` row on a debt (never effective, listed, removable, as slice 15), (b) refuse with guidance and defer `001` whole (D-016). Recommended: (a).
3. **Wording** in decision 6: approve or change.

## Decisions

Choices made that the feature file does not settle, each with the reason. Keep feature-local choices here; promote
a choice to `docs/decisions/decisions.md` only when other features will rely on it. Foundation rules live in
`docs/guides/domain-foundations.md`; do not restate them, only link.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| e.g. create a checking account | `V2_..._001`, `V2_..._002` | API + UI (MSW) + e2e | todo |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep result, not memory):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |

## Coverage

Filled from `npm run coverage -- --slice NN`: ID, test file, level. Deferred or blocked IDs also go in
`deferred.txt` with a reason.

## Open questions

Anything that needs the product owner. Add it to `docs/decisions/questions.md` as well (that is the register the
next session reads), and mark the answer and date in both places when resolved.

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |

## How it works

Written after Land by a read-only agent and checked against the code (brief in `docs/process/prompts.md`): what the
user can do now, what changed, how the main path works, decisions and open items, how to verify.

## Handoff

What the next session must know that is not in the code: what is half-built, what to watch for, what v1 showed.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session:
- What went well:
- Process change to try:
