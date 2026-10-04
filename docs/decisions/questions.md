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
| Q-008 | 2026-10-04 | `V2_CHECKING_001` says the starting amount is not counted as September income, but there is no income figure until row 04. Does proving it structurally (opening amount is not an activity row; detail shows empty activity) count as built? Recommended: yes. If no, 001 defers whole. | resolved | Yes, as recommended (2026-10-04) |  |
| Q-009 | 2026-10-04 | Promote to `decisions.md`: the opening amount lives on the account row (`opening_amount`, `opened_on`), not as an activity row? Refines foundations 5 and 10. Recommended: yes. | resolved | Yes, as recommended (2026-10-04) | D-017 |
| Q-010 | 2026-10-04 | Until row 03, should "Update balance" and the money in/out/transfer actions be visible but inactive (Update balance opens an amount-and-date form whose save is disabled), or hidden? Recommended: visible and inactive, with a note. | resolved | Yes, as recommended (2026-10-04) |  |
| Q-011 | 2026-10-04 | Refuse an account opening date after today (400)? Not in the scenarios; from foundations 4. Recommended: yes. | resolved | Yes, as recommended (2026-10-04) |  |
| Q-012 | 2026-10-04 | `V2_MEMBERS_001` says both names are available for owner choice and "who entered a record". The entered-by chooser needs activity (rows 03, 05). Build 001 now (owner choice only) or defer it whole (D-016)? Differs from Q-008: there the missing piece was a report, proved structurally; here it is a UI element (the entered-by chooser) with no form to live in. Recommended: defer whole; the owner half is still built and tested without citing the ID. | resolved | Defer whole (2026-10-04) | |
| Q-013 | 2026-10-04 | Build the per-person account filter and joint-account note now (half of `V2_MEMBERS_002`, without totals) and member name change history (half of 005)? Recommended: yes, both small. | resolved | No for now; build each when a scenario that cites it can pass (2026-10-04) | |
| Q-014 | 2026-10-04 | `DELETE` of a member who owns an account: answer 409 "Deactivate instead" and keep deleting unowned members? Recommended: yes. | resolved | Yes, fixed now (2026-10-04) | |
