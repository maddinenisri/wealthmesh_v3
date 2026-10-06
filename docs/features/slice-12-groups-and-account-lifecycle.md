# Slice 12: Bank and debt groups, account lifecycle

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: 12 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/lifecycle/manage-accounts.feature` (006 of 7: 007 is the draft, slice 17), `accounts/checking/activity.feature`, `household/overview/understand-wealth.feature`
- Status: done and pushed (2026-10-06, on the owner's word, D-002)
- Started: 2026-10-06 08:04 (session clock)  Finished: 2026-10-06  Commit: `0b0e4ff` (commits from `c59f23b`)

## Prompts and directions

Paste, verbatim, the kickoff prompt that started this session (see `docs/process/prompts.md`, note its version), then
add each instruction or answer the product owner gave at a checkpoint, with the date. No transcripts, no secrets.

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 12 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

It is 9 IDs, size L, and adds W2, A1, A2 and A3. The IDs are ACCOUNT_LIFECYCLE_001 to 006, CHECKING_012, and WEALTH_003 and 011.

What to expect: wealth groups for bank money and debts, plus archive, close and delete of accounts. This is the first time an account can leave the active set, so it touches every reader of the account row.

Things I'd want the checkpoint-1 inventory to cover
- Readers of an account's active state: every chooser (move target, payment, transfer, add entry), the Accounts list, the Household card, wealth, and Spending filters. An archived or closed account must leave choosers but keep its history, as the category rules did.
- Server-side guards with raw-API tests: an entry saved onto an archived or closed account, a transfer or card payment to one, a move target, and batch entry. A UI that hides the option is not the guard.
- Races under lock: archive, close or delete racing a save onto the same account. This is the same pattern as member deactivation in slice 05.
- Delete rules: what blocks deleting an account that has history, and what Undo restores. D-044 says a repeat Undo is idempotent, so apply it here too.
- Wealth groups: a card's negative balance counts as debt and a bank account as bank money. Check which group an overdrawn checking account lands in (D-022 counts it as debt).

Process notes for the session
- Focus: account lifecycle adds more panel exits (archive, close, delete, restore). Use one shared "focus after a state change" helper, not per-screen fixes. Slices 09 to 11 each found focus faults.
- Red before the fix: run each new e2e assertion on its own against the unfixed code. The serial run stops at the first failure.
- Cowork: report the finding count against 8, 8 and 5.
```

- Preflight (2026-10-06 08:04): JDK 25 default, Node 26.4, Docker up; ports 5434, 5180, 8081 held by this project (`wm-backend`, `wm-frontend`); v1 on 3000 not running (not needed).
- 2026-10-06 Checkpoint 1 answer: approved the task list and the design. Q-037: block deleting an account with a non-zero opening amount (409 pointing to Archive or Close); record as a decision noting it deviates from foundations 10 ("no activity beyond the opening row"). Q-038: yes, an archived account's entries stay editable, removable and restorable; a closed account's do not. Additions: (1) Close refuses while any entry dated after today exists, with a raw-API test; (2) one sweep test: delete an account, then hit every read path and chooser and assert it is absent; (3) `useStateChangeFocus` for every new panel exit, with slices 09 to 11 panel exits listed as a backlog in the notes, not retrofitted. Stop rule: if one hits, drop group 4 (delete and Undo) to a later session; keep groups 5 and 6. Build in order, one commit per group, local only, no push, no Claude trailer. Run each new e2e assertion alone against the unfixed code. Report the Cowork count against 8, 8 and 5.
- 2026-10-06 Checkpoint 2 answer: owner pass (Cowork) at 710px, window in front, all five steps pass; 5 faults (against 8, 8 and 5), none of them focus; 1280px by page contents on LC Used Savings only (screenshot too small to judge by eye). Table below.

## Scope

Scenario IDs in this session (all of them, unless a split is recorded): `@V2_ACCOUNT_LIFECYCLE_001` to `006`, `@V2_CHECKING_012`, `@V2_WEALTH_003`, `@V2_WEALTH_011`.

Out of scope: `V2_ACCOUNT_LIFECYCLE_007` (investment draft, slice 17).

## Decisions

Choices made that the feature file does not settle, each with the reason. Keep feature-local choices here; promote
a choice to `docs/decisions/decisions.md` only when other features will rely on it. Foundation rules live in
`docs/guides/domain-foundations.md`; do not restate them, only link.

Foundations 5 and 10 apply (status values, archive, close, delete). D-022, D-024, D-033, D-034, D-036, D-044 are relied on.
Proposed, pending checkpoint 1 (to promote after approval as D-045 and D-046):

- **Repository facts that shape the plan:** `account.status` already exists (V2: draft, active, archived, closed) but nothing reads it except
  `WealthService` (draft). There is no `deleted_at` (V18 adds it). There is no unique account name, so Undo of a delete cannot clash.
  `WealthSummary` has only `financialAssets` and `debts` (no net worth, no groups). 10 services load an account and call
  `AccountType.holdsActivity` as the one gate; the lifecycle gate goes in the same place.
- **One writable gate (D-045):** `AccountType.holdsActivity` answers "what type"; a new `AccountState.requireOpen(account)` answers "what state". Every writer
  calls it after `lockAccount` and the re-read, so the check is made under the lock. Archived or closed: 409 "<name> is archived (or closed).
  Restore (or reopen) it first." Rules: new money (entry, batch, historical entry, correction, reminder, transfer or payment leg, move target) needs **active** on every
  account it touches. Changing or removing an existing row (edit, remove, Undo, convert), a statement (a record, not money) and an opening-start
  correction need no touched account **closed** (a closed account stays at a zero Balance); an archived account's history may still be corrected, because
  archive only tidies the list and the money stays in wealth. `AccountService.update` (rename, institution, owners) is allowed in both states
  (details are not money) and still refuses an inactive new owner (D-034).
- **Lifecycle writes, mirroring slice 05 (`HouseholdMemberController`: `POST /{id}/deactivate` and `/restore`, row `FOR UPDATE`, state-based replay
  returns 200 with the same result, no key, no event row, review lives in the UI):** `POST /api/v1/accounts/{id}/archive|restore|close|reopen|delete|undo-delete`.
  Each takes the account row `FOR UPDATE` (`lockAccount`) and re-reads status and Balance under it. (First draft: no event row, as members have none;
  Cowork finding 1 added `account_event`, V19, with who and when, and an optional `enteredByMemberId` body field.) A read-only `GET /accounts/{id}/lifecycle` gives the review its facts (`balance`, `canClose`, `canDelete`,
  and why not: history rows, opening amount) so scenario 006 can show "history must be retained" before Confirm; the 409 on the write is the guard.
  (The first draft also said the close review would list reminders that stay; that was not built, a reminder is not Balance.)
  Transitions: active to archived, active to closed, archived or closed back to active. A closed account must be reopened before it can be archived.
- **Close needs an accounted-for zero (A2):** the Balance as of today is exactly 0 under the lock, else 409 with the amount ("transfer or pay it first"). Close also refuses (409) while any entry dated after today exists (owner addition 1).
  A card with a Card credit is not zero. Reminders (future dated) are not Balance; they are listed in the review ("1 reminder will stay").
- **Delete (A3), unused only:** blocked (409, points to Archive or Close) when the account has any `activity` row **including removed ones**, a
  reminder, a statement, an opening revision, or a correction. Blocked also for a non-zero opening amount (Q-037, recommended). Soft delete:
  `account.deleted_at`; every account read ignores a deleted row (list, detail 404, wealth, choosers); Undo clears it. A repeat Undo returns the
  same account (200, no second event), as D-044.
- **Wealth groups (W2, D-046):** `GET /api/v1/wealth` keeps `financialAssets` and `debts` and adds `netWorth`, `bankMoney` (total of checking and savings
  Balances, archived included, negative one visible) with its accounts, and `debtGroup` (each card that is owed, and each overdrawn bank account, once).
  Drafts and deleted accounts are out; archived and closed are in. An overdrawn checking account is **in Bank money as a negative figure and in
  Debts as its positive amount**, counted once in assets-minus-debts (D-022); the page says so in one line. Check, WEALTH_011: savings 5,000 + checking -100 = Bank money 4,900; assets 5,000; debts 1,000 card + 100 overdraft = 1,100; net worth 3,900. WEALTH_003: 15,000 + 50 credit = assets 15,050; debts 1,000; net worth 14,050. This follows from the scenarios, so it is not a question.
- **Chooser rule (UI):** `transfers/accountChoice.ts` today only formats a label ("Name (Type)"). One filter, `usableAccounts(accounts)` (type is ready and
  status is active), is added to that file and replaces the copies of `ACCOUNT_TYPES.some(type => type.ready ...)` in AddEntry (add entry **and** the
  move-target chooser of an edit), SplitEntry, TransferForm (transfer and "Pay a card", both from checking, savings and the card page), ChangeToTransfer.
  `status` is already on the wire (`AccountResponse.status`, `Account.status`), so no response change. The Spending account filter
  and the Accounts list "Show archived and closed" toggle read all accounts (history stays reachable, as archived categories did).
- **Focus after a state change:** one helper, `useStateChangeFocus`, built on `useReturnFocus`: after Confirm of archive, close, delete, restore,
  reopen or Undo, focus goes to a status line (`role="status"`, in view) naming what changed; after Cancel or Back, to the opener; when the opener
  is gone (deleted account, row left the list) to the page heading. Every panel exit gets an e2e line, each run red alone (`--grep`).
- **CHECKING_012 wording:** "marks checking inactive" is Archive. The review sentence carries the scenario's explanation ("This changes the household
  list. It does not close an account at its bank."); "Show archived and closed" is the "includes inactive accounts" switch.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| 0 Base: V18 (`deleted_at`), `AccountState` gate, every account read ignores deleted, `usableAccounts` helper | (supports all) | API + unit | built |
| 1 Wealth groups: Bank money, Debts, net worth, archived label | `V2_WEALTH_003`, `V2_WEALTH_011` | API + UI (MSW) + e2e | built |
| 2 Archive and restore: review, confirm, archived view, restore, "inactive" explanation | `V2_ACCOUNT_LIFECYCLE_001`, `V2_ACCOUNT_LIFECYCLE_002`, `V2_CHECKING_012` | API + UI + e2e | built |
| 3 Close and reopen: zero rule, unavailable for new entries | `V2_ACCOUNT_LIFECYCLE_003`, `V2_ACCOUNT_LIFECYCLE_004` | API + UI + e2e | built |
| 4 Delete and Undo: unused rule, history refusal, repeat Undo | `V2_ACCOUNT_LIFECYCLE_005`, `V2_ACCOUNT_LIFECYCLE_006` | API + UI + e2e | built |
| 5 Guards and races: raw-API refusal for each writer (entry, batch, historical entry, correction, reminder, statement, transfer, card payment, move target, edit, Undo) and a `holdUncommitted` race per lifecycle write against each keyed writer | cites 001, 003, 004, 005 | API | built |
| 6 Shared focus helper and UI exits at 710px and 1280px (Confirm, Cancel, Back, Undo, restore, reopen, delete) | cites 001 to 006 | e2e | built |

Order: 0, 5's guards with 2 (the gate is meaningless without archive), 1, 3, 4, then 6 and the rest of 5. Gap analysis: all 9 IDs are citeable now
(card and savings exist, transfers and card payments exist, `status` exists); none blocked, none deferred. Card balances in 002 and 004 and the
overdraft in 011 need nothing new.

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep result, not memory):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |
| `account.status` (archived, closed) | Backend loaders that gate on type today: `EntryService.load`, `BatchEntryService`, `HistoricalEntryService`, `MoveTarget`, `MovementService` (both legs), `TransferPreviewService`, `BalanceCorrectionService`, `ReminderService`, `StatementService`, `OpeningRevisionService.loadEditable`, `EntryChangeService` (edit, remove, Undo, convert); `AccountService.findAll/findById/update`; `WealthService.summary`; `SpendingService.known(accountId)`; SQL joins `ActivityStore` (2), `MovementStore`, `ReminderStore`. UI (`useAccounts`): `AddEntry`, `SplitEntry`, `TransferForm`, `ChangeToTransfer`, `TransferChange`, `SpendingPage`, `AccountsPage`, `HouseholdPage`, `AccountDetailPage`, `MembersCard`, `StatementForm` | New `AccountLifecycleService` (archive, restore, close, reopen) | Archive or close held uncommitted vs each keyed writer above (one test each, fails when `requireOpen` or the lock is removed); same-action replay returns the same state |
| `account.deleted_at` (new) | Same account reads: `AccountRepository.findAllBy...`, `findById` (every service), wealth, list, detail | `AccountLifecycleService.delete / undoDelete` | Delete held vs a save onto it; save held vs delete (the save wins, the delete then sees the row) |
| `Account.status` on the wire | Already sent (`AccountResponse`, `frontend/src/api/accounts.ts`); labels and filters read it | none | none |
| Account Balance of 0 (close rule) | `ActivityStore.deltasByAccount` | Every entry writer | Close held vs an entry save (close sees the committed row) |
| `WealthSummary` shape | `WealthController`, `useWealth`, `HouseholdPage` | `WealthService` | none (read) |

## Coverage

`npm run coverage -- --require --slice 12`: 9/9 covered, none deferred.

| ID | API (Testcontainers) | UI (Vitest + MSW) | e2e (710px and 1280px) |
| --- | --- | --- | --- |
| `V2_ACCOUNT_LIFECYCLE_001` | `ArchiveRestoreApiTests`, `ArchivedAccountGuardsApiTests`, `AccountStateRaceApiTests`, `ArchivedWealthApiTests` | `AccountStatusCard.test.tsx`, `WealthGroups.test.tsx`, `accountChoice.test.ts` | `13-lifecycle.spec.ts` archive and restore |
| `V2_ACCOUNT_LIFECYCLE_002` | `ArchiveRestoreApiTests`, `ArchivedWealthApiTests` | `WealthGroups.test.tsx` | (API and UI) |
| `V2_ACCOUNT_LIFECYCLE_003` | `CloseReopenApiTests`, `AccountStateRaceApiTests` | `AccountStatusCard.test.tsx` | `13-lifecycle.spec.ts` close and reopen |
| `V2_ACCOUNT_LIFECYCLE_004` | `CloseReopenApiTests` | | (API) |
| `V2_ACCOUNT_LIFECYCLE_005` | `DeleteAccountApiTests`, `DeletedAccountReadsApiTests`, `DeletedAccountSweepApiTests` | `AccountStatusCard.test.tsx` | `13-lifecycle.spec.ts` delete and Undo |
| `V2_ACCOUNT_LIFECYCLE_006` | `DeleteAccountApiTests` | `AccountStatusCard.test.tsx` | `13-lifecycle.spec.ts` delete refused |
| `V2_CHECKING_012` | `ArchiveRestoreApiTests` | `AccountStatusCard.test.tsx` | `13-lifecycle.spec.ts` Show archived and closed |
| `V2_WEALTH_003` | `WealthGroupsApiTests` | `WealthGroups.test.tsx` | (API and UI) |
| `V2_WEALTH_011` | `OverdraftGroupsApiTests` | `WealthGroups.test.tsx` | `13-lifecycle.spec.ts` wealth groups |

Mutation checks (defect planted, test went red, defect removed): `AccountState.requireOpen` switched off (guards class red); reminder read the stale
account, expense re-read without the gate, remove without the account lock (each its race test red); close without the lock and delete without the lock
(each its race test red); the focus helper with Confirm not focusing, Cancel not returning focus, arrival not focusing (each e2e assertion red on its own).

## Validator report (independent agent, commit 2e69c18) and what was done

Checklist: 9 defects and 6 failed items reported. Fixed in `ed78c32`: (1) a reminder save racing a delete answered 200 with nothing saved (the re-read under the lock had
no 404); (2) no test for the closed-state gates of starting-balance correction, correction replacement, transfer and payment replace or remove, convert from a closed
account and a move from a closed source (new `ClosedAccountGuardsApiTests`, two new races, each gate proven red by planting its removal); (4) `hasCard` ignored status;
(8) a reload after Undo said "deleted" again; (9) Bank money took every non-card type. Not fixed, recorded: (3) a retry after an archive is 409 for entry writers
and a replay for movements (Q-040); (5) a repeat delete is 404 (D-045 now says so); (6) a soft-deleted account keeps its `account_owner` rows, so a member who owns
only a deleted account cannot be deleted until Undo or another owner (handoff); (7) a move target deleted while the move waits shows the tracking-start message
instead of 404 (handoff). Process items (notes, retro) are written at Land.

## Open questions

Anything that needs the product owner. Add it to `docs/decisions/questions.md` as well (that is the register the
next session reads), and mark the answer and date in both places when resolved.

- **Q-037 (resolved: block, 2026-10-06)** Delete an unused account whose opening amount is not zero? Foundations 10 allows it (no activity). It would drop money from wealth with only an
  Undo as the way back. Recommended: block it (409, Archive or Close instead); scenario 005 only covers a zero account. Default if unanswered: block.
- **Q-038 (resolved: yes, 2026-10-06)** May an archived account's existing entries still be edited, removed or restored (the Balance stays in wealth), while a closed account's may not?
  Recommended: yes (as in the Decisions list). Default if unanswered: yes.

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |
| 1 | 8 | fixed | Archive and Restore leave no trace in history (who, when) | `AccountEventsApiTests`, `AccountStatusCard.test.tsx` (status history, Confirm waits for who), e2e restore step reads "Archived by .. · date" and "Restored by" (red on the old code) |
| 2 | 1, 3 | fixed | Edit and Remove stay enabled on the open side of a payment to a closed card, then Confirm is refused after a full review | e2e "closed card from the other side" (red on the old code); `ActivityList` and `EntryHistory` take `lockedBy` and say why |
| 3 | 6 | fixed | The delete-refused review said "a starting Balance of 1000.00" | `DeleteAccountApiTests`, e2e delete refused reads "$300.00" (red on the old code); close refusal reads "$1,000.00" too |
| 4 | wording | fixed | "1 saved entry, removed ones included" | now "1 saved entry (removed ones count)"; same tests |
| 5 | 6 | fixed | Cards total "-$988.00" while every card line says owed or Card credit | e2e "closed card from the other side" (red with the fix removed); the Cards total reads "$988.00 owed" |

Count: 5 against 8, 8 and 5; no 710px table fault and no focus fault. Also from the owner's note: LC Everyday Checking started at $6,000.00 (it holds the $1,000 transfer in), and the "deleted" status line with Undo stays after a reload until Undo is clicked (it now clears after Undo; kept on purpose before it, because a reload lands on the same deleted state).

## How it works

Written after Land by a read-only agent and checked against the code (brief in `docs/process/prompts.md`): what the
user can do now, what changed, how the main path works, decisions and open items, how to verify.

Written by the read-only walkthrough agent over `d916e2b..HEAD`; I checked each claim against the code and corrected the one stale point (it said no event row; V19 and `/events` exist).

1. **What you can do.** Household shows Bank money, Cards (owed or Card credit) and What makes up debts, plus Net worth; archived and closed accounts keep a label. On an account page the Account status card offers Archive, Close and Delete (Restore and Reopen when they apply). Each opens a review that shows who is entering; Cancel returns focus to the button, Confirm moves focus to a status line. Accounts has "Show archived and closed". A delete lands on the list with a status line and Undo. The card lists who changed the status and when.
2. **What changed.** V18 (`deleted_at`), V19 (`account_event`); `AccountLifecycleService`, `AccountState`, `AccountUsageStore`, `AccountController` (archive, restore, close, reopen, delete, undo-delete, lifecycle, events); `WealthService` and `WealthSummary` groups; `AccountStatusCard`, `useStateChangeFocus`, `usableAccounts`; nine API test classes plus `AccountEventsApiTests`, `AccountStatusCard.test.tsx`, `WealthGroups.test.tsx`, `e2e/tests/13-lifecycle.spec.ts`.
3. **The main path (close).** Review reads `GET /lifecycle`; Confirm posts `/close`; the service takes the account row `FOR UPDATE`, re-reads status and Balance, refuses unless the Balance is exactly zero and nothing is dated after today, then saves the status and an event in one transaction. Every other writer locks, re-reads, then calls `AccountState.requireOpen` (new money) or `requireNotClosed` (change of what exists; an archived account passes). Delete is soft, refused for any activity row (removed ones too), reminder, statement, correction or a non-zero opening amount; every account read skips deleted rows; a repeat Undo returns the same account.
4. **Decisions and deferred.** D-045, D-046, Q-037 (block a non-zero opening), Q-038 (archived entries stay editable). Out: `ACCOUNT_LIFECYCLE_007` (slice 17). Open: Q-040 and the handoff items.
5. **How to verify.** `npm test`, `npm run e2e`, `npm run coverage -- --require --slice 12` (9/9); on screen: the flows above.

## Handoff

- Built: `AccountState.requireOpen` (new money) and `requireNotClosed` (change of what exists) gate every writer after the account lock and re-read; archive, restore, close, reopen, delete and undo-delete (`AccountLifecycleService`, `account_event` V19 for who and when, `deleted_at` V18); `GET /wealth` groups (D-046); `usableAccounts` in `transfers/accountChoice.ts` is the one chooser filter; `useStateChangeFocus` is the one answer to focus after a state change; `13-lifecycle.spec.ts` makes its own household so each assertion runs alone.
- Watch for: any new writer that adds money or changes a row must call the gate after `lockAccount` and add a cell to the writer-by-state matrix (checklist); any new reader of accounts must skip deleted rows (`AccountRepository.findById` is overridden; raw SQL joins are not) and add its path to `DeletedAccountSweepApiTests`; any new thing an account can own (dated values and prices in slice 15, loans in 16) must be added to `AccountUsageStore.usageOf` or a delete will lose it; `WealthService` puts only `paysCards` types in Bank money, so investment types need their own group; a new Confirm that needs who is entering needs Entering as set in the e2e.
- Left open: Q-040 (a retry after an archive is 409 for entry writers and a replay for movements; owner: fix it at the start of slice 13 as a small group); a repeat delete is 404; a soft delete keeps `account_owner` rows so a member who owns only a deleted account gets 409 on delete until Undo; a move target deleted while the move waits shows the tracking-start message; the slice 09 to 11 panel exits are a backlog above, not routed through `useStateChangeFocus`; 1280px was checked by page contents only on LC Used Savings; one e2e flake (focus after Close at 710px) did not recur in 8 runs; if it appears again, keep the full Playwright output and trace (owner asked; the earlier unexplained one-offs are logged the same way).
- Owner, after Cowork: `enteredByMemberId` is now required on every lifecycle write (400 "Choose who entered this"), like every other write; the Undo button on the Accounts list waits for Entering as. Confirm that `useStateChangeFocus` really removed the focus faults in slice 13 before calling it fixed.
- v1 showed: not running, not consulted.
- Next: slice 13 (budgets).

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator again found gaps after the build (a reminder save racing a delete answered 200 empty; six closed-state gates untested); Cowork found 5 faults after 151 e2e tests, two of them on the other side of a link (a closed card's payment on the bank's page, no history of the state change); two e2e runs failed on my own test setup (Entering as, a before-figure that included the account being deleted).
- What went well: planting each gate's removal proved every race and guard (and showed the first `loadOpen` change had no test); the shared focus helper meant no focus fault at Cowork (5 against 8, 8 and 5); each Cowork fault got an e2e that was red on the old code; `13-lifecycle.spec.ts` runs alone.
- Process change to try: writer-by-state matrix with a planted-defect red per cell; check the pages of linked accounts for a state on one account; Entering as in the e2e beforeEach (checklist and improvements log updated).

## Panel-exit backlog (slices 09 to 11, not retrofitted this session)

Owner addition 3: `useStateChangeFocus` serves every new exit of this slice (archive, restore, close, reopen and delete: Confirm, Cancel, the switch from a
refused delete to Archive or Close, and the arrival on the Accounts list after a delete). These earlier exits keep their own fixes and are listed for a later pass:

| Where | Exit | Today |
| --- | --- | --- |
| `AccountDetailPage` `Activity` panels (add, edit, batch, split, transfer, correction) | Confirm | `announce()` focuses the Activity heading or `closeTransfer` scrolls; two ways to say the same thing |
| same | Cancel and Back | `useReturnFocus` returns to the opener |
| same | Removal, Undo | `ChangeEntry` and `TransferChange` call `announce` or `closeTransfer` |
| `SplitEntry` | Back from review, Remove portion | own focus code (slice 11 fixes) |
| `CategoriesPage` | create, rename, merge, archive, Undo of a merge | own `useReturnFocus` plus focus after a change (slice 10 fixes) |
| `StatementsCard` | attach, revise | `useReturnFocus` only |
| `BatchEntry` | Save and add another | own focus code |
Candidate for a later session: route all of these through `useStateChangeFocus` (it needs a "stay on this page" variant of `changed`, which `AccountStatusCard` already is).
