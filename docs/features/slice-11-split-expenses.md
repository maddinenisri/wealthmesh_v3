# Slice 11: Split expenses

One file per slice, edited only by the session working it.

- Slice: 11 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/spending/categories/split-expenses.feature`
- Status: done locally (not pushed)
- Started: 2026-10-05 20:34 (session clock)  Finished: 2026-10-06  Commit: `1ac5740`

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
- 2026-10-05 Checkpoint 1 answer: approved the task list (groups 1 to 6) and the design. Q-036: a second Undo of the same removal is idempotent (the same restored result, no second restore, no 409); one Undo restores the payment and both portions; record it in `decisions.md` as cross-cutting (D-044) and keep slice 02's Undo consistent on a repeat. Add to the inventory and tests: moving a split to another account carries its portions; reminders and a card purchase with portions read correctly; keep the portions table extensible for slice 16 debt payments. One commit per group, local only, no push, no Claude trailer. Report the Cowork finding count against 8 and 8, and whether the 710px table and focus faults appear.
- 2026-10-06 Checkpoint 2 answer: owner pass (Cowork) at 710px, window went to the background partway: all eight steps pass, 5 faults (focus after Back, after Confirm, after Remove portion; history without the word Split; "Split expense (split)"), positions by eye unverified. See Cowork findings.

## Scope

Scenario IDs in this session (all of them, unless a split is recorded): `@V2_...`

## Decisions

Foundation rules: `docs/guides/domain-foundations.md`.

Foundations 6 and 11 (portions, corrections) apply; D-026, D-028 to D-031, D-034, D-039, D-042 are relied on.

- **Model (new decision, to promote as D-043 after approval):** a split is one `activity` expense row (the payment, its full amount, no category of its own) plus 2 to 20 rows in `activity_portion (activity_id, seq, category_id, classification, amount)`. Balance, removal, Undo, history and the date all stay on the one payment row. Portions never change in place: a correction is a replacement of the payment (as for any entry, D-028) that carries the new portions, so the old split stays on the replaced row.
- **One definition of "what a category sees":** a SQL view `activity_part` (V16) gives one row per portion, or one row for a payment with no portions, with the category, class and amount to count. `ActivityStore` readers by category and class (`totalsByCategory`, `classTotals`, `monthEntries` by category, the uncategorized review) and the category usage count read it instead of `activity`. Month totals, Balance and `spendingByMonth` still read `activity`, so a split payment counts once (SPLITS_001 "from one payment"). Merge pointer resolved on the portion's category as for D-042.
- **Rules (server, raw-API tests):** the portions sum to the payment amount exactly (400 with assigned and remaining); at least 2 portions; each amount above 0; each a spending category (kind expense, active, not archived); a category may repeat (V17 drops the one-per-category index: after a merge two portions can sit in one category, and the correction form sends them back); the payment's own category must be omitted when portions are sent; an expense only (not income, refund, correction, transfer) and on an account that holds activity. Each portion carries its own class (default the category's default, then null).
- **Review:** computed in the browser like batch entry (no server preview): lists each portion, shows "assigned" and "still to assign", and Confirm is disabled until still to assign is $0.00 (SPLITS_003). The server re-checks.
- **Opening a portion:** a category's entry list shows the payment (full amount, account, date) with its split beneath it; the Spending page highlights the portion's amount in that category. Same payment, same full split on either category (SPLITS_001).
- **Undo (Q-036, owner yes, D-044):** one Undo restores the payment and both portions; a second Undo of the same removal is idempotent (200, no second event), for entries and linked movements. Slice 02 and 07 tests that expected a 409 now expect 200.
- Out of scope: splitting income, refunds or card payments; splits in batch entry, reminders (400 if sent) or historical entries; a Balance correction may be replaced by a split fee (not refused, not specially tested).

## Task list (approved at checkpoint 1)

| Group | What | Scenario IDs | Test level | Status |
| --- | --- | --- | --- | --- |
| 0 | Q-035 locked member read in `EntryService.record` | none (already `8ce398d`) | done before this session; re-proved in Prove: `CategoryGuardsApiTests` fails with the lock planted out | done |
| 1 | Portions in the data and the rules: V16 table and view, `portions` on the expense request, sum, count, kind and duplicate rules, Balance and totals unchanged | `V2_SPLITS_001` (save and Balance), `V2_SPLITS_003` (sum rule, raw API) | API | done |
| 2 | Readers: category totals, class totals, category entry list, uncategorized review, category usage and merge read portions; the entry list and history show the split | `V2_SPLITS_001` (Groceries $90, Gifts $30, September $120 from one payment, either portion opens the payment) | API + UI (MSW) | done |
| 3 | Entry form: "Split across categories" with portion rows, assigned and still to assign, review, confirm | `V2_SPLITS_001`, `V2_SPLITS_003` | UI (MSW) + e2e at 710px and 1280px | done |
| 4 | Correct a split as a replacement with reason, original split stays in history; Cancel changes nothing | `V2_SPLITS_002`, `V2_SPLITS_005` | API + UI (MSW) + e2e | done |
| 5 | Remove and Undo a split payment (portions follow the payment) | `V2_SPLITS_004` (one Undo, Q-036) | API + e2e | done |
| 6 | Races: every writer in the inventory, plus same-key concurrent save and a retry after the ledger changed | all five (rules, not scenarios) | API (`holdUncommitted`) | done |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

Build notes: `monthEntries` with no category and `monthTotal` keep reading `activity` (a split lists once); `activity_part` carries `removed_at` so a removed payment leaves category totals; history shows portions on the replaced row too.

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep result, not memory):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `activity_portion` rows (new) | `ActivityStore` (month entries, totals by category, class totals, `ENTRY_COLUMNS`, history), `CategoryStore` usage and merge, `SpendingService` uncategorized review | `EntryService.record`, `EntryChangeService.swapLocked` (replacement), `HistoricalEntryService` (calls `record`'s save for a pre-start entry; splits allowed there? no: plain expense only, 400 if portions) | portions saved with the payment in one transaction under the account lock; replacement swap |
| the payment row (`activity`, split expense) | everything that reads `activity` (Balance deltas, `changeUpTo`, month totals, `spendingByMonth`, `earliestOf`) which stay unchanged | `EntryService`, `EntryChangeService` (replace, remove, undo), `BatchEntryService` (no portions: 400 if sent), `MovementService` convert-from-expense (replaces the split payment with a transfer; the split stays on the replaced row, tested) | existing account-lock tests extended to a split payment |
| a category named by a portion | `CategoryService` lookups, archive and merge (`CategoryLifecycleService`), `EntryValidator.checkCategoryLocked` | portion save (each portion's category read `FOR SHARE`, every path: id and name), archive, merge | archive and merge held uncommitted vs a split save, by id and by name; merge vs the portion pointer |
| the entering member | `validator.memberLocked` | split save and replacement (already `FOR SHARE`) | split save holds only the member row (`holdUncommitted`) |
| the save key | `findByIdempotencyKeyAndCreatedAtAfter` after `lockAccount` | split save, replacement | same-key concurrent; retry after the ledger moved; same key with other portions is 409 (portions are part of `Entry.matches`) |
| the category default class | `EntryValidator` class resolution | category edit (slice 10) | no new race: a portion stores its class at save (D-042) |

## Coverage

`npm run coverage -- --require --slice 11`: 5/5 covered; `--require spending/categories/split-expenses` 5/5, none deferred.

| ID | Tests (level) |
| --- | --- |
| `V2_SPLITS_001` | `SplitRulesApiTests`, `SplitReadersApiTests`, `SplitRaceApiTests` (API); `SplitEntry.test.tsx` (UI); `11g-splits.spec.ts` (e2e, 710px and 1280px) |
| `V2_SPLITS_002` | `SplitCorrectApiTests`, `SplitReadersApiTests.correctAfterAMerge`, `SplitRaceApiTests` (API); `SplitCorrect.test.tsx` (UI); `11g-splits.spec.ts` (e2e) |
| `V2_SPLITS_003` | `SplitRulesApiTests`, `SplitRaceApiTests` (API); `SplitEntry.test.tsx` (UI); `11g-splits.spec.ts` (e2e) |
| `V2_SPLITS_004` | `SplitRemoveApiTests`, `RepeatUndoApiTests` (API); `SplitRemove.test.tsx` (UI); `11g-splits.spec.ts` (e2e) |
| `V2_SPLITS_005` | `SplitCorrectApiTests.moveCarriesPortions` (API); `SplitCorrect.test.tsx` (UI); `11g-splits.spec.ts` (e2e) |

Planted-defect proof (lock removed, test goes red): member share lock (`SplitRaceApiTests`, `CategoryGuardsApiTests` for Q-035), category share lock by id and by name, portion recheck in the correction, account lock in `record`, account lock in Undo. Counts at the end of Prove: 355 backend tests (run in full, 0 failed), 179 UI tests, 127 e2e.

## Validator report (independent agent, after the build)

| # | Finding | Result |
| --- | --- | --- |
| 1 | High: a split whose two portion categories were merged could not be corrected (duplicate check on merged ids) | Fixed: a category may repeat in a split (V17 drops the unique index); API and form no longer refuse it; test `correctAfterAMerge` |
| 2 | Spending category list showed the full payment | Fixed: the part in the category, with "of $120.00 payment"; e2e |
| 3 | Over-assignment sentence and Confirm-disabled untested in the UI | Fixed: UI test |
| 4 | Reminders silently dropped `portions` | Fixed: 400 (owner may override, see checkpoint 2) |
| 5 | Notes contradicted the code | Fixed |
| 6 | A Balance correction may be replaced by a split fee, untested | Left: allowed, not specially tested |
| 7 | "$X still to assign" when only the amount changes and portions are carried | Left: the message describes the carried portions |
| 8 | Wording lost the split (history origin, Change to transfer, Undo label) | Fixed |
| 9 | Unused `PortionStore.isSplit`; 20 portions untested | 20 portions tested; `isSplit` left (unused) |
| - | No first-error e2e; no overdraft notice in the split form; focus lost after an edit; concurrent same-key correction | Fixed: e2e, notice, focus on the Activity heading, `sameKeyCorrection` |
| - | "Connection reset" in `StartMoveGuardApiTests` once in a full run, green alone and on rerun | Logged as a flake, not fixed |

## Dev data left (ui-checklist item 9)

The dev stack was restarted on the new build (Flyway to V17, the old backend had none of it). I added one spending category, **Gifts** (default Discretionary), through the API so the scenario's Groceries and Gifts can be used. No account, entry or split was created in the dev data. My own click-through in Chrome could not be completed: the extension tab reported `visibilityState: hidden` (smooth scroll never ran) and would not resize to 710px, so the 710px and 1280px layout rests on e2e plus the Cowork pass.

## Open questions

- Owner choices made without a question (override at checkpoint 2): (a) a reminder with portions is refused with a 400; (b) a category may repeat in a split, so a merge shows two lines under one name; (c) a split has no "Change to transfer" button in the UI (the API converts it, EXPENSE_008 does not reach splits from the form).

- Q-036 resolved (owner, 2026-10-05): D-044. v1 was not running, so it was not consulted.
- The owner's "plan for slice 11, including the inventory items" is not in the repo; I used the skill's inventory. Paste the plan if it differs.

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |
| 1 | 1 | Back from the review left focus on the page body | focus did not return to the form | `11g-splits.spec.ts` focus after Back (failed before the fix) |
| 2 | 1 | After Confirm (save, edit, removal, Undo) focus fell to the body and nothing said what changed | no message, no stated focus | Activity heading takes focus and a status line says what changed; e2e for removal and Undo (the serial run stopped at fault 1 before it, so this one was not seen red) |
| 3 | 1 | "Remove portion n" dropped focus to the body | focus lost with the button | e2e, focus moves to the portion that took its place (not seen red, same reason) |
| 4 | 7 | History showed the portions but not the word "Split" or a name for a split with no description | wording | e2e nameless split in history (not seen red, same reason) |
| 5 | wording | Removal and Undo review said "Split expense (split)" | wording | e2e, same test as 4 (not seen red) |

Count: **5 faults** after 133 e2e tests, against 8 and 8 for slices 08 and 09/10. The 710px table fault did **not** recur (no sideways page scroll, tables fit); the focus faults **did** (1 to 3). Owner could not verify positions by eye (window in the background): panel position from a scrolled page, where the page sits after Cancel or Confirm, Spending category entries under the category list at 710px (about 140px under the fold by the DOM reading) and 1280px by eye are open for a pass in the foreground. Left in the dev data: one split on Everyday Checking (2026-10-02, $120.00, Groceries $80 and Gifts $40, with its history), Balance $2,383.00.

## How it works

Written by a read-only agent over the diff and checked against the code (two points corrected: the Undo button sits in the history table; the save and its portions run in one transaction, `EntryService.record`).

**What a person can do.** On a checking or savings account, "Split an expense" (on a card, "Split a purchase") opens a form with the payment (description, amount, date) and two or more portions, each a category, a class and an amount. A line says how much is assigned and how much is still to assign. Review lists the portions; Confirm stays disabled until nothing is left to assign. "Edit" on a split row opens the same form with a reason field; saving replaces the payment and the old split stays in history. "Remove" takes the whole payment out (the review shows both portions and the Balance coming back); Undo in the history table brings it back, and a second Undo changes nothing. The Spending page shows each portion under its category, and opening a category lists the payment with the part that is in it.

**What changed underneath.** A split is one payment row plus 2 to 20 portion rows (V16 `activity_portion`). The payment keeps the amount, date, Balance, removal and history. The view `activity_part` gives one row per portion (or one for a payment with none); category totals, class totals, a category's entries, usage and merge read it, while Balance, month totals and spending by month still read `activity`, so a split counts once. V17 lets a category repeat (a merge can leave two portions in one). A second Undo of the same removal answers 200 with no second event, for entries and for transfers and card payments (D-044).

**The main path of a save.** (1) `SplitEntry.tsx` sends the payment with `portions`. (2) `EntryService.record` locks the account row and reads the account again. (3) `EntryValidator.portions` checks the sum, the count, each amount and category (share-locked lowest id first). (4) The member is read under a share lock. (5) The payment row is saved, then `PortionStore.insert` writes the portions, in the same transaction. (6) `ActivityStore` and `PortionStore.shownFor` attach the portions to lists and history. A correction is `EntryChangeService.replace`: it carries the old portions when none are sent, rechecks each portion category under the locks and writes the new portions on the replacement row.

**Decisions and open items.** D-043 (model), D-044 (Undo). Choices to override: a reminder with portions is a 400; a category may repeat; a split has no "Change to transfer" button. Open: positions by eye at 710px and 1280px; Spending entries below the category list at 710px.

**How to verify.** `npm run coverage -- --require --slice 11`; `scripts/gradle.sh test --tests '*Split*'`; `npm run e2e`.

## Handoff

- Built: split an expense (and a card purchase) across 2 to 20 spending portions that add up; correct it as a replacement (portions carried when omitted); remove and Undo it whole; the Spending page, category usage, merge and class totals follow portions; history keeps the original split. V16 (`activity_portion`, view `activity_part`) and V17 (a category may repeat). D-043 and D-044; Q-035 was already done in `8ce398d`; Q-036 resolved.
- Watch for: any new reader of category or class must read `activity_part` (not `activity`) and any Balance or month total keeps `activity`; `activity_portion.kind` is 'category' only, ready for slice 16 principal and interest portions (extend the CHECK and keep the view on `kind = 'category'`); every later Undo follows D-044; a portion category is share-locked lowest id first (`CategoryStore.lockShared`); reminders refuse portions (400); a split has no Change to transfer button (the API converts it).
- Left open: Spending category entries sit below the whole category list at 710px (about 140px under the fold by the DOM reading); panel and scroll positions after Cancel or Confirm from a scrolled page, and 1280px by eye, were not verified; a flaky "Connection reset" in `StartMoveGuardApiTests` once in a full run; the "$X still to assign" message when only the amount changes with carried portions; `PortionStore.isSplit` is unused; the Balance-correction-replaced-by-split-fee path is allowed and untested.
- v1 showed: not running, not consulted.
- Next: slice 12 (bank and debt groups, account lifecycle).

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator again found a gap after the build (a split could not be corrected after its categories were merged: my one-portion-per-category rule collided with the merge pointer); three focus faults at Cowork (Back, Remove portion, Confirm of a removal or Undo) after 127 e2e tests; my own click-through failed because the browser tab was hidden; the serial e2e run stops at the first failure so new assertions were not all seen red.
- What went well: planting each lock defect proved every race test; mutating Q-035 proved its test; the portions view kept Balance and month totals untouched; 5 Cowork faults against 8 and 8.
- Process change to try: try a stored-data restriction against merge, move and Undo; list every exit of a panel with its focus; run new e2e assertions red alone (checklist and improvements log updated).
