# Build checklist

Yes or no items. The builder works through it before Prove; the `validator` agent fills it in again with evidence
(a test name or a command result). A blank item counts as a failure. Every item came from a defect found in slices
01 to 06 (see `review-2026-10-05.md`).

## Inventory (written at checkpoint 1, in the slice notes)

- [ ] Every shared row or state this slice changes is listed (account row, member status, entry, category), with every
      reader and writer found by grep, not from memory.

## Rules and races

- [ ] A rule that restricts stored data (one per category, at most N) is tried against every operation that rewrites that
      data: merge, move, replacement, Undo (slice 11: one portion per category broke correcting a merged split).
- [ ] A state rule (archived, closed) is a matrix in the inventory: every writer by every state (new money, change of what
      exists), one raw-API test per cell, and planting the gate's removal turns a test red (slice 12: six closed-state gates
      had no test until the validator asked). A state on one account is also checked from the pages of the accounts linked to
      it by transfers and payments.
- [ ] Every rule a feature adds has a raw-API test of the forbidden case. A UI that hides the option is not the guard.
- [ ] A state rule (inactive, closed, replaced) is enforced where the server writes, at every use of that state
      (owner, entered-by, target account), and re-read under the lock.
- [ ] Every writer in the inventory takes the lock and has a race test built on `holdUncommitted` in
      `LedgerApiTestBase`. The test fails when the lock is removed (random timing proves nothing).
- [ ] A keyed save has a concurrent same-key test (second request replays the first) and a retry-after-the-ledger-
      changed test.
- [ ] Every keyed save reads its key under the lock: grep each service for `findByIdempotencyKey` and check it
      comes after `lockAccount` (or in the same transaction as the lock), including services the slice did not write but
      a new type now reaches (slice 08: Update balance read it before the lock).
- [ ] A row that is read by id, by name and through a join (a category, a member) is locked on every read path of a
      save, and each path has its own race test (slices 09 and 10: a by-name lookup was unlocked while every test used
      the id). Grep the repository for each way the row is fetched.
- [ ] A race test for a row lock (account, member) holds only that row. Holding the account lock too hides whether the
      member row is read `FOR SHARE`; the test must fail when the lock or the `FOR SHARE` is removed.
- [ ] Every test cites its scenario ID, including race, guard and replay tests (grep the titles of each new test class).
- [ ] A race test's "both wait" check can pass for another reason (an FK or the later UPDATE of the same row waits too).
      Name the outcome that only the lock produces, assert it, and plant the lock away to see it red. A plant counts
      only when the method it names goes red (slice 17b: a plant on `move()` stayed green because delete is another
      method). Restore a plant from a copy, never with `git checkout` on a file that holds uncommitted work.
- [ ] A removed UI state or option (a "coming soon" type, a flag) is grepped in `e2e/tests` and `docs` as well as
      `frontend/src` before the full e2e run (slice 17b: `04-income.spec.ts` still expected it).

## UI

- [ ] A form or review that opens above a long table uses `Panel`, and returns focus to its opener with
      `useReturnFocus`. A panel whose content swaps in place (form to review) scrolls and focuses the new content.
- [ ] Playwright, at 710px and 1280px: the panel's top is in view, focus is inside it, nothing scrolls sideways. After a
      save, the new row is in view; seed a long list first, because a short table hides a page left scrolled down.
- [ ] Playwright: a form's first error is in view and focused; a save finishes before the test leaves the page.
- [ ] A new type that changes how a Balance or amount reads: grep every `formatMoney(` of a Balance, every list that
      shows a signed amount, and every category or account chooser, and decide each (slice 08 Cowork findings 4 to 8).
- [ ] After Confirm, focus and scroll go somewhere stated: the row that changed, or the opener when the row is gone;
      a review sentence reads right for 0 and 1 entries.
- [ ] Every way out of a panel has stated focus and an e2e line: Confirm, Cancel, Back from a review, a row removed
      inside the form, and a removal or Undo (slice 11: Back, Remove portion and Confirm of a removal lost focus). A
      status line says what changed. Run each new e2e assertion red on its own (`--grep`): a serial run stops at the first
      failure and hides the rest.
- [ ] Edit forms start from the current values and show the original. A long name and label wrap at 710px.
- [ ] A race test for a lock uses an update when a foreign key to the locked row would make an insert wait anyway (plant the
      lock's removal and see it red). A screen that lists rows is checked in a short month and at 1280px; a history row
      says what changed, not only who and when.
- [ ] A panel or form that holds state for one row is keyed by the row (and action) and a test opens it on a second row
      (slice 14: Change opened on another bill saved the first bill's values). A mutation error is reset when a new
      panel opens. Assert the computed colour of each Button variant once (slice 14: `cn` dropped a label colour).
- [ ] A rule that picks "the latest" or an order has a tie test: two writes on one date, with the clock moved between them (slice 15: a system row outranked a saved value; the shared test clock is fixed).
- [ ] A form or page for a new account type is read against that type's own words before Cowork does (slice 15: Bank, Opened on, Balance and joint on a property); a review that Confirm can refuse is told by the server first.
- [ ] Every Confirm, removal and Undo ends with a sentence saying what changed and focus on the section heading; every Back returns focus to the form's heading and clears the save error (slice 16a, fifth slice with this fault in Cowork).
- [ ] A rule the save refuses is refused in the review too: the preview endpoint runs the same check, and Confirm stays off (slice 16a: a new initial amount below what was paid).
- [ ] A new type or account state (draft) is checked against every page that groups or lists accounts by type: Household groups, Accounts list, pickers, Spending, wealth groups; the totals equal the lines shown (slice 17a: Bank money listed brokerages; Financial assets outran the page).
- [ ] A step that destroys something (Cancel on a draft, a discard) asks once before it acts, even when there is no Undo; ask the owner at checkpoint 1 if the scenario is silent.
- [ ] Every Decision written in the notes is built with a test, or struck out, before the validator runs.
- [ ] Anything new that distinguishes accounts or entries (type, status, owner) shows in the lists, not only on the
      detail page.

## Report

One line per item: pass or fail, and the evidence.
