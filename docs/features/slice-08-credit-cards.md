# Slice 08: Credit cards

- Slice: 08 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/credit-cards/setup.feature`, `accounts/credit-cards/activity.feature`, `spending/monthly-review/review-spending.feature`, `household/history/manage-supporting-records.feature`
- Status: in-progress (checkpoint 1 approved)
- Started: 2026-10-05 13:28 (ET, session clock)  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 08 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

- Scope: CARD_001 to 014, MONTHLY_002 and SUPPORTING_RECORD_001.
- Why it is the hardest slice so far:
  - It is the largest, at 16 IDs, so lean on the checkpoint-1 inventory and keep the groups small.
  - Card payments reuse the linked-transfer mechanism from slice 07.
  - A card Balance is a debt, so check how wealth and the overdraft rules treat it.
- Strict Givens (D-021): the board says to revisit them after slice 08. That session should count how often a Given was the only blocker and report it at the retro.
- Decision for you: slice 08 is also a natural point to merge or split. At 16 IDs I'd split it if the task list has more than 5 groups. The session will raise that at checkpoint 1.
```

- 2026-10-05 Checkpoint 1 answer: approved the task list and all 11 decisions, no split (fallback after group B only on a stop rule). Q1 yes; Q2 yes, new `card_payment_in` kind with V12; Q3 yes, refuse the starting-balance correction on a card with "Use Update balance". Additions: (1) spending = expenses minus refunds lives in ONE shared query/function used by every spending reader, named in the inventory; (2) one test that Spending, the Month review, the account list and the Household card agree after a refund. Build A, B, C, D, one commit per group, local only, no push, no AI trailer.
- 2026-10-05 Checkpoint 2 answer: pending

## Scope

`@V2_CARD_001` to `@V2_CARD_014`, `@V2_MONTHLY_002`, `@V2_SUPPORTING_RECORD_001` (16). Capability T2 (credit card account), plus refunds (new kind in use), card payments (second `MovementKind`). Completes `accounts/credit-cards/setup.feature` (6) and `activity.feature` (8).

## Gap analysis (2026-10-05)

Preflight (13:28): JDK 25, Node 26, Docker up; db 5434, backend 8081 and frontend 5180 up under pm2 (`wm-backend`, `wm-frontend`, mine); git clean on `main`. Behind latest, not touched: typescript 6 to 7, msw 2 to 3, @types/node, Gradle 9.7.1 to 9.8 (Q-004 still open). Boot 4.1.1 is current.

All 16 are citeable now (no capability outside this slice is missing). Dependencies are inside the slice: CARD_010 and SUPPORTING_RECORD_001 need a card statement (group D), CARD_006 needs payments (group C).

What exists (grep, not memory):

- `AccountType` has `CHECKING`, `SAVINGS`; `holdsActivity` is the one server gate (D-035), mirrored by `ACCOUNT_TYPES` in `accountTypes.ts` (`credit_card` is `ready: false`). The `account.type` CHECK already allows `credit_card`.
- Balance is `opening_amount` + `SIGNED` activity (`ActivityStore.SIGNED`): `income, refund, transfer_in, interest, correction` add; every other kind subtracts. That is the **asset sign**, so a card stored as owed = negative works unchanged: purchase (`expense`) lowers it, `refund` raises it, a payment into the card raises it.
- Wealth (`WealthService.summary`): per account, positive Balance is an asset and negative is a debt, counted once (D-022). So a card owed is debt, a Card credit is an asset, and one card never hides another. No change needed to the sum; it needs tests (CARD_003). The overdraft label (`OverdrawnLabel`, "Overdrawn by", overdraft warning in `AddEntry` and `TransferForm`) must **not** fire for a card: a negative card Balance is its normal state.
- `refund` is allowed by the `activity.kind` CHECK and signed in `SIGNED`, but **nothing writes or reads it**: `EntryService` takes `expense` and `income` only, and every spending query filters `kind = 'expense'` (`monthTotal`, `totalsByCategory`, `monthEntries`, spending history, `TransferPreviewService.monthSpending`, `ReplacementPreviewService`). CARD_006 (spending $80), CARD_008 (spending -$20) and MONTHLY_002 need spending = expenses minus refunds, in every one of those readers.
- `card_payment` is allowed by the CHECK but treated as money out by `SIGNED`; no card-side kind exists. V11's movement-id CHECK and one-live-row-per-side index cover only `transfer_in` / `transfer_out`. `MovementService.legs` returns 404 unless the rows are a `transfer_out`/`transfer_in` pair (slice 07 handoff).
- Seeded spending categories have `Bank fees` but not "Interest charged" or "Annual fee" (CARD_011).
- Statements: `StatementService` stores `balance` as a plain signed string with reason and revision link (slice 04); the card needs the Owed / Card credit meaning, as does Update balance (`CorrectionPreview` says an amount, not "increase in debt").
- Gates that name `holdsActivity` and so start to accept a card the moment it is enabled: `EntryService`, `HistoricalEntryService`, `BalanceCorrectionService`, `MoveTarget`, `MovementService` (both legs), `TransferPreviewService`. Each needs a per-type rule (see decision 5).

| ID | Has | Needs |
| --- | --- | --- |
| CARD_001, 003, 014 | account create, owners, amount parsing | card type enabled, Owed / Card credit chooser, signed storage, list, detail and Household card labels, wealth |
| CARD_002 | blank = 0.00 (slice 06), expense entry | purchase on a card, month Groceries figure |
| CARD_004 | edit never touches money (D-017) | edit form for a card |
| CARD_005 | validation, Cancel | same on the card form, keeps issuer, Balance, date |
| CARD_006 | expense, payment mechanism (slice 07) | refund, payment, wealth and list figures |
| CARD_007 | transfer review and Cancel | Record payment from the card detail (destination fixed) |
| CARD_008 | nothing | refund; Card credit; spending negative with explanation |
| CARD_009 | amount > 0 message | on the card form, account/date/category stay |
| CARD_010 | Update balance review (slice 03), statements (slice 04) | Owed wording, increase in debt, statement with a meaning |
| CARD_011 | expense | two seeded categories |
| CARD_012 | overdraft review | overpayment review explains Card credit |
| CARD_013 | pair edit, remove, Undo (slice 07) | same for a card payment |
| MONTHLY_002 | account filter on Spending (D-037) | card as a filter; refund inside the category; repayment and August purchase excluded |
| SUPPORTING_RECORD_001 | statement attach and revise | card, Owed meaning, version link in history |

## Decisions (approved at checkpoint 1)

1. **Card Balance is stored with the asset sign.** Owed is negative, Card credit is positive; `opening_amount` carries it. Nothing in Balance, wealth or `SIGNED` changes. The API still takes a positive amount plus `balanceSide` (`owed` or `credit`) on a card (create, Update balance, statement), never a signed amount from the user, and returns the signed string. A blank amount is `0.00` with no side. A side sent for a non-card is 400. The UI shows "$1,000.00 owed" / "$50.00 Card credit" from the sign.
2. **Per-type rules, not just `holdsActivity`.** `AccountType` gains `CREDIT_CARD` and a rule per use: which entry kinds (expense, refund, income), source or destination of a transfer (a card is neither: plain transfers to or from a card are 400 "Use Record payment"), source of a card payment (checking or savings), target of a moved entry (expense and refund only). Every gate in the gap analysis is changed together and each refusal gets a raw-API test.
3. **Refund is a real entry kind.** Same service and endpoint family as expense (`POST /accounts/{id}/refunds`), spending category, positive amount, any activity-holding account. Spending = expense minus refund in every reader; a category or month may be negative (CARD_008), with the explanation "refunds exceed purchases" in the API and UI. Edit, remove and Undo of a refund follow the entry rules.
4. **Card payment is the second `MovementKind`.** Bank leg `card_payment` (money out, as foundations 7 says); card leg is a **new kind `card_payment_in`** (V12 widens the kind CHECK, extends the movement-id CHECK and the one-live-row-per-side index to both new kinds, adds both to `SIGNED` and to the history filter). Card side distinct from `transfer_in` so the exclusion from income and spending, labels and the transfer-only guards stay structural. Endpoint family under `/api/v1/card-payments` (create, preview, replacement, removal, undo) reusing `MovementService` with the kind; the pair is never half changed; lock order, key replay and member checks are slice 07's.
5. **Overpayment and overdraft.** An overpayment is allowed: the review states the resulting Card credit; Income and spending stay 0.00 (kinds). The overdraft label and warning apply to bank accounts only. A card payment may overdraw its checking Balance and shows the existing warning.
6. **Seed two spending categories** (V12, as V10 did): "Interest charged" and "Annual fee" (CARD_011). Read-only until slice 10.
7. **Update balance and statements on a card** use the Owed / Card credit chooser; the review says "increase in debt $20.00" or "decrease in debt"; the correction row is unchanged (`correction`, signed, never spending). A statement keeps its meaning (`balanceSide`) and never feeds Balance.
8. **Given tally for D-021** (owner asked for evidence): this session keeps a table below of every scenario whose Given could not be met without a later or missing capability, and whether it was the only blocker. Filled at Prove, reported at the retro.
9. **Readings settled now.** (a) CARD_010 "history keeps the statement reference and correction": both records exist and show (statement in the Statements card, correction in history, each with who, time and reason); no foreign key joins them (D-032). (b) Zero shows as "$0.00 owed" (Balance at or below zero is Owed, above zero is Card credit). (c) Slice 04's starting-balance correction on a card: refused on a card with a message ("Use Update balance"), not given a chooser (no scenario needs it); raw-API test. (d) Change an expense to a transfer is hidden on a card expense and refused by the API (a card is not a transfer source). (e) `HistoricalEntryService` keeps expense and income only; a refund before the tracking start is refused with the existing message (no scenario needs it).
10. **Code structure (checked in the code).** `MovementService` is hard-wired to `KIND = TRANSFER` (`legs`, `actor`, `toTransfer`, the pair check at line 355), so group C turns that constant into a per-call `MovementKind`. Legs are already picked by kind, not position, but `MovementStore.legs` orders by kind: with `card_payment` before `card_payment_in` the order is reversed from transfers, so nothing may use position (grep and a test). On the UI, `signedAmount.ts` and `transferRows.ts` (`isTransfer`, `rowName`) name only `transfer_*`: payment legs join both and the list label says "payment to / from".
11. **Split.** Four groups (A to D) is under the owner's threshold of more than 5, so **no split**. Rough size in the slice 07 unit (a group of 20 to 30 minutes): A about 1, B about 1.5 (refund in every spending reader), C about 2 (second `MovementKind`, V12, race suite), D about 0.7; so roughly 5 units, the largest slice so far. Fallback split point if it runs long: after B (08a = A and B, 10 IDs; 08b = C and D, 6 IDs); the owner may choose it now.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A. Card setup: enable `credit_card` (server and `accountTypes.ts` together), Owed / Card credit chooser, signed opening, list, detail and Household labels, edit separately from Balance, name and amount errors keep entries, Cancel adds nothing, wealth shows debt and Card credit separately, no Overdrawn label on a card, per-type kind rules (decision 2) | `V2_CARD_001`, `003`, `004`, `005`, `014` | API + UI (MSW) + e2e at 710px and 1280px | done 2026-10-05 |
| B. Card spending: purchase, refund, interest and fee entries, refund kind in every spending reader, two seeded categories, negative category with explanation, card in the Spending account filter, repayment and an earlier month excluded | `V2_CARD_002`, `008`, `009`, `011`, `V2_MONTHLY_002` | API + UI + e2e at 710px and 1280px (refund form) | todo |
| C. Card payment: `MovementKind.CARD_PAYMENT`, V12, Record payment from the card detail (bank chosen, destination fixed), review and Cancel, overpayment explained, edit, remove and Undo as a pair, plain transfers to a card refused | `V2_CARD_006`, `007`, `012`, `013` | API (race tests) + UI + e2e at 710px and 1280px | todo |
| D. Card Balance correction and statements: Update balance with Owed / Card credit, increase in debt wording, statement with a meaning, corrected copy keeps the original | `V2_CARD_010`, `V2_SUPPORTING_RECORD_001` | API + UI + e2e at 710px and 1280px (Update balance on a card) | todo |

16 of 16 IDs, 4 groups. The e2e spec is `11c-cards.spec.ts` (sorts before `12-members.spec.ts`, which renames Alex Doe). Order A, B, C, D (C needs A and B; D needs A).

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep of `backend/src/main` and `frontend/src`, 2026-10-05):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account` row lock (card and its paying bank account) | all writers below | `ActivityStore.lockAccount` callers: `EntryService.record`, `EntryChangeService` (undo, swap), `HistoricalEntryService`, `BalanceCorrectionService`, `OpeningRevisionService`, `StatementService`, `AccountService` (edit), `MovementService` | card payment waits behind each writer on the card and on the bank account and each waits behind it, both directions, holding one row only (`holdUncommitted`); fails when the lock is removed |
| `account.opening_amount` sign for a card (new meaning of an existing column) | `AccountMapper.balance`, `WealthService.summary`, `OpeningRevisionService` (starting-balance correction, tracking start), `BalanceCorrectionService.balanceAsOf`, account list and detail, Household card | `AccountService.create` only (edit never touches it, D-017) | `OpeningRevisionService` on a card: correction keeps the sign and side (raw API); concurrent card edit vs opening revision |
| `activity.kind` values `refund`, `card_payment`, `card_payment_in` (new use) | `SIGNED` (`deltasByAccount`, `deltaOf`, `changeUpTo`), `earliestOf`, `forAccount`, `history`, `monthTotal`, `totalsByCategory`, `monthEntries`, `spendingByMonth`, `TransferPreviewService.monthSpending`, `ReplacementPreviewService` (month figure, `signed`), `OpeningRevisionService` (counted entries), `EntryChangeService.original` (kind filter), `MovementService.legs`/`actor`/`toTransfer` and `MovementStore.legs` (order by kind: no positional reads), `signedAmount.ts`, `transferRows.ts`, `ActivityList`, `EntryHistory`, `transferRows.ts` | `EntryService` (refund), `MovementService` (card payment) | income and spending asserted for create, edit, remove, Undo; with and without an account filter; a start move against a card payment (refused after) |
| Spending and month figures (spending = expense minus refund) | `SpendingService` (`summary`, `entries`, `review`, `history`), `SpendingController`, `IncomeController`, month review, `SpendingPage`, `TransferPreviewService`, `ReplacementPreviewService`, annual estimate | none (read by kind) | negative category total; refund in an earlier month; account filter with refund |
| Replace, remove and Undo state of a row (`removed_at`, `replaces_id`) | `history`, `clearRemoved`, previews | `markRemoved`, `clearRemoved` via `EntryChangeService` and `MovementService` | card payment remove vs edit: one wins; two Undo at once; Undo of a replaced pair refused; refund edit vs remove |
| Per-row entry endpoints | `EntryChangeService.original` | n/a | raw API: payment legs 404 on the per-row endpoints; a refund row is accepted there |
| Per-type rules (income, transfer, move target on a card) | `EntryService`, `HistoricalEntryService`, `BalanceCorrectionService`, `MoveTarget`, `MovementService`, `TransferPreviewService`, `AccountService.parse` | `AccountType` (one place) | raw API: income into a card, plain transfer to or from a card, move of income to a card, card payment between two banks or from a card: each refused |
| Save key (`idempotency_key`) | each save path | create, replace, card payment, refund | same key twice at once: one pair; same key different body: 409; retry after the ledger changed replays |
| Household member state (entered-by) | `EntryValidator.member`, `memberLocked` | member writes | deactivate during a card payment save: refused under the lock, holding only the member row |
| `statement` rows (balance and meaning) | `StatementService.ofAccount`, `StatementsCard`, history | `StatementService.attach`, `revise` | concurrent revisions of one card statement: one wins (`UNIQUE (replaces_id)`) |
| Seeded `category` rows | `CategoryService`, `EntryValidator` | V12 migration | none (read-only) |

### Given tally (D-021 evidence, filled at Prove)

Covers slices 00b to 08 (the owner asked for how often a Given was the only blocker, not only this slice). Known so far, from `deferred.txt` and `questions.md`:

| Scenario | Given that needed a capability | Was it the only blocker? | How met |
| --- | --- | --- | --- |
| `V2_CHECKING_006` | file saved by an older version, no opening amount | yes | deferred whole (Q-027, Q-030) |
| `V2_WEALTH_005` | same | yes | deferred whole (Q-027, Q-030) |
| `V2_SAVINGS_005` | same | yes | deferred whole (Q-030) |
| `V2_MEMBERS_001` | "who entered a record" chooser (a UI element) | yes | deferred in slice 00b (Q-012), built in 01a |
| slice 08 | filled at Prove | | |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Every test cites its scenario ID.

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
