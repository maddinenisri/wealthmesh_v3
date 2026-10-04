# Manage members (row 02)

- Feature file: `docs/requirements/v2/household/members/manage-members.feature`
- Status: parked, `todo` on the board (mirror the row in `INDEX.md`)
- Started: 2026-10-04  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v1, plus one added paragraph; not yet in `docs/process/prompts.md`):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for household/members/manage-members.feature.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

Row 02 has 6 scenarios. Read docs/features/accounts-checking-setup.md first (handoff). Account owners already use the account_owner join; this row adds the member-side rules and joint accounts. Deleting a member who owns an account returns 500 today (FK), so members need active=false per foundations 9. Specs share one database: number new e2e specs (pitfall 35) and use @DirtiesContext on API test classes (pitfall 34). Defer whole any scenario that depends on a later feature (D-016).

I haven't checked the row 02 scenarios, so the last line is a general rule. The session will do the gap analysis. The prompt is not yet in docs/process/prompts.md; the session saves it in the feature notes.
```

- 2026-10-04 Checkpoint 1 answer: task list not approved. Park row 02, build row 03 next, revisit after row 05. Q-012: defer 001 whole. Q-013: no for now, build each when a scenario that cites it can pass. Q-014: yes, fixed now as a separate commit-sized change.
- Checkpoint 2 answer:

## Scope

6 scenarios: `@V2_MEMBERS_001` to `@V2_MEMBERS_006`. Plumbing: `household_member.active`, member name history,
joint owners in the account form, member filter on the accounts list.

## Gap analysis

Code today: member add/list/rename/delete API and household screen; `account_owner` join; the account form offers one
owner. No `active` column, no name history, `DELETE` of an owning member returns 500 (FK).

| ID | State | Needs |
| --- | --- | --- |
| 001 | half blocked | Add two members and choose either as owner: exists. "Who entered a record" chooser needs activity (rows 03, 05). |
| 002 | blocked | 401k and Traditional IRA (wave 3), total assets (row 06). Joint view and per-person filter are built without citing the ID. |
| 003 | blocked | Correction with entered-by member and reason needs `activity` (row 03). |
| 004 | blocked | 401k with contribution history (wave 3, row 03). Deactivate and restore are built on a checking account without citing the ID. |
| 005 | blocked | Saved expense entered by Maya (row 05). Rename with profile change history is built without citing the ID. |
| 006 | buildable | Joint checking exists (row 01); cancel is a UI path; "history" is empty until row 03. |

## Decisions

Feature-local, proposed (see open questions):

1. `household_member.active BOOLEAN NOT NULL DEFAULT TRUE` (migration `V3`). `POST /api/v1/household-members/{id}/deactivate`
   and `/restore`; the "review" and cancel are UI only. Responses gain `active`.
2. Inactive members are refused as a new owner (400 "Choose an active member"), but an existing inactive owner may
   stay on an account when it is edited. Owner text reads "Sam, inactive member".
3. `DELETE /household-members/{id}`: 409 "Deactivate this member instead" when the member owns an account; unchanged
   otherwise (fixes the 500).
4. Rename keeps the earlier name: table `member_name_change(member_id, old_name, old_label, changed_at)`, listed on the
   member row. No money or ownership rows are touched.
5. Account form: owner field becomes a multi-select of active members (checkboxes), at least one (checking and
   savings may be joint, foundations 9).
6. Accounts list gets a filter: Whole household / each member. Joint accounts show once in each person's view, with an
   explanation line. No totals (wealth is row 06).
7. e2e spec `03-members.spec.ts`, API test classes `@DirtiesContext`. It extends the row 01 account (edit it to add a
   second owner, then deactivate and restore) rather than creating a new one: cheaper, and it exercises the
   inactive-owner-stays rule.
8. Implementation shape, rule 2: `AccountService.checkOwners` on edit allows an inactive member only if already in
   `owners.ownersOf(id)`; on create, or for a newly added owner, an inactive member is refused.
9. Frontend `active` plumbing: `parseMember` reads it, `OwnerOptions` lists active members only (plus the account's
   current owners on edit), `memberLabel`/`ownerNames` append ", inactive member", and the `test/mockApi.ts` fixtures
   gain `active`.
10. Owner cardinality: checking is one or more owners; per-type limits (foundations 9, exactly one for retirement
    types) arrive with those types. No switch now.

## Task list (not approved; parked)

Effect: 1 of 6 scenarios citable (006); 002 to 005 defer whole (wave 3, rows 03 to 06); 001 depends on Q-012. The row ends `partial`.

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A. Member rules: `V3` migration, deactivate/restore, inactive owner rule, delete guard, name history | none (halves of 004, 005) | unit + API | todo |
| B. Joint owners: multi-owner account form (edits landed row 01 tests: `02-checking-setup.spec.ts` and `CheckingSetup.test.tsx` owner selection), "Sam, inactive member" owner text, member filter and joint note | none (half of 002) | API + UI (MSW) | todo |
| C. Members screen: deactivate review and cancel, restore, inactive section, rename history | `V2_MEMBERS_006` (cancel); 001 pending Q-012 | UI (MSW) + e2e | todo |
| D. Deferred whole | `V2_MEMBERS_002`, `003`, `004`, `005` (and `001` if Q-012 says defer) | none (rows in `deferred.txt`) | todo |

## Coverage

## Open questions

See `docs/decisions/questions.md` Q-012 to Q-014.

## Handoff

- Parked, nothing built except the member delete guard: deleting a member who owns an account now returns 409 "This member owns an account and cannot be deleted." (was 500). Test: `HouseholdMemberApiTests.deleteRefusedWhenMemberOwnsAnAccount`.
- Revisit after row 05: 001, 003, 005 and 006 become citeable; 002 and 004 wait for wave 3. The decisions and task groups above are a starting point, not approved.
- Deactivation (`active`) is still to build, and the 409 message should then point to it.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the row was placed by position, not by counting citeable scenarios; only 1 of 6 was buildable, found at checkpoint 1
- What went well: the gap analysis and the advisor caught that group B edits landed row 01 tests before approval
- Process change to try: Orient counts citeable scenarios; under half means offer "move this row later" first
