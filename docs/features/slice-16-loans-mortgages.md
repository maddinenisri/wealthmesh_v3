# Slice 16: Loans and mortgages

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: 16a (and 16b, next) in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/loans/manage-loans.feature`, `accounts/mortgage/manage-mortgage.feature`, `accounts/lifecycle/dated-values.feature` (001, 003)
- Status: done for 16a (loans, groups 0 to 3); 16b (mortgages) is the next session
- Started: 2026-10-06 21:40 EDT (session clock)  Finished: 2026-10-07  Commit: `6a14bad`, pushed 2026-10-07

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
- 2026-10-07 Checkpoint 2 answer: 8 faults against 8, 8, 5, 5, 5, 7, 9 and 9 (22 found by the screenshot step before); the slice is right on the numbers. Owner: make ledger Balance corrections removable with Undo (done). Asked: is a dated correction stored as a change, not a figure, the wanted behaviour (folded into the open Q-031 with a note; the owner decides).

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

13. **Group 3 as built (D-053 continued).** A loan's corrections are the existing mechanisms with debt wording: the initial amount is an `opening_revision` (typed as an amount owed, stored negative, the original and reason kept) and a dated correction is a signed `correction` row (`balance-corrections`), both refused for a negative amount owed. **A debt never becomes an asset** (`DebtRules.requireNotCredit`, 409, read under the account lock after the change, so a refusal rolls it back): it guards a correction (including one dated before a payment), a new initial amount below what was paid, the removal or Undo of a correction, and the Undo of a payment; `LoanCorrectionApiTests` order 9 proves each cell and the race tests prove two of them against a concurrent payment. A loan's correction row can be **removed and brought back** (a repeat Undo is the same 200); this is the one place a Balance correction is removable: a ledger account still replaces it (decision for the owner at Checkpoint 2, `EntryChangeService.original`). The wealth change explanation gains two lists, neither a term of the identity: `correctionLines` (each Balance correction dated in the period: "a $200.00 debt correction", for a loan) and `restatements` (each starting amount corrected in the period, dated by the day it was made, because every date's figure already uses the corrected amount, so a restatement explains a difference with earlier reports). LOAN_004's "$200.00 debt correction" is the restatement; DATED_VALUE_003's and MORTGAGE_008's is a correction line.
14. **Open, not fixed (group 3):** the opening-revision lock is not proven by a race test (planting it away stays green); the "Initial Balance" row in a loan's history table still reads in ledger words; a ledger account's Balance correction cannot be removed (only replaced), by design above; the date lookup, reminders and statements are not offered on a loan.

15. **Validator report (after Prove; commit follows group 3).** Finding 1, fixed: the credit rule read only today's total, so a $1,500 payment dated 09-15 saved on a loan whose debt a correction raised on 09-25 left a credit on the days between (and in as-of wealth). `DebtRules.requireNotCredit` now walks the Balance on every date (`ActivityStore.dailyChanges`), and a payment create or replace calls it after the insert as well (`LoanCorrectionApiTests` order 11, seen red with the per-date check planted away). Finding 2, fixed: tests for a correction Undo and a correction replacement that would leave a credit (order 12). Finding 3: a payment keeps saving when "Loan interest" is archived (the portion keeps the category, shown archived; a merge is followed by the views): decided, tested (order 13). Left open and logged: ledger words in the Accounts list headings for a loan (a mixed list), "is back with its Balance" after a deleted loan returns, the history table's "Initial Balance" row, the inventory rows for `AccountUsageStore`, `RecurringStore` and `PortionStore` readers, no state-matrix cell for a payment on a closed loan or removal on an archived one, the opening-revision lock not proven by a race, no tie test for two corrections on one date in the explanation, no long-name or long-list e2e check, and no second-row panel test. The e2e lines of groups 2 and 3 were green on first run, never run red alone.

## Task list (approved at checkpoint 1)

Nine groups, more than 5. Proposed split (owner item 3): see question 1.

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 (own commit) property review wording: "Value now / Value after", plus the other Balance words a property still shows | cites existing `V2_PROPERTY_00x` IDs | UI (Vitest red first) + e2e line | done (Vitest red first: 7 tests failed on the new wording before the source change; the two changed e2e lines are wording edits of existing assertions, green on the packaged jar; server history text "Value returns to"; the property page has no date lookup, so none was changed) |
| 1 DEBT kind, loan setup, edit, blank is $0.00, validation, Lender, lists, Loans group in Debts | `V2_LOAN_001`, `002`, `005` | API + UI + e2e | done (`Kind.DEBT`, `AccountType.LOAN`, the debt stored negative; `LoanSetupApiTests` 9 tests with the per-writer refusal list and a lifecycle wording test seen red without its fix; `LoanSetup.test.tsx` 9 red first, `accountChoice.test.ts` seen red; e2e `17-loans.spec.ts` seen red against the old jar (the serial run stopped at line 1, so line 2 and `V2_LOAN_005` were not seen red alone: a miss, `LOAN_005` could have been run with `--grep`); full backend green only after the dev stack was stopped, see Handoff) |
| 2 loan payment: per-leg amounts, portions, V25, spending interest, `flowsBetween` and the identity test, overpayment review | `V2_LOAN_003`, `006` | API (identity, races, replay) + UI + e2e | done (V25; `LoanPaymentApiTests` 11, `LoanPaymentRaceApiTests` 8 (create lock, overpayment race, same key, remove, replace seen red when planted away; the create-wait line stays green without the lock because the insert waits on the account foreign key, the checklist's caveat), `WealthAsOfApiTests` order 9 with loans over five periods, `LoanPayment.test.tsx` 9 (written after the components; the Confirm-off-on-error and unassigned-message behaviours seen red when planted away), e2e `18-loan-payments.spec.ts` (green on its first full run; not run alone against pre-change code, a miss: the lines are serial); full backend, frontend 306 and e2e 237 green) |
| 3 debt correction and opening correction, remove and Undo, wealth explanation | `V2_LOAN_004`, `V2_DATED_VALUE_003` | API + UI + e2e | done (`LoanCorrectionApiTests` 11 and `LoanCorrectionRaceApiTests` 5: the credit rule on correction, removal, opening and payment Undo, the loan-correction removal gate and the restatement query each seen red when planted away, the correction and removal locks too; the opening-revision lock is NOT caught by its race test when planted away (the revision's insert waits on the account foreign key) and is logged below; `LoanCorrection.test.tsx` 6 and a `WealthOverTime` test written red first; e2e `19-loan-corrections.spec.ts` green on its first full run, not run alone against pre-change code; full backend, frontend 313 and e2e 245 green) |
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

## Cowork findings, owner's pass (2026-10-07)

8 faults, 710px with real clicks, 1280px by opening and cancelling panels. Fixed, each with a Vitest or API test seen red first unless noted:

| # | Fault seen | Fix |
| --- | --- | --- |
| 1 | Removing a loan correction said "Removed null."; the history button was "Undo entry" | "Removed the balance correction."; "Undo correction of 2026-09-30" |
| 2 | A new initial amount that would leave a credit was reviewed with Confirm on, refused only after Confirm | The review refuses it up front (409) for the initial amount and for a dated correction (`LoanCorrectionApiTests` order 14), Confirm stays off |
| 3 | The refusal stayed on the next review after Back | Back clears the save error (Vitest, `failNextSave`) |
| 4 | After Confirm payment or Confirm correction focus went to a far button, no status line | A sentence says what was saved and the Activity heading takes focus (Vitest) |
| 5 | Back from a review, and Confirm removal and Undo, left focus on the page body | Back focuses the form heading (payment, correction, initial amount); removal and Undo announce (Vitest). e2e line for Back on the initial amount |
| 6 | "Loan interest" could be archived but payments still saved into it | The two interest categories cannot be archived or merged away (409, rename allowed): `LoanCorrectionApiTests` order 13 |
| 7 | Two payments from one account had identical button names; a row showed only the principal | Names carry the amount and date; the loan row says "Part of a $500.00 payment, $50.00 of it interest" (`paymentTotal`, `paymentInterest`, API and Vitest) |
| 8 | "Balance owed $20,000.00 owed"; "Starting balance correction" in a loan's history; Edit payment Reason not marked optional | The details figure drops "owed"; "Initial amount correction"; "Reason (optional)". The Accounts list heading was changed to "Bank or lender" in `781a47b`; the owner's build predates it and the dev stack now serves it |

Owner's two questions: (a) ledger corrections removable with Undo: yes, built (`EntryChangeService`, the Remove button for every correction, `CorrectCorrectionApiTests` guard test rewritten, `aLedgerCorrectionIsRemovableToo`). (b) a dated correction is stored as a signed change plus the requested figure (slice 03): this is open Q-031 (slice 04), so it is not a second question: kept as built; the form says "Enter what was owed at the end of that day" and the review shows the change. A cheap improvement if wanted: a form hint "a later change to an earlier amount moves this figure".

## Coverage

Filled from `npm run coverage -- --slice NN`: ID, test file, level. Deferred or blocked IDs also go in
`deferred.txt` with a reason.

## Open questions

Anything that needs the product owner. Add it to `docs/decisions/questions.md` as well (that is the register the
next session reads), and mark the answer and date in both places when resolved.

## Cowork findings

Count against 8, 8, 5, 5, 5, 7, 9 and 9. The owner's pass is pending (Checkpoint 2). The `visual-reviewer` ran first, after Prove and the validator, on about 60 states at 710px and 1280px: **22 faults**, none a data fault, none a sideways scroll. All but the three minor ones below were fixed with a Vitest or e2e line (red first where noted); 16 of the 22 were wording or line breaks, 3 were signs, 1 focus, 1 duplicate message, 1 wrong sentence.

| # | Screen | Fault seen | Fix |
| --- | --- | --- | --- |
| 1 | Spending, Loan interest entries | A loan payment read "Split expense", "of $50.00 payment", no loan named | "Interest on payment to <loan>", "Interest part of a payment", a Payment and Category detail (e2e) |
| 2 | Update balance owed review, initial amount review | Focus on the page body | The review heading takes focus (Vitest and e2e, seen red) |
| 3, 4, 12 | Loan list, history, Undo review | Bare minus signs meaning "debt went down" in one list and the opposite in another | "$450.00 paid", "$200.00 less owed" (`loanChangeText`), history opening shows "$20,200.00 owed" (Vitest) |
| 5, 6, 7, 8, 16 | Dates and "owed" broke over lines | Review sentence, review label, removal sentence, history Saved by, Household "owed" | `whitespace-nowrap` / `Dated` / `Stamped` |
| 9 | Property Undo | "The value is the latest one" was false | "The value with the latest date is the one that counts" |
| 10, 11 | Correction reviews | "the Balance", "entries", "starting balance" on a loan | Loan wording |
| 13, 14 | History "Initial Balance"; Accounts header "Bank" | Ledger words | "Initial amount owed" (Vitest, seen red); "Bank or lender" |
| 15 | List "Includes interest" vs history "Split" | Two words | One word (Vitest) |
| 17, 22 | Record payment | Unassigned message twice; blank amount said "valid amount" | One message (Vitest, seen red); "Enter the payment amount" / "Enter the principal" |
| 18 | Wealth on a date | Restated line had no direction, a dense run of lines | "lowering/raising what is owed", bulleted, "loan principal cancels" |
| 19 | Edit payment | "Confirm payment", accounts in another order | "Confirm change", payer first |
| 20, 21 | Interest note wraps at 1280px; "Entered by" header wraps | Minor | Not fixed |

Not reached by the reviewer: the success messages after Confirm, the Restore review of a loan with payments, a payment on a $0.00 loan, a long loan name in the chooser, the Edit correction review, and 1280px pictures of about 30 states (no claim made).

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |

## How it works

(Written by a read-only agent from the diff and these notes; its claims were checked against the code: the verify commands and the button names were wrong and are corrected here.)

**What you can do.** Add account now offers **Loan**: name, lender, owners, an optional amount owed (blank is $0.00 owed) and an "As of" date, reviewed before saving. -1.00 and `abc` give the scenario messages. A loan shows one "Balance owed" figure and counts once in wealth under a new Loans group. From checking or savings, **Pay a loan** (or **Record payment** on the loan's page) takes the whole payment, a principal and an interest; the review shows both Balances after, and refuses principal above the debt. The payment opens from either account as one payment with its portions; **Edit** corrects the portions, **Remove** and **Undo** move both sides and the interest together. On the loan, **Update balance owed** either corrects the initial amount owed or makes a dated correction, each with a reason and a review; any Balance correction can now be removed and restored. A property says "Value", not "Balance", in its reviews.

**What changed.** `V25__loan_payments.sql` (kinds, principal portions, the two interest categories); `AccountType.Kind.DEBT`; `account/service/DebtRules.java`; `activity/LoanPaymentController.java` and `MovementService` (per-leg amounts); `ActivityStore`, `WealthStore` and `WealthService` (interest as spending, principal as a cancelling transfer, correction and restatement lines); `frontend/src/features/loans/`, plus accounts, activity, values, household and spending screens; tests `Loan*ApiTests`, `LoanPayment*`, `Loan*.test.tsx`, `e2e/tests/17` to `19`.

**A payment.** (1) The review asks the server for both Balances after; an overpayment is refused there. (2) Confirm locks both accounts (lowest id first), re-reads the loan's debt and refuses an overpayment, saves the paying row (whole amount, principal and interest portions) and the loan's row (principal), and then checks the loan holds no credit on any date. (3) Only the interest counts as spending, in "Loan interest"; the principal is a transfer that cancels in the wealth explanation. (4) A repeated key returns the stored payment; the same key with other figures is 409.

**Decisions.** D-053 (a loan is a debt; a debt never becomes an asset; corrections; any correction removable), D-054 (the payment shape; interest categories cannot be archived or merged away). Open: Q-031 (a dated correction is stored as a change), the as-of wealth lines leave loans out, the opening-revision lock has no race test that fails without it. Mortgages and DATED_VALUE_001 are slice 16b.

**Verify.** `npm test` (backend and frontend, with the dev stack stopped), `npm run e2e`, `npm run coverage -- --require --slice 16a`; then Accounts > Add account > Loan, a loan's page, Household and Spending at 710px and 1280px.

## Handoff

- Built: groups 0 to 3 (slice 16a), V25, D-053 and D-054, Q-054 (yes); Q-031 (open, extended). Pushed to `origin/main` on 2026-10-07 (owner approved, D-002; the pre-push hooks passed). Frontend 318, e2e 247, backend suite green (stop the dev stack first, pitfall 35).
- 16b (groups 4 to 8, next session): `AccountType.MORTGAGE` as a second `Kind.DEBT` type (setup, Lender, wealth group "Mortgages", `MovementKind` for mortgage payments with `MORTGAGE_INTEREST` id `a16a0000-0000-4000-8000-000000000002`, already seeded and protected), the mortgage scenarios `MORTGAGE_001` to `008`, and `DATED_VALUE_001` (a future-dated correction on a debt saves a planned value no reader counts: owner approved; where it lives is open, `account_value` is refused for a loan today, so the plan needs its own table or a widened gate, and slice 15's exclusion test is reused).
- Watch for: every writer that changes a loan's Balance must call `DebtRules.requireNotCredit` after the change under the lock (payment create and replace, correction save, removal and Undo of a correction, the Undo of a payment, a new initial amount); a new reader of spending must read `activity_part`; ledger words on a debt page (Bank, Balance, entries, transfer) are what Cowork finds, read the new type's pages in its own words before Cowork; Confirm, removal, Undo and Back each need a sentence and focus; run Gradle test classes one pattern per invocation.
- Left open (logged): the as-of wealth lines on the Household page leave loans out; the opening-revision lock race test is green without the lock; no state-matrix cell for a payment on a closed loan or a removal on an archived one; two minor wraps at 1280px; Q-031.
- Owner's proposals (2026-10-07), for 16b: (1) group 0 proves the opening-revision lock with a test that fails without it; (2) extend `visual-reviewer` to read `document.activeElement` and the visible status sentence after each step, since it missed state and focus; (3) the status-sentence tests of faults 4 and 5 passed first time and are unproven until one is seen red. Q-031: keep as built; the form hint ("A later change to an earlier amount moves this figure") is added.
- v1 showed: not consulted.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the payment shape (portions or a separate interest row) took a design review to settle; the full backend suite failed twice because the dev stack was running; the screenshot step and Cowork between them found 30 mostly wording and focus faults on a slice whose numbers were right.
- What went well: every rule, lock and refusal was planted away and seen red; the identity test over five periods stayed whole through the new kinds; the owner's count (8) is the lowest so far.
- Process change to try: the two checklist lines added (Confirm, removal, Undo and Back end with a sentence and focus; a refusal at save is also refused in the review).

---

# Slice 16b: mortgages and planned debt values

Started: 2026-10-07 09:07 EDT (session clock). Status: checkpoint 1 (task list) pending.

## 16b prompts and directions

- Kickoff prompt (v2, 16b), summarized, no transcript: run `feature-session` for 16b. Owner answers 2026-10-07: Q-031 stays as built and the correction form gets a hint that a later change to an earlier amount moves this figure; group 0 also adds the opening-revision lock with a test that fails when the lock is removed; `DATED_VALUE_001` on a debt saves a planned value no reader counts, reusing slice 15's exclusion test; visual-reviewer after Prove and before Checkpoint 2, also reading `document.activeElement` and the visible status sentence after each step; report the Cowork count against 8, 8, 5, 5, 5, 7, 9, 9 and 8; stop at task-list approval and when the app is ready to look at.

- 2026-10-07 Checkpoint 1 answer: approved with four additions. 0a: plant the lock removal, show the test red, restore it, record it (this was the unproven lock). 1: a test that net worth, the Household total and the change explanation count a mortgage once after the split from loans. 2: a mortgage payment through the raw API with a wrong interest category is refused or ignored (category comes from the type). UI: list every `type === 'loan'` branch in the inventory, replace with one helper. Decision 2: close/archive refuse while a plan exists, same rule, message and test as slice 15. Decisions 1 and 3 fine. Run the advisor again before Land (it was unavailable at checkpoint 1); visual-reviewer with the activeElement and status-sentence check before Checkpoint 2.

## 16b gap analysis (all 9 IDs citeable; none blocked)

| Need | Today | Gap |
| --- | --- | --- |
| Type | `AccountType.LOAN(DEBT)`; V2 check already allows `mortgage` | add `MORTGAGE(DEBT)`; `isDebt` already covers both, so every debt writer/gate/reader works unchanged |
| Payment | `MovementKind.LOAN_PAYMENT` (interest category `LOAN_INTEREST`); `MORTGAGE_INTEREST` seeded and protected (V25, `CategoryLifecycleService`) | interest category chosen by the debt's type (mortgage: `MORTGAGE_INTEREST`) on create, preview, replace; same endpoint family or `mortgage-payments` (decide in group 5) |
| Wealth | `loans` group = every debt line (`WealthService.summarize`) | split into Loans and Mortgages groups (`WealthSummary.mortgages`), Household page and API type |
| Words | `loanWords.ts`, `type === 'loan'` in ~15 UI places (EntryHistory, ActivityList, signedAmount, BalanceFigure, LoanPaymentForm, ...) | one `isDebtType` helper; noun "mortgage"/"loan" in labels, "Lender" kept |
| DATED_VALUE_001 on a debt | correction in the future is refused; planned rows live in `account_value` for valued accounts only (`ValueService` gate `isValued`) | debt takes `plan` rows in `account_value` (never effective): where exactly decided in group 8 |
| Q-031 hint | none | one sentence on the balance correction form |
| Opening-revision lock | `OpeningRevisionService.locked` locks the account row; race test stays green without it | race test that fails when the lock is planted away (group 0) |

## 16b task list (for checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0a opening-revision lock: a race test red without `lockAccount` | none new (cites `LOAN_004`) | API race | done: `LoanCorrectionRaceApiTests.twoInitialAmounts` (two different initial amounts at once must chain). Planted: removed `lockAccount` from `OpeningRevisionService.locked`, test FAILED; restored (`git checkout`), 5 of 5 green. This was the unproven lock of 16a |
| 0b Q-031 form hint: "A later change to an earlier amount moves this figure" on the balance correction form | cites `CHECKING_009` (the ledger scenario for this form; `DATED_VALUE_003` is cited by `LoanCorrection.test.tsx`) | Vitest | done: the sentence was already in `BalanceCorrection.tsx` (commit `6a14bad`; one component for ledger and debt) and tested only for a loan; added the ledger test in `BalanceCorrection.test.tsx`. Not seen red (the text pre-exists). Q-031 marked resolved |
| 1 `MORTGAGE` type, setup, edit, blank is $0.00, validation, Lender, lists, Mortgages group in wealth/Household | `MORTGAGE_001`, `002`, `007` | API + UI + e2e | API + UI done (e2e line at the end of the slice): `MortgageSetupApiTests` 9 (8 seen red before the type existed), `MortgageSetup.test.tsx` 7 (7 red first). `AccountType.MORTGAGE(DEBT)`, `WealthSummary.mortgages`; the counted-once test is `MortgageSetupApiTests.loanAndMortgageCountOnce` (loan + mortgage + home: debts 225,000, net worth 80,000, the change explanation's `accountsAdded` equals the change and `other` is 0) and the Household Vitest. Addition 2 |
| 2 mortgage payment: interest category by type, sum rule, same identity and wealth | `MORTGAGE_003`, `006` | API (identity: loan and mortgage interest equal on Spending, Month, budgets, change explanation) + UI + e2e | API + UI done (e2e at the end): `MortgagePaymentApiTests` 5 (3 red before `MovementKind.interestFor`; planting the loan category back made 5 of 10 mortgage tests FAIL, restored), `MortgagePayment.test.tsx` 3 (4 red first). The interest category comes from the debt's type (`interestFor(pair.to())`); a client-sent `categoryId`/`interestCategoryId`/`interestCategory` is refused or ignored and never counts (addition 3). The button reads "Pay a loan", "Pay a mortgage" or "Pay a loan or mortgage" by what exists; refusals say "loan or mortgage" |
| 3 correct payment portions, remove and Undo twice | `MORTGAGE_004`, `005` | API + UI + e2e | API + UI done (e2e at the end): `MortgageChangeApiTests` orders 1, 2 and `MortgageChange.test.tsx` orders 1, 2. These are noun-over-16a tests that passed first time by design (16a's code); the mortgage words in them (Mortgage label, Mortgage interest) are the red-able part |
| 4 dated lender correction, cancel | `MORTGAGE_008` | API + UI + e2e | API + UI done (e2e at the end): `MortgageChangeApiTests` orders 3, 4 and `MortgageChange.test.tsx` order 3; passed first time (16a's correction code) |
| 5 planned value on a debt for all four rows (home, car, car loan, mortgage); reuse slice 15 exclusion test over the debt | `DATED_VALUE_001` | API + UI + e2e | API + UI done (e2e `20-mortgages.spec.ts`, running): `DebtPlanApiTests` 4 (all four rows of the outline in one test, seen red: 4 of 5 failed before the change), `WealthAsOfApiTests.debtPlanIsNeverCounted` (the twin of slice 15's `planIsNeverCounted`, loan and mortgage, before and after the plan's date), `DebtPlan.test.tsx` 6 and `Values.test.tsx` 2 (the property and car rows). See "Group 5 as built" |

Groups renumbered from the 16a plan (4 to 8 become 1 to 5) because the lock and hint are group 0. Six groups with 0a/0b merged under 0: close to the 5-group guide, but groups 1 to 4 are mostly a noun over 16a.

### 16b inventory

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account.type` = mortgage | every `isDebt` caller (done in 16a), frontend `=== 'loan'` branches (~15), mock API | AccountService create/edit | none new |
| mortgage payment legs and portions | as 16a loan payment; category id by type | payment create/replace/remove/Undo | overpayment race on a mortgage (reuse 16a pattern) |
| planned `account_value` on a debt | `AccountUsageStore.plannedValues`, `AccountLifecycleService` (close/archive refuse), ValueStore readers, WealthStore, ActivityStore (all `NOT planned`) | ValueService plan save/remove | plan vs close |
| opening-revision account lock | OpeningRevisionService | OpeningRevisionService | group 0a |
| payment interest category (addition 3) | spending, month review, budgets, change explanation read `activity_portion.category_id` | `MovementService.insertPair` via `MovementKind.interestFor(debt)`: from the debt's type, never the request | `MortgagePaymentApiTests.categoryComesFromTheType` (raw API with `categoryId`, `interestCategoryId`, `interestCategory`, on a mortgage and a loan) |

### 16b UI inventory: every `'loan'` type literal and what became of it (addition 4)

One helper, `isDebt(type)` in `accountTypes.ts` (already the gate for loans; `mortgage` is now `debt: true`). Literals found by `grep "'loan'"` over `frontend/src` (non-test), each replaced:

| Site | Was | Now |
| --- | --- | --- |
| `EntryHistory.tsx` (5 branches: row width, change text, correction label, opening figure, "Initial amount owed") | `opening?.type === 'loan'` | `isDebt(opening?.type ?? '')` |
| `EntryHistory.tsx` opening `BalanceFigure` | `type="loan"` | `type={opening?.type}` |
| `ActivityList.tsx` (empty text, change text) | `accountType === 'loan'` | `isDebt(accountType ?? '')` |
| `signedAmount.ts` `shownAmount` | `accountType === 'loan'` | `isDebt(accountType ?? '')` |
| `HouseholdPage.tsx` group filter | `isDebt` (both types in Loans) | `type === 'loan'` for Loans, `type === 'mortgage'` for the new Mortgages group (group membership, not a gate) |
| `accountTypes.ts` list | `mortgage` not ready | `ready: true, debt: true` |
| `test/mockApi.ts` (10 sites: opening sign, payment gates, overdraft, preview, wealth) | `type === 'loan'` | `isDebtType` (the same helper) |

Sites that already used `isDebt` need no change (about 40). Words, not gates, still to read in group 2: `LoanPaymentForm` ("Loan", "Loan to pay", "Choose a loan"), `LoanPaymentChange` ("Loan"), `AccountDetailPage` ("Pay a loan"), `EntriesTable` ("Loan payment to", "Loan interest"), `AccountForms` ("who owes this loan"), `WealthOverTime` ("loan principal").

### Group 5 as built (D-055, draft): where a debt's plans live

- **Storage.** A plan on a loan or mortgage is an `account_value` row with `planned = true` (V26 relaxes `amount >= 0` to `planned OR amount >= 0`), stored **with the debt's sign** (negative is owed, D-053) so `balanceText` reads "$15,000.00 owed" with no special case. The API takes the amount as a positive "amount owed" and negates it (a negative is refused: "Enter zero or a positive amount owed"); replay fingerprints negate the same way.
- **Gate.** `ValueService` lets a debt through for plan save and review, history, removal review, removal and Undo (`loadPlannable`). A recorded (non-plan) value on a debt is refused ("What is owed changes by a payment or Update balance owed. A future amount can be saved as a plan."); a future date is refused first with slice 15's guidance text; start-extension stays valued-only. A debt's `currentBalance` is opening + payments and corrections, never a value row, so the review's "now" and "after" are the real Balance owed; `history` lists plans only (no invented "Initial value" row).
- **Readers.** Every reader of `account_value` already filters `NOT planned`, and a debt's Balance never reads it; `DebtPlanApiTests` compares the account, activity, history, wealth now, wealth on a past date and the change explanation before and after each of the four rows' plans, and `WealthAsOfApiTests.debtPlanIsNeverCounted` moves the clock past the plan's date.
- **Close and archive (decision 2 corrected).** Slice 15 refuses **Close** only (not archive) while a plan exists, after the zero check, with "<name> has N planned value(s). Remove it first, then close." A debt gets the same rule, message and review line (`closeBlockedBy`); archive is not blocked. My checkpoint-1 wording ("close and archive") was wrong about slice 15; the owner's "same rule, message and test" holds.
- **UI.** The debt page shows a "Planned amounts owed" card (only once a plan exists) above Activity, with Remove and Undo per plan (the existing `ValueChange` review, worded for a debt). A date after today in the Update balance owed form shows slice 15's guidance with "Save as a future plan" and "Choose another date"; the plan form (`DebtPlanForm`) reviews and saves, ends with a status sentence and focus on the Activity heading, and Back returns focus to the plan form heading.
