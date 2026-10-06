# Slices 09 and 10: Batch entry, category management and classes

- Slice: 09 and 10 in `docs/features/INDEX.md`, merged by the merge rule (12 IDs, 3 capabilities: L7, S2, S3; IDs in `slices.txt`); feature files touched: `docs/requirements/v2/spending/expenses/record-expenses.feature`, `spending/categories/manage-categories.feature`
- Status: done and pushed (2026-10-05, on the owner's word, D-002)
- Started: 2026-10-05 16:03 (ET, session clock)  Finished: 2026-10-05  Commit: `48b87bc` (commits from `cdc3485`)

## Prompts and directions

- Kickoff prompt (v2, merged slices):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slices 09 and 10 together (merge rule: Batch entry, 4 IDs, plus Category management and classes, 8 IDs) in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Record the merge in the INDEX.md rows and in slices.txt.
Owner answer, 2026-10-05: Q-034 is yes. Add a small "Pay a card" button on checking and savings account pages as an extra task group, reusing the existing card-payment path. Record the answer in questions.md and the notes.
Stop at the task-list approval and again when the app is ready to look at.
(Expectations: groups for batch entry, category management and classes, and Pay a card; the inventory names the category rows other features read; Cowork pass as for slice 08, with the finding count reported.)
```

- 2026-10-05 Owner answer: Q-034 yes (a "Pay a card" button on checking and savings, reusing the card-payment path). Recorded in `questions.md`.
- 2026-10-05 Checkpoint 1 answer: approved the task list, decisions 1 to 4 (seeded-name reading, default classes as proposed, refunds carry a class, batch cap 20) and all design choices. Conditions: record the seeded-name deviation as a decision with the exact test mapping (recorded as **D-041**; the owner wrote D-010, which already exists as the Requirements rule) and cite the scenario IDs on the adapted tests; build in the order given, one commit per group, local only, no push, no AI trailer; report the Cowork finding count at checkpoint 2; run the walkthrough at Land.
- 2026-10-05 Checkpoint 2 answer: Cowork pass at 710px with Maya: all nine steps passed, 8 findings, none a wrong figure (table below). 1280px: the Categories page passed; panel position on account pages could not be verified by clicking (rests on e2e). Dev data left: categories Pet care, Restaurants, Eating out, Freelance; Everyday Checking and Summit Rewards Card with the entries listed in the pass.

## Scope

`@V2_EXPENSE_002` to `005`, `@V2_CATEGORIES_001` to `008` (12), plus the Q-034 extra (no scenario ID). Completes `spending/categories/manage-categories.feature` (8) and `spending/expenses/record-expenses.feature` (11, after 09). Capabilities: L7 batch entry, S2 category management, S3 Essential/Discretionary classes and the review flag.

## Gap analysis (2026-10-05)

Preflight (16:03): JDK 25 default (`java_home` lists 21 and 17 only; `scripts/gradle.sh` finds 25), Node 26, Docker up; db 5434, backend 8081 and frontend 5180 up under pm2 (`wm-backend`, `wm-frontend`); git clean on `main`. Q-004 tool upgrades still open, not touched.

All 12 IDs are citeable now (Givens need only checking, a card, expenses, categories, all built). Nothing blocked, none deferred.

What exists (grep, not memory):

- `category` table (V3): `id, name UNIQUE, kind (spending|income), sort_order`; seeded read-only (D-020; V10 Bonus, V12 Interest charged and Annual fee). `CategoryService` lists only; `CategoryController` has `GET /api/v1/categories?kind=`. No create, edit, archive, merge, history.
- **No Essential/Discretionary class exists anywhere** (grep of `backend/src`, `frontend/src`: only a test name). CATEGORIES_001, 002, 006 need: a default class on a spending category, a class stored on each expense, totals by class, and "unclassified".
- `EntryValidator.category` refuses an expense with no category ("Choose a spending category"), but `activity.category_id` is nullable and `ActivityStore` already LEFT JOINs `category`. CATEGORIES_006 (uncategorized expense with a review flag) needs the validator relaxed for expenses (not for income or refund) and the flag derived (`category_id IS NULL`).
- `ReminderStore` INNER JOINs `category` (reminders always have one) and `ReminderService` stores `categoryId`; an archived or merged category must still resolve there.
- Spending totals (`ActivityStore.totalsByCategory`, `Counted`) group by `category_id` with a LEFT JOIN, so a null category groups as an unnamed row today; the UI needs "Uncategorized".
- Batch entry: no batch endpoint. `AddEntry` has a single form with a per-form idempotency key (`newKey`, D-024). Card purchases already work (slice 08), so EXPENSE_002 to 005 on a card need no new account rule.
- Pay a card: `TransferForm` already has payment mode (`payment` prop; card fixed as destination, bank chosen) and `/api/v1/card-payments`. From a bank page the form needs the card chosen and the bank fixed; server unchanged unless the form's source/target wiring says otherwise.

| ID | Has | Needs |
| --- | --- | --- |
| EXPENSE_002 | card purchase, month Groceries figure | Save and add another: retained account and category, blank date and amount |
| EXPENSE_003 | single entry, key replay (D-024) | prepare several rows, review (dates, card, amounts, total), nothing saved yet, one keyed all-or-none save, repeat = no duplicates |
| EXPENSE_004 | Cancel pattern (P1) | batch review with Cancel, nothing saved |
| EXPENSE_005 | amount validation | row error "Enter an amount greater than zero", none saved, entered rows kept |
| CATEGORIES_001 | seeded list | create a category with a default class, class per expense (default or override), totals by category and class, class shown on each expense |
| CATEGORIES_002 | n/a | change default (review, Cancel), past expenses keep their class |
| CATEGORIES_003 | n/a | rename with review, history of earlier names, same expenses |
| CATEGORIES_004 | n/a | merge review (two expenses, total), confirm, Undo restores both categories and their expenses |
| CATEGORIES_005 | n/a | archive and restore: hidden from new choices, kept on old entries with an archived label |
| CATEGORIES_006 | nullable `category_id` | expense with no category, "Uncategorized" total and flag, unclassified shown apart, assign category and class clears the flag |
| CATEGORIES_007 | income kind exists | create income category (no class), income by category, rename never turns it into spending |
| CATEGORIES_008 | `name UNIQUE` | "Enter a category name" on blank, guide to the existing category on a duplicate (case and space insensitive) |
| Q-034 extra | payment mode in `TransferForm` | "Pay a card" on checking and savings, card chosen, bank fixed |

## Decisions (proposed, for checkpoint 1)

1. **Seeded-name collision (needs the owner).** `Groceries` and `Dining` are seeded (V3), and CATEGORIES_008 forbids a duplicate, yet CATEGORIES_001 says Maya *creates* "Groceries" and CATEGORIES_003 renames "Food shopping" to "Groceries"; neither can pass as written against a seeded database, and a `.feature` file is never edited. Proposed reading (deviation recorded here): the seeded list stays and seeded categories are ordinary, editable categories. 001 is met by setting Groceries' default to Essential on the seeded row (an edit, reviewed), plus a test that creates a brand-new category with a default (`Pets`); 003 by first renaming seeded Groceries to "Food shopping" through the app (a Given met through the app, D-021) and then renaming it to Groceries; 004 and 005 use seeded Dining, a created Restaurants and seeded Travel. 008 collides with seeded Groceries by design.
2. **Class lives on the entry, stored at save.** New `activity.classification` (`essential` | `discretionary`, NULL when unclassified) and `category.default_class` (NULL on income categories). An expense or refund saved with a category and no explicit class takes the category's default at that moment, so changing a default never rewrites past entries (CATEGORIES_002). Edit-as-replacement copies the class unless the person changes it. A refund carries a class too, so class totals = expenses minus refunds and add up to total spending (extends the D-039 definition in `ActivityStore.Counted`). V14 backfills existing expenses and refunds from their category's default so dev data is not all "unclassified".
3. **Uncategorized is allowed for expenses only.** `category_id` NULL; the "category review flag" is derived (`kind = 'expense' AND category_id IS NULL`), not stored. Spending lists show "Uncategorized" with the unclassified figure apart from Essential and Discretionary. Assigning a category and class is an ordinary edit (replacement, slice 02), so history keeps the old row. Income, refund and reminders still require a category.
4. **One `category_event` table, like `activity_event` (V5)**: `(seq, category_id, action created|renamed|default_changed|archived|restored|merged|merge_undone, old_name, new_name, detail, member_id, occurred_at)`. It gives 003's "category history records the earlier name" and who/when for every change. Each category write takes an entered-by member, validated active under the member lock like entries (D-034).
5. **Merge is a pointer, not a rewrite.** `category.merged_into_id` and `category.merge_id` (V14). A merged source is also archived. Ledger rows are never touched (consistent with edit-as-replacement). One shared SQL expression `effective category = COALESCE(c.merged_into_id, c.id)` in `ActivityStore` (next to `Counted`) is used by totals, entries-by-category, history and the Spending filter, so the target shows $125.00 and opens the same two expenses. Undo clears the pointer and the archive on every source of that `merge_id`; entries saved into the target after the merge stay in the target (no guard needed). The merge target may be an existing category or a new name created in the same save. Rule: a category that is the target of a live merge cannot itself be merged away ("Undo that merge first"), so pointers never chain. Merge, archive and restore are state-setting: the same request twice gives the same state, a conflicting one 409, so they take no idempotency key (create is guarded by the unique name: a double click answers "already exists" and guides to it). Each takes the category rows `FOR UPDATE`, lowest id first.
6. **Names are unique per kind, case-insensitive and trimmed, archived and merged included.** Duplicate: 409 with the existing category's id; the UI links to it. Blank: 400 "Enter a category name". `findByName` (used when an entry names a category) ignores archived and merged categories.
7. **An archived or merged category cannot be chosen for a new entry**, enforced where the server writes (`EntryValidator`, replacement, reminder save and post, historical entry, batch) under a category row `FOR SHARE`. On an edit the unchanged category is allowed (the old entry keeps its archived label); a changed one must be active. Old entries show the label "(archived)" or the merge target.
8. **Seeded default classes** (owner may correct): Rent, Utilities, Insurance, Groceries, Health, Transportation, Bank fees, Interest charged, Annual fee = Essential; Dining, Travel, Entertainment = Discretionary. (CATEGORIES_001 fixes Groceries = Essential, 002 fixes Dining = Discretionary.)
9. **Batch entry is one keyed, all-or-none save.** `POST /accounts/{id}/expense-batches` with a batch key (a new key per form; the single-entry key rules, D-024): one account per batch, 1 to 20 rows (proposed cap), each row date, amount, category, class, description. A preview gives each row, the total and the resulting Balance ("owed" on a card). An invalid row refuses the batch with row-indexed errors and saves nothing. It takes the account lock once and reads the key under it, checks the tracking start and member per row, and a replay returns the first result. "Save and add another" is the same call with one row: the UI retains account and category and asks for date and amount again.
10. **Pay a card extra (Q-034 yes).** A "Pay a card" button on checking and savings pages opens the existing payment form, bank fixed, a chooser of active cards; same `/api/v1/card-payments` endpoints, no new server rule. No card: the button is disabled with the reason.

## Task list (for approval at checkpoint 1, in execution order)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 1. Category core and classes: V14, create spending and income categories, default class, class on each expense (default or override), uncategorized expense with flag and its own unclassified total, class totals on Spending, blank and duplicate names | `V2_CATEGORIES_001`, `006`, `007`, `008` | API (Testcontainers, race) + UI (MSW) + e2e `11d-categories.spec.ts` at 710px and 1280px | done 2026-10-05 (001 default and override, 006, 007, 008) |
| 2. Category lifecycle: change default, rename with history, merge and Undo, archive and restore, each reviewed with Cancel | `V2_CATEGORIES_002`, `003`, `004`, `005` | API (race: category row locks) + UI + e2e `11d-categories.spec.ts` (same file, restore steps below) | done 2026-10-05 |
| 3. Batch entry: Save and add another, prepare several, review with total, Cancel, all-or-none, replay-safe, on a card and on checking | `V2_EXPENSE_002`, `003`, `004`, `005` | API (race, same key at once, retry) + UI + e2e `11e-batch.spec.ts` at 710px and 1280px | done 2026-10-05 |
| 4. Pay a card button on checking and savings (Q-034) | none (extra, cites Q-034) | UI (MSW) + e2e `11f-pay-card.spec.ts` at 710px and 1280px | done 2026-10-05 |

12 of 12 IDs; four groups, no split. Fallback split point on a stop rule: after group 2 (batch entry and Pay a card move to a later session, slices 09 partial).

E2E shares one database in file order (`11c` before `12-members`, which renames a member). The specs above sort after `11c-cards` and before `12-members`. Every e2e mutation of a seeded category is undone in a `finally` at the end of its test: rename Groceries back from Food shopping, Undo the Dining merge, restore Travel, and the default class of Groceries and Dining back to its seeded value. Created categories (Pets, Restaurants, Side work, Eating out) are archived afterwards. The Cowork dev data will list whatever is left.

### Inventory

Rows other features read. Seeded category names referenced by name in `docs/requirements/v2` (grep, 2026-10-05): **Groceries** (record-expenses, budgets 13, review-spending, split-expenses 11, credit cards, checking activity and setup), **Dining** (record-expenses, manage-categories), **Utilities** (record-expenses, recurring 14), **Travel** (budgets 13), **Rent** and **Bank fees** (checking activity); Insurance, Transportation, Health, Entertainment, Salary, Interest, Bonus, Interest charged, Annual fee are used by code or tests (`EntryValidator.findByName`, V10 and V12 seeds, e2e) but no later feature file names them. Slice 13 budgets, 14 recurring and 11 splits will read these rows, so a renamed, merged or archived seeded category must not break lookup by name or the effective-category expression.

This slice mutates (tests): Groceries (rename, default class), Dining (default class, merge source), Travel (archive); the rest are only read.

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `category` row (name, kind, default class, archived, merged_into, merge_id) | `EntryValidator.category`, `CategoryService.list`, `ActivityStore` (history join line 36, `totalsByCategory` 165, replacement previews 248 to 256), `ReminderStore` (INNER JOIN, line 27), `SpendingService` (summary, filter), UI choosers (`AddEntry`, `ChangeEntry`, `HistoricalSetup`, `RemindersCard`, `ChangeToTransfer`, `SpendingPage` filter), later 11, 13, 14 | new `CategoryService`: create, default, rename, merge, undo merge, archive, restore; V14 default classes | entry save vs archive/merge of its category (`FOR SHARE` vs `FOR UPDATE`, holding only the category row); two creates of one name; two renames to one name; two merges of one source; double Undo |
| Effective category (new shared SQL expression) | every spending reader above | none (derived) | merge vs entry edit; totals, Spending list and filter agree before and after merge and Undo |
| `activity.classification` (new column) | class totals, `ActivityResponse`, history, replacement, reminder posting | `EntryService.record`, `EntryChangeService` (replacement, undo), `HistoricalEntryService`, `ReminderService` (post), `MovementService.convert` (expense becomes a transfer: class cleared), batch, V14 backfill | a test per writer that the class is kept or deliberately set, never lost or invented |
| Category review flag (derived) | Spending summary and list, month review, UI | none | assign-category edit vs remove: one wins |
| Month figures by class | `SpendingService`, `ActivityStore.Counted` (D-039), month review | none | refund and class agree on Spending, Month review and the account filter |
| Batch save key | `EntryService` family, new batch service | batch save | same key twice at once: one set of rows; same key different body 409; retry after the ledger changed replays; key read after `lockAccount` |
| Account row lock (batch target) | all entry writers | batch save | batch waits behind each entry writer and each behind it, holding only the account row |
| Member state (entered-by) | `EntryValidator.member` | member writes | deactivate during a batch or category save refused under the lock, holding only the member row |
| Account Balance (a batch lowers it; a card more owed) | `AccountMapper.balance`, wealth, list, Household card | batch save | figures agree after a batch on a card |
| Pay a card extra: card and bank rows | `MovementService` (cardPayments) | unchanged | slice 08 `CardPaymentRaceApiTests`; UI test that the form posts the chosen card |

## Progress

- Group 1 done (commit `cdc3485`). Group 2 done and committed locally (2026-10-05): V15, lifecycle API (`CategoryLifecycleService`), merge as a pointer resolved in `ActivityStore` (effective category), category rows read `FOR SHARE` by entry saves and `FOR UPDATE` by category writes, Categories page with reviewed Rename, Change default, Archive, Restore, Merge and Undo, per-category History. Backend, frontend (162), e2e (100, run twice), lint and `npm run check` green. Race tests fail when the share lock or the `FOR UPDATE` is removed (mutation runs). Fix found by the e2e: a review that replaces a form inside one panel now scrolls and focuses its heading; `useReturnFocus` no longer scrolls (a card-payment e2e that checks the new row's position flaked once rows got taller).
- Group 3 done and committed locally (2026-10-05): `POST /accounts/{id}/expense-batches` (`BatchEntryService`, one batch key stored as `<key>:i` per row, read under the account lock, member read FOR SHARE), the Add several form with review and Cancel, and Save and add another on the single form. Deviation from decision 9: no server preview endpoint; the review is computed in the browser from the entered rows and the account Balance, and the server validates every row on save (a bad row answers 400 `Row N: ...`). Race mutations (no account lock, no member share lock) fail the batch tests. Backend, frontend (166) and e2e (108, `11e-batch.spec.ts`) green.
- Group 4 done and committed locally (2026-10-05): "Pay a card" on checking and savings (`TransferForm` `fromBank`: the bank is fixed, a card is chosen; disabled with a note when no card exists), same `/api/v1/card-payments` path, no server change. UI tests (`PayCard.test.tsx`) and e2e `11f-pay-card.spec.ts` at 710px and 1280px.
- Prove, Checkpoint 2 and Land are done (see the validator report, Cowork findings and Handoff below).

### Validator report (2026-10-05, HEAD b99d3e9) and what was done

Commands all passed (coverage 4/4 and 8/8, backend 304, frontend 170, e2e 113, lint, typecheck, check). Planted defects (no `FOR SHARE` by id, no batch account lock, no batch member lock, no `FOR UPDATE` on category rows) each turned a test red. Findings and the fix:

| # | Finding | Fix |
| --- | --- | --- |
| 1 | An expense naming its category by name read it without `FOR SHARE`, so it could be saved on a category being archived | `findActiveByKindAndName` is `FOR SHARE`; `CategoryGuardsApiTests.byNameWaitsForArchive` (red without it) |
| 2 | `ReminderService.save` had no transaction and read its key with no account lock | transaction, `lockAccount`, member `FOR SHARE`, key read after the lock; same-key-at-once test (red without the lock) |
| 3 | `ReminderStore` showed the raw category, not the merge target | joins the effective category; test that a merged category's reminders show the target |
| 4 | Merge locked the target before the sources, against its own javadoc | one statement locks sources and target, lowest id first; two opposite merges at once give 201 and 409, no deadlock |
| 5 | `EntryService.record` (slice 01) uses `validator.member`, not `memberLocked` | **not changed** (older code outside this slice): recorded for the next session |
| 6 | Missing tests: replacement, batch and reminder with an archived category; rename race; a long list and a long name at 710px | added (`CategoryGuardsApiTests`, e2e long-name test); a new category is scrolled into view and focused after save |

Known untested guard: the `checkCategoryLocked` re-check inside the replacement swap (the validator's plant stayed green). The first read already waits on an uncommitted archive; the re-check covers an archive that commits between that read and the swap. Left as defence in depth; a deterministic test would need a hook between the two. A historical entry (start move) with an archived category has no test of its own (same validator path as a plain save).


### Build checklist after the fixes (builder's evidence; the validator was not re-run, the mutation runs below are the proof)

| Item | Result | Evidence |
| --- | --- | --- |
| Inventory | pass | inventory above, extended by the validator's grep (by-name read, `ReminderStore`) |
| Raw-API test for every rule | pass | `CategoryApiTests`, `CategoryLifecycleApiTests` (`mergeGuards`, `renameGuards`), `CategoryGuardsApiTests.archivedCategoryRefused` (replacement, batch, reminder, by id and by name), `BatchEntryApiTests` (size, key, invalid row) |
| State rule enforced where written, re-read under the lock | pass, one exception | by id and by name `FOR SHARE` (`byNameWaitsForArchive`); reminder save in a transaction. Exception: the `checkCategoryLocked` re-check in the replacement swap has no test of its own; a historical entry with an archived category has none either |
| Every writer locks, `holdUncommitted` race test fails without it | pass | mutation runs: no `FOR SHARE` by id or by name, no `FOR UPDATE` on category rows, no batch account lock, no batch member share lock, no reminder account lock each turned a test red; `renameWaitsForRow`, `oppositeMerges` |
| Keyed save: same-key at once and retry after the ledger changed | pass | `BatchEntryApiTests.sameKeyAtOnce`, `fourWeeklyPurchases`; reminder same-key test |
| Every keyed save reads its key under the lock | pass | `BatchEntryService`, `ReminderService.saveLocked` (slice 01 `EntryService.record`'s member read was Q-035, now locked) |
| A row-lock race test holds only that row | pass | category, member and account rows are each held alone |
| Every test cites its scenario ID | pass | grep of titles; the Cowork e2e title now carries its IDs |
| Panel, `useReturnFocus`, a swapped review scrolls and focuses | pass | `Panel` on every new panel; `useRevealReview`; e2e `confirm` helper checks focus inside the panel |
| Playwright 710px and 1280px: top in view, focus inside, no sideways scroll; new row in view on a long list | pass | `11d`, `11e`, `11f` loops over both widths; the long-name test brings a new row into view at the end of a long list |
| First error in view and focused; save finishes before leaving | pass | `11d` (blank and duplicate name), `11e` (invalid amount at its row) |
| New type changes how a Balance or amount reads | n/a | no new account type; a class is a label |
| Edit forms start from current values; long names wrap at 710px | pass | `EditCategory` starts from the current name and default; the long-name e2e |
| New distinguishers show in the lists | pass | class, Archived category, Uncategorized and "(archived)" in Spending, asserted in e2e |


## Coverage

`npm run coverage -- --require --slice 09`: 4/4. `--slice 10`: 8/8. `--require spending/categories/manage-categories.feature`: 8/8; `--require spending/expenses/record-expenses.feature`: 11/11. Deferred: none.

| ID | Tests |
| --- | --- |
| `V2_EXPENSE_002` | `BatchEntryApiTests`, `BatchEntry.test.tsx` (save and add another), `11e-batch.spec.ts` |
| `V2_EXPENSE_003` to `005` | `BatchEntryApiTests` (all or none, replay, races), `BatchEntry.test.tsx`, `11e-batch.spec.ts` |
| `V2_CATEGORIES_001`, `006`, `007`, `008` | `CategoryApiTests`, `Categories.test.tsx`, `11d-categories.spec.ts` |
| `V2_CATEGORIES_002` to `005` | `CategoryLifecycleApiTests`, `CategoryGuardsApiTests`, `CategoryLifecycle.test.tsx`, `11d-categories.spec.ts` |
| Q-034 | `PayCard.test.tsx`, `11f-pay-card.spec.ts` |

## Open questions

- Seeded-name collision (decision 1): approve the reading, or choose another.
- Default classes for the seeded categories (decision 8): confirm or correct.
- Refund carries a class and reduces class totals (decision 2): confirm.
- Batch cap of 20 rows (decision 9): confirm.

## What to click (710px and 1280px; `docs/process/ui-checklist.md` for the Cowork pass)

App: `npm run dev` is running (backend 8081, Vite http://localhost:5180). V14 and V15 are applied to the dev database. Use Entering as: Alex (or any member). Dev data is whatever earlier sessions left; note anything you add.

1. **Categories** (new nav item). Spending list shows each default class. Add category: blank name, then "groceries" (duplicate: the message and a "Go to Groceries" button), then a new spending category with a default, then an income category (no class choice). The new row is scrolled into view and focused.
2. **Class on an expense.** On a checking account: Add money out, pick a category, see "Category default (Essential)" in Class, override it to Discretionary, Review (shows Class), Confirm. The row shows the class under the category. Add money out with no category: it is saved as Uncategorized with "Needs a category". Spending: the class totals line, the Uncategorized row (open it). Edit that entry: choose Groceries and Essential, review shows "No category changed to Groceries".
3. **Change default**: Dining to Essential, Review, Cancel (nothing changes), repeat and Confirm. Old Dining expenses keep Discretionary; a new one takes Essential. Put Dining back to Discretionary afterwards.
4. **Rename**: Groceries to "Food shopping" (review says how many entries and the total), Confirm, then History shows the earlier name. Rename it back.
5. **Merge**: create "Restaurants" first. Merge categories: tick Dining and Restaurants, new name "Eating out", Review (entries and total), Confirm. Spending shows Eating out with both. "Undo merge of Dining and Restaurants" brings both back.
6. **Archive**: Archive Travel (review), Confirm: it is labelled Archived, gone from the money-out category list, old entries show "Archived category". Restore it.
7. **Batch**: on a credit card, Add several purchases: add rows (new rows copy the category), fill four weekly $150.00 Groceries, Review (dates, card, total $600.00), Cancel (nothing saved), repeat and Confirm saving all. Try -$100.00 in one row: the message is under its Amount and nothing is saved. Same on checking with Add several expenses.
8. **Save and add another**: on a card, Record purchase, Review, Save and add another: the card and category stay, date and amount are empty.
9. **Pay a card** (Q-034): on checking and on savings, Pay a card: the bank is fixed, choose the card, Review (both Balances), Cancel, then Confirm. With no credit card in the household the button is disabled with a note.

At 710px and 1280px each: the panel's top in view and focus inside; Cancel returns focus; long names wrap; nothing scrolls sideways.

## Cowork findings

**8 findings** (slice 08 had 8). None was a wrong figure. Each is covered by `Cowork findings 1 to 8` in `11d-categories.spec.ts` (710px and 1280px), which failed at the first finding before the fixes (the rest of it was written to fail until each fix landed), plus unit tests where noted.

| # | Check | Result | Fault seen | Fix and test |
| --- | --- | --- | --- | --- |
| 1 | 8 | Fixed | Category history said who but not when | History lines end "on 2026-10-05"; e2e matches the date |
| 2 | 1 | Fixed | After confirming a rename, merge or archive focus fell to the page body, and a merge did not scroll to the category | `close` focuses and scrolls to the row that changed (`useReturnFocus.cancel` stops the return to the opener); e2e `toBeFocused` and in view; `CategoryLifecycle.test.tsx` rename |
| 3 | 3 | Fixed | The duplicate-name message sat at the top of the form, not by the Name field, and focus was lost | the 409 is set as the Name field's error and focuses it; e2e checks focus and the accessible description |
| 4 | n/a | Fixed | Reviews lower-cased the category name ("rename groceries") | heading keeps the name's capitals; e2e finds the region by exact name |
| 5 | n/a | Fixed | "The 0 entries totalling $0.00 follow", "The 1 entry totalling -$30.00 stay in place... with their links", "The review shows 3 entries" | "It holds no entries yet" / "It holds N entries totalling $X"; merge says "Together they hold"; e2e |
| 6 | n/a | Fixed | Undo of a merge into a new category left it behind, empty and active | a category created by the merge is archived when Undo leaves it empty (kept if it holds entries); `CategoryGuardsApiTests.undoArchivesEmptyTarget`, e2e |
| 7 | 7 | Fixed | Spending did not mark an archived category | `categories[].archived`, shown "(archived)"; API and e2e |
| 8 | 4 | Fixed | Entries with no description showed only "by Maya" | "No description" in the Description cell; e2e |

1280px: Categories page confirmed by the owner; account-page panel positions rest on the e2e at 1280px (`11d`, `11e`, `11f`).

## How it works

Written by a read-only agent (Explore) over `ec0c99d..HEAD` from the notes, scenarios IDs and decisions; the builder checked the endpoint prefix (`/api/v1/accounts/{id}/expense-batches`), the migrations V14 and V15, the guards in `BatchEntryService` and `CategoryLifecycleService` and the final counts against the code, and corrected the agent's stale test counts.

**What the user can do now**

1. Categories (new nav item): add a category (blank name refused, a duplicate shows the message at the Name field and "Go to Groceries"); a spending category has a default class (Essential or Discretionary), an income one none.
2. Add money out: the class starts as the category default and can be overridden; no category saves as Uncategorized with "Needs a category"; Spending shows class totals and an Uncategorized row.
3. Change default, Rename (History keeps earlier names, with date and who), Merge with Undo, Archive and Restore: each shows a review with Cancel first. An archived category is hidden from new choices and kept, labelled, on old entries and in Spending.
4. Add several purchases (card) or expenses (checking): fill rows, Review (dates, account, total, Balance after), Cancel or Confirm saving all; a bad row shows its message and nothing is saved. Save and add another keeps the account and category and blanks date and amount.
5. Pay a card (Q-034) on checking and savings: the bank is fixed and a card is chosen; disabled with a note when no card exists.

**What changed:** `V14__category_classes.sql` (default class, class on each entry, unique names per kind, `category_event`), `V15__category_lifecycle.sql` (archive and merge pointer); API `/api/v1/categories` (create, `/{id}/rename`, `/default-class`, `/archive`, `/restore`, `/usage`, `/history`, `/merges`, `/merges/{id}/undo`) and `POST /api/v1/accounts/{id}/expense-batches` (`CategoryLifecycleService`, `BatchEntryService`, `EntryValidator`, `ActivityStore`); UI `features/categories/`, `BatchEntry.tsx`, `AddEntry.tsx`, `SpendingPage.tsx`, `TransferForm.tsx`; tests `CategoryApiTests`, `CategoryLifecycleApiTests`, `CategoryGuardsApiTests`, `BatchEntryApiTests`, `Categories`, `CategoryLifecycle`, `BatchEntry`, `PayCard` tests, e2e `11d`, `11e`, `11f`.

**How a batch save works:** the browser builds the review (no server preview); Confirm sends one request with one key; the server locks the account once and reads the key after the lock (a replay returns the first result), reads the member `FOR SHARE`, validates every row (categories read `FOR SHARE`, archived or merged refused) and answers `Row N: ...` for the first bad row with nothing saved; otherwise all rows save in one transaction. A merge is a pointer: ledger rows are never touched, readers resolve `COALESCE(merged_into_id, id)`, Undo clears it.

**Decisions and deferred:** D-041 (seeded names are ordinary categories, adapted tests cite their IDs), D-042; no server batch preview; Q-035 (`EntryService.record` member lock); the `checkCategoryLocked` re-check and a historical entry with an archived category have no test of their own.

**How to verify:** `npm run coverage -- --require --slice 09` and `--slice 10`, `npm test`, `npm run e2e` (117 at the last run), `npm run lint`, `npm run check`; click "What to click" at 710px and 1280px.

## Handoff

- Built: categories you can add, rename, give a default class, merge (with Undo), archive and restore, each reviewed with Cancel and logged (`category_event`); a class on every expense and refund, stored at save; uncategorized expenses with a derived review flag; class totals and an Uncategorized row on Spending; batch entry (`POST /accounts/{id}/expense-batches`, up to 20 rows, one key stored as `<key>:i`, all or none) with Add several purchases/expenses; Save and add another; Pay a card on bank accounts. V14 and V15.
- Watch for: anything that reads a category must resolve the merge pointer (`COALESCE(merged_into_id, id)`) and a new category lookup must lock like the existing ones (by id and by name, `FOR SHARE`); a batch row key is `<batch key>:i`; `useReturnFocus` no longer scrolls and has `cancel()`; there is no server preview for a batch (the review is computed in the browser); `findByName` no longer exists (kind-aware `findActiveByKindAndName`).
- Q-035 resolved (owner yes): `EntryService.record` now reads the member under a share lock, with a race test. Left open: the `checkCategoryLocked` re-check in the replacement swap and a historical entry with an archived category have no test of their own; the 1280px click-through of account-page panels rests on e2e; e2e leaves created categories (Pets, Side work, Restaurants, Eating out, Cw ...) in its own database only; slice 11 splits and 13 budgets read the category rows (renaming Groceries and archiving Travel are safe because lookups follow the active name).
- v1 showed: nothing consulted.
- Next: slice 11 (split expenses), which reads categories and the effective-category expression.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator again found gaps after the build (a by-name lookup with no lock, reminder save unlocked and unmerged, a merge lock order); the owner's Cowork pass found 8 faults after 170 UI and 117 e2e tests (focus after a change, a message away from its field, wording for 0 and 1, an empty merge target); one e2e flaked until focus return stopped scrolling.
- What went well: the pointer design made merge and Undo cheap and race tests could be written first; planting each lock defect proved every race test; the e2e caught a swap-in-place focus fault at 710px before the owner did.
- Process change to try: list every way a row is read before locking it and race-test each; say where focus goes after Confirm; write review sentences for 0 and 1 (checklist and improvements log updated).
