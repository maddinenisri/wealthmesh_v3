# Slice 19: holdings and prices

- Slice: 19 in `docs/features/INDEX.md` (IDs in `slices.txt`, plus WEALTH_009 from `deferred.txt`); feature files: `investments/holdings.feature`, the five `accounts/*/setup.feature`, `household/overview/understand-wealth.feature`, `household/history/manage-supporting-records.feature`
- Status: partial (19a this session; 19b to 19d later)
- Started: 2026-10-09  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v2, owner's extended version): run the feature-session skill for slice 19 (14 IDs including WEALTH_009 deferred from 18). At Checkpoint 1 check each ID is citeable and propose a split (19a, 19b, ...) with IDs, test level and what each leaves; owner suggests prices and holdings first, then the display half and the as-of reads. Carry in: the dated-price rule of WEALTH_009; Investments, Retirement and Health savings overlap on purpose (D-065, D-067) so after prices land every reader counts an account once (counted-once test over net worth, financial assets, each person's view, Household total, change explanation; list every reader of holdings and prices). Prices are shared rows: every reader and writer by grep, a lock per writer with a race test that fails when planted away (`holdUncommitted`; restore plants from a copy), a raw-API refusal test per rule, each rule refused in the review as well as at Confirm, same-key and retry tests (D-024, D-049). Cost and gain: unknown cost shows "Not available", never zero; check labels against each type's vocabulary; every Confirm, removal, Undo and Back ends with a sentence and the right focus. Validator, then visual-reviewer, before Checkpoint 2; `scripts/flake-check.sh` and the Vitest loop before Land; advisor at Checkpoint 1 and before Land; commit in logical pieces, lint first. Do not stop between groups; stop at task-list approval and when the app is ready; or if blocked 15 minutes. Report the Cowork finding count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5, 1, 1. Process review still open: run before or after (owner leans before).
- 2026-10-09 Checkpoint 1 answer: approved. Q-066 yes (optional cost per opening line). Q-068 yes. Q-069 replace; the earlier price stays in history with who and when, and a test shows the as-of read for an earlier date still returns it. Q-070 yes, refused in the review as well as at Confirm. Q-071 reuse the two-date read. Q-072 recommended split: build 19a only this session (`_001` x5, HOLDINGS_004), stop at app-ready, INDEX row `partial` with the IDs covered. Q-073 skipped: the owner runs the process review separately. For 19b: a price move is never income (its own line in the change explanation, which still balances), and every reader in the inventory has a test that fails when the price term is dropped from it. Do not stop between groups.
- Checkpoint 2 answer (19b): Cowork count 3 (1 Medium, 2 Low), see "19b Cowork pass".

## Scope

`@V2_401K_001 @V2_BROKERAGE_001 @V2_HOLDINGS_002 @V2_HOLDINGS_003 @V2_HOLDINGS_004 @V2_HOLDINGS_005 @V2_HOLDINGS_008 @V2_HSA_001 @V2_ROTH_IRA_001 @V2_SUPPORTING_RECORD_002 @V2_TRAD_IRA_001 @V2_WEALTH_001 @V2_WEALTH_004 @V2_WEALTH_009` (14). `npm run coverage -- --slice 19`: 0 of 13 covered (WEALTH_009 is in `deferred.txt`, not `slices.txt`).

## Gap analysis (from the code)

What exists: opening cash + holding lines per investment account (`account_opening`, `account_opening_holding`, V27/V28; no cost column, no price table); `account.opening_amount` = cash + quantity x price; a Balance is `opening + ActivityStore delta` everywhere, and a valued account already folds its dated value into that delta (`VALUED_DELTAS`, D-050); `WealthStore.balancesAsOf` has its own copy of the read for any date; the Household page has the Investments, Retirement and Health savings groups; statements attach to an investment account and can be removed (D-059) but not restored.
What does not: any price after setup, any holdings view (an account's detail shows only its opening breakdown), any cost, selected-vs-group view, trend, Undo of a statement removal.

| ID | Needs | Citeable now? |
| --- | --- | --- |
| 401K / BROKERAGE / HSA / ROTH_IRA / TRAD_IRA `_001` | The display half left in 17a: holdings (symbol, shares, price, price date, value, cost "Not available", gain "Not available") in the list and detail, same Balance in wealth; the edit half (name, institution, Sam enters, owner stays, history) is built (18b/18c) | Yes, with holdings display |
| HOLDINGS_002 | Whole-investment view by security across accounts: shares, value, known cost, known gain, coverage 71.43%, value share 27.00%; **known cost on opening lines** | Yes if an opening line can carry a cost (no cost field exists; Q-066) |
| HOLDINGS_003 | Selected-account view (cash, holdings value, Balance, HOME share 25.58%) kept apart from "All investment accounts" | Yes |
| HOLDINGS_004 | One holding with 2 of 14 shares of known cost: value, cost, gain for the known 2; full cost and gain "Not available"; coverage 14.29% | Yes if a cost can cover only some of a line's shares (Q-066); otherwise it waits for slice 20 purchases |
| HOLDINGS_005 | Statement total vs calculated Balance: review shows the difference and asks which cash, quantity or price needs correction; Balance unchanged; Cancel of "the proposed correction" | Mostly; the correction step is only a price correction here (cash correction is slice 22, quantity is purchases/sales). Q-068 |
| HOLDINGS_008 | Record a price of $0.00 after setup: review highlights the zero and says shares remain; Balance = cash; cost kept, gain -$200.00 or "Not available"; a missing price stays "Not available"; five types | Yes (needs price recording) |
| SUPPORTING_RECORD_002 | Undo of a statement removal, twice, returning the same statement and opening link once (D-059 kept the link for this) | Yes |
| WEALTH_001 | Household overview with brokerage, 401k, IRA, Cash Balance plan; financial assets 188,620.00; open the group and the account | Yes once holdings value is in the Balance |
| WEALTH_004 | Prices last updated shown; "balances come from different dates" explanation; record a price on the brokerage and the total moves to 26,620.00; the older 20,000.00 stays in history | Yes (needs price recording, price date on the line, Balance history) |
| WEALTH_009 | Wealth on a date counts only price values effective on or before it; a trend through the next month with the October increase | Yes; the trend view does not exist (new) |

All 14 are citeable in this slice. Nothing is blocked. Two scenarios need an owner call first (Q-066 cost, Q-068 what HOLDINGS_005 cancels).

## Design (proposed, to be approved)

- **A price is a dated observation on a holding** (account + symbol), not on a security: the Givens of HOLDINGS_002 and 003 have HOME at $110 in Redwood and $100 in Harbor and Willow on the same date, and HOLDINGS_006 (slice 22) separates "Harbor's latest HOME price dated Sep 29" from a Sep 30 observation. One table `holding_price` (V33): account, symbol, price (zero or more), value date (not in the future, not before tracking began), who entered, `created_at`, `replaced_at`, `removed_at` (removal itself is slice 24). One price per account, symbol and date counts; a later save on the same date replaces it (the earlier row stays; tie broken by `created_at`, tested with the clock moved). A price applies to every line of that symbol in the account.
- **Effective price** of a holding on a date = the latest of the recorded prices on or before the date and the line's own opening price (itself a dated observation), else the opening price. One definition (`HOLDING_DELTAS`, beside `EFFECTIVE_VALUES`), used by every reader. The by-symbol view (HOLDINGS_002) sums shares and values at each account's own price.
- **Balance** stays `opening + delta`. The price move, `sum(quantity x (effective price on the date - opening price))`, is **added to** the activity sum, never substituted for it (slices 21 and 23 put activity on the same accounts; `VALUED_DELTAS` is an either/or and must not be copied as is). `ActivityStore.deltasByAccount`, `deltaOf`, `changeUpTo` and the two `WealthStore` reads take it; the other `openingAmount() + delta` readers stay as they are. Quantities do not change before slice 20.
- **Locking**: a price write takes `lockAccount` like every other writer of the account, reads the key under the lock and re-reads the account state (draft, deleted, archived, closed) there. No cross-account lock is needed.
- **Cost** is optional per opening line (cost for that line's shares). Lines may repeat a symbol (V27 has `UNIQUE (account_id, position)` only, and `OpeningComponents` does not refuse a repeat), so HOLDINGS_004 is two CARE lines at $250: 2 shares with cost $400 and 12 with none. Known-cost shares, known cost, known gain and coverage are derived; full cost and gain are "Not available" unless every share has a known cost. Never zero.
- **Change explanation**: a price move is a term of the identity beside `valueChange` (D-051, D-066), so the residual stays 0. It is the one reader outside the balance that must change.
- **Counted once**: lines come from accounts, groups are views (D-065, D-067). The counted-once test adds a price and checks net worth, financial assets, each person's view, the Household total and the change explanation against the same lines.
- **Mixed dates (WEALTH_004)**: "the balances come from different dates" is its own sentence when the counted lines carry different value dates; it is not the 30-day stale flag (Sep 1 to Sep 30 is 29 days).

## Decisions

- D-070 (promoted): a purchase cost is an optional field of an opening holding line; unknown is null and shown "Not available", never zero; a partly known cost is two lines of one symbol; `Holdings` derives known shares, known cost, known gain and coverage; cost never enters a Balance.
- 19a shows the cost the opening was given. A holding's price is the opening price until 19b records one later. Balance is unchanged by 19a (no `holding_price` table yet).
- The Household page lists an investment account with "Balance dated <date>" (the Balance date of the list and the detail). The price date ("prices last updated") is 19b's, with the mixed-dates sentence of WEALTH_004.
- The Add and Remove holding buttons move focus in an effect after React commits, not in a frame callback (a late frame took focus from a cost field in e2e: "CARE400"; pitfall 49).

## Proposed split (for Checkpoint 1)

Recommended (the foundation is its own part, because it is the only one that changes a Balance):

| Part | IDs | Level | Leaves for the next |
| --- | --- | --- | --- |
| 19a Holdings shown, cost | 401K, BROKERAGE, HSA, ROTH_IRA, TRAD_IRA `_001`; HOLDINGS_004 (6) | API (cost rules, holdings read) + Vitest (holdings table, cost on the setup line, "Not available") + e2e | Prices (no Balance change in 19a); group views; statement difference; as-of reads |
| 19b Prices | HOLDINGS_008, WEALTH_004 (2), with the counted-once test, `holding_price`, the delta rule, the change term, races and replay | API first (rules, reviews, races, counted once), then Vitest + e2e | Group views; statements; as-of reads and trend |
| 19c Views and statements | HOLDINGS_002, HOLDINGS_003, HOLDINGS_005, SUPPORTING_RECORD_002 (4) | API + Vitest + e2e | As-of reads |
| 19d As-of reads and wealth | WEALTH_001, WEALTH_009 (2) | API (as-of with prices, trend, counted once on a date) + Vitest + e2e | Nothing for this slice |

Why: `_001` records no price (it is the opening, displayed with cost "Not available"), so 19a changes no Balance and lands first at low risk. 19b is the Balance-changing foundation with every reader and writer. 19c only reads; 19d reads other dates and needs the dated-price rule from 19b. Alternative (the owner's suggestion): 19a prices + holdings display together (6 + HOLDINGS_008 = 7 IDs and the foundation in one part), then display half, then as-of; heavier, and the first part could not land without the Balance change.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 1 (19a, this session) Optional cost per opening line; holdings table on detail and list; cost, gain, coverage "Not available" | `_001` x5, HOLDINGS_004 | API + UI + e2e | todo |
| 2 (19b) Shared price definition: V33, `HOLDING_DELTAS`, balance readers, change-identity term, counted-once test | (foundation; cited by 3 and 4) | API | done |
| 3 (19b) Record a price: review, Confirm, zero-price highlight, same-key and retry-after-change tests, replace on a date, raw-API guards, state matrix, price history, mixed-dates sentence | HOLDINGS_008, WEALTH_004 | API + UI + e2e | done |
| 4 (19c) Selected-account and whole-investment views | HOLDINGS_002, HOLDINGS_003 | API + UI + e2e | todo |
| 5 (19c) Statement difference review; Undo of a statement removal | HOLDINGS_005, SUPPORTING_RECORD_002 | API + UI + e2e | todo |
| 6 (19d) Wealth on a date with prices; trend | WEALTH_001, WEALTH_009 | API + UI + e2e | todo |

### Inventory

Found by grep on 2026-10-09 (`opening_amount`, `openingAmount()`, `deltaOf`, `deltasByAccount`, `changeUpTo`, `account_opening_holding`, `.balance` in `frontend/src`).

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `holding_price` (new, V33) | `ActivityStore.deltasByAccount`, `deltaOf`, `changeUpTo`; `WealthStore.balancesAsOf`, `notYetTracked`; `WealthService.explain` (change term); holdings read (account and all investments); price history on the account | Record a price (new, takes `lockAccount`); replace on the same date (same writer); `InvestmentSetupService.create/finish` (opening line = first observation); price removal is slice 24, not built | Two saves of one account, symbol and date; same-key replay; retry after the ledger changed; a price against Finish setup, Close, Delete, Archive of the holder; each fails when the lock is planted away |
| `account_opening_holding` (+ cost, shares covered) | `OpeningStore.of`, `InvestmentSetupService.opening`, the new holdings reads, `HOLDING_DELTAS` | `InvestmentSetupService.create`, `finish` (draft completed), `OpeningStore.save`; the plain Edit does not touch lines | Existing 17b races stay; new cost column checked in the same writers |
| `account.opening_amount` + activity delta (the Balance) | `AccountMapper:64`, `AccountService:119, 396`, `AccountLifecycleService:148`, `BalanceCorrectionService:190, 208`, `MovementService:433`, `TransferPreviewService:159`, `ReplacementPreviewService:77`, `OpeningRevisionService:93`, `ValueService:530`, `StatementService:187`, `RecurringService:409`, `WealthStore` (two SQL reads); frontend: `AccountsPage`, `AccountDetailPage`, `InvestmentAccount`, `HouseholdPage`, `WealthOverTime`, `FinishSetup`, `StatementsCard/Form` | none new; a price changes the Balance only through the delta | Counted-once test over every reader |
| `statement` removal / `account_opening.statement_id` | `StatementStore.openingUses`, `StatementService.removalReview` | `StatementService.remove` (D-059) and the new Undo | Undo twice (D-044) and Undo against a concurrent revise |
| Wealth groups (Investments / Retirement / Health savings) | `WealthService.summarize`, Household page groups | none | Counted-once test |

## Coverage

19a (this session), `npm run coverage -- --slice 19`: 6 of 13 covered; the 7 missing are 19b to 19d (HOLDINGS_002, 003, 005, 008; SUPPORTING_RECORD_002; WEALTH_001, 004; WEALTH_009 is not on the slice line yet).

| ID | Test | Level |
| --- | --- | --- |
| V2_BROKERAGE_001, V2_401K_001, V2_HSA_001, V2_ROTH_IRA_001, V2_TRAD_IRA_001 | `HoldingsApiTests.completeOpeningThenEdit` (five types: list, detail, wealth line and holdings one Balance; cost and gain absent; edit by Sam keeps the Balance, owner and a rename row) | API |
| the same five | `Holdings.test.tsx` (detail shows cash, holdings, one Balance dated 2026-09-01, cost and gain "Not available"; list and Household page agree) | UI |
| the same five | `e2e/tests/26-holdings.spec.ts` at 710px and 1280px (review, Confirm sentence and focus, detail, list, Household page, financial assets delta, edit sentence and focus) | e2e |
| V2_HOLDINGS_004 | `HoldingsApiTests.partlyKnownCost`, `fullyKnownCost`, `zeroCostIsKnown`, `invalidCost` (3 rows), `numberCostRefused`, `draftKeepsCost`, `otherAccounts` | API |
| V2_HOLDINGS_004 | `Holdings.test.tsx` "opening cost" (2 of 14 sentence, negative cost refused with no request, blank is Not available) | UI |
| V2_HOLDINGS_004 | `26-holdings.spec.ts` "2 of 14 CARE shares" at both widths | e2e |

## Notes for the build

- WEALTH_009 is in `deferred.txt`, not on line 19 of `slices.txt`: add it to the line (and remove it from `deferred.txt`) when it passes, so `--slice 19` counts 14.
- WEALTH_001 and 004 Givens show brokerage cash $16,000 / $15,000 on Sep 30; no cash movement exists yet, so the tests open the account with that cash and say so.
- Read `docs/guides/patterns.md` and `pitfalls.md` before group 1. Preflight registry-version checks (`npm view`, Gradle, start.spring.io) not run this session; no upgrade is planned.

## Open questions

- Q-066 Opening cost: an optional cost on each opening holding line (setup form, review, API); a repeated symbol is two lines, so a partial cost needs no extra field. Needed for HOLDINGS_002 and 004. Default if unanswered: yes.
- Q-067 A price is recorded on one holding (account and symbol), applies to every line of that symbol in the account, and the review shows the effect on that account's Balance and on wealth. Default: yes.
- Q-068 HOLDINGS_005: the statement review offers the correction paths that exist (record a price now; cash is slice 22, shares come with purchases and sales in 20) and Cancel leaves everything unchanged. Default: yes.
- Q-069 A second price for the same holding and date replaces the first (both kept in history, the earlier marked replaced). Default: replace, not refuse.
- Q-070 A price is accepted only on an active account (not draft, deleted, archived or closed); archived and closed accounts still read their last price. Default: yes.
- Q-071 WEALTH_009 trend: reuse the two-date read already on the Household page (`WealthOverTime`: wealth on a date, and the change between two dates) rather than a new month-end chart? Default: reuse; the scenario is two dated points and the October increase.
- Q-072 Split: the recommended 19a to 19d above, or the owner's order (prices and holdings together first)? Default: recommended.
- Q-073 Process review: run it right after approval, before group 1 (docs only, format of `review-2026-10-05.md`). Default: before.

## Checks before Checkpoint 2 (19a)

**Validator** (full `npm test`, e2e 350, plants): no functional defect; 6 test gaps, all closed with tests that go red when planted: G1 the preview ignores a cost (`previewIgnoresCost`), G2 Add holding focus (Vitest `Add a holding puts focus ...`; red without the effect), G3 a JSON-number cost at save, G4 Finish setup refuses a bad cost and keeps the draft's, G5 the cost error is focused and `aria-invalid`, G6 Finish setup starts from the draft's cost.

**Visual reviewer** (710px and 1280px; 1 High, 3 Medium, 5 Low):

| # | Finding | Result |
| --- | --- | --- |
| 1 High | Focus after Add a holding arrived late | `useLayoutEffect` and `append(..., { shouldFocus: false })` (RHF also focused the new item); the reviewer's `focus.mjs` run again on the final code (6 runs, then 6 runs with a 100ms wait): every typed value is in its own field, no `costN` step ever names another field, and 100ms after each Add focus is on the new holding's name in 18 of 18 steps; read straight after the click it can still be on the button for a frame (pitfall 49) |
| 2 Med | "Not available" and a long holding name squeezed in the review and Opening tables | `whitespace-nowrap` on Cost and Gain cells, `min-w-28` on the name, review `max-w-2xl`; e2e asserts the cell height; red when planted |
| 3 Med | The status sentence split the date over two lines at 1280px | status box `max-w-2xl`. A date wrapper broke every `findByText` (text split over spans), so it was dropped; a very long name can still wrap a date (logged) |
| 4 Med | Balance "dated 2026-09-01" beside a price dated 2026-09-30 | Owner call for 19b: the price date and the Balance date are different things; 19b adds "prices last updated" |
| 5 Low | Review said "Owners: Maya." for a one-owner type | `ownerLabelFor` (Owner, Participant, Owners); Vitest |
| 6 Low | Edit of the institution only adds no history row | By design (a rename row only); logged |
| 7, 8 Low | Cancel lands on the page body; Back lands on Account name | Older behaviour, logged |
| 9 Low | The cost field's "0.00" placeholder looked like a zero cost | placeholder "Unknown"; Vitest |

## Handoff (19a)

- 19a built: 6 of 13 IDs (`_001` x5, HOLDINGS_004). The slice stays `partial`: 19b prices (HOLDINGS_008, WEALTH_004), 19c views and statements (HOLDINGS_002, 003, 005, SUPPORTING_RECORD_002), 19d as-of reads (WEALTH_001, WEALTH_009; add WEALTH_009 to the slice 19 line in `slices.txt` and remove it from `deferred.txt` when it passes).
- 19b must (owner, 2026-10-09): a price move is never income (its own line in the change explanation, which still balances); every reader in the inventory has a test that fails when the price term is dropped from it; the earlier price of a replaced one stays in history with who and when, and the as-of read for an earlier date still returns it; a price is refused on a non-active account in the review as well as at Confirm; the counted-once test over net worth, financial assets, each person's view, the Household total and the change explanation; a lock per writer with a `holdUncommitted` race test; same-key and retry-after-change tests. Design: `holding_price` per account and symbol (see Design); `Holdings.view` takes the effective price; add the "prices last updated" date and the mixed-dates sentence.
- Logged, not built: a long name can still split a date in the status sentence; Cancel on Add account lands on the page body; Back on the review lands on Account name; an institution-only Edit adds no history row; three phrasings of one date ("as of", "dated", "on"); the Opening card repeats the Holdings card.
- Proof: backend 872 in one full run (the 19a `scripts/flake-check.sh` claimed 3 runs, but runs 2 and 3 were Gradle `UP-TO-DATE` in under a second; found at the start of 19b and the script now runs `cleanTest`), Vitest 492 x 3, e2e 350 on the final code, lint, format and typecheck clean.
- Dev data: "VR19a ..." accounts remain.

## Cowork pass (19a, owner, 2026-10-09)

**1 fault** (against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5, 1, 1); the four excluded items (the date mismatch, "Owners" with one owner, the status-sentence split, the institution-only Edit) were not counted.

| # | Step | Width | What the owner saw | Severity | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 Holdings card | 710 and 1280 | CARE cost and gain say "Not available" right above a sentence saying the cost is known for 2 of 14 shares ($400.00); the account-level cost and gain read the same | Low | When a security's cost is only partly known, its labels and the account's read "Full purchase cost" and "Full gain" (value stays "Not available", as HOLDINGS_004 words it); Vitest and e2e assert it, red when planted |

Owner's question, not counted: a purchase cost of 0 is accepted and reviews as "$0.00" with the whole value as gain. Kept as built (a gifted or vested share has a real zero cost, and HOLDINGS_008 treats a known zero as a value); the review shows the zero openly. Open for the owner if a confirmation is wanted.
Outside 19a, logged: the Household "Accounts in this view" list (18c) shows archived accounts with no Archived label (the groups do label them).

## How it works (19a)

Written after the build by a read-only agent and checked against the code (diff `61140fb..HEAD`, D-070).

**Cost on an opening line**
- Each opening holding line can carry an optional purchase cost, a nullable `cost` column (`V33__holding_cost.sql`). Blank is unknown (null); a typed 0 is a known zero cost. A cost never enters a Balance.
- `OpeningComponents` refuses a bad cost with "Purchase cost must be zero or greater"; `HoldingRequest` takes it as an object, so a JSON number is refused. Preview and save judge it alike.
- The setup form (`OpeningFields.tsx`, `openingForm.ts`) has an optional cost field (placeholder "Unknown"); the review (`OpeningReview.tsx`) has Purchase cost and Gain columns reading "Not available" when unknown; `FinishSetup.tsx` starts from the cost a draft kept.
- A partly known cost is two lines of one symbol.

**The holdings read**
- `GET /accounts/{id}/holdings` (`InvestmentSetupService.holdings`) returns a `HoldingsView`; a draft is 409 (Finish setup first), an unknown account 404.
- `Holdings` groups lines by symbol and derives known shares, known value, known cost, known gain and coverage (2 of 14 is 14.29%). A security's full cost and gain, and the account's, exist only when every share has a known cost.

**What the Holdings card shows**
- `HoldingsCard.tsx` on a completed investment account: cash, holdings, the one Balance with its date, then one block per security (shares, price and its date, value, cost, gain). Partly known cost: the "known for 2 of 14 shares" sentence and "Full" labels.
- The Household page shows "Balance dated <date>" on investment accounts.
- Not built yet: prices after setup, group views, as-of reads (19b to 19d).

**Focus and layout fixes**
- Add and Remove holding move focus in a layout effect and pass `shouldFocus: false` to `append` (pitfall 49; a late frame callback is the likely cause of the cost typed into the symbol field, not proven).
- Cost and Gain cells do not wrap, the name has a minimum width, the review and status boxes are `max-w-2xl`.

**Tests**
- `HoldingsApiTests` (five types' `_001`, HOLDINGS_004 rules, preview, Finish setup, draft), `Holdings.test.tsx`, `e2e/tests/26-holdings.spec.ts` at 710px and 1280px. Final counts: backend 872 x 3, Vitest 492 x 3, e2e 350.

---

# 19b: prices (HOLDINGS_008, WEALTH_004)

- Started: 2026-10-09 (second session of slice 19). Status: partial (19b landed; 19c and 19d to do).
- Kickoff prompt (v2, owner's extended version): run the feature-session skill for slice 19b, HOLDINGS_008 and WEALTH_004; handoff and requirements in "Handoff (19a)". Owner answers: a $0 cost stays as built; Q-069 replace (the earlier stays in history with who and when, and the as-of read for an earlier date still returns it); Q-070 prices only on an active account, refused in the review as well as at Confirm; the process review is run separately. A price move is never income: its own line in the change explanation, which still balances. Every reader in the inventory (by grep: `ActivityStore.deltaOf`, `deltasByAccount`, `changeUpTo`, the two `WealthStore` reads, the change explanation, each person's view, the Household total, each group total) gets a test that fails when the price term is dropped, plus a counted-once test across net worth, financial assets, each person's view and the Household total; overlapping groups stay views. A price write takes `lockAccount`: a `holdUncommitted` race test that fails when the lock is planted away (restore from a copy), same-key and retry tests (D-024, D-049), a raw-API refusal test per rule. Group 0: the Household "Accounts in this view" list shows archived accounts with no label (fix or log). Run `scripts/flake-check.sh` and 8 Vitest runs first. Every Confirm, removal, Undo and Back ends with a sentence and the right focus; labels against the holding's vocabulary ("Not available", never zero). Validator, then visual-reviewer, before Checkpoint 2; advisor at Checkpoint 1 and before Land; commits in logical pieces. Do not stop between groups; stop at the task-list approval and when the app is ready. Report the Cowork count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5, 1, 1 and 1.
- Checkpoint 1 answer (2026-10-09): approved. Q-074 to Q-078 as written (Q-077 as the advisor's rule: refuse a price before the symbol's opening price date). Build groups 1 to 3 without stopping. Every repeated-run claim is reported with its elapsed time (a 3-run backend check takes about 25 minutes; a run under a minute is not a run). The Flyway "Unable to obtain connection" failure stays OPEN in the notes (seen once, in flake-out3 run 1; not reproduced in 3 clean runs of 7m50s each, flake-out4).

## 19b gap analysis (from the code)

What exists after 19a: the holdings read (`Holdings`, `GET /accounts/{id}/holdings`), cost on opening lines, the Holdings card. A holding's price is only its opening line's. Every Balance is `opening + ActivityStore delta`; `GET /accounts/{id}/balance?asOf=` reaches `BalanceCorrectionService.balanceOn` and so `changeUpTo` for an investment account.

| ID | Needs | Citeable now? |
| --- | --- | --- |
| HOLDINGS_008 (6 examples: the five types with cost $200.00, and an HSA with unknown cost) | Record a known zero price after setup: review highlights the zero and says 10 shares remain recorded; save; holding value $0.00, Balance = cash; shares and cost unchanged; gain -$200.00 or "Not available"; list, detail, wealth agree; a missing price still says "Not available" | Yes, with the price table, the review and the save |
| WEALTH_004 | Wealth on Sep 30 with checking and a brokerage last priced Sep 1: "prices last updated Sep 1", the sentence that balances come from different dates; record HOME $130.00 dated Sep 30 on the brokerage: total $26,620.00, Balance $21,500.00 = $15,000.00 cash + $6,500.00 holdings; the older $20,000.00 stays visible in the brokerage history | Yes |

Both are citeable. WEALTH_001 and WEALTH_009 stay with 19d (the as-of reads get their price term here; their screens are 19d).

## 19b design

- **`holding_price` (V34)**: id, account_id, symbol, price (zero or more, up to 4 decimals), value_on, entered_by_member_id, created_at, replaced_at, removed_at (removal is slice 24, not built), idempotency_key. A partial unique index on (account_id, symbol, value_on) where not replaced and not removed. A second price for the same holding and date sets `replaced_at` on the first and inserts the new one in one transaction; the first row stays with who and when.
- **Effective price** of a line on a date D: the latest of the line's own opening price (dated by its value date) and the active recorded prices of that account and symbol dated on or before D (a recorded price outranks the opening price on a tie; then the later `created_at`). One SQL fragment, `HOLDING_DELTAS`, beside `EFFECTIVE_VALUES`: per line `round(quantity x effective price, 2) - round(quantity x opening price, 2)`, summed per account, with the date of the latest price. Replaced and removed rows are never read.
- **The delta is added to the activity sum**, never substituted (slices 21 and 23 put activity on the same accounts). Readers that take it: `ActivityStore.deltasByAccount`, `deltaOf` (and through it the account detail, the list, Close and Archive reviews, statements, the opening revision), `changeUpTo` (Balance as of a date), `WealthStore.balancesAsOf` (with and without a member), which also returns the price part alone and the latest price date.
- **Opening price date (advisor, resolves the Q-077 conflict)**: a recorded price must be dated on or after the earliest value date among the account's opening lines of that symbol; an earlier one is refused (400, "HOME's opening price is dated 2026-09-01; record a price on or after it"), in the review and at save, like the tracking-start refusal. So no recorded price is ever inert and the history never has to explain one. Q-077 is replaced by this rule.
- **The Balance date moves**: `Delta.latest` becomes the later of the last activity date and the latest price date, so after a Sep 30 price the list and detail read "as of 2026-09-30" (WEALTH_004); the 19a e2e asserts the opening date only, which stays true until a price is recorded. `Holdings.view` computes `holdingsValue` from effective prices; HOLDINGS_008 asserts cash + holdings = Balance ($1,000.00 = cash) in the read and the list.
- **Delete and the sweep**: an account is deleted softly (`deleted_at`), so no row is removed and `holding_price` needs no sweep delete; `DeletedAccountSweepApiTests` now also hits `GET /prices`, `/holdings`, `/opening`, `POST /prices/review` and `POST /prices` on a deleted account (404). Recorded prices count as saved history, so an account with a price cannot be deleted (found by the validator: `AccountUsageStore.Usage.prices`, the delete review and the delete). A partial-unique-index violation is mapped to 409 (D-052 pattern); with the account lock it cannot be reached by a test, and without the lock it answers 500 (planted, red: the lock tests).
- **Reading of Q-069**: "the as-of read for an earlier date still returns it" means an as-of read dated before a later price, or before a replacement, still returns the Balance the earlier price gave; a replaced price is dropped from every read for its own date onward, but stays in the price history with who and when. A test records $120 on Sep 10, then $130 on Sep 30, then replaces the Sep 30 price with $140, and reads Sep 10 ($120), Sep 29 ($120), Sep 30 ($140), and the history with three rows (one replaced).
- **The change explanation** gets a `priceChange` term (account Balance move from prices between the two dates, per account lines `priceMoves`) beside `valueChange`; never part of income, spending, transfers or corrections; the residual stays 0.
- **Record a price**: `POST /accounts/{id}/prices/review` (writes nothing; same checks as the save) and `POST /accounts/{id}/prices` (keyed, takes `lockAccount` first, reads the key under the lock, then the state gate), `GET /accounts/{id}/prices` (history with who and when, replaced rows marked, and the Balance points by date). Rules, each refused in the review and at save (400 unless stated): the account is active (draft 409 with Finish setup; archived and closed 409; deleted 404), the symbol is held (named exactly as an opening line), price is a valid amount of zero or more, the date is not in the future and not before the tracking start, the entering member is an active member of the household (read `FOR SHARE`). A zero price is accepted and the review highlights it. A price dated before the account's earliest opening price date for that symbol is refused (above).
- **Retry (D-024, D-049)**: the same key and the same body returns the saved price (200, no second row); the same key with a different body is 409; a retry after the account was archived or its member deactivated still replays (judged on what was saved).
- **WEALTH_004 sentences**: an investment line carries `valueDate` (the date of its latest price) and the summary lists `olderDates` (investment lines whose price date is before the wealth date); the Household page says "Prices last updated 2026-09-01" under the line and, when any exist, "These balances use prices dated before 2026-09-30. Balances come from different dates." It is not the 30-day stale flag. The Household page already shows "Value dated"/"As of" for a line with `valueDate` (18b) and "Balance dated" for investments (19a): group 3 reconciles them so an investment line shows one date phrase ("Prices last updated" with the price date, and the Balance date only when it differs), never two.
- **UI**: a "Record a price" panel on a completed investment account (holding chooser, price, date, entered by) with a review (before and after for the holding, the account Balance and the Household total; the zero highlighted: "HOME will be worth $0.00. Your 10 shares stay recorded."), Confirm ends with a sentence on the status line with focus, Back returns focus to the form, Cancel returns focus to its button; a "Prices" history card (who, when, replaced rows) and a "Balance history" list (the opening Balance and each price date's Balance); the Holdings card shows the price date and the Balance date apart; the change explanation shows "Investment price changes" as its own line.

## 19b task list (to be approved at Checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 Checks (flake check: found the port collision, `application-test.yaml` fixed, re-run pending) and the archived label: `scripts/flake-check.sh` (now `cleanTest`), 8 Vitest runs, the Household "Accounts in this view" archived label | none | Vitest + e2e | done: 3 real flake runs of 872 tests, 7m51s 7m50s 7m51s, 0 failures; 8 Vitest runs of 492; the Flyway failure stays open |
| 1 The price term in every reader: V34, `HOLDING_DELTAS`, `deltasByAccount`, `deltaOf`, `changeUpTo`, `WealthStore` reads, change explanation `priceChange`; a drop-the-term test per reader; counted once | HOLDINGS_008, WEALTH_004 (foundation) | API | done (`HoldingPriceReadersApiTests`, 5 reader plants red) |
| 2 Record a price: review, keyed save, replace on a date, history, rules, lock and race, same-key and retry, raw-API refusals | HOLDINGS_008 | API | done (`HoldingPriceApiTests`, `HoldingPriceRaceApiTests`) |
| 3 UI: reconcile the two Household date phrases for investment lines (see above); Record a price panel, price history and Balance history, Holdings card dates, the Household "prices last updated" and the different-dates sentence, the change line | HOLDINGS_008, WEALTH_004 | Vitest + e2e at 710px and 1280px | done (`Prices.test.tsx` x2, `27-prices.spec.ts`) |

### 19b inventory (grep, 2026-10-09)

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `holding_price` (new) | `ActivityStore.deltasByAccount`, `deltaOf`, `changeUpTo`; `WealthStore.balancesAsOf` (2 forms), `notYetTracked` (not a reader: an untracked account has no price yet); `WealthService.explain`, `line`, `summarize` (group totals, per-person view, Household total, financial assets, net worth: all summed from the lines); `Holdings.view` (price per security); price history; frontend `HoldingsCard`, `HouseholdPage`, `WealthOverTime` | record a price (new, `lockAccount`); replacement of a same-date price (same writer); `InvestmentSetupService.create/finish` write opening lines (the first observation), not `holding_price`; Delete account and Undo (the prices stay with the account) | two saves of one holding and date; same-key concurrent; a price against Archive, Close and Delete of the account; each red when the lock is planted away |
| Balance through `deltaOf` | `AccountMapper:64`, `AccountService:119, 396`, `AccountLifecycleService:148` (Close needs zero; Archive review), `OpeningRevisionService:93`, `StatementService:187`, `ValueService:530` (valued only), `BalanceCorrectionService:190, 208`, `MovementService:433`, `TransferPreviewService:159`, `ReplacementPreviewService:77`, `RecurringService:409` (the last six refuse an investment account; a test per refusal stays green) | none | reached through the per-reader tests |
| Wealth groups (D-065, D-067) | `WealthService.summarize`; Household page | none | counted-once test: net worth, financial assets, each person's view, Household total, change explanation, each group total |

## 19b open questions

- Q-074 Reading of Q-069 (above): a price replaced on its date is gone from every read from that date on, an earlier-dated read is unaffected, and the history keeps it. Default: as written.
- Q-075 Price on a symbol the account does not hold: refused (400, "X is not held in this account"). Default: refuse.
- Q-076 The different-dates sentence applies to investment lines whose latest price date is before the wealth date (not to ledger accounts, which are exact as of the date, and not to manually valued accounts, which keep their own stale flag). Default: as written.
- Q-077 (replaced by the advisor's rule above) A price dated before the opening price date of that symbol is refused in the review and at save. Default: refuse.
- Q-078 A price is entered by a chosen active member (Entering as), recorded with the row, like statements. Default: yes.
- Q-079 Group 0 archived label: the "Accounts in this view" list shows the status badge the groups show. Default: fix it.

## 19b flake investigation (group 0)

`scripts/flake-check.sh` (now `cleanTest test`) ran 3 real runs: run 1 failed 195, run 2 passed, run 3 failed 14. Evidence kept in `flake-out3` (a temp folder, summarised here): the 12 failures of run 3 and 12 of run 1 are one class, `OwnerCorrectionApiTests`, with 401 and 404 on its setup call; its Netty ports (63360 in run 1, 49248 in run 3) were `Code Helper` listeners on 127.0.0.1; 19a's `MortgageChangeApiTests` timeout was port 63810, also a `Code Helper` listener. Run 1's other 183 failures are a second, unexplained cause: `ReplayRulesApiTests` failed to load its context (Flyway "Unable to obtain connection") and Spring's failure threshold skipped every later class. Fix: `server.address: 127.0.0.1` in the test profile; re-run: 3 real runs of 872 tests, 7m51s, 7m50s, 7m51s (about 24 minutes in all), 0 failures; pitfalls 50 and 51. **Open:** the Flyway "Unable to obtain connection" context failure of flake-out3 run 1 (183 skipped tests) is unexplained and did not recur in those 3 runs; it stays open here and in pitfall 51. The 19a claim "872 x 3" was one run (corrected above).

## 19b coverage and checks before Checkpoint 2

`npm run coverage -- --slice 19`: 8 of 13 (19a's 6, plus HOLDINGS_008 and WEALTH_004). WEALTH_009 is not on the slice line yet (19d). Elapsed times of repeated runs (only these count as runs):

| Check | Result | Elapsed |
| --- | --- | --- |
| `scripts/flake-check.sh 3` (flake-out4, with `cleanTest`) | 872 tests x 3, 0 failures | 7m51s, 7m50s, 7m51s |
| Vitest loop, 8 runs, before the build | 492 x 8, 0 failures | about 12s each |
| Full backend, own run after groups 1 and 2 | 917 tests, 0 failures | 8m05s |
| Validator's first `npm test` | **917 tests, 88 failed**: `TransferRaceApiTests` failed to load its context, Flyway "Unable to obtain connection ... error occurred while setting up the SSL connection", then Spring's failure threshold failed 12 classes (Transfer*, Value*, Wealth*, ZeroStart*), on an idle host | 6m55s |
| Validator's rerun (`cleanTest test`) | 917 tests, 0 failures | 8m06s |
| Validator's full e2e | 364 passed | 3m09s |

**The Flyway "Unable to obtain connection" failure is open and has now happened twice** (flake-out3 run 1, and the validator's first `npm test`, an SSL setup error on an idle host); not reproduced in 3 clean runs. Port collision (pitfall 51) does not explain it. Not fixed; the cause is probably the Testcontainers database not accepting a connection yet when a new context starts.

**Validator** (full report in the session; plants all red except the cases below, all closed): D1 (Medium, code) an investment account whose Balance comes from a recorded price could be deleted with no warning: fixed (`Usage.prices`, delete review and delete, test red when planted). D2 the DuplicateKeyException to 409 mapping is unreachable under the lock (planting the lock away answers 500): documented above, no test possible. D3 the tie rules had no test: added (a recorded price wins a tie with the opening price; two saves with the clock moved), both red when planted; the replaced-price filter in `HoldingDeltaSql` only matters on an equal `created_at`, which the fixed test clock produces. D4 a title without a scenario ID: fixed. D5 Cancel from the review, the singular "1 share" sentence, a refused field in view and focused, a long price history: added to Vitest and e2e (the Back test clears a save error twice, in Back and again at the next Review, so planting only the Back reset stays green: logged). D6 doc lines: fixed. The absolute $26,620.00 total is now asserted by the API (`HoldingPriceWealthApiTests`).

**Balance sites decided** (build-checklist: every `formatMoney` of a Balance): the Holdings card (cash, holdings, Balance: effective prices), the Prices card (Balance history points), the account header and list (`balance.amount`, moved by a recorded price), the Household group lines (`account.balance` and "Prices last updated"), the "Wealth on a date" card (`balance` per line as of the date), the review (before and after: holding value, Balance, household wealth), the status sentence (`PriceResult.message`). No reader formats a Balance from the opening amount alone for an investment account.

## 19b visual review (710px and 1280px; 4 Medium, 4 Low)

| # | Finding | Result |
| --- | --- | --- |
| 1 Med | A server refusal about the date (before the symbol's opening price date) was a banner at the top of the form, no full stop, focus left on Review price | The refusal is shown beside Price date, which takes focus; wording "HOME's opening price is dated 2026-09-20. Record a price on or after that date."; Vitest (red first) |
| 2 Med | The status sentence split its date over two lines at 710px | `text-pretty` on the status line (avoids a one-word last line); not a guarantee: a date can still break (logged, as in 19a) |
| 3 Med | Date before setup used account-setup wording ("Review the earlier tracking start...") and its date broke | A price says "A price cannot be dated before tracking began on 2026-09-01." (server, client rule, mock, tests) |
| 4 Med | The different-dates note was one 1,734-character paragraph naming about 25 accounts | A count and a list ("N investment accounts use prices dated before D"), folded into "Show the accounts" above 3; Vitest |
| 5 Low-Med | Back from the review left focus on the panel wrapper in the dev server (StrictMode runs the panel's focus effect twice, after the heading's) | `Panel` takes `takeFocus={false}` after Back; a Vitest under StrictMode (red when planted) and the dev trace now reads `record-price-heading` at 0, 50, 200 and 600ms |
| 6 Low | Sentences showed the price without a dollar sign | "$130.00" in the review, the status sentence and the replaces text (server, mock, tests) |
| 7 Low | An account whose opening price is dated after its setup shows "as of <setup>" in the header and "Prices last updated <price date>" on the Household page | Not changed: the Balance date (a recorded price or the setup) and the date of the latest price (including an opening line's) are two things, and 19a's owner pass accepted "dated 2026-09-01" for an HSA priced 09-30. **Question for the owner (Q-080)** |
| 8 Low | The future-date refusal used ledger wording | "A price cannot be dated in the future." |

Taste, logged: the form opens above its opener; Entered by sits above the buttons in the form and below them in the review; the review does not show the gain change; "Household wealth" in the review is today's figure; Balance date wording varies ("as of", "dated"); Balance history rows have no reason label; "Accounts in this view" shows no date phrase for investment lines; At 710 the "Asset value change" amount sits under its note.
Not reached by the reviewer: a draft or closed account refusing a price in the UI, a chooser with several holdings, a price with 4 decimals, the delete review blocked by prices, the packaged build (`npm start`; the e2e runs the jar).

One Vitest failure, seen once, evidence not kept (a mistake: pitfall 33 says copy the output first): `OwnerCorrection.test.tsx` "V2_401K_007 Maya reviews and saves ..." failed in the first full run after a frontend edit and passed in the next 3 full Vitest runs (514 tests, about 13s each). Open.

## 19b Cowork pass (owner, 2026-10-09): 3 faults (1 Medium, 2 Low)

Count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5, 1, 1 and 1. Not counted: Q-080, the status-sentence date split, taste items. 19a's fault (partly known cost) looks fixed. Red-first evidence, as actually seen: fault 1 failed on the old jar in e2e (`27-prices.spec.ts` "Cowork 19b", the review sentence and the Prices card note). Faults 2 and 3: the first e2e run stopped at a hard assertion, so their e2e lines did not run on the old jar; their Vitest tests (`Prices.test.tsx`) were checked red by planting the pre-fix `OlderPricesNote.tsx` and `WealthOverTime.tsx` (restored with cmp): `Unable to find role="list" and name "Price changes"` and the Archived label test failed, 5 others passed. The e2e plant (same two files, jar repackaged) then failed at the `Price changes` line (362) and the `Archived` line (372) and passed fault 1's lines; restored with cmp. After the fix 368 e2e pass (3.1m).

| # | Fault | Fix |
| --- | --- | --- |
| 1 (Medium) | A price dated on the opening price date replaced the opening price silently: no "replaces" sentence, no row | Review says "It replaces the $100.00 opening price dated D; the opening price stays in the opening holdings."; history returns `overridden`; Prices card lists "Opening price replaced: HOME $100.00 for D" (API test `sameDateAsTheOpeningPrice`) |
| 2 (Low) | "Investment price changes" had no per-account line | `Price changes` list: "<account> price increase of $X ($a to $b), a price move rather than income or spending." (Vitest) |
| 3 (Low) | Archived account in the older-prices "Show the accounts" list had no label | `OlderPricesNote` takes the status from the investments group and shows the Archived badge (Vitest) |

Owner questions (not counted), answers pending: the different-dates note compares with the wealth date (today shows it almost always); "Holding market price must be zero or greater" is the scenario's own wording (`setup.feature:64`), kept; "Opening total" row differs between accounts; Wealth on a date shows no Debts line.

## Handoff (19b)

- 19b built: HOLDINGS_008 and WEALTH_004 (8 of 13 IDs on the slice line). The slice stays `partial`: 19c views and statements (HOLDINGS_002, 003, 005; SUPPORTING_RECORD_002), 19d as-of reads (WEALTH_001, WEALTH_009; put WEALTH_009 on the slice 19 line in `slices.txt` and remove it from `deferred.txt` when it passes).
- Reuse, do not rebuild: `HoldingDeltaSql` (the one price definition; `perAccount(dateExpr)` and `lines(dateExpr)`), `HoldingPriceStore.effective(...)`, the effective-price rule in `InvestmentSetupService.holdings` (`atEffectivePrices`). Any new Balance reader adds the price term through `HoldingDeltaSql` and needs a plant that fails when it is dropped (build-checklist; pitfall 50 for flake runs).
- 19c/19d must know: the Household "Accounts in this view" list has no date phrase for investment accounts (the group lines have "Prices last updated"); the price review omits the gain change (taste item); the selected-account and whole-investment views (19c) must read the effective price on their date, not the opening price; WEALTH_001 and WEALTH_009 (19d) read the as-of Balance through `balancesAsOf`, which already joins `perAccount`.
- Owner answers wanted: Q-080 (Balance "as of" vs "Prices last updated" when an opening price is dated after setup); the different-dates note compares with the wealth date, so today's view shows it almost always (compare with the newest price in the total instead?); "Opening total" row shows on some accounts only; Wealth on a date has no Debts line.
- Open, not explained: Flyway "Unable to obtain connection" in a Testcontainers context (twice: flake-out3 run 1 and the validator's first `npm test`; pitfall 51); one `OwnerCorrection.test.tsx` Vitest failure whose output was not kept (pitfall 33 says copy it), not seen in the later full runs.
- Logged, not built: removal of a recorded price (slice 24); a long name can still split a date in the status sentence; the price form opens above its opener; "as of" and "dated" both appear.
- Dev data: "VR19b ..." accounts, "CW Meadow HSA Plan" and "VR19b Late Price Brokerage" carry prices and cannot be deleted.

## How it works (19b)

Drafted by a read-only agent, then checked against the code and the migration (the agent ran nothing and said it had not compared code with docs; wording and counts corrected here).

1. **Click flow.** On a completed, active investment account, "Record a price" opens a form (holding, "Market price", "Price date", who entered it) and a review that writes nothing: holding value, Balance and household wealth before and after. A known $0.00 is allowed and highlighted ("Your 10 shares stay recorded"). Confirm ends on the status sentence with focus; Back returns to the form heading, Cancel to the opener. A price dated the same day as the opening price says it replaces that opening price (kept in the opening holdings), and the Prices card lists "Opening price replaced".
2. **Where it shows.** The Prices card (every price with who and when, Replaced rows, Balance on each date it changed), the Holdings card, the account header and list, the Household group lines ("Prices last updated <date>"), "Wealth on a date" (with "These balances come from different dates" and a list, folded when long, with an Archived label where it applies), and "What changed" (an "Investment price changes" line, then one sentence per account; never income).
3. **Server path** (`HoldingPriceController`, `HoldingPriceService`, `HoldingPriceStore`, table `holding_price` in `V34__holding_price.sql`): the review and the save apply the same rules (investment type, active account, held symbol, valid price, not in the future, not before tracking began, not before the symbol's opening price date, active member). The save takes `lockAccount` first, re-reads the account, expires and reads the save key (same key and details replay; different details 409), then the state gate, then reads the member `FOR SHARE`, replaces a same-date price (the old row stays with `replaced_at`) and inserts. A partial unique index turns a lost race into 409.
4. **One price definition.** `HoldingDeltaSql` gives the effective price of each opening line on a date: the latest of the opening price and recorded prices on or before the date; a recorded price wins a tie; replaced rows never count. The price term is added (not substituted) in `ActivityStore.deltaOf`, `deltasByAccount`, `changeUpTo` and both `WealthStore` reads, so every Balance, group, person view and the household total follows and each account counts once. The change explanation has its own `priceChange` term and still balances (`other` stays 0).
5. **Also.** An account with recorded prices (replaced ones count) cannot be deleted (validator finding). Decisions: D-071; Q-066 to Q-080 (Q-080, Q-081 open). Removal of a price is slice 24 (`removed_at` exists, unused).
6. **Verify.** `HoldingPrice*ApiTests` (backend), `Prices.test.tsx` x2 (Vitest), `e2e/tests/27-prices.spec.ts`; screens as in the Cowork list.

## 19b proof at Land (final code, `3108a80`, `48a7645`, `cf57de5`)

| Check | Result | Elapsed |
| --- | --- | --- |
| Vitest loop, 8 runs | 516 x 8, 0 failures | about 11s each, 91s in all |
| `scripts/flake-check.sh 3` (flake-out4, `cleanTest`) | 923 tests x 3; **run 1: 1 failure**, runs 2 and 3: 0 | 24m36s in all (16:44:07 to 17:08:43) |
| `LoanCorrectionRaceApiTests` alone, 10 runs after that | 10 of 10 green | 12-13s each, 2m06s in all |
| Full e2e on the final code | 368 passed | 3m11s |
| Cowork fix plants | fault 1 red on the old jar (e2e), faults 2 and 3 red in Vitest and in e2e | see above |

**New open flake (not 19b code):** run 1 of the flake check failed `LoanCorrectionRaceApiTests.twoInitialAmounts` (V2_LOAN_004): two different initial amounts at once answered `[201, 409]`, expected `[201, 201]` (line 103). Failure kept: `LoanCorrectionRaceApiTests.java:103`, `Expecting actual: [201, 409] to contain exactly in any order: [201, 201]` (flake-out4/results1, untracked). Not reproduced alone in 10 runs, so it needs the full suite's load; the 409 body was not captured. So the flake check did NOT come back clean: 2 of 3 runs green. Open next to the Flyway failure (two hits) and the single `OwnerCorrection` Vitest failure. A next session should capture the 409 body in that test's failure message.

## 19c kickoff and group 0 (2026-10-10)

- Kickoff (owner, 2026-10-10): feature-session for slice 19c: HOLDINGS_002, 003, 005 and SUPPORTING_RECORD_002. Process review is run separately by the owner: skipped. Group 0 first: (a) `LoanCorrectionRaceApiTests.twoInitialAmounts` `[201, 409]` with the body printed, reproduced under load, fixed or explained with evidence; (b) the Flyway "Unable to obtain connection" failure and the single OwnerCorrection Vitest failure reproduced with output kept, else logged with evidence; (c) remove `flake-out4/`, ignore `flake-out*/`. Carry in Q-080, Q-081, the Opening total row and the missing Debts line. Red before the fix alone (pitfall 53); elapsed time on every repeated run; validator, then visual-reviewer before Checkpoint 2; advisor at Checkpoint 1 and before Land. Report the Cowork count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5, 1, 1, 1 and 3.
- Push of 19b (2026-10-10): the pre-push hook runs the full backend suite. My first two pushes overlapped (two Gradle runs on one build directory; one died with `NoSuchFileException ... in-progress-results-generic.bin`), my mistake. The third push ran alone: hook passed (923 backend tests, frontend typecheck and tests), `61140fb..cc301c7` pushed, 18:32:54 to 18:41:17 (8m23s).

### Group 0 results

| Item | Result | Evidence and elapsed time |
| --- | --- | --- |
| (a) `twoInitialAmounts` `[201, 409]` | **A test bug, not a conflict path in the app.** `CardPaymentTestBase.key()` was `"k-card-" + (++paymentKeys)` on a plain static int and `both()` calls it inside two `async` suppliers, so two threads could draw the same key; the second request then (correctly) answered 409 "This save was already used with different details" (`OpeningRevisionService.replay`). The race tests that assert only "exactly one saved" hid it; the two that assert 201 and 201 showed it (`twoInitialAmounts`, `sameKeyAndTwoCorrections`). `TransferRaceApiTests.key()` had the same counter. | Mechanism reproduced: with a 50 ms gap planted between read and write of the counter, both tests fail with `409 ... "This save was already used with different details. Start a new entry."` (plant restored from a copy, `cmp` clean). Fix: `AtomicInteger` in both; `both()` keeps each refusal's body and the two asserts print it. Verified: 10 runs of both race classes, 4 `yes` CPU hogs running, all green, 6m18s (37-38s each). The hook's full backend run (8m23s) also passed. |
| (b) Flyway "Unable to obtain connection" | **Not reproduced; stays open (two hits).** | 15 fresh Gradle runs (each starts a Testcontainers database and a Spring context, a Flyway migration each) of `LoanCorrectionRaceApiTests`, logs kept in `/tmp/g0/fw*.log` and grepped for "Unable to obtain connection" and "SSL connection": no hit, 3m23s. Plus the 3 flake-check runs (24m36s), the validator-free hook run (8m23s) and the 10 loaded runs above: no hit. |
| (b) `OwnerCorrection` Vitest failure | **Not reproduced; stays open (one hit, output lost).** | 30 runs of `src/features/accounts` (13 files, 127 tests, includes `OwnerCorrection.test.tsx`) with output kept: 30 of 30 passed, about 4.5s each, about 2m20s, while the 15 backend runs loaded the machine. Plus 8 full Vitest runs (91s). |
| (c) `flake-out4/` | removed; `flake-out*/` in `.gitignore` | `git status` clean |

## 19c gap analysis (from the code)

| ID | Background against the code | Citeable now? |
| --- | --- | --- |
| HOLDINGS_002 | Needs a read across accounts: per security shares, value, known cost and gain for the known shares, known-cost coverage (250 of 350 = 71.43%), full cost and gain "Not available", the account Balances and their total, the security's share of the investment Balance (35,500 / 131,500 = 27.00%), and each account's cash, shares, price date and cost explanation. The pieces exist per account (`Holdings.positions`, effective prices, 19a/19b); no cross-account read or screen exists. Prices are per holding, so 50 HOME at $110.00 beside 200 HOME at $100.00 needs no shared price. | Yes, with a new read and screen |
| HOLDINGS_003 | The selected account's cash, holdings value and Balance are on the Holdings card; "HOME is 25.58% of the Balance" and a separately labeled "All investment accounts" summary ($131,500.00) are missing. Neither heading nor list may include the other accounts. | Yes |
| HOLDINGS_005 | `StatementsCard` already reviews a statement against the calculated Balance ("it will not move"). Missing for an investment account: the $100.00 difference on the statement date, the question which cash, quantity or price needs correction, and the cancel of a proposed correction. Only a price can be corrected now (HOLDINGS_008); cash and quantity correction is slice 22 and must not be offered. | Yes, with only the price correction offered (owner, 2026-10-10) |
| SUPPORTING_RECORD_002 | Removal review and removal exist (`StatementService.remove`, "the removal stays in history"); the opening link survives removal (`usedByOpening`). Undo does not exist: the code says "bringing a removed one back comes in a later release". Needed: restore (twice returns the same statement once), the history of removal and restore, Balance and opening breakdown unchanged. | Yes, with restore |

All four are citeable. Nothing deferred.

## 19c design

- **Group read** `GET /api/v1/investments/holdings` (`InvestmentHoldingsService`, `InvestmentHoldings` DTO): the accounts the wealth "Investments" group counts (D-065/D-067: every completed investment account once, archived and closed labeled by status), each with cash, holdings value at effective prices, Balance and Balance date; the group Balance total (equal to `wealth.investments.total`); and per security (symbol, summed across accounts) shares, value, known shares/value/cost/gain, coverage, full cost and gain (null when any share is unknown), share of the group Balance, and its per-account positions (shares, price, price date, value, cost state). Built from the same per-account lines as the Holdings card and the one Balance (`account.balance`), so a price shows once everywhere. A person view is not built (logged).
- **Share of Balance**: `HoldingsView.Security.shareOfBalance` ("25.58%", value over the account Balance) for HOLDINGS_003; the group read has the same field over the group Balance (27.00%). Labeled as a different measure from coverage.
- **Screens**: a new page `/investments` ("Investments", reached from the Household Investments group and the account page): heading, "All investment accounts" summary (total and one line per account), a security chooser, and the selected security (350 shares ... coverage, the account Balances, "HOME is 27.00% of this investment Balance (not the same as known-cost coverage)"), each account line linking to the account. The account page keeps its selected-account Holdings card and adds a separately labeled "All investment accounts" summary with a link; neither includes the other's lines.
- **Statement difference (HOLDINGS_005)**: `GET /accounts/{id}/statements/difference?statementOn=&balance=` (read, no write) returns the calculated Balance on that date (`changeUpTo`), the statement total and the difference, and `corrections: ["price"]` for an investment account. The Statements review shows "The statement total is $21,400.00 and the calculated Balance on 2026-09-30 is $21,500.00: a difference of $100.00. Which cash, quantity or price needs correction? Only a price can be recorded now; cash and quantity corrections come later." with Record a price (opens the price panel, 19b), Save statement as supporting record, and Cancel (ends with a sentence and focus; nothing changed).
- **Undo of statement removal (SUPPORTING_RECORD_002)**: V35 `statement_event` (statement, kind removed or restored, member, time; existing removals backfilled from `removed_at`); `POST /accounts/{id}/statements/{sid}/restore` takes `lockAccount` first, then the state gate, `memberLocked`, clears `removed_at`, writes a `restored` event; a repeat on an active statement returns it unchanged (200, one event), like D-044. Removal writes a `removed` event. The Statements card shows "Removed by X on D" and "Restored by Y on D" rows in a history list, an Undo button on the removal sentence (focus on it) and on the removed row; Undo ends with a sentence and focus on the restored row. `requireLinkable`'s "later release" sentence is reworded.
- **Carried in**: Q-080 keep two dates (default; owner may change); Q-081 keep (default); Opening total row is the optional typed total (shown only when typed): not a fault, logged with that reason; Wealth on a date gets a "Debts" line (it already returns `debts`) and a sentence on how Household wealth differs from Financial assets.

### 19c inventory (grep, to be finished at the build)

Shared rows read by the new screens: effective prices (`HoldingDeltaSql`), account Balances (`ActivityStore.deltasByAccount` via `AccountService`), wealth groups (`WealthService`). New readers: the group read, the difference read, the share of Balance. Each gets a test that fails when the price term is dropped (the group read is planted: value at the opening price instead of the effective price) and a counted-once test (group total = `wealth.investments.total`; HSA and 401(k) once; an account in two groups once; net worth, financial assets, each person's view, the Household total and the change explanation unchanged by the new read). New writer: statement restore (`lockAccount`, `holdUncommitted` race test planted away, same-key is not needed because Undo is naturally repeat-safe: tested twice, raw-API refusals: draft/closed/other type/foreign statement/unknown/inactive member, refused in the removal-review sense: the restore has no review, the Undo button is offered only for a removed statement).

## 19c task list (to be approved at Checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 Open failures: the race-test key counter, Flyway and OwnerCorrection reproduction, `flake-out*/` ignored | none | API | done (see Group 0 results) |
| 1 Group read and share of Balance: `GET /investments/holdings`, `shareOfBalance`, per-reader plants, counted once | HOLDINGS_002, HOLDINGS_003 | API | todo |
| 2 Statement restore: V35, restore, events, lock and race, repeat-safe, raw-API refusals | SUPPORTING_RECORD_002 | API | todo |
| 3 Statement difference read for an investment statement | HOLDINGS_005 | API | todo |
| 4 UI: Investments page and chooser, "All investment accounts" summary on the account page, share of Balance on the Holdings card, difference review with only Record a price, Undo and history, Debts line on Wealth on a date | HOLDINGS_002, 003, 005, SUPPORTING_RECORD_002 | Vitest + e2e at 710px and 1280px | todo |

## 19c open questions

| Id | Question | Default |
| --- | --- | --- |
| Q-080 | Balance date for an account whose opening price is dated after setup (carried) | keep two dates |
| Q-081 | The different-dates note compares with the wealth date (carried) | keep |
| Q-082 | Where does the group view live: a new `/investments` page reached from the Household Investments group (proposed), or inside the Household page? | new page |
| Q-083 | Does the group view include archived and closed investment accounts? Proposed: yes, labeled, because the wealth Investments group counts them (the scenario's $131,500.00 is three active accounts) | yes, labeled |
| Q-084 | Undo on a removed statement is offered to any active member entering as themselves (the removal's own rule), not only to the one who removed it | any active member |
