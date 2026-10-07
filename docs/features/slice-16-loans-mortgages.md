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

7. **D-053 (draft, promoted at Land): a loan is a debt.** `AccountType.Kind.DEBT`, `LOAN` first; Balance = opening owed + its payments and corrections, stored negative like a card; `holdsActivity` stays LEDGER only, so every ordinary writer refuses it (`LoanSetupApiTests` lists them: expense, income, refund, batch, reminder, historical, statement, transfer both ways, card payment, recurring bill, dated value). `balanceSide`/`readsAsOwed` read a loan as "$X owed", never a minus. Wealth gets a `loans` group beside `cards`; an owed loan is also a `debtLine` once. Group 2 admits the loan as the in-side of a payment; group 3 admits balance and opening corrections (`balance-corrections` and `starting-balance-corrections` are refused today only by the ledger gate).
8. **Lender**: the institution field; its over-120 message says "Lender" for a loan, "Bank" for the rest, on create and on edit.
9. **Open, not fixed (group 1):** the as-of wealth lines on the Household page list only property and other assets, so a loan shows only in the net figure on a past date; a card's line there reads with a minus sign (older than this slice).

10. **Considered, not taken (advisor, before building): a separate interest expense row (W).** The interest would be its own `expense` row on checking tied to the movement by a new column, with equal legs. Rejected: LOAN_003 says the payment opens as **one** linked $500.00 payment from either account, and W leaves two rows in the checking list; it needs ~7 single-entry writers to refuse a linked expense and two replacement chains and two remove and Undo rows for MORTGAGE_004 and 005; and the owner approved decision 4 and asked for the per-leg regression tests (addition 1). **Decision 4 stands, with the reader cost handled:** the payment is one `loan_payment` row on checking (the whole amount) with portions (D-043's shape): interest is a `category` portion (category "Loan interest", class Essential) and principal is a `principal` portion; the debt leg is `loan_payment_in` for the principal. `activity_part` shows the payment once, as its interest; `Counted` counts `loan_payment` as spending through it; `monthTotal`, `spendingByMonth` and `flowsBetween` read `activity_part` (sums are invariant for splits); a zero-interest payment has no interest portion, and the view's no-portion branch excludes `loan_payment`; `monthEntries` shows a payment's interest as its amount; `MovementService` gets per-leg amounts (`Parsed.inAmount`), identity for transfers and card payments. Identity: loan kinds join `flowsBetween`'s transfer term with the checking leg contributing only its principal portion, so `transfers` stays 0 and `other` stays 0.

11. **Group 2 as built (D-054, draft).** Decision 4 stands. `POST /api/v1/loan-payments` (create, preview, `GET /{id}`, replacement, removal, undo) is `MovementKind.LOAN_PAYMENT` on the same `MovementService`: `Parsed.inAmount` (the principal) and `Split` (principal, interest) are the only new shape; transfers and card payments get `inAmount = amount`, and `TransferRequest.principal` or `interest` on them is refused ("Principal and interest apply to a loan payment only", `LoanPaymentApiTests` order 7, seen red). Rows: `loan_payment` on the payer (whole amount, `principal` portion, interest as a `category` portion) and `loan_payment_in` on the loan (principal). Interest category found by its fixed id (`a16a0000-...-001` Loan interest, `-002` Mortgage interest, both Essential, V25), so a rename never loses it. `activity_part` shows a payment once as its interest and not at all without interest; `Counted` includes `loan_payment`; `monthTotal` and `spendingByMonth` read `activity_part`; `monthEntries` shows a payment's interest as its amount; `WealthStore.flowsBetween` counts the payer's principal portion in `transfers` and the interest in `spending` (`other` stays 0 over five periods). Overpayment: the loan's debt is read under the account locks, with a payment being replaced already removed (400, raced by two payments: one saved). Entry writers refuse the rows by whitelist (`EntryChangeService.original`), proved by `entryWritersRefuseLoanPaymentRows`. The loan page lists its payments (`activityOf` admits a loan for reading) and has only Record payment; reminders, statements and the date lookup are for ledger accounts and are not shown on a loan. Checking and savings get Pay a loan.
12. **Open, not fixed (group 2):** the Spending page lists a loan payment as an entry with its interest as the amount and kind `loan_payment` (check the label at Cowork); the loan's history table still shows an "Initial Balance" row in ledger words; a correction of the portions keeps the whole payment but the review cannot yet change the loan; no payment can be dated before the loan's start or after today (same as transfers).

## Task list (approved at checkpoint 1)

Nine groups, more than 5. Proposed split (owner item 3): see question 1.

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 (own commit) property review wording: "Value now / Value after", plus the other Balance words a property still shows | cites existing `V2_PROPERTY_00x` IDs | UI (Vitest red first) + e2e line | done (Vitest red first: 7 tests failed on the new wording before the source change; the two changed e2e lines are wording edits of existing assertions, green on the packaged jar; server history text "Value returns to"; the property page has no date lookup, so none was changed) |
| 1 DEBT kind, loan setup, edit, blank is $0.00, validation, Lender, lists, Loans group in Debts | `V2_LOAN_001`, `002`, `005` | API + UI + e2e | done (`Kind.DEBT`, `AccountType.LOAN`, the debt stored negative; `LoanSetupApiTests` 9 tests with the per-writer refusal list and a lifecycle wording test seen red without its fix; `LoanSetup.test.tsx` 9 red first, `accountChoice.test.ts` seen red; e2e `17-loans.spec.ts` seen red against the old jar (the serial run stopped at line 1, so line 2 and `V2_LOAN_005` were not seen red alone: a miss, `LOAN_005` could have been run with `--grep`); full backend green only after the dev stack was stopped, see Handoff) |
| 2 loan payment: per-leg amounts, portions, V25, spending interest, `flowsBetween` and the identity test, overpayment review | `V2_LOAN_003`, `006` | API (identity, races, replay) + UI + e2e | done (V25; `LoanPaymentApiTests` 11, `LoanPaymentRaceApiTests` 8 (create lock, overpayment race, same key, remove, replace seen red when planted away; the create-wait line stays green without the lock because the insert waits on the account foreign key, the checklist's caveat), `WealthAsOfApiTests` order 9 with loans over five periods, `LoanPayment.test.tsx` 9 (written after the components; the Confirm-off-on-error and unassigned-message behaviours seen red when planted away), e2e `18-loan-payments.spec.ts` (green on its first full run; not run alone against pre-change code, a miss: the lines are serial); full backend, frontend 306 and e2e 237 green) |
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
