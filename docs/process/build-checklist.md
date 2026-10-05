# Build checklist

Yes or no items. The builder works through it before Prove; the `validator` agent fills it in again with evidence
(a test name or a command result). A blank item counts as a failure. Every item came from a defect found in slices
01 to 06 (see `review-2026-10-05.md`).

## Inventory (written at checkpoint 1, in the slice notes)

- [ ] Every shared row or state this slice changes is listed (account row, member status, entry, category), with every
      reader and writer found by grep, not from memory.

## Rules and races

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
- [ ] Edit forms start from the current values and show the original. A long name and label wrap at 710px.
- [ ] Anything new that distinguishes accounts or entries (type, status, owner) shows in the lists, not only on the
      detail page.

## Report

One line per item: pass or fail, and the evidence.
