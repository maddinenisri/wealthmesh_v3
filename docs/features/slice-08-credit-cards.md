# Slice 08: Credit cards

- Slice: 08 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/credit-cards/setup.feature`, `accounts/credit-cards/activity.feature`, `spending/monthly-review/review-spending.feature`, `household/history/manage-supporting-records.feature`
- Status: done and pushed (2026-10-05, on the owner's word, D-002)
- Started: 2026-10-05 13:28 (ET, session clock)  Finished: 2026-10-05  Commit: `5caca17` (commits from `b5d8aab`)

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
- 2026-10-05 Checkpoint 2 answer: Cowork pass at 710px: all seven steps passed; 10 findings (table below). Findings 9 and 10 left to the owner; 10 is the checkpoint-1 answer, 9 is Q-034. 1280px clicks did not land, so 1280px rests on e2e.

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
4. **Card payment is the second `MovementKind`.** Bank leg `card_payment` (money out, as foundations 7 says); card leg is a **new kind `card_payment_in`** (V13 widens the kind CHECK and the movement-id CHECK, the one-live-row-per-side index already covers any kind; both kinds are in `SIGNED` and the history filter). Card side distinct from `transfer_in` so the exclusion from income and spending, labels and the transfer-only guards stay structural. Endpoint family under `/api/v1/card-payments` (create, preview, replacement, removal, undo) reusing `MovementService` with the kind; the pair is never half changed; lock order, key replay and member checks are slice 07's.
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
| B. Card spending: purchase, refund, interest and fee entries, refund kind in every spending reader (one shared definition, `ActivityStore.Counted`), two seeded categories (V12), negative category with explanation, card in the Spending account filter | `V2_CARD_002`, `008`, `009`, `011` (`V2_MONTHLY_002` moved to C, see deviation) | API + UI + e2e at 710px and 1280px (refund form) | done 2026-10-05 |
| C. Card payment: `MovementKind.CARD_PAYMENT`, V13, Record payment from the card detail (bank chosen, destination fixed), review and Cancel, overpayment explained, edit, remove and Undo as a pair, plain transfers to a card refused, a card in Spending leaves out the repayment | `V2_CARD_006`, `007`, `012`, `013`, `V2_MONTHLY_002` | API (race tests) + UI + e2e at 710px and 1280px | done 2026-10-05 |
| D. Card Balance correction and statements: Update balance with Owed / Card credit, increase in debt wording, statement with a meaning, corrected copy keeps the original | `V2_CARD_010`, `V2_SUPPORTING_RECORD_001` | API + UI + e2e at 710px and 1280px (Update balance on a card) | done 2026-10-05 |

16 of 16 IDs, 4 groups. The e2e spec is `11c-cards.spec.ts` (sorts before `12-members.spec.ts`, which renames Alex Doe). Order A, B, C, D (C needs A and B; D needs A).

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep of `backend/src/main` and `frontend/src`, 2026-10-05):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account` row lock (card and its paying bank account) | all writers below | `ActivityStore.lockAccount` callers: `EntryService.record`, `EntryChangeService` (undo, swap), `HistoricalEntryService`, `BalanceCorrectionService`, `OpeningRevisionService`, `StatementService`, `AccountService` (edit), `MovementService` | card payment waits behind each writer on the card and on the bank account and each waits behind it, both directions, holding one row only (`holdUncommitted`); fails when the lock is removed |
| `account.opening_amount` sign for a card (new meaning of an existing column) | `AccountMapper.balance`, `WealthService.summary`, `BalanceCorrectionService.balanceAsOf`, `StatementService` (a card statement keeps the same sign), account list and detail, Household card | `AccountService.create` only (edit never touches it, D-017); `OpeningRevisionService` refuses a card (`loadEditable`), so nothing else writes a card's opening | raw API: starting-balance change and preview refused on a card, reading the list allowed (`CardSetupApiTests`); no second writer to race |
| `activity.kind` values `refund`, `card_payment`, `card_payment_in` (new use) | `SIGNED` (`deltasByAccount`, `deltaOf`, `changeUpTo`), `earliestOf`, `forAccount`, `history`, `monthTotal`, `totalsByCategory`, `monthEntries`, `spendingByMonth`, `TransferPreviewService.monthSpending`, `ReplacementPreviewService` (month figure, `signed`), `OpeningRevisionService` (counted entries), `EntryChangeService.original` (kind filter), `MovementService.legs`/`actor`/`toTransfer` and `MovementStore.legs` (order by kind: no positional reads), `signedAmount.ts`, `transferRows.ts`, `ActivityList`, `EntryHistory`, `transferRows.ts` | `EntryService` (refund), `MovementService` (card payment) | income and spending asserted for create, edit, remove, Undo; with and without an account filter; a start move against a card payment (refused after) |
| Spending and month figures (spending = expenses minus refunds; the one definition is `ActivityStore.Counted.of(kind, prefix)`) | `SpendingService` (`summary`, `entries`, `review`, `history`), `SpendingController`, `IncomeController`, month review, `SpendingPage`, `TransferPreviewService`, `ReplacementPreviewService`, annual estimate | none (read by kind) | negative category total; refund in an earlier month; account filter with refund |
| Replace, remove and Undo state of a row (`removed_at`, `replaces_id`) | `history`, `clearRemoved`, previews | `markRemoved`, `clearRemoved` via `EntryChangeService` and `MovementService` | card payment remove vs edit: one wins; two Undo at once; Undo of a replaced pair refused; refund edit vs remove |
| Per-row entry endpoints | `EntryChangeService.original` | n/a | raw API: payment legs 404 on the per-row endpoints; a refund row is accepted there |
| Other readers of the entry kinds (found by the validator's grep, all behave as decisions 9d and 9e say) | `MovementService.convert` and `TransferPreviewService.expense` (only an expense becomes a transfer), `EntryChangeService.replacementKind`, `OpeningRevisionService.withEntry` (refund refused before a start move), `EntryValidator.parseReminder` (a reminder is expense or income; a refund reminder is 400) and `.category` (a refund takes a spending category); UI: `AddEntry`, `ChangeEntry`, `AccountDetailPage`, `HistoricalSetup`, `SpendingPage` | none | covered by the refusal tests above |
| Per-type rules (income, transfer, move target on a card) | `EntryService`, `HistoricalEntryService`, `BalanceCorrectionService`, `MoveTarget`, `MovementService`, `TransferPreviewService`, `AccountService.parse` | `AccountType` (one place) | raw API: income into a card, plain transfer to or from a card, move of income to a card, card payment between two banks or from a card: each refused |
| Save key (`idempotency_key`) | each save path | create, replace, card payment, refund | same key twice at once: one pair; same key different body: 409; retry after the ledger changed replays |
| Household member state (entered-by) | `EntryValidator.member`, `memberLocked` | member writes | deactivate during a card payment save: refused under the lock, holding only the member row |
| `statement` rows (balance and meaning) | `StatementService.ofAccount`, `StatementsCard`, history | `StatementService.attach`, `revise` | concurrent revisions of one card statement: one wins (`UNIQUE (replaces_id)`) |
| Seeded `category` rows | `CategoryService`, `EntryValidator` | V12 migration | none (read-only) |

- Group C: `MovementService` is no longer a singleton `@Service`; `MovementConfiguration` builds one per `MovementKind` (`transfers`, `cardPayments`), so lock order, replay and member checks are shared. `MovementKind` carries the pair rule (`refusal`) and the noun for messages. Routes: `/api/v1/card-payments` (create, get, preview, replacement, removal, undo). The card leg is `card_payment_in`, the bank leg `card_payment` (V13 widens the kind check and the movement-id check).
- The e2e found a real fault the API and MSW tests missed: a card's history showed "Use Update balance" because listing starting-balance corrections went through the same card refusal as changing them. `OpeningRevisionService.load` is now plain and only `loadEditable` (preview, save) refuses a card; a card test reads the list.
- Race tests (`CardPaymentRaceApiTests`): with `MovementStore.lockAccounts` emptied, 3 of 9 fail (change/remove/Undo waits, same key at once, one winner); the create wait and the member-row tests still wait on the foreign-key share lock and the member lock.

- Group D: `CorrectionRequest`, `StatementRequest` and the preview take a `balanceSide`/`side` for a card and store the asset sign (`AccountService.signed`, one rule for create, Update balance and statements). The review's `overdraft` flag is false for a card. "History keeps the statement reference and correction" is read as decision 9a: both records show, no foreign key.

### Given tally (D-021 evidence, filled at Prove)

Covers slices 00b to 08 (the owner asked for how often a Given was the only blocker, not only this slice). Known so far, from `deferred.txt` and `questions.md`:

| Scenario | Given that needed a capability | Was it the only blocker? | How met |
| --- | --- | --- | --- |
| `V2_CHECKING_006` | file saved by an older version, no opening amount | yes | deferred whole (Q-027, Q-030) |
| `V2_WEALTH_005` | same | yes | deferred whole (Q-027, Q-030) |
| `V2_SAVINGS_005` | same | yes | deferred whole (Q-030) |
| `V2_MEMBERS_001` | "who entered a record" chooser (a UI element) | yes | deferred in slice 00b (Q-012), built in 01a |
| `V2_MONTHLY_002` | "checking paid that card $500.00" needs a card payment | yes, until group C | met by ordering: moved from group B to C inside the slice |
| `V2_CARD_006` | payment from checking | yes, until group C | met by ordering (group C) |
| `V2_CARD_010` | "Maya's September 30 statement shows $600.00 owed" needs a card statement and a payment | yes, until groups C and D | met by ordering (group D) |
| `V2_SUPPORTING_RECORD_001` | "her card has one Balance of $1,000.00 owed" and an attached statement | yes, until the card existed (A) and its statement (D) | met by ordering (group D) |
| `V2_CARD_002`, `003`, `008`, `011`, `012`, `013` | none beyond the card itself | no | built after group A |

**Report (D-021):** across slices 00b to 08, 4 scenarios were blocked only by a Given that no feature could create: `V2_CHECKING_006`, `V2_WEALTH_005`, `V2_SAVINGS_005` (an account with no opening amount, Q-030; still deferred) and, for one session, `V2_MEMBERS_001` (a UI element; built in 01a). In slice 08 four Givens (MONTHLY_002, CARD_006, CARD_010, SUPPORTING_RECORD_001) were the only blocker for part of the session, and ordering the groups met all of them with no deferral and no direct database seeding. Strict Givens cost 3 deferred IDs out of 262 and no extra build time in this slice; loosening them would only help the 3 legacy-file scenarios, which Q-027 already judged not worth a throwaway seed. Recommendation: keep D-021 as it is.

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Every test cites its scenario ID.

### Deviations from the approved plan

- `V2_MONTHLY_002` moved from group B to group C: its Given is "checking paid that card $500.00", which needs card payments (group C). Counted as a Given-only blocker inside the slice (see the tally).
- The card-leg migration is V13 (group C); V12 carries only the two seeded categories (group B).
- Refunds: the server accepts a refund on any account that holds activity; the UI offers "Record refund" on a card only (no scenario asks for a bank refund).
- The shared definition of spending is `ActivityStore.Counted.of(kind, prefix)` (filter and per-row value: expenses minus refunds). `monthTotal`, `totalsByCategory`, `monthEntries` and `spendingByMonth` all build their SQL from it; `TransferPreviewService` and `ReplacementPreviewService` read through `monthTotal`.
- `SpendingSummary` gained `note` (month) and `CategorySpending.note`: "Refunds exceed purchases" when a total is below zero.

## Coverage

`npm run coverage -- --require --slice 08`: 16/16 covered, 0 deferred. `--require accounts/credit-cards/setup.feature`: 6/6; `--require accounts/credit-cards/activity.feature`: 8/8.

| ID | API | UI (MSW) | e2e (`11c-cards.spec.ts`, 710px and 1280px) |
| --- | --- | --- | --- |
| `V2_CARD_001` | `CardSetupApiTests` | `CardSetup.test.tsx` | adds a card owed |
| `V2_CARD_002` | `CardActivityApiTests` | | purchases and fee on a card |
| `V2_CARD_003` | `CardSetupApiTests` (wealth) | `CardSetup.test.tsx` (list, Household card) | Card credit in list and Household card |
| `V2_CARD_004` | `CardSetupApiTests` | `CardSetup.test.tsx` | edit keeps the Balance |
| `V2_CARD_005`, `V2_CARD_014` | `CardSetupApiTests` | `CardSetup.test.tsx` | name and amount errors in view and focused |
| `V2_CARD_006` | `CardPaymentApiTests`, `CardPaymentRaceApiTests` | `CardActivity.test.tsx` (removal), `CardPayment.test.tsx` | pays a card |
| `V2_CARD_007` | `CardPaymentApiTests` | `CardPayment.test.tsx` | review and Cancel |
| `V2_CARD_008` | `CardActivityApiTests` | `CardActivity.test.tsx` | refund, every screen agrees |
| `V2_CARD_009` | `CardActivityApiTests` | `CardActivity.test.tsx` | negative purchase |
| `V2_CARD_010` | `CardCorrectionApiTests` | `CardCorrection.test.tsx` | Update balance review |
| `V2_CARD_011` | `CardActivityApiTests` | | interest and fee |
| `V2_CARD_012` | `CardPaymentApiTests` | `CardPayment.test.tsx` | overpayment as Card credit |
| `V2_CARD_013` | `CardPaymentApiTests`, `CardPaymentRaceApiTests` | `CardPayment.test.tsx` | correct, remove, restore |
| `V2_MONTHLY_002` | `CardPaymentApiTests` | `CardActivity.test.tsx` (Spending) | card in Spending |
| `V2_SUPPORTING_RECORD_001` | `CardCorrectionApiTests` | `CardCorrection.test.tsx` | corrected statement |

Validator findings fixed after the first run: Update balance looked up its save key before taking the account lock, so two identical saves at once gave 201 and 400 (slice 03 code, reached by cards; now the key is read under the lock, `CardCorrectionApiTests.correctionSameKeyAtOnce`); added tests for a payment change and a card statement sent twice with one key, a historical entry and a transfer preview on a card (each refused), and edit forms starting from saved values. `CardPaymentRaceApiTests.createWaitsForBothAccounts` still passes with the account lock removed because the insert waits on the foreign-key share lock, as in slice 07.

Race and keyed-save tests: `CardPaymentRaceApiTests` (9: lock waits on bank and card, member row, same key at once and retry, one winner, start move, no deadlock with transfers, type rule), `CardActivityApiTests.refundSameKeyAtOnce`, `CardCorrectionApiTests` (same key replay, concurrent statement revisions). Mutation runs: removing the refund sign in `ActivityStore.Counted` fails 4 refund tests; removing the card-income rule in `EntryValidator` fails 2; emptying `MovementStore.lockAccounts` fails 3 of 9 payment race tests (the rest still wait on the foreign-key share lock and the member lock, as in slice 07); reverting `ChangeEntry`'s card wording fails the removal review test.

## Open questions

Anything that needs the product owner. Add it to `docs/decisions/questions.md` as well (that is the register the
next session reads), and mark the answer and date in both places when resolved.

## What to click (710px and 1280px; `docs/process/ui-checklist.md` for the Cowork pass)

App: `npm run dev` is running (backend 8081, Vite http://localhost:5180). V12 and V13 are applied. Use Entering as: Alex.

1. Accounts > Add account > Credit card. Issuer, owner, date 2026-09-01, Balance $1,000.00, Balance means Owed. Save: list shows "$1,000.00 owed". Repeat with Card credit $50.00: "$50.00 Card credit". Try a blank name and "one thousand".
2. Open the card: Record purchase (try -$100.00, then $100.00 Groceries 2026-09-10), Record refund $20.00, purchases named Interest charged and Annual fee. Balance follows ($1,080 owed after the refund).
3. Record payment from the card detail: the card is the destination, choose checking, review shows both Balances (try an overpayment: Card credit is explained), Cancel, then confirm. Edit it, Remove it, Show history > Undo.
4. Update balance on the card to $600.00 Owed dated 2026-09-30: review says "increase in debt"; confirm needs a reason.
5. Supporting statements: attach a statement ($600.00 owed), then Replace with corrected version with a reason; both versions stay.
6. Spending: Month September, Account = the card: Groceries total, open it; a refund-only card shows a negative total with "Refunds exceed purchases". Household page and Accounts list show the same card figures.
7. Transfers: a card is not offered in Add transfer; income is not offered on a card.

## Cowork findings

Owner's Cowork pass (2026-10-05, dev data, Entering as Maya): all seven steps passed at 710px and every figure matched across the card page, Accounts list, Household card and Spending. At 1280px layout was measured (no sideways scroll, tables fit, headings at the top with focus) but clicks did not land reliably, so panel position and Cancel focus there rest on the e2e at 1280px.

| # | Finding | Result | Test added (each failed before the fix) |
| --- | --- | --- | --- |
| 1 | Activity description became a 114px column at 710px | Fixed: Entered by moves under the description below 1024px, amount does not wrap | `11c-cards.spec.ts` "Cowork 1 to 3": description cell at least 150px |
| 2 | History table scrolls inside its card at 710px (also slice 06 finding 5, slice 07 finding 3) | Fixed: Category and Reason columns appear from 1024px, below it they sit inside the Description and Saved by cells | same test: the wrapper has no inner scroll; removing the change fails it |
| 3 | Accounts list balance wrapped over three lines | Fixed: the Balance cell does not wrap | same test: "Card credit" is one line |
| 4 | "Groceries $80.00 (2 expenses)" counted a refund as an expense | Fixed: the Spending list says entries | `CardActivity.test.tsx` V2_MONTHLY_002 Cowork 4 and 7 |
| 5 | A purchase read -$100.00 beside a Balance that read owed; a refund had no label | Fixed: a card list shows debt added as positive and credits negative, a refund is labelled "Refund" | `CardActivity.test.tsx` V2_CARD_006 Cowork 5 and 8 |
| 6 | Checking offered Interest charged and Annual fee | Fixed in the UI: only a card offers them (the server keeps one list, D-020) | `CardActivity.test.tsx` V2_CARD_011 Cowork 6 |
| 7 | Spending Account chooser lacked the type | Fixed: "Everyday Credit Card (Credit card)" | same test as 4 |
| 8 | Purchase and refund reviews lacked the card Balance after | Fixed for a card | same test as 5 |
| 9 | A card payment can only be started from the card page | Open: Q-034, recommend yes (a "Pay a card" button on checking and savings) in slice 09 or with the next account work | none |
| 10 | Update balance on a card has no "Correct the starting balance" | Intended: the owner's checkpoint answer 3 (use Update balance) | none |

## How it works

Written by a read-only agent over `5eac320..HEAD` from the notes and decisions, not the diff bodies; the builder checked the V12/V13 split, the sign rule, `Counted`, the per-kind `MovementService` and the save-key fix against the code.

**What the user can do now**

1. Add account > Credit card: enter the Balance and choose Owed or Card credit; the list shows "$1,000.00 owed" or "$50.00 Card credit".
2. On the card: Record purchase, Record refund, and purchases named Interest charged or Annual fee.
3. Record payment from the card page: pick checking or savings (the card is fixed), review both Balances, Cancel or confirm; an overpayment shows as Card credit. Edit, remove, or Undo from history.
4. Update balance on the card: the review says "increase in debt" or "decrease in debt"; a reason is required.
5. Attach a statement, then replace it with a corrected version; both stay, the Balance does not move.
6. Spending filtered to the card agrees with the Household page and the Accounts list.

**What changed**

- Database: `V12__card_charge_categories.sql` (two categories), `V13__card_payments.sql` (kind `card_payment_in`, movement-id check).
- API: `AccountType` (per-type rules), `AccountService.signed`, `ActivityStore.Counted`, `MovementConfiguration`, `CardPaymentController` (`/api/v1/card-payments`), refunds at `POST /accounts/{id}/refunds`, `balanceSide` on setup, corrections and statements.
- UI: `features/accounts` (`cardBalance.ts`, `BalanceFigure.tsx`, setup, detail), `features/transfers` (`TransferForm` in payment mode), `ActivityList` and `EntryHistory` (card amounts, narrow columns).
- Tests: `CardSetup`, `CardActivity`, `CardPaymentApiTests`, `CardPaymentRaceApiTests`, `CardCorrectionApiTests`; four `.test.tsx` files; `11c-cards.spec.ts`.

**How the main path works**

1. A card amount arrives positive with a side; `AccountService.signed` stores owed as negative, so Balance sums and wealth are unchanged.
2. `AccountType` and `EntryValidator` refuse income on a card, plain transfers to or from it, starting-balance moves and pre-start entries.
3. Spending is `ActivityStore.Counted`: expenses minus refunds; a total below zero is shown with "Refunds exceed purchases".
4. A payment goes through the per-kind `MovementService`: it locks both accounts lowest id first, replays a finished key, checks the member and the dates under the locks, and writes `card_payment` and `card_payment_in` in one transaction.
5. Update balance reads its save key under the account lock.

**Decisions and open items:** D-038 to D-040; Q-034 (pay a card from checking or savings); no starting-balance correction on a card (checkpoint answer 3); the UI offers refunds on a card only; 1280px rests on e2e.

**How to verify:** `npm run coverage -- --require --slice 08`, `npm test`, `npm run e2e`, `npm run lint`, `npm run check`; click "What to click" above at 710px and 1280px.

## Handoff

- Built: a card account with one Balance stored with the asset sign (owed negative) and a `balanceSide` on setup, Update balance and statements (`AccountService.signed`); refunds with the one spending definition `ActivityStore.Counted`; card payments as a second `MovementKind` (`card_payment` / `card_payment_in`, V13) at `/api/v1/card-payments`; Update balance and statements on a card; card figures shown as owed or Card credit everywhere through `cardBalance.ts` and `BalanceFigure.tsx`; V12 seeds Interest charged and Annual fee.
- Watch for: the `SpendingSummary` JSON gained `note` fields; a refund is accepted by the server on any account that holds activity but only a card's page offers it; `MovementService` beans are per kind, so a new movement kind (loan principal, slice 16) adds a `MovementKind` and a bean in `MovementConfiguration`; the card-only categories are hidden in the UI only; `createWaitsForBothAccounts` does not fail without the account lock (foreign-key lock), same as slice 07.
- Left open: Q-034 (pay a card from checking or savings), Q-004 (tool upgrades), Q-033 answered yes in slice 07, 1280px click-through by the owner (rests on e2e), Cowork found nothing at 1280px except that clicks missed; slice 07 checks 4 to 6 are still not walked.
- Next: slice 09 (batch entry), which needs a card: its Givens are now met.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator found a keyed-save race in slice 03 code that cards reached, four rules with no refusal test and missing same-key tests; Cowork found 8 faults (long tables at 710px again, card amounts and labels, refunds counted as expenses, card-only categories on checking).
- What went well: the inventory named every writer and one shared spending definition meant a refund needed no hunt through eight readers; the transfer mechanism took a second kind with no change to its locks; the e2e at both widths found a fault the API and MSW tests missed.
- Process change to try: grep every keyed save for a key read before the lock; when a type changes how a Balance reads, grep every place it is formatted and every chooser before building; narrow-width table columns once.
