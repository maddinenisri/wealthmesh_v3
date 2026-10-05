# Slice 05: Member lifecycle and joint owners

- Slice: 05 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/household/setup/set-up-household.feature`, `docs/requirements/v2/household/members/manage-members.feature`
- Status: done (committed, not pushed: push only when the owner says, D-002)
- Started: 2026-10-04  Finished: 2026-10-05  Commit: see git log

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 05 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

- Scope: HOUSEHOLD_SETUP_001, MEMBERS_005 and MEMBERS_006. It adds M1 and M2 (member lifecycle, joint owners).
- Background: this resumes the old parked row 02. Its gap analysis is in household-members-manage-members.md. MEMBERS_002 and 004 land later in slices 18 and 21.
- Merge option: at 3 IDs it is small, and the merge rule allows taking slice 06 (savings, 9 IDs) too. I'd keep it separate, because savings is a large slice with a new account type.
- Open question: Q-031 is a note from slice 04, not a blocker.
```

- 2026-10-04 Checkpoint 1 answer: approved as proposed (groups A to C, decisions 1 to 6, slice kept separate, Q-031 left as is).
- 2026-10-04 Checkpoint 2 answer: owner click-through passed the joint account, rename and remove paths; failed an inactive member row with a long name and label at 710px (fixed with four smaller items, see the notes below); 2026-10-05 "approved, lets continue"; Q-032 keep the 409.

## Scope

`@V2_HOUSEHOLD_SETUP_001`, `@V2_MEMBERS_005`, `@V2_MEMBERS_006`. Kept separate from slice 06 (owner's note in the kickoff).

## Gap analysis (2026-10-04)

All 3 IDs are citeable now (needs: M2 and W1 for 001; M1, L2, L4, P2, P4 for 005; M1, M2, P1 for 006; all exist).

Code today: member add/list/rename/delete API and household screen; household rename; `account_owner` join; the account API accepts a list of owners (`checkOwners`) but the account form (`AccountForms.tsx`, `ownerMemberId`) takes one; no `active` column, no name history; `DELETE` of an owning member returns 409. Basic wealth (W1) exists and counts an account once.

| ID | Has | Needs |
| --- | --- | --- |
| `V2_HOUSEHOLD_SETUP_001` | members, account create, wealth, household rename | multi-owner account form; details show both names; test that a joint account counts once in wealth and survives a household rename |
| `V2_MEMBERS_005` | expense entered-by, member rename | review-and-confirm rename; `member_name_change` history shown on the member; test that Balance, owner and entered-by are unchanged and no activity is created |
| `V2_MEMBERS_006` | joint checking, member list | "Remove" review (deactivate) with Cancel; both stay active, ownership and Balance unchanged |

Plan details from the parked gap analysis (`household-members-manage-members.md` decisions 1 to 10) are the starting point, adjusted below.

## Decisions

Approved at checkpoint 1 (2026-10-04); built as written, plus:

1. `household_member.active BOOLEAN NOT NULL DEFAULT TRUE` (migration `V9`); `POST /household-members/{id}/deactivate` and `/restore`; responses gain `active`. Deactivate is built because 006 reviews it, and confirm must work for the review to mean something.
2. An inactive member is refused as a new owner (400), but an existing inactive owner may stay on an account when it is edited.
3. Rename keeps the earlier name in `member_name_change(member_id, old_name, old_label, changed_at)`, listed on the member row. No money or ownership rows change.
4. Account form: owner field becomes checkboxes of active members, at least one. Per-type owner limits arrive with those types.
5. Member delete 409 message points to Deactivate.
6. Foundations 9 applies (removing a member sets `active = false`); no new foundation rule.
7. The deactivate/restore writes and the rename lock the member row (`FOR UPDATE`); account create and edit read the household's members `FOR SHARE`, so a new inactive owner cannot slip in between the check and the save.
8. The delete-409 message is "This member is on your accounts or records and cannot be deleted. Deactivate this member instead." (an entry or statement also blocks a delete, not only an account).
9. An account's owners are shown in name order (the API returns them by id, which is random).
10. "Entering as" and "Entered by" offer active members only; a remembered inactive member counts as nobody chosen, and the server refuses an inactive member as who entered a new record (400 "Choose an active member", every writer goes through `EntryValidator.member`). Old records keep their inactive enterer. A retried save whose member was removed in between gets this 400 instead of a replay.
11. The rename review has "Change name" (back to the form with the typed text) as well as Cancel; opening a review moves focus to its panel and closing it returns focus to the member's Edit button.
12. Account edit locks the account row first (`ActivityStore.lockAccount`), so two edits of one account take turns and the owners it reads are the committed ones.
13. Account setup with members but none active shows "Add a household member first" (no owner list nobody can pick from).

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A. Joint owners: multi-owner account form (create and edit), details and list show all owners, wealth counts a joint account once, household rename keeps owners | `V2_HOUSEHOLD_SETUP_001` | API + UI (MSW) + e2e | todo |
| B. Rename a member with a review step and a profile change history (`V9` `member_name_change`); balance, owner, entered-by unchanged; no activity created | `V2_MEMBERS_005` | unit + API + UI (MSW) + e2e | todo |
| C. Remove a member: review and Cancel, Confirm deactivates, Restore, inactive section, inactive-owner rule, 409 message | `V2_MEMBERS_006` | API + UI (MSW) + e2e | todo |

Cross-cutting: concurrent-save and retry tests where a save changes a row other saves read (account owners vs member deactivate: lock the member and account rows, race each writer); 710px and 1280px Playwright assertions for the new member panel and the multi-owner form, first error in view and focused.

## Coverage

`npm run coverage -- --require --slice 05`: 3/3 covered, none deferred. No feature file is completed by this slice (`manage-members.feature` completes in slice 21, `set-up-household.feature` in 18).

| ID | API | UI (MSW) | e2e |
| --- | --- | --- | --- |
| `V2_HOUSEHOLD_SETUP_001` | `MemberLifecycleApiTests` | `MemberLifecycle.test.tsx` | `12-members.spec.ts` |
| `V2_MEMBERS_005` | `MemberLifecycleApiTests` | `MemberLifecycle.test.tsx` | `12-members.spec.ts` |
| `V2_MEMBERS_006` | `MemberLifecycleApiTests` | `MemberLifecycle.test.tsx` | `12-members.spec.ts` |

Also tested (each held with an uncommitted write on a second connection, so the timing does not depend on luck): an owner edit and an account create wait for a deactivate in progress and are then refused; a deactivate waits for a rename and keeps the new name; two edits of one account take turns; a refused duplicate rename leaves no history row; an inactive member is refused as entered-by; deleting a member with only history is allowed. Earlier: an owner edit waits for a deactivate that is in progress (held uncommitted in a second connection) and is then refused. Mutation checks (each failed the named test, then restored): removing `FOR SHARE` from the member read; `FOR UPDATE` on the member row; `@Transactional` on rename; the active check on entered-by; the account lock in update (a first, random-timing race test passed even without the lock and was replaced); making Cancel in the removal review save the removal failed the cancel test. Existing specs changed: owner select became checkboxes (`02`, `03`, `04` e2e; `CheckingSetup`, `HouseholdOverview`, `Expenses` UI tests) and member edit became review-then-confirm (`01` e2e, `HouseholdPage` test).

Checkpoint 2 findings fixed (owner click-through, 2026-10-04): the inactive member row collapsed at 710px with a long name and label (label and badge now sit under the name, which keeps at least 12rem; e2e measures it); "inactive member" read as one more owner in a comma list, so it is now "Sam (inactive)"; Cancel on Remove returns focus to Remove, and Remove and Restore keep focus as they swap; the Accounts list column says "Owners". Left for later (not fixed): the removal review repeats the full name five times and its confirm button wraps; "Entering as" stretches across the header on the Accounts pages with a long name; the Accounts list is cramped at 710px with a long owner (the date and names wrap); Restore has no review step.

## Open questions

Q-031 (slice 04 note) is not a blocker.

- Q-032: adding a member whose name and label match a removed (inactive) member is 409, because the unique name index ignores `active`. Keep (recommended: the owner restores the member instead) or allow a reuse of the name?

## Handoff

- Built: member `active` and `member_name_change` (V9), `POST /household-members/{id}/deactivate` and `/restore`, rename history in the member response (`nameHistory`), `MemberNameHistoryStore`, owner checkboxes (`CheckboxGroupField`), `MembersCard` (Edit with rename review, Remove review, Restore), the inactive-owner rule in `AccountService.checkOwners` and the entered-by rule in `EntryValidator.member`.
- Decisions: D-033, D-034. Q-032 resolved (keep the 409).
- Existing screens that changed: owner is now checkboxes (an account may be joint); member edit is review-then-confirm; owners are shown in name order; "Entering as" and "Entered by" offer active members only.
- Left for later: the removal review repeats the full name and its confirm wraps with a long name; "Entering as" stretches across the header on the Accounts pages; the Accounts list is cramped at 710px with a long owner; Restore has no review. Pre-existing: the history table scrolls inside its card at 710px (slice 04).
- Watch for: `MembersCard` focus handling uses `data-member-edit` and `data-member-action`; new e2e spec `12-members.spec.ts` renames Alex Doe to Alex Patel and must stay last among the household specs; account edit now locks the account row first (`ActivityStore.lockAccount`).
- Next: slice 06 (savings accounts, 9 IDs, new account type). Owner checkboxes already support joint savings (foundations 9); per-type owner limits (exactly one for retirement types) arrive with those types.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator found gaps after the build again (entered-by not enforced on the server, an unlocked account edit, lock claims with no test) and my first race test passed without the lock; the click-through found a layout fault with a long name.
- What went well: tests first on all three groups, deterministic race tests with mutation checks, the owner's detailed click-through found only layout and wording faults, fixed the same day.
- Process change to try: enforce a member-state rule where the server writes; race tests hold an uncommitted write on a second connection; try a long name and label at 710px (added to the Build step).
