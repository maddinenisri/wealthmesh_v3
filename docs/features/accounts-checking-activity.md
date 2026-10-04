# Checking activity (row 03)

- Feature file: `docs/requirements/v2/accounts/checking/activity.feature`
- Status: dissolved into slices 01, 02, 03, 04, 07, 12 of `INDEX.md` (D-018, Q-F); this file keeps the gap analysis
- Started: 2026-10-04 12:46 EDT  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v1, plus addendum):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for accounts/checking/activity.feature.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

Addendum: at Orient, count how many of the file's scenarios can be fully cited now (D-016). If fewer than half, say so at
checkpoint 1 and offer to move the row later, before showing any task list.
```

- Checkpoint 1 answer: pending

## Scope

11 scenarios: `@V2_CHECKING_007`, `008`, `009`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `018`.

## Gap analysis

Code today: `account`, `account_owner`, clock, money helpers, members. No `activity` table, no income, expense,
category, transfer, savings or wealth code (grep of `backend/src/main` and `frontend/src`; only migrations V1, V2).

"Citeable now" = every Given/When/Then step can be built and passed without a later row (D-016).

| ID | Blocked on | Citeable now |
| --- | --- | --- |
| 007 | income (04), Rent expense (05), savings (09), income/spending report (04, 05) | no |
| 008 | expense entry and edit (05), category Rent (13), spending report | no |
| 009 | household wealth (06), income/spending report (04, 05), grocery expense (05) | no |
| 010 | savings account (09) | no |
| 011 | expense form, Groceries category (05, 13) | no |
| 012 | savings (09), inactive/restore (18) | no |
| 013 | expense (05), spending report | no |
| 014 | expense form, Bank fees category (05, 13) | no |
| 015 | household wealth (06), bill expense (05) | no |
| 016 | expense entry (05) | no |
| 018 | income (04), income/spending report | no |

**Count: 0 of 11 citeable now** (strict D-016). Closest: 008, 009, 013, 018 would need only the `activity` table
plus a minimal spending/income summary, but that pulls in rows 04 and 05 reporting, and 009 also needs wealth (06).
Even with those, 010, 012, 014, 015, 016 and 007 stay blocked on savings, categories, archive or wealth.
The keyword check ("7 of 11 stay within checking") counted account mentions, not the other steps each scenario needs.
The `activity` table, correction flow and balance-with-activity are real row-03 groundwork, but no scenario ID can be cited.

## Decisions

None yet.

## Task list (approved at checkpoint 1)

Not written: fewer than half citeable, so the row move is offered first.

## Coverage

Not started.

## Open questions

- Q-015 (resolved 2026-10-04): dissolved by Q-F; see `docs/decisions/questions.md`.

## Handoff

(pending)
