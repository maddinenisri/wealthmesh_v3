# Foundations (row 00)

- Feature file: none. Output is `docs/guides/domain-foundations.md` (no scenario IDs, no feature code).
- Status: done
- Started: 2026-10-04 10:25 EDT  Finished: 2026-10-04  Commit: see git log

## Prompts and directions

- Kickoff prompt (v1, plus one added paragraph):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for row 00 foundations.
Repository facts supersede this prompt. Stop at the task-list approval and again when the work is ready to review.

That session will read the board, decisions/decisions.md and the open questions (including Q-006 and Q-007), then stop for your approval. You can answer Q-006 and Q-007 at that checkpoint or leave them for later.
```

- 2026-10-04 Q-006 answer (given while the session ran): leave `accounts/savings/setup` in wave 2.
- 2026-10-04 Q-007 answer: yes, defer the whole scenario ID when only part can be built.
- 2026-10-04 Checkpoint 1 answer: approved; commit and push after verification; Q-004, Q-005 left open
- Checkpoint 2 answer: n/a (docs only)

## Scope

No scenario IDs. One page of decisions covering the 11 topics in the `feature-session` skill, "Session 0".

## Decisions

Foundation rules live in `docs/guides/domain-foundations.md`. Promoted on approval: Q-006 and Q-007 answers.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| Draft the foundations page (11 topics) | none | review by owner | done |
| Record Q-006, Q-007 answers | none | docs | done |

## Coverage

Not applicable (no scenarios).

## Open questions

Q-004, Q-005 still open (see `docs/decisions/questions.md`).

## Handoff

Next: row 01 `accounts/checking/setup`. It needs the account, activity, owner tables from the page and the clock bean.
Row 01 should also add `GET /api/v1/today` and the `WEALTHMESH_CLOCK_FIXED_TODAY` export in `e2e/start-stack.sh`.

## Retro (3 lines, also appended to `docs/process/retro.md` after approval)

- What slowed this session: waiting on checkpoint; Q-006/Q-007 answered mid-run
- What went well: coverage script and e2e stack read first, so the citation and clock rules match real code
- Process change to try: none (first occurrence)
