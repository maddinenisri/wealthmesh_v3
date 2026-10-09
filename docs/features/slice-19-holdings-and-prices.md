# Slice 19: holdings and prices

- Slice: 19 in `docs/features/INDEX.md` (IDs in `slices.txt`, plus WEALTH_009 from `deferred.txt`); feature files: `investments/holdings.feature`, the five `accounts/*/setup.feature`, `household/overview/understand-wealth.feature`, `household/history/manage-supporting-records.feature`
- Status: partial (19a this session; 19b to 19d later)
- Started: 2026-10-09  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v2, owner's extended version): run the feature-session skill for slice 19 (14 IDs including WEALTH_009 deferred from 18). At Checkpoint 1 check each ID is citeable and propose a split (19a, 19b, ...) with IDs, test level and what each leaves; owner suggests prices and holdings first, then the display half and the as-of reads. Carry in: the dated-price rule of WEALTH_009; Investments, Retirement and Health savings overlap on purpose (D-065, D-067) so after prices land every reader counts an account once (counted-once test over net worth, financial assets, each person's view, Household total, change explanation; list every reader of holdings and prices). Prices are shared rows: every reader and writer by grep, a lock per writer with a race test that fails when planted away (`holdUncommitted`; restore plants from a copy), a raw-API refusal test per rule, each rule refused in the review as well as at Confirm, same-key and retry tests (D-024, D-049). Cost and gain: unknown cost shows "Not available", never zero; check labels against each type's vocabulary; every Confirm, removal, Undo and Back ends with a sentence and the right focus. Validator, then visual-reviewer, before Checkpoint 2; `scripts/flake-check.sh` and the Vitest loop before Land; advisor at Checkpoint 1 and before Land; commit in logical pieces, lint first. Do not stop between groups; stop at task-list approval and when the app is ready; or if blocked 15 minutes. Report the Cowork finding count against 8, 8, 5, 5, 5, 7, 9, 9, 8, 5, 6, 2, 5, 1, 1. Process review still open: run before or after (owner leans before).
- 2026-10-09 Checkpoint 1 answer: approved. Q-066 yes (optional cost per opening line). Q-068 yes. Q-069 replace; the earlier price stays in history with who and when, and a test shows the as-of read for an earlier date still returns it. Q-070 yes, refused in the review as well as at Confirm. Q-071 reuse the two-date read. Q-072 recommended split: build 19a only this session (`_001` x5, HOLDINGS_004), stop at app-ready, INDEX row `partial` with the IDs covered. Q-073 skipped: the owner runs the process review separately. For 19b: a price move is never income (its own line in the change explanation, which still balances), and every reader in the inventory has a test that fails when the price term is dropped from it. Do not stop between groups.
- Checkpoint 2 answer: (pending)

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
| 2 (19b) Shared price definition: V33, `HOLDING_DELTAS`, balance readers, change-identity term, counted-once test | (foundation; cited by 3 and 4) | API | todo |
| 3 (19b) Record a price: review, Confirm, zero-price highlight, same-key and retry-after-change tests, replace on a date, raw-API guards, state matrix, price history, mixed-dates sentence | HOLDINGS_008, WEALTH_004 | API + UI + e2e | todo |
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
- Proof: backend 872 x 3 (`scripts/flake-check.sh`, 0 failures), Vitest 492 x 3, e2e 350 on the final code, lint, format and typecheck clean.
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
- `HoldingsApiTests` (five types' `_001`, HOLDINGS_004 rules, preview, Finish setup, draft), `Holdings.test.tsx`, `e2e/tests/26-holdings.spec.ts` at 710px and 1280px. Final counts: backend 872 x 3, Vitest 492 x 3 (then 493 with the last test), e2e 350.
