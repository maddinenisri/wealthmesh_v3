# Slice 12: Bank and debt groups, account lifecycle

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: 12 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/accounts/lifecycle/manage-accounts.feature` (006 of 7: 007 is the draft, slice 17), `accounts/checking/activity.feature`, `household/overview/understand-wealth.feature`
- Status: in-progress (checkpoint 1 pending)
- Started: 2026-10-06 08:04 (session clock)  Finished:   Commit:

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
- 2026-10-06 Checkpoint 2 answer:

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
  Each takes the account row `FOR UPDATE` (`lockAccount`) and re-reads status and Balance under it. No `account_event` table, no entered-by (members
  have none either; `updated_at` moves). A read-only `GET /accounts/{id}/lifecycle` gives the review its facts (`balance`, `canClose`, `canDelete`,
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

## How it works

Written after Land by a read-only agent and checked against the code (brief in `docs/process/prompts.md`): what the
user can do now, what changed, how the main path works, decisions and open items, how to verify.

## Handoff

What the next session must know that is not in the code: what is half-built, what to watch for, what v1 showed.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session:
- What went well:
- Process change to try:

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
