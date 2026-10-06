# Slice 11: Split expenses

One file per slice, edited only by the session working it.

- Slice: 11 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/spending/categories/split-expenses.feature`
- Status: in-progress (waiting at checkpoint 1)
- Started: 2026-10-05 20:34 (session clock)  Finished:   Commit: 

## Prompts and directions

Paste, verbatim, the kickoff prompt that started this session (see `docs/process/prompts.md`, note its version), then
add each instruction or answer the product owner gave at a checkpoint, with the date. No transcripts, no secrets.

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 11 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Owner answer, 2026-10-05: Q-035 is yes. Do it as group 0 before the split groups: switch EntryService.record to the locked member read, with a holdUncommitted race test that fails when the lock is removed, and commit it on its own.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
At the checkpoint-2 pass, remember that Cowork has found 8 faults for two slices in a row. Tell me the count this time, and whether the 710px table or focus faults still appear.
```

A second paste of the prompt, without the Q-035 and Cowork paragraphs, said everything else in the owner's plan stands.
- Repository fact: Q-035 was already built and committed in `8ce398d` (end of the slice 09 and 10 session, race test `CategoryGuardsApiTests.plainSaveWaitsForMemberRow`), so there is no group 0 to build. I will check the test fails with the lock removed in Prove.
- 2026-10-05 Checkpoint 1 answer: pending
- Checkpoint 2 answer: pending

## Scope

Scenario IDs in this session (all of them, unless a split is recorded): `@V2_...`

## Decisions

Foundation rules: `docs/guides/domain-foundations.md`.

Foundations 6 and 11 (portions, corrections) apply; D-026, D-028 to D-031, D-034, D-039, D-042 are relied on.

- **Model (new decision, to promote as D-043 after approval):** a split is one `activity` expense row (the payment, its full amount, no category of its own) plus 2 to 20 rows in `activity_portion (activity_id, seq, category_id, classification, amount)`. Balance, removal, Undo, history and the date all stay on the one payment row. Portions never change in place: a correction is a replacement of the payment (as for any entry, D-028) that carries the new portions, so the old split stays on the replaced row.
- **One definition of "what a category sees":** a SQL view `activity_part` (V16) gives one row per portion, or one row for a payment with no portions, with the category, class and amount to count. `ActivityStore` readers by category and class (`totalsByCategory`, `classTotals`, `monthEntries` by category, the uncategorized review) and the category usage count read it instead of `activity`. Month totals, Balance and `spendingByMonth` still read `activity`, so a split payment counts once (SPLITS_001 "from one payment"). Merge pointer resolved on the portion's category as for D-042.
- **Rules (server, raw-API tests):** the portions sum to the payment amount exactly (400 with assigned and remaining); at least 2 portions; each amount above 0; each a spending category (kind expense, active, not archived); one portion per category (a repeat is 400); the payment's own category must be omitted when portions are sent; an expense only (not income, refund, correction, transfer) and on an account that holds activity. Each portion carries its own class (default the category's default, then null).
- **Review:** computed in the browser like batch entry (no server preview): lists each portion, shows "assigned" and "still to assign", and Confirm is disabled until still to assign is $0.00 (SPLITS_003). The server re-checks.
- **Opening a portion:** a category's entry list shows the payment (full amount, account, date) with its split beneath it; the Spending page highlights the portion's amount in that category. Same payment, same full split on either category (SPLITS_001).
- **Q-036 (open, see register):** one Undo restores the payment and both portions; a second Undo is refused.
- Out of scope: splitting income, refunds or card payments; splits in batch entry or reminders (each stays one category); a split opened from a transfer.

## Task list (awaiting approval at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 | Q-035 locked member read in `EntryService.record` | none (already `8ce398d`) | done before this session; re-prove the race test fails without the lock |
| 1 | Portions in the data and the rules: V16 table and view, `portions` on the expense request, sum, count, kind and duplicate rules, Balance and totals unchanged | `V2_SPLITS_001` (save and Balance), `V2_SPLITS_003` (sum rule, raw API) | API |
| 2 | Readers: category totals, class totals, category entry list, uncategorized review, category usage and merge read portions; the entry list and history show the split | `V2_SPLITS_001` (Groceries $90, Gifts $30, September $120 from one payment, either portion opens the payment) | API + UI (MSW) |
| 3 | Entry form: "Split across categories" with portion rows, assigned and still to assign, review, confirm | `V2_SPLITS_001`, `V2_SPLITS_003` | UI (MSW) + e2e at 710px and 1280px |
| 4 | Correct a split as a replacement with reason, original split stays in history; Cancel changes nothing | `V2_SPLITS_002`, `V2_SPLITS_005` | API + UI (MSW) + e2e |
| 5 | Remove and Undo a split payment (portions follow the payment) | `V2_SPLITS_004` (one Undo, Q-036) | API + e2e |
| 6 | Races: every writer in the inventory, plus same-key concurrent save and a retry after the ledger changed | all five (rules, not scenarios) | API (`holdUncommitted`) |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

Build notes: `monthEntries` with no category and `monthTotal` keep reading `activity` (a split lists once); `activity_part` carries `removed_at` so a removed payment leaves category totals; history shows portions on the replaced row too.

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep result, not memory):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `activity_portion` rows (new) | `ActivityStore` (month entries, totals by category, class totals, `ENTRY_COLUMNS`, history), `CategoryStore` usage and merge, `SpendingService` uncategorized review | `EntryService.record`, `EntryChangeService.swapLocked` (replacement), `HistoricalEntryService` (calls `record`'s save for a pre-start entry; splits allowed there? no: plain expense only, 400 if portions) | portions saved with the payment in one transaction under the account lock; replacement swap |
| the payment row (`activity`, split expense) | everything that reads `activity` (Balance deltas, `changeUpTo`, month totals, `spendingByMonth`, `earliestOf`) which stay unchanged | `EntryService`, `EntryChangeService` (replace, remove, undo), `BatchEntryService` (no portions: 400 if sent), `MovementService` convert-from-expense (refuses a split payment: 409) | existing account-lock tests extended to a split payment |
| a category named by a portion | `CategoryService` lookups, archive and merge (`CategoryLifecycleService`), `EntryValidator.checkCategoryLocked` | portion save (each portion's category read `FOR SHARE`, every path: id and name), archive, merge | archive and merge held uncommitted vs a split save, by id and by name; merge vs the portion pointer |
| the entering member | `validator.memberLocked` | split save and replacement (already `FOR SHARE`) | split save holds only the member row (`holdUncommitted`) |
| the save key | `findByIdempotencyKeyAndCreatedAtAfter` after `lockAccount` | split save, replacement | same-key concurrent; retry after the ledger moved; same key with other portions is 409 (portions are part of `Entry.matches`) |
| the category default class | `EntryValidator` class resolution | category edit (slice 10) | no new race: a portion stores its class at save (D-042) |

## Coverage

Filled in Prove from `npm run coverage -- --slice 11`.

## Open questions

- Q-036 (open, also in `questions.md`): one Undo or two for `V2_SPLITS_004`. v1 was not running, so it was not consulted.
- The owner's "plan for slice 11, including the inventory items" is not in the repo; I used the skill's inventory. Paste the plan if it differs.

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |

## How it works

(after Land)

## Handoff

(after Land)

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session:
- What went well:
- Process change to try:
