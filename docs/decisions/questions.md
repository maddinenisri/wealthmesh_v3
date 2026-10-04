# Questions

| ID | Date | Question | Status | Answer | Decision |
| --- | --- | --- | --- | --- | --- |
| Q-001 | 2026-10-04 | What is v1 on port 3000 for? | resolved | Go with the recommendation: a read-only UX reference | D-011 |
| Q-002 | 2026-10-04 | Approve the task list per feature or per scenario group? | resolved | Per feature (recommended) | D-009 |
| Q-003 | 2026-10-04 | Start with the foundations session, or straight to household setup? | resolved | Foundations first (recommended) | D-008 |
| Q-004 | 2026-10-04 | Upgrade the three tools behind latest: TypeScript 6 to 7, msw 2 to 3, Gradle 9.7.1 to 9.8? | open | | |
| Q-005 | 2026-10-04 | Fix the smaller review suggestions now (parsers throw `ApiError`, `danger` Button token, unused `UNIQUE (household_id, id)`, split the member form hooks, clearer 409 messages), or fold them into the features that touch them? | open | | |
| Q-006 | 2026-10-04 | Pull `accounts/savings/setup` into wave 1, right after `accounts/checking/setup`? Same shape as checking; it unblocks `set-up-household` 004 and parts of members and overview. Default if unanswered: keep it in wave 2. | resolved | Keep it in wave 2 (2026-10-04) | D-015 |
| Q-007 | 2026-10-04 | When only part of a scenario can be built (for example `V2_CHECKING_002` without salary), defer the whole ID with a note and cite it from no test until it passes? Recommended: yes, so coverage never overstates. | resolved | Yes (2026-10-04) | D-016 |
