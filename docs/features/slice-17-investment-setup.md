# Slice 17: Investment accounts, generic setup

- Slice: 17 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/{401k,brokerage,hsa,roth-ira,traditional-ira}/setup.feature`, `accounts/lifecycle/manage-accounts.feature` (007), `investments/corrections.feature` (005)
- Status: 17a built and proven, waiting for Checkpoint 2 (17b next)
- Started: 2026-10-07 14:43 EDT (session clock)  Finished: 2026-10-07 (17a)  Commit: `ee8247f` to `0e8b514`

## Prompts and directions

- Kickoff prompt (v2, slice 17), summarized, no transcript: run `feature-session` for slice 17 (size L, 22 IDs, five types sharing one capability). At Checkpoint 1 propose a split (17a, 17b, ...) with IDs and test level per part and what each leaves for the next; shared capability first, then the types as thin additions (as 16a and 16b did). Before the task list, read how a type is added today (AccountType, holdsActivity, the debt-kind gate, wealth groups, UI type branches) and put every reader and writer in the inventory; one helper for UI type branches. Carry over: every lock has a test that fails without it; a rule refused at Confirm is refused in the review; a form for a new type is read against that type's own words; every Confirm, removal, Undo and Back ends with a sentence and the right focus. Validator, then visual-reviewer (focus and status sentence after each step) before Checkpoint 2. Advisor before Land (if unavailable, say so at Checkpoint 1 and at Land). Report the Cowork count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5. Stop at task-list approval and again when the app is ready to look at.
- 2026-10-07 Checkpoint 1 answer: approved, 17a and 17b, Finish setup in 17a, Q3 as proposed (CHECKING_006, WEALTH_005, SAVINGS_005 stay deferred unless 17a unblocks them). Q1 corrected: BROKERAGE_003 says the incomplete account "stays a draft", so after Review with cash blank a **saved draft row exists** (listed as a draft, nothing in wealth) and **Cancel on that draft discards it** (quick discard, no review, no Undo) so the list has no "Redwood Brokerage". Test both halves. `ACCOUNT_LIFECYCLE_007` stays the reviewed delete with Undo. Report the planted-away result for the draft state matrix here. Note: v1 (localhost:3000) was not running, not consulted.
- 2026-10-07 17b kickoff prompt (summarized, no transcript): run `feature-session` for 17b (401K, HSA, ROTH_IRA, TRAD_IRA x 002, 003, 005, 006). Owner answers: thin additions over 17a; one API test per scenario run over the four types; one Vitest per type for its own words; one e2e spec over the four types. Close the 17a gaps as group 0 or log each with a reason: race test for two concurrent linked-statement attaches (red without the lock); Finish setup vs delete as a race test; guard matrix asserting the message per cell; "who and when" on a directly set up brokerage; the early-date text; the arrival sentence beside the delete review; Back from the mismatch review leaving Opening total below the fold at 710px. Cancel draft asks once before it discards, for all four types. Run `scripts/flake-check.sh` before Land. Validator, then visual-reviewer (focus and status sentence after each step) before Checkpoint 2. Advisor before Land (if unavailable, say so at Checkpoint 1 and Land). Report the Cowork count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5 and 6. Stop at task-list approval and when the app is ready to look at.
- Checkpoint 2 answer:

## Scope

`@V2_401K_002 003 005 006`, `@V2_BROKERAGE_002 003 005 006`, `@V2_HSA_002 003 005 006`, `@V2_ROTH_IRA_002 003 005 006`, `@V2_TRAD_IRA_002 003 005 006`, `@V2_ACCOUNT_LIFECYCLE_007`, `@V2_INV_CORRECTION_005`. The five types' 002/003/005/006 are identical apart from the name.

## Gap analysis

Nothing for an investment account exists today: no `Kind.INVESTMENT`, no holding storage, no setup form with components, no draft path (the `account.status` check already allows `draft`; `WealthStore` already skips drafts; V2 type check already lists `brokerage`, `401k`, `traditional_ira`, `roth_ira`, `hsa`).

| Scenario | Need | Citeable now? |
| --- | --- | --- |
| `*_002` empty setup | Create with no amount; Balance $0.00 dated setup date; "no starting amount was entered" in history; no contribution, expense, price or cost row | yes (Q-030 blank opening already built for debts) |
| `*_003` draft | Opening total + holdings, cash unanswered: review asks for cash, never infers it; saved as `draft`, not in wealth; Cancel leaves no account | yes, needs opening-component storage for the draft |
| `*_005` validation (6 rows) | cash < 0, quantity 0 / -2, price < 0, holding value date in the future, holding value date before tracking start | yes (server messages are the scenario's) |
| `*_006` mismatch | Total vs cash + qty x price: review shows calculated Balance and the mismatch; save refused; no difference becomes cash | yes |
| `ACCOUNT_LIFECYCLE_007` | Delete a draft with review + Undo; the draft returns as a draft | yes (slice 12 delete path; draft is the new input) |
| `INV_CORRECTION_005` | Remove a statement linked to a saved complete opening: review says 1 opening breakdown uses it and the cash, shares, price remain; Balance stays $20,000.00; removal in history | yes by the map (P6 statements exist), but its Given is a **saved complete opening with holdings**, so the shared capability must save one (cash + holding lines, Balance = cash + qty x price at the opening). `*_001`'s display half (list/detail/wealth, cost and gain "Not available") stays in 19 |

Not in this slice (stay with later slices, per the map): `*_001` complete opening shown in list, detail, wealth with purchase cost and gain "Not available" (19); `*_004` cash correction (22); `*_007` owner rule (18); wealth groups Investments/Retirement/Health (18); prices (19).

## Proposed split (for checkpoint 1)

| Part | IDs | Test level | Leaves for the next |
| --- | --- | --- | --- |
| 17a shared capability, on brokerage | BROKERAGE 002, 003, 005, 006; ACCOUNT_LIFECYCLE 007; INV_CORRECTION 005 (6) | API (preview refusals, mismatch, draft, delete+Undo, statement removal, races) + Vitest (setup form, review, draft, Finish later) + e2e | the other four types; investment wealth groups (18); display of holdings, prices, cost and gain (19) |
| 17b four types as thin additions | 401K, HSA, ROTH_IRA, TRAD_IRA x (002, 003, 005, 006) (16) | one API test parameterised over the four wires per scenario; one Vitest per type for its own words; e2e 002 and 005 per type, 003 once per type | owner rule, groups, per-person view (18) |

## Inventory (draft; every reader and writer found by grep on 2026-10-07)

Backend gates keyed by type (all use `AccountType` statics; a new `Kind.INVESTMENT` is false for `holdsActivity`, `isValued`, `isDebt`, `isCard`, so every one refuses an investment account by default, which is right until slices 20 to 23):

| Gate | Sites (grep) | Investment account today |
| --- | --- | --- |
| `holdsActivity` | EntryService 126/134, BatchEntryService 168, MoveTarget 41, MovementService 449-451, TransferPreviewService 148, BalanceCorrectionService 242, HistoricalEntryService 116, ReminderService 92, StatementService 158, RecurringService 559 | refused (no activity until 21; **StatementService:158 must be widened for INV_CORRECTION_005**) |
| `isValued` / `valued()` | WealthService 88/114/121/132, BalanceCorrectionService 65, OpeningRevisionService 254, AccountLifecycleService 152/158/225, AccountService 109, ValueService 550/557 | no |
| `isDebt` / `Kind.DEBT` | MovementService, EntryService 134, TransferPreviewService, BalanceCorrectionService 85-91/242, OpeningRevisionService 89/98/150/216, ValueService (6), AccountLifecycleService 147/167/229/237/243, AccountService 125/174, DebtRules | no |
| `isCard`, `paysCards` | WealthService 128-129, MovementService 59-67, EntryValidator, HistoricalEntryService | no (note `paysCards` = holdsActivity and not card) |
| creation: `AccountService.parse/signed/requireInstitution` | sign, "Bank" vs "Lender" word | new: opening components, setup date, draft path |
| wealth: `WealthService.line/balance/summarize`, `WealthStore` (opening + activity; skips `draft`) | a positive line is an asset in `assets`; no group yet (groups are 18) | none: `opening_amount` holds cash + holdings (decision 1), so no new reader until 19 |
| `AccountLifecycleService` archive/close/delete, `AccountState` | delete needs "draft or no activity" | draft delete + Undo, "closed Balance zero" for an investment |
| `account.status = 'draft'` | WealthStore (5 queries), AccountRepository lists | every list reader must show/handle a draft (lists, detail, Household card, pickers) |

Frontend type branches (one helper `typeTraits(type)` / `accountTypes.ts` for kind, noun, institution word, opening form; replaces per-site literals): `accountTypes.ts` list (`brokerage` is `ready: false`), `AccountForms`/`AccountFormPages` (Add account, Bank/Lender), `AccountDetailPage`, `AccountsPage` list, `HouseholdPage`, `accountChoice.ts`, `SpendingPage`, `transfers/*` pickers, `BalanceFigure`, `EntryHistory` (opening figure), `ActivityList`, `UpdateBalance`, `StartingBalanceCorrection`, `test/mockApi.ts` + `mockValues.ts` (create, wealth, gates).

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account` row for investment type, `status` draft/active | all lists, wealth (now, as-of, change), Household, pickers, delete/archive/close | create, draft save, Finish setup (17a only saves complete or draft), delete, Undo | draft delete vs Finish; create same name twice |
| opening components (cash, holding lines) new tables | WealthStore, account response, history, statement link | setup save, draft save/replace, delete/Undo | draft replace vs delete under the account lock |
| statement <-> opening link, statement removal | StatementService, history | statement remove/restore | removal vs opening save |

### State matrix: draft (a new account state; one raw-API test per cell, gate planted away turns one red)

Refuse (409/400 with a sentence): entry, batch entry, historical entry, transfer in and out, debt payment, Balance correction, starting-balance revision, statement attach, reminder, recurring, value/plan, archive, close, edit tracking start. Allow: edit details (name, institution), Finish setup, delete, Undo of delete. Also a draft is absent from wealth now, as-of and change, and present in the Accounts list with a "Draft" label.

## Decisions (feature-local; draft, confirm at checkpoint 1)

1. **Storage.** `account.opening_amount` = cash + sum(qty x price) of the opening lines, computed at save; a total that differs is refused at save and in the preview ("calculated Balance, mismatch"), never turned into cash. Holding lines go in one table `account_opening_holding` (account_id, symbol, quantity, price, price_on, position). No security or price tables until slice 19. Balance is frozen at the opening until 19; wealth readers do not change.
2. **Draft.** `status = 'draft'` with the entered components stored (total, cash or null, lines); the review of an incomplete form asks for the missing cash and never infers it. A draft is not in wealth. **Finish setup is in 17a** (a draft becomes `active` through the same preview and save as a new account, under the account lock; race: Finish vs delete).
3. **`*_003`** (owner corrected 2026-10-07): Review with cash blank saves a draft row (listed as Draft, not in wealth); Cancel on the draft discards it at once (no review, no Undo). `ACCOUNT_LIFECYCLE_007` is the reviewed delete with Undo.
4. **Kind.** `AccountType.Kind.INVESTMENT` for brokerage, 401k, traditional_ira, roth_ira, hsa; `holdsActivity`, `isValued`, `isDebt`, `isCard` stay false, so entries, transfers, reminders, recurring and corrections refuse an investment account until 20 to 23.
5. **Words.** institution label "Institution" (scenarios say `at "Harbor Benefits"`); form words "Opening total", "Cash", "Holdings", "Setup date"; Balance stays "Balance". Carried by the one UI helper `typeTraits(type)` in `accountTypes.ts` (kind, institution word, noun) so no site branches on a type literal.
6. **Statements.** `StatementService` filters `holdsActivity` at line 158; add `takesStatements(wire)` = ledger or investment and change that one filter. `holdsActivity` is not widened.
7. **Messages** are the scenario's own ("Cash must be zero or greater", "Enter more than zero shares", "Holding market price must be zero or greater", "Future values are not completed account history", "Review the earlier tracking start before saving"); the last is new text (grep found none).

Advisor: available and used at checkpoint 1 (2026-10-07); to be run again before Land.

### Planted-away results (17a backend, 2026-10-07; each plant applied to one line, the class run, the line restored)

| Plant | Red test |
| --- | --- |
| Finish setup without the account lock | `InvestmentDeleteApiTests` Finish-waits-for-Finish (409 expected, got a second success) |
| discard without the account lock | `InvestmentDeleteApiTests` discard waits for a Finish setup |
| statement removal without the account lock | `InvestmentStatementApiTests` removal waits for the account lock |
| lifecycle (archive, close, restore, reopen) draft gate | `InvestmentGuardsApiTests` draftRefusesLifecycle |
| statement draft gate (`requireNotDraft`) | `InvestmentGuardsApiTests` draftRefusesStatement |
| starting-balance gate for investments (`isInvestment` filter in `OpeningRevisionService`) | `InvestmentGuardsApiTests` both writer matrices and the statement cell (4 red) |
| `holdsActivity` widened to investments | `InvestmentGuardsApiTests` active-investment matrix |
| a discarded draft cannot be undone | `InvestmentDraftApiTests` cancelDiscards |
| mismatch refused at save | `InvestmentSetupApiTests` mismatch and total-with-cash (3 red) |

Not yet planted: Finish vs delete (`finishWaitsForDelete` is green with the lock removed because the later `findById` already hides a deleted row; the Finish-waits-for-Finish and discard races carry the lock claim, as P1 and P2 show).

## Task list (approved at checkpoint 1, 2026-10-07)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 17a-0 `Kind.INVESTMENT`, `BROKERAGE`, V27 (opening components, statement removal columns, event actions), the one UI helper `typeTraits` | none (shared) | API + Vitest | done |
| 17a-1 setup from components: empty, complete, 6 invalid rows, mismatch review | BROKERAGE 002, 005, 006 | API (`InvestmentSetupApiTests` 15) + Vitest + e2e | done |
| 17a-2 draft: saved at Review with cash unanswered, listed, not in wealth, Cancel discards, Finish setup; draft state matrix | BROKERAGE 003 | API (`InvestmentDraftApiTests`, `InvestmentGuardsApiTests`) + Vitest + e2e | done |
| 17a-3 reviewed delete of a draft, Undo returns the same draft | ACCOUNT_LIFECYCLE 007 | API (`InvestmentDeleteApiTests`) + Vitest + e2e | done |
| 17a-4 statement backing the opening, reviewed removal keeps breakdown and Balance | INV_CORRECTION 005 | API (`InvestmentStatementApiTests`) + Vitest + e2e | done |
| 17b the four types: `401k`, `hsa`, `roth_ira`, `traditional_ira` | 16 IDs | parameterised API, one Vitest per type, one e2e spec over the types | next session |

Mock/type facts: the four 17b types are already in `ACCOUNT_TYPES` as "coming soon" (investment flag set), so 17b flips `ready` and adds the enum values.

### UI inventory (17a): every type branch found by grep and what became of it

One helper, `typeTraits(type)` in `accountTypes.ts` (kind `ledger|card|valued|debt|investment`, `institutionLabel`, `holdsMoney`, `dateLabel`), with `isInvestment`. Sites:

| Site | Was | Now |
| --- | --- | --- |
| `AccountForms.tsx` setup: institution label, date label, balance field vs components | `card ? 'Issuer' : debt ? 'Lender' : 'Bank'`, `noun ? ... : debt ? ...` | `traits.institutionLabel`, `traits.dateLabel`, `investment` branch renders `OpeningFields` |
| `AccountForms.tsx` edit: institution label | the same chain | `typeTraits(type).institutionLabel` |
| `AccountDetailPage.tsx` details label; body | chain; `isValued ? ValuedAccount : Activity` | `typeTraits().institutionLabel`; third branch `InvestmentAccount` |
| `transfers/accountChoice.ts` `usableAccounts` | `!isValued && !isDebt` | `typeTraits().holdsMoney` (investments never offered) |
| `spending/SpendingPage.tsx` account filter | `!isValued && !isDebt` | `typeTraits().holdsMoney` |
| `AccountsPage.tsx` active-only list | `status === 'active'` | `active` or `draft` listed; a draft shows "No Balance yet" |
| `test/mockApi.ts` wealth bank group | everything not card, valued, debt | `typeTraits().kind === 'ledger'`; drafts skipped |

Sites left alone, with reason: `BalanceFigure`, `balanceText`, `signedAmount` (an investment Balance is a positive asset, nothing to do); `EntryHistory`, `ActivityList`, `UpdateBalance`, `BalanceCorrection`, `StartingBalanceCorrection`, loan/transfer forms (an investment account has no activity page, so none is reached); `HouseholdPage` (Investments group is slice 18: **a brokerage's Balance counts in the totals but has no line on the Household page until 18**).

### Planted-away results, frontend (2026-10-07)

| Plant | Red test |
| --- | --- |
| a draft left out of the list | draft listed (setup), reviewed delete + Undo |
| a mismatch can be confirmed | mismatch review |
| wrong zero-quantity message | the `quantity 0` and `quantity -2` rows |
| investments offered for new money | `accountChoice.test.ts` brokerage |
| Cancel on the removal review sends it | Cancel on the removal review |
| Cancel on Finish setup loses focus | Finish setup Cancel focus |
| a draft shows a Balance | draft listed + details |
| draft Cancel does not go to the list sentence | Cancel on the draft |

### Validator report (2026-10-07) and what became of it

Defects found and fixed with a test that was red first: D2 Household page listed brokerages and drafts under Bank money (now `typeTraits().kind === 'ledger'`; `InvestmentSetup.test` Household test, red when planted back); D3 the Finish setup review refused a draft whose owner was later deactivated (`opening-preview?accountId=` keeps present owners); D4 a huge holding passed the review and then failed with a 500 (`That amount is too large to record`, both paths); D5 a ledger statement could be removed through the API (removal and its review are investment-only); D6 the dead-end message when a linked statement was removed; D7 words (`Institution must be...`, close advice, `(removed ones count)` for statements); D8 titles. D1 was the unstaged files (staged now).

Left open, logged (not built): no race test for two concurrent linked-statement attaches (`link()` is a plain UPDATE under the account lock); Finish against delete has only a behaviour test (green without the lock; the Finish/Finish and discard races carry the lock claim); no tie test for `wasDiscarded` (`at DESC, seq DESC`); e2e seeds no long account list; the draft matrix is one loop asserting a 4xx per writer, not a message per cell; Back from a review focuses the first field (the older pattern of the setup form).

### Visual-reviewer (2026-10-07, 710px and 1280px, with focus and status sentence after every step): 11 faults

Fixed (Vitest first, seen red): 1 Review inside Finish setup left focus on the body (Panel reused; now keyed form/review); 2 the draft's Opening card showed Cash $0.00 for an unanswered cash ("Not answered yet"); 4 saving a statement gave no sentence (now "Statement saved. A statement never changes the Balance." with focus on the heading); 7 the Cash hint in Finish setup said a blank cash starts at $0.00 (now says it keeps the draft); 9 "Initial Balance" beside the "Opening" card (now "Opening Balance" for an investment); 11 double margin above Supporting statements.

Not fixed, for the owner: 3 the arrival sentence ("saved as a draft") stays beside the delete review that opens later (the status card and the investment card keep separate sentences); 5 Financial assets includes brokerages but no line on the Household page shows them until the Investments group in slice 18 (**decision for the owner at Checkpoint 2**); 6 a directly set up brokerage has no "who and when" (account creation records none for any type; Finish setup records Setup finished by); 8 the early value date message is the scenario's own text and does not name the date; 10 Back from the mismatch review focuses Account name with Opening total below the fold at 710px.

### Prove, 17a (2026-10-07, after the validator and screenshot fixes)

Backend `npm run backend:test` 0 failures; frontend 371; `npm run e2e` 281 passed (24 new lines in `21-investments.spec.ts`, each failing when its behaviour is planted away: Back focus, arrival sentence focus, removal focus, draft listing); `npm run lint`, `format:check`, `typecheck`, `check` pass; `npm run coverage -- --slice 17`: 6 of 22 (the 16 missing are 17b's). Advisor: used before the plan (2026-10-07); due again before Land. v1 (localhost:3000) not running, not consulted.

### Cowork pass, 2026-10-07: 6 faults (previous slices: 8, 8, 5, 5, 5, 7, 9, 9, 8, 5)

Owner walked every step at 710px (real clicks), 1280px from page contents. All five checks passed on the main paths. Faults, each with a Vitest assertion and an e2e line, planted back and seen red (V1 to V6, `/tmp` script, 2026-10-07):

| # | Fault | Fix |
| --- | --- | --- |
| 1 (high) | Cancel draft removed the draft the moment it was clicked | One question first, "Cancel this draft?" with Discard draft and Keep draft (focus returns to Cancel draft); still no Undo. **Changes the checkpoint-1 answer** ("quick discard, no review"): the owner's pass called the missing question a fault |
| 2 (high) | Finish setup with cash blank reviewed as "will start at $0.00", "no unexplained amount" | The review of a draft states cash "Not answered yet", "will be saved as a draft", and no start or equality claim |
| 3 | Add account Review saved the draft straight away | Review shows the draft review first; **Save draft** saves (decision 2's "saved at Review" becomes "saved at Save draft") |
| 4 | A too-large holding showed its refusal off screen, on no field | Checked at the price field before any request; any other server refusal scrolls into view |
| 5 | A removed statement still read "supports the opening"; a different figure unremarked; removal has no Undo | Removed ones drop the label; a line says when the statement shows another figure than the Balance; the removal review says Undo comes later |
| 6 | Wording | Draft sentence not repeated; "not worked out from the total" only when a total was typed; non-number shares say "Enter a valid number of shares"; fund names take 120 characters (V28) |

Owner's decision taken: **Financial assets no longer outruns the page.** `GET /wealth` has an `investments` group (one total line, brokerage and later retirement and health types), the Household page shows an Investments group, drafts excluded. The Investment, Retirement and Health split stays slice 18. Not verified by the owner (listed): 1280px by eye and saves at 1280px; the deactivated-owner, statement-API and lock fixes; Archive, Close and Edit on a brokerage. One frontend test (`AccountStatusCard` close) failed once under full-suite load and passed three times alone and on the rerun (timing), noted.

## Handoff (17a)

- Built: brokerage setup from cash and holdings (V27, V28), the draft (Save draft, Finish setup, Cancel draft with one question, reviewed delete and Undo), statement backing the opening and its reviewed removal, an `investments` wealth group (D-061), `typeTraits` (D-060). D-057 to D-061. Full proof in the Prove section; Cowork 6. Committed as `ee8247f`, `6d3f7f2`, `6a8d5cc`, `0e8b514` (no attribution trailer); pushed 2026-10-07 (owner said push).
- **17b (next session):** add `K401`(wire `401k`), `HSA`, `ROTH_IRA`, `TRADITIONAL_IRA` to `AccountType` (kind INVESTMENT; the enum needs a wire override for `401k`), flip `ready: true` on the four rows already in `ACCOUNT_TYPES` (they read "coming soon" now; three older tests name `401(k)` as the coming-soon type: pick another then), turn `InvestmentSetupApiTests` and `InvestmentDraftApiTests` into per-type parameterised runs (displayed names must cite all five IDs for coverage), one Vitest per type for its own words (institution label, owner hint: retirement and health types take exactly one owner, but that rule is slice 18), one e2e spec over the four wires, then `npm run coverage -- --require --slice 17`. The sentence "Opening" words, Household group and statements are shared and need nothing.
- Watch for: a `Kind.INVESTMENT` type must never join `holdsActivity` (D-057); every list/group page (checklist lines added in 17a); Cancel draft asks first.
- Owner's not-verified list: 1280px by eye and saves at 1280px; the deactivated-owner Finish fix; the statement-removal API fix; the lock/race gaps below; Archive, Close and Edit on a brokerage.
- Open (logged, not built): visual faults 3 (arrival sentence beside the delete review), 6 (no who/when on a directly set up account; account creation records none for any type), 8 (early value date text is the scenario's), 10 (Back focuses Account name, Opening total below the fold at 710px); validator items: no race test for two concurrent linked-statement attaches (`link()` is a plain UPDATE), Finish against delete is behaviour-only (closed by 17b 0b), no tie test for `wasDiscarded`, no long-list seed in e2e, the guard matrix asserts a 4xx not a message per cell; two timing flakes under load (`AccountStatusCard` close in Vitest, `DeletedAccountSweepApiTests` read timeouts in the full backend run; both pass alone).
- Advisor: available at checkpoint 1 and again before Land; both used. v1 not running, not consulted.

## How it works (17a)

Written by a read-only agent over the diff and the notes, then checked by me against the code and tests: the six refusals' words (server `OpeningComponents`, browser `openingForm.ts`, same text), the three review states (`complete`, `draft`, `mismatch`) and the disabled Confirm, the save in one transaction, the account-lock on Finish, Cancel draft and statement removal, the Cancel-draft question, the Investments group and drafts excluded, and the empty-setup text (`noStartingAmount`, test and Opening card) all hold. The agent did not run anything; the test counts and planted-away results are in the Prove and planted-away sections above.

**What a person can now do.** Add a Brokerage with a setup date, an optional opening total, cash and holding lines (name or symbol, quantity, market price, value date); the Balance is cash plus quantity times price to the cent. A blank setup starts at $0.00 and the account page says no starting amount was entered. Six bad inputs are refused at their field (cash below zero, shares of 0 or -2, a negative price, a future value date, a value date before the setup date), and a number too large to record is refused too. A total that differs from cash plus holdings is shown as a mismatch, cannot be confirmed, and the difference never becomes cash. With anything entered but cash blank, the review says the account will be a draft ("Not answered yet"); Save draft keeps it, listed with no Balance and not in wealth. Finish setup answers the cash under the same checks and makes it active; Cancel draft asks once and then removes it for good; Delete account on a draft is reviewed and can be undone, returning the same draft. A statement can back the opening; removing it is reviewed and keeps the cash, shares, price and Balance, with who and when in history. The Household page has an Investments line.

**Underneath.** A new kind of account (investment) that entries, transfers, reminders and corrections refuse until slices 20 to 23; the opening components in two tables (V27, V28); the account's opening amount is cash plus holdings, frozen until prices (slice 19); a draft is an account marked draft, refused by every writer except edit details, Finish, Cancel and delete; a removed statement is only marked removed and its link to the opening stays.

**Where each rule is enforced.** In the browser (field checks, the too-large check), in the review (the server runs the same judgement and returns complete, draft or mismatch), at save (the server judges again and refuses a mismatch), and under the account lock for Finish, discard and statement removal.

**Left.** 17b: the four retirement and health types, 16 IDs. Slice 18: split the Investments group, owner rule, per-person view. Slice 19: prices, cost and gain. Slice 22: cash correction. Later: Undo of a statement removal.

**Verify by hand.** Blank brokerage; total $20,000 and 50 HOME at $100 with cash blank (draft, Household unchanged); Cancel draft question; Finish setup with cash $15,000 (Balance $20,000, Investments line); total $20,000, cash $100 and one $100 share (mismatch, Confirm off); the bad inputs; delete a draft then Undo; attach and remove a statement.

## 17b task list (proposed, 2026-10-07; waiting for Checkpoint 1)

Gap analysis (all verified by grep and diff, 2026-10-07): 16 IDs, all citeable now. After swapping names, owners and figures, the 002 to 006 text of 401K, HSA, ROTH_IRA and TRAD_IRA is identical to brokerage (diffed against 401k: no other difference). `V2__accounts.sql` already allows `401k`, `traditional_ira`, `roth_ira`, `hsa`. Owners differ per scenario (401K_002 Sam, HSA_002 Maya): tests match them; the one-owner rule is slice 18 and is not added. `scripts/scenario-coverage.sh` matches the literal ID as a whole word in test sources, so a template name (`V2_{0}_002`) cites nothing: each parameterised test's name must spell all five IDs, and Vitest and Playwright titles must spell them literally.

Findings that shape the list: (1) After the flip **no type is "coming soon"**; `SavingsSetup.test` (line 47) and `HouseholdOverview.test` (line 29) name 401(k) as coming soon. Plan: they assert the four types are now selectable; the `ready` flag and its "(coming soon)" branch stay for future types, and `accountChoice.ts` keeps filtering on `ready`. (2) Account names are unique, so parameterised runs put the wire in each name. (3) `AccountRequest` carries no member id, so "who" for a direct setup needs a new `enteredByMemberId` on the investment create body: not thin.

| Group | What | IDs | Test level | Default |
| --- | --- | --- | --- | --- |
| 0a | Two concurrent linked-statement attaches (`link()` plain UPDATE under the account lock) | INV_CORRECTION_005 | API race, planted red without the lock | build |
| 0b | Finish setup vs delete as a race (hold the account lock in the test as the Finish/Finish race does) | BROKERAGE_003 | API race, planted red | build; log if the lock stays unobservable behind `findById` |
| 0c | Guard matrix: the message asserted per cell (draft and active investment) | BROKERAGE_002, 003 | API | build |
| 0d | "Set up by <member> on <date>" in the history of a directly set up investment account (`enteredByMemberId` on the create body, investment types only) | BROKERAGE_002 | API + Vitest + e2e | build; other types logged |
| 0e | Early value date: scenario sentence kept whole, then "The Setup date is 2026-09-01." | BROKERAGE_005 | Vitest + API | build |
| 0f | Arrival sentence not shown beside the delete review | ACCOUNT_LIFECYCLE_007 | Vitest + e2e | build |
| 0g | Back from the mismatch review lands on Opening total, in view at 710px | BROKERAGE_006 | Vitest + e2e at 710px | build |
| 1 | `K401` (wire `401k`), `HSA`, `ROTH_IRA`, `TRADITIONAL_IRA` as `Kind.INVESTMENT`; wire override; no `valueOf`/`name()` caller on a type found by grep | 16 | API | |
| 2 | Existing API tests run per type (brokerage + four) with the wire in every name; Cancel draft keeps asking once | 002, 003, 005, 006 x 4 | API (name spells the five IDs) | |
| 3 | Flip `ready: true`; the two older tests above; one Vitest per type for its own words (institution label, the six messages, draft question) | 16 | Vitest | |
| 4 | One e2e spec over the four wires. **Lean:** per type at 710px: 002, 003 with the Cancel question and Discard, 006, one 005 row; the six 005 rows live in API and per-type Vitest; 1280px once | 16 | e2e | |
| 5 | Prove order: coverage `--require --slice 17`, `npm test`, `npm run e2e`, lint, check, validator, visual-reviewer (dev up), **Checkpoint 2**, Cowork fixes, stop dev, `scripts/flake-check.sh` (3 full suites; nothing else on Docker or Gradle), advisor, Land | | | |

Questions (defaults in bold): 1. 0d adds `enteredByMemberId` to the investment create body only (**yes**). 2. 0e appends the date after the scenario sentence (**yes**). 3. 0a/0b logged with a reason if unobservable, no test seam (**yes**). 4. Keep the "(coming soon)" branch with no type using it (**yes**).

Preflight (2026-10-07): JDK 25 default (`java -version`; `java_home -V` lists 21/17, `gradle.sh` resolves 25); node 26.4, npm 11.17; Docker ok; db on 5434 up, 8081/5180 free, v1 (3000) not running and not consulted; pm2 empty; git user set, tree clean. Registry-version checks skipped (17a ran them today).

Checkpoint 1 answer (2026-10-07): approved. 1 Yes: `enteredByMemberId` required on the investment create body only; **API change** named here, with a raw-API test that a create without it is refused. 2 Yes (scenario sentence whole, then "The Setup date is 2026-09-01."). 3 No seam; try `holdUncommitted` first for 0a and 0b (hold the write on a second connection, fire the attach or Finish, show it waits), plant each lock away and show red; log one as unobservable only if that truly fails, with the reason here, and put it to the advisor. 4 Remove the "coming soon" branch if no type uses it, unless a Vitest exercises it. Start at 0a.

### 17b group 0 progress

| Group | Result |
| --- | --- |
| 0a | `InvestmentStatementApiTests.concurrentOpeningAttachesTakeTheLock`: `both()` holds the account row on a second connection, fires two attaches that both back the opening, asserts both wait, then `[201, 409]` and one statement. Plant: `lockAccount` removed from `StatementService.save` -> that test red (15 run, 1 failed); restored, 15 green. |
| 0b | `InvestmentDeleteApiTests.finishAndDeleteTakeTurns`: four rounds; `both()` holds the account row, fires Finish setup (cash given) and the reviewed delete, asserts both wait, then accepts only the two legal orders: Finish 200 then delete 409 (account active), or delete 200 then Finish 404 with Undo returning the draft with its cash still unanswered. Plants: `lockAccount` removed from `InvestmentSetupService.finish` -> red (this test and `finishWaitsForFinish`); `lockAccount` removed from `AccountLifecycleService.delete` -> red (this test only). Both restored, 10 green. **Why the 17a test `finishAfterDeleteFindsItGone` stayed green without the lock:** it held `deleted_at` uncommitted on the row, and Finish without the lock still ended in an `UPDATE` of that same row (the status save), which waits for the held row lock anyway, and its last read `findById` hides a deleted row, so the 404 came from the row lock plus the final read, not from `lockAccount`. It never proved the lock; the new test replaces it as the lock claim (the old one stays as a behaviour test, named so). |

Advisor: used on this list (2026-10-07: coming-soon, coverage matching, names, lean e2e, flake order); due again before Land.
