# Slice 14: Recurring bills

- Slice: 14 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/spending/recurring/manage-recurring.feature` (all 10)
- Status: done, pushed
- Started: 2026-10-06 14:08 (session clock)  Finished: 2026-10-06  Commit: 41be33d and the Land commit after it

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 14 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Owner answer, 2026-10-06: Q-044 is yes, fix it as group 0 before the recurring groups: a retry of a saved entry, batch or reminder is judged on what was saved, not on today's category and member rules, following the HistoricalEntryService pattern. Add a test per writer.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

What to watch for in slice 14
- Existing reminders: slice 02 already has reminders (ReminderService). The inventory must say how recurring bills relate to them, and whether they share a table or a path.
- Seeded names: Utilities is read by name here (see the slice 09 and 10 inventory).
- Money paths: a recurring bill generates entries, so it touches the entry writers, the shared spending function and the month review.
- Lifecycle and members: a bill on an archived account or a deactivated member (slices 05 and 12) is the likely trap.
- Size: 10 IDs and size L. Ask for a stop point at checkpoint 1.
- Cowork: report the count against 8, 8, 5, 5, 5 and 7.
```

- Preflight (2026-10-06 14:08): JDK 25 default, Node 26.4, Docker up; ports 5434, 5180, 8081 held by this project (`wm-backend`, `wm-frontend`); git clean on `main`. Registry version checks not re-run (slice 13 recorded the majors behind: Q-004, still open, not touched).
- 2026-10-06 Q-044 answer (owner): yes, group 0.
- 2026-10-06 Checkpoint 1 answer: approved groups 0 to 6 and the design. Q-045 no, Q-046 yes, Q-047 yes (soft delete, no Undo), Q-048 yes, Q-049 continue to the end (fallback stop after group 3; group 0 lands either way). Additions: (1) group 0 builds one shared replay-first mechanism used by every keyed writer (entry, batch, reminder, and the existing ones where it fits), not per-writer copies; tests per writer by id and by name, including an archived or merged category and a changed default class. (2) Extend the slice 12 deleted-account sweep test to cover schedules (a schedule on a deleted account and a soft-deleted schedule must not appear or block account deletion). One commit per group, local only, no push, no Claude trailer; run each new e2e assertion alone against the unfixed code; Cowork count against 8, 8, 5, 5, 5 and 7.
- 2026-10-06 Checkpoint 2 answer: owner pass (Cowork), 710px by real clicks, 1280px by opening and cancelling each panel on one bill (no save): all nine steps pass on behaviour; 8 faults (plus the button colour reported first = 9, against 8, 8, 5, 5, 5 and 7), table below. Not decided for later: Delete has no Undo (Q-047 stands), no cards in Paid from. Not verified by the owner: 1280px by eye and any save at 1280px, suggestion Dismiss, a confirmed Reschedule, Yearly, a Change after a recorded payment, the items left in the notes.

## Scope

`@V2_RECURRING_001` to `010`. Plus group 0 (Q-044).

## Repository facts that shape the plan

- **Reminders (V4, slice 02) are one-off plans**: `reminder` has account, kind, amount, one `due_on`, category, member and a key. No schedule, no status, no edit, no remove, no link to an entry. It is read by `ReminderStore.all`, `RemindersCard` (account page), `AccountUsageStore` (blocks delete) and written only by `ReminderService.save`. Nothing turns a reminder into an entry.
- **Recurring does not share the table or the path.** A schedule repeats and changes (pause, edit, delete, advance); a reminder is write-once. Folding one into the other would bend `reminder`'s `CHECK`s and its tests for no gain. Recurring gets its own tables and service. Scenarios 008 and 009 say "no active payment reminder" and "no future reminders are created from it": read as **a schedule never writes a `reminder` row**; its upcoming occurrences are derived, shown on the recurring list. (Q-045 offers the other reading.)
- **Seeded names.** Utilities (V3, spending) is the only seeded name the scenarios use (003 shows it as the category; 001 to 002 and 009 say Electricity). No code reads it by name today (grep). A schedule stores the category **id**; tests find Utilities by name through `GET /categories`. No scenario creates, renames or merges a seeded name, so D-041 does not apply. "Electricity" is a description, not a category.
- **Money path.** "Record actual expense" saves a real expense, so it goes through the entry rules (`EntryValidator.parse`, `EntryService` shape: account lock, key first, state gate on a new key, member under a share lock, category under a share lock). It adds the entry to `activity` only; spending and the month review read `activity` through `ActivityStore.totalsByCategory` and are unchanged (D-039, D-042). Scenarios 002, 004, 006, 007, 008, 010 assert that Balance and spending do not move, which holds because a schedule never writes `activity`.
- **Clock.** Backend tests drive today with `MutableClock` (the scenarios use 2026-09-30 and 2026-10-07). The e2e stack is fixed at today 2026-10-03: e2e specs state their dates relative to it (an overdue occurrence is one due before 2026-10-03). Adaptation recorded here, not a deviation from the behaviour.
- **Account state.** `AccountState.requireOpen` gates new money (D-045). `AccountType.holdsActivity` gates accounts that take entries (checking and savings; cards go through their own rules, D-038).
- Latest migration V21, so recurring is V22.

## Decisions (proposed, to confirm at checkpoint 1)

1. **Shape.** `recurring_schedule` (household, account, description, category, amount > 0, frequency weekly|monthly|yearly, `next_due_on`, status active|paused, `anchor_day` for month ends (31st clamps, then returns), `removed_at`, entered-by, key) and `recurring_occurrence` (schedule, `due_on`, outcome paid|dismissed, `paid_on`, `activity_id`; unique per schedule and due date). Upcoming occurrences are computed from `next_due_on`, never stored. `recurring_dismissal` holds dismissed suggestions (account, category, normalised description). `recurring_event` is the history (who, when, what changed), as budgets have.
2. **A schedule never writes `activity` and never writes `reminder`.** Only Record actual expense writes an entry, one transaction.
3. **Suggestions (001, 009).** Read-only, derived from `activity`: expenses (not removed, not replaced) of one account with the same category and the same description, at least 3, on dates a month apart (same day of month, or the last day of a short month). Expected = the latest amount (all equal in the scenarios; Q-046 for unequal), last recorded = the latest date, next expected = one month after it. Supporting bills = those entries, each linked to its history. A suggestion already confirmed as a schedule, or dismissed, is not offered. Text: "Estimate, not a recorded expense"; it does not claim every repeated purchase can be found.
4. **Confirm a suggestion (002) = create a schedule** with the reviewed amount, frequency and next due date; the supporting bills stay linked by the same match rule (shown on the list as "access to the supporting bills").
5. **Create, change, pause, resume, delete.** One keyed write per action (D-024), each takes the household row `FOR UPDATE` first (as budgets, D-047) so two writes on one schedule serialize, key read first, then the checks, then who (`enteredByMemberId` required, share lock, D-025 and D-034). Negative or zero amount: 400 "Enter an amount greater than zero" (005), checked on the server. Every change has a review with Cancel; Cancel saves nothing (004, 005). Change (007) rewrites the schedule's future only: amount, frequency, first due date; earlier entries are untouched by construction. Pause (008) keeps `next_due_on`; Resume requires an explicit reviewed next due date and records no catch-up. Delete (009) is soft (`removed_at`), never touches entries. Delete has no Undo (Q-047).
6. **Record actual expense (003, 010).** Body: occurrence `dueOn`, account, category, actual amount, paid date (may be earlier or later than due), entered-by, key. The review shows the figures and nothing changes until Confirm. One transaction under the account lock: save the entry exactly as an expense (so the date rules, category rules and class apply), write the occurrence row as paid with its `paid_on` and `activity_id`, move `next_due_on` to the occurrence **after the due date, not after the paid date** (003: 2026-11-05, not 2026-10-30). Only the current next occurrence can be recorded (a due date not equal to `next_due_on` is 409). A paused schedule cannot record. **Lock order** (written so the next writer cannot invert it): household row `FOR UPDATE`, account row `FOR UPDATE`, category `FOR SHARE` (lowest id first), member `FOR SHARE`. `lockHousehold` moves out of `BudgetStore` into the shared store (`ActivityStore` family) in group 1, so recurring does not call a budget class.
7. **Overdue (010).** Derived: active and `next_due_on` before today: "Overdue by N days" (singular "1 day"). Offers Record actual expense, Reschedule (set this occurrence's due date, no entry) and Dismiss this occurrence (occurrence row `dismissed`, `next_due_on` advances by the same rule as paid; no entry).
8. **Lifecycle and members (the trap).** (a) A schedule on an **archived or closed account**: stays visible, labelled with the account state; Record actual, Resume, Reschedule and Change of the account or amount are refused by the server (new money and changes need an open account, `requireOpen`, under the lock); Pause, Delete and Dismiss suggestion still work (they move no money). Creating a schedule on such an account is refused. A deleted account cannot hold one: `AccountUsageStore` counts schedules so Delete account is blocked 409 (like reminders). (b) A **deactivated member** who created a schedule: nothing changes (history name stays); every new write takes an active member, under a share lock. A retry of a saved create is judged on what was saved (the group 0 rule, Q-044). (c) **Category archived or merged later**: the schedule stores the id, shows the effective category through the merge pointer (D-042, as `ReminderStore`); Record actual on an archived category is refused with the entry message and the review lets the user pick another (the saved schedule is not rewritten).
9. **Group 0 (Q-044).** `EntryService.record`, `BatchEntryService.record` and `ReminderService.save` already read the key first under the lock (Q-040) but then parse the retry against today's rules. `HistoricalEntryService.replay` is not enough to copy: `withNoDateCheck` only bends the date, and it still runs the category and member rules. The fix is a **replay-mode parse** in `EntryValidator`, used only when a stored row exists for the key: (a) by id, the stored category (and each stored portion's category) is passed as `kept`, which already bypasses the archived check; (b) by name, a new lookup that includes archived and merged categories resolves the name, so the result can be compared with the stored category id (today `findActiveByKindAndName` returns nothing and the retry is 400); (c) the member is compared with the stored `entered_by_member_id` and household only, without the active rule and without a new share lock; (d) the date rule and the account-start rule are skipped; (e) when the request names no class, the stored class is accepted (today the category's current default is read, so a default changed since the save makes the replay 409). A new key still meets every rule. Tests use the wire shape the UI sends (checked in `AddEntry.tsx` at build time), by id and by name.
10. **Screens.** A **Recurring** page at `/recurring` linked from the main navigation (new route; the schedule is household-wide across accounts): Suggestions, Schedules (Active and Paused, with state labels), the overdue and early-payment actions, History per schedule; forms use `Panel` and `useReturnFocus`; status words as in the scenarios ("Paused", "Active", "Overdue by 2 days", "paid early on 2026-09-30").
11. **Month review and spending are not changed.** No Month review field; a recurring estimate is never spending (the scenarios assert $0.00 four times).

12. **Account types.** A schedule is allowed on the accounts `AccountType.holdsActivity` allows (checking and savings), the same gate as `EntryService.load`; cards are refused this slice (INDEX: recurring only needs checking and expenses).
13. **Suggestion scope.** `kind = expense`, `category_id IS NOT NULL` (a split payment has no category of its own, so it never counts), not removed, not replaced, refunds ignored.
14. **Occurrence and its entry afterwards.** The occurrence stays `paid` with its `activity_id`; the display follows the replacement chain to the current row (`replacesId`), and a removed payment shows "Payment removed" while the occurrence stays paid and `next_due_on` does not move back (no Balance or spending effect from the schedule either way).
15. **E2E isolation.** The e2e database is shared and earlier specs left repeated expenses. `15-recurring.spec.ts` makes its own accounts and descriptions, and every suggestion assertion is on its own account; today is the fixed 2026-10-03.

## Task list (for approval at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 Q-044: retry of a saved entry, batch or reminder is judged on what was saved (replay-mode parse, decision 9). One test per writer for each cause (category archived, category merged, member deactivated, default class changed; reminder also after its due date passes), by id and by name | none new; cites `V2_ACCOUNT_LIFECYCLE_001` and D-024 | API (Testcontainers, `MutableClock`) | done (see Group 0 result) |
| 1 Base: V22 tables, service shell, `lockHousehold` reuse, create a manual schedule with first due date, list with following occurrence, frequency math (weekly, monthly with month ends, yearly), negative amount | `V2_RECURRING_006` (3 examples), `V2_RECURRING_005` (negative half) | API + UI (MSW) + e2e | done |
| 2 Suggestions and supporting bills: detection, inspect, confirm, dismiss | `V2_RECURRING_001`, `V2_RECURRING_002`, `V2_RECURRING_009` (dismiss half) | API + UI + e2e | done |
| 3 Change, pause, resume, delete, cancel paths | `V2_RECURRING_005` (cancel half), `V2_RECURRING_007`, `V2_RECURRING_008`, `V2_RECURRING_009` (delete half) | API + UI + e2e | done |
| 4 Record actual expense: review, early payment, next due, cancel | `V2_RECURRING_003`, `V2_RECURRING_004` | API + UI + e2e | done |
| 5 Overdue: status, reschedule, dismiss one occurrence | `V2_RECURRING_010` | API + UI + e2e | done |
| 6 Guards, races, focus and layout at 710px and 1280px; archived account, closed account, deactivated member, archived and merged category; Cowork list | cites 001 to 010 | API + e2e | built, Cowork list below |

Order: 0, 1, 2, 3, 4, 5, 6, one commit per group, local only (D-002).

**Stop point asked (size L, 10 IDs).** Proposed split if time runs out: after group 3 (everything that moves no money: IDs 001, 002, 005, 006, 007, 008, 009 = 7 of 10), then groups 4 to 6 (003, 004, 010, the money path) in the next session. Row marked `partial` with the handoff. Group 0 is a separate commit and lands either way.

Gap analysis: all 10 IDs are citeable now (checking and expenses exist; the Given of 003, 004, 010 and 001 need only entries and a starting balance). None blocked, none deferred.

### Inventory

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `recurring_schedule`, `recurring_occurrence`, `recurring_dismissal`, `recurring_event` (new) | `RecurringService` (list, suggestions, review), `RecurringPage` (UI), `AccountUsageStore` (blocks Delete account) | `RecurringService`: create, change, pause, resume, delete, record, reschedule, dismiss occurrence, dismiss suggestion | create vs create (same key; same schedule), change vs record, record vs record (same occurrence: second is 409, not a second entry), pause vs record, delete vs record, each holding only the household row; each red when the lock is removed |
| `reminder` (existing) | `ReminderStore`, `RemindersCard`, `AccountUsageStore` | `ReminderService.save` | none new (not shared); group 0 retry tests |
| `activity` (entries) | recurring suggestion detection (read), supporting bills list, `ActivityStore.totalsByCategory` (spending, month review, budgets) | `RecurringService.record` (new writer through the entry rules); `EntryService`, `BatchEntryService`, `HistoricalEntryService`, `EntryChangeService` (an edit or removal of a supporting bill changes a suggestion; an edit of a recorded bill must not break its occurrence link) | one test: record actual vs remove of the same entry; suggestions drop when a bill is removed; spending, Spending page, month review and budget show the same figure after a record |
| `account` state (active, archived, closed, deleted) | recurring write gate (`requireOpen`), list labels | `AccountLifecycleService` | record held vs archive, and the reverse; create vs archive |
| `household_member` (active) | `RecurringService` (share lock) | `HouseholdMemberService.deactivate` | deactivate held vs record, and the reverse |
| `category` (archived, merged) | schedule reads resolve `merged_into_id`; record parses under share lock | `CategoryLifecycleService` | record held vs archive and merge of its category, holding only the category row; merge then read list |
| Keyed writers `EntryService.record`, `BatchEntryService.record`, `ReminderService.save` (group 0) | `activity` and `reminder` key columns | category and member lifecycle | retry after archive, merge, deactivate: replay 200 with the original id |

Writer by state (checklist), for the schedule row: create, change, pause, resume, delete, record, reschedule, dismiss occurrence × (account active, archived, closed) × (schedule active, paused, deleted): one raw-API test per cell.

## Built differently from the plan

- **Change** edits the amount, frequency and next due date only; the name, category and account stay (the form shows them as text). Decision 5 said so loosely.
- **Delete** also dismisses the schedule's suggestion (otherwise its three bills were offered again at once). D-048.
- **Record has a review endpoint** (`POST /recurring/{id}/record/review`, the same checks, nothing written); a review of a new schedule on an archived or closed account is refused like its save.
- **Reschedule** and **Dismiss this occurrence** are offered only while the occurrence is overdue (the scenario's wording); the server accepts them for any next occurrence of an active schedule.
- **Occurrences are not unique per due date in the database** (decision 1 said so): the household lock plus the "must be the next occurrence" check keep a date from being paid twice; Reschedule back to a paid date and then Record would pay it again (validator finding 8, left).
- **A removed payment** shows "Payment removed: the occurrence stays paid" (decision 14); the schedule does not move back.
- **E2E** runs at the stack's fixed today 2026-10-03: overdue uses an occurrence due 2026-10-01 (2 days), early payment dates 2026-09-30 and 2026-10-03.
- **Today in API tests**: the base class resets today to 2026-10-03 before every test, so each test that needs another date sets it itself.

## Coverage

`npm run coverage -- --require --slice 14`: 10/10 covered, none deferred; `--require spending/recurring/manage-recurring.feature`: 10/10.

| ID | API | UI (Vitest + MSW) | e2e (710px and 1280px) |
| --- | --- | --- | --- |
| RECURRING_001 | `RecurringSuggestionsApiTests`, `SuggestionsTest` | `Recurring.test.tsx` suggestions | `15-recurring` suggestions |
| RECURRING_002 | `RecurringSuggestionsApiTests` | `Recurring.test.tsx` | `15-recurring` confirm |
| RECURRING_003 | `RecurringRecordApiTests`, `RecurringRaceApiTests` | `Recurring.test.tsx` record | `15-recurring` actual expense |
| RECURRING_004 | `RecurringRecordApiTests` (review writes nothing) | `Recurring.test.tsx` Cancel and Back | `15-recurring` actual expense |
| RECURRING_005 | `RecurringBaseApiTests`, `RecurringChangeApiTests` | `Recurring.test.tsx` | `15-recurring` negative estimate |
| RECURRING_006 | `RecurringBaseApiTests`, `RecurrenceTest`, `RecurringGuardsApiTests`, `RecurringRaceApiTests` | `Recurring.test.tsx` | `15-recurring` create, long list |
| RECURRING_007 | `RecurringChangeApiTests` | `Recurring.test.tsx` (incl. switching rows) | `15-recurring` changes |
| RECURRING_008 | `RecurringChangeApiTests`, `RecurringGuardsApiTests` | `Recurring.test.tsx` | `15-recurring` pause and resume, archived |
| RECURRING_009 | `RecurringSuggestionsApiTests`, `RecurringChangeApiTests`, `DeletedAccountSweepApiTests` | `Recurring.test.tsx` | `15-recurring` dismiss, delete |
| RECURRING_010 | `RecurringOverdueApiTests` | `Recurring.test.tsx` overdue | `15-recurring` overdue |
| Group 0 (Q-044) | `ReplayRulesApiTests` | | |

Planted defects, each seen red and removed: the household lock in `acting`, in `create`, the account lock in `openAccount`, the member share lock in `insert`, the deleted-account filter of the schedule query (sweep test), the panel `key` (UI switching test), group 0 against the unfixed `src/main` (5 of 7). Not planted: the category share lock, the state gate of each writer, the `Payment removed` read. Each new e2e test was run on its own the first time it was written (all passed at once: the UI was built before its e2e), so none was seen red; the faults the owner finds at checkpoint 2 get a red-first assertion.

## Validator report (independent agent, commit 83bb861) and what was done

62 backend tests of the slice's classes green; coverage, lint, format, typecheck green (full suite and 189 e2e were run before).

| # | Finding | Answer |
| --- | --- | --- |
| 1 | A panel opened on another row kept the first row's form and could write it to the wrong schedule | Fixed: panels are keyed by action and row, `create.reset()` and `dismiss.reset()` on open; Vitest "switching rows" (red without the key) |
| 2 | Decision 14 (removed payment) not built | Fixed: `OccurrenceView.paymentRemoved`, "Payment removed" text, API test |
| 3 | Replay fingerprints left out the member | Fixed: create, change and record include `enteredByMemberId`; test in `RecurringBaseApiTests.retryReplays` |
| 4 | Lock order inverted in `change` and `acting` (member before account) | Fixed: household, account, then member |
| 5 | An omitted class replays the stored class; a by-name retry after a category rename is 400 | Left: the owner asked for stored-class replays; the UI sends ids. Noted in the handoff |
| 6 | A shorter retry of a batch replays (before this slice) | Left, noted |
| 7 | Stale mutation errors | Fixed with the resets in 1 |
| 8 | No unique (schedule, due date); orphan javadoc; the sweep tries only some writers on a deleted account | Javadoc fixed; unique left (see above); the sweep covers the list, create, change, pause, resume and delete |
| Checklist gaps | Inventory races not built: record vs remove of the same entry (the display is tested instead), record held vs archive, category merge race; state matrix lacks archived or closed × deleted and × paused except Resume; same-key concurrency only for Record; create by id and record by name not raced; Back in Resume and Reschedule and the opener in view on a long list not in e2e | Left and reported here; the lock tests prove the locks, the matrix covers every writer on archived and closed accounts and on paused and deleted schedules on an open one |

## Group 0 result (Q-044)

One shared mechanism: `EntryValidator.parseForReplay` (and `parseReminderForReplay`) with `EntryValidator.Stored` (the stored category, class and portions). It is used when a row exists for the key, under the account lock, by `EntryService.record`, `BatchEntryService.record`, `ReminderService.save` and `HistoricalEntryService.replay` (its `withNoDateCheck` is gone). It checks only what a request must be anyway (amount, date, member given, split shape) and resolves the category (by id as given; by name through `CategoryRepository.findAnyByKindAndName`, archived and merged included, the stored one preferred when a name was reused) and the member (as given, no active rule) without today's rules; an omitted class is the stored class. A new key still goes through `parse`. Transfers, payments, edits, corrections, starting balance and statements already look the key up first and compare on stored figures, so they were left (nothing to move). `ReplayRulesApiTests` (7 tests): entry, batch, split, reminder and historical entry × by name and by id × (category archived, category merged, member deactivated, default class changed, reminder past its due date); a different body is still 409. Red against the unfixed code (5 of 7), green with it; the full backend suite and `npm run lint` pass.

## Open questions

All resolved by the owner at checkpoint 1 (see `docs/decisions/questions.md`; D-048, D-049).

| # | Question | Recommended |
| --- | --- | --- |
| Q-045 | Does a schedule ever create reminder rows? 008 and 009 say "no payment reminder" and "no future reminders created from it". | No: occurrences are derived and shown on the recurring list; `reminder` stays one-off |
| Q-046 | Suggestion with unequal amounts (180, 180, 195): expected amount? | The latest amount; the review lets the user change it |
| Q-047 | Delete a schedule: soft delete with no Undo (the scenario has none), or with Undo as budgets have (D-044)? | Soft delete, no Undo in this slice |
| Q-048 | Schedule on an archived or closed account: stays visible, Pause and Delete work, money and changes refused (decision 8a)? | Yes |
| Q-049 | The stop point: continue to the end, or stop after group 3 (7 of 10 IDs) and finish 003, 004, 010 next session? | Continue unless the budget runs out; split at group 3 if so |

## Cowork findings

Owner pass (Cowork): 710px by real clicks, 1280px by opening and cancelling each panel on one bill (no save at 1280px). All nine steps pass on behaviour; no focus or position fault recurred. Count against 8, 8, 5, 5, 5 and 7: **9** (8 in the second pass plus the button colour).

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |
| 1 | colour (710px) | fixed | The label of "Record actual expense" (a small primary button) was dark on dark green | Cause: `cn` (tailwind-merge) read `text-caption` as a text colour and dropped `text-on-primary`; every small primary Button and Badge was affected. `cn` now knows the size; `cn.test.ts` and a `toHaveCSS('color')` assertion in `15-recurring` (both red before) |
| 2 | 3 | fixed | Resume and Reschedule opened with an empty "Entered by" chooser although Entering as was set | `ActionPanel` always shows the member; Confirm waits for a date (`confirmDisabled`); two Vitest tests (red before) |
| 3 | 8 | fixed | History showed what and when, not who | "Created by Maya, <time>"; Vitest (red before) |
| 4 | 7 | fixed | Every row's buttons were named only "Change", "Pause", "Delete" | Each button names its bill ("Delete Gym"); suggestions the same; the Vitest tests find them by those names |
| 5 | 3 | fixed | The payment date was empty the first time Record opened | The form waits for the server's date; Vitest (red before) and an e2e line (not seen red: the e2e DB has today loaded by then) |
| 6 | 7 | fixed | On the account page an expense paid by a recurring bill looked like any other; its removal review did not say the occurrence stays paid | New `GET /recurring/payments?accountId=` (follows a corrected payment's replacement chain); "Recurring bill: X, occurrence <date>" on the row; a line in the removal and Undo reviews; API and Vitest tests (red before) |
| 7 | 6 | fixed | The record review gave no resulting Balance and said "2026-10 spending" | `RecordReview.balanceBefore/After`; "Balance goes from $5,000.00 to $4,820.00", "October 2026 spending"; API and Vitest tests (red before) |
| 8 | 7 | fixed | A schedule on an archived account said Active with no reason Record was missing | A line says the account takes no new money until restored or reopened; Vitest (red before) |
| 9 | wording | fixed | History verbs lower case; "the months it was paused" for a weekly bill; a past first due date saved without a warning | Capitalised verbs, "the time it was paused", and a review line "has already passed, so this bill will show as overdue as soon as it is saved"; Vitest (red before) |

Decisions the owner raised, not changed: Delete has no Undo (Q-047, owner's answer); a bill is paid from checking or savings, not a card (decision 12); the menu label is now "Recurring" (was "Recurring bills") after the owner saw it wrap at 710px: not reproduced in headless Chromium, so no assertion was seen red.

## How it works

(Written by a read-only agent from the diff and these notes; its claims were checked against the code and the repo scripts.)

**What you can do.** Open **Recurring** in the main menu (`/recurring`). A suggestion appears when three or more bills share an account, category and description, about a month apart; it lists its bills and says "Estimate, not a recorded expense". Confirm it, dismiss it, or add a weekly, monthly or yearly bill by hand with an explicit first due date. Change, pause, resume and delete a schedule; each has a review with Cancel. **Record actual expense** saves the real bill (early or late) after a review that shows the Balance before and after. An overdue occurrence says "Overdue by N days" and offers Record, Reschedule or Dismiss this occurrence. The account page marks an expense that paid a recurring bill.

**What changed.** `V22__recurring.sql` (schedule, occurrence, dismissal, event); `recurring/` (`RecurringController`, `RecurringService`, `RecurringStore`, `Recurrence`, `Suggestions`); `household/repository/HouseholdLock`; `GET /recurring/payments`; `features/recurring/*`, `api/recurring.ts`, `hooks/useRecurring.ts`; tests `Recurring*ApiTests`, `RecurrenceTest`, `SuggestionsTest`, `ReplayRulesApiTests`, `Recurring.test.tsx`, `15-recurring.spec.ts`. Group 0: `EntryValidator.parseForReplay` for entry, batch, reminder and historical entry saves.

**Record actual expense.** (1) The client sends a key (D-024). (2) The server takes the household lock first. (3) It reads the key; a retry replays the stored result. (4) The schedule must be active and the date must be its next occurrence (else 409). (5) `EntryService.record` saves the entry under the account lock with the entry rules (account open, category, member). (6) In the same transaction the occurrence is marked paid and the next due date moves from the due date, not the paid date. A schedule alone never writes an expense or reminder row, so Balance, spending and Budgets do not move. Lock order: household, account, then category and member share locks.

**Decisions.** D-048 (schedules are estimates; delete is soft with no Undo and does not bring its suggestion back), D-049 (a retry is judged on what was saved). Left: occurrences are not unique per due date in the database; a by-name retry after a category rename is 400; a shorter retry of a batch replays; some inventory races are untested.

**Verify.** `npm run backend:test`, `npm run frontend:test`, `npm run frontend:lint`, `npm run e2e` (189 + new), `npm run coverage -- --require --slice 14` (10/10), then `/recurring` at 710px and 1280px.

## Handoff

- Built: groups 0 to 6 (see the task list); V22; D-048, D-049; Q-044 and Q-045 to Q-049 resolved; the deleted-account sweep covers schedules.
- Watch for: a new household-wide writer takes `HouseholdLock` first, then the account row, then the member and category share locks; a keyed save reads its key before the state and category rules and a replay uses `parseForReplay`, never `parse`; a panel that holds form state for one row is keyed by the row; a spending reader calls `ActivityStore.totalsByCategory` only; the API test base resets today to 2026-10-03 before each test, e2e runs at 2026-10-03; the e2e DB is shared, so `15-recurring` makes its own accounts and bill names.
- Cleanup decided by the owner (2026-10-06): the unique occurrence constraint and the by-name retry after a category rename become group 0 of slice 15; the untested inventory cells and the shorter-batch retry stay logged here; Q-004 waits for a small session after Milestone C; the Milestone B process review waits for Milestone C.
- Left open: occurrences are not unique per (schedule, due date); an omitted class on a retry replays the stored class, and a by-name retry after a category rename is 400 (the UI sends ids); a shorter batch retry replays (before this slice); races not built: record vs removal of its entry, record held vs archive, category merge; matrix cells archived or closed × deleted and × paused (except Resume); same-key concurrency only for Record; the menu wrap at 710px did not reproduce in headless Chromium (label shortened to "Recurring"); Back in Resume and Reschedule and "opener in view on a long list" have no e2e; the 1280px save path and suggestion Dismiss were not walked by the owner.
- v1 showed: not running, not consulted.
- Next: slice 15 (see `INDEX.md`).

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: group 0 was larger than the prompt said (a replay-mode parse, not a copy of the historical pattern); the validator's panel-reuse finding and nine Cowork faults came after 189 green tests, so the slice needed a second fix round.
- What went well: one shared replay mechanism instead of per-writer copies; the lock races held per writer and were seen red when each lock was planted away; the household lock moved to a shared class before a second writer needed it.
- Process change to try: key row-bound panels and assert the computed colour of each Button variant (checklist, `improvements.md`); strike or build every Decision in the notes before the validator runs.
