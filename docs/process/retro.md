# Process retro log

The feedback loop. Each session appends one row when it finishes: what slowed it down, and one change to try. Do
not rewrite old rows.

**Promotion rule:** when the same problem appears in two rows, change the process in that session: update a skill,
`AGENTS.md`, a doc or a script, put the commit hash in the last column and add a row to `improvements.md`. A problem that only shows up once stays
a note.

| Date | Session | What slowed it | Change to try | Promoted (commit) |
| --- | --- | --- | --- | --- |
| 2026-10-04 | setup (project bootstrap) | Integration bugs found late; port and JDK surprises | Added `preflight`, pitfalls list and playbook gates | `docs: add project playbook` |
| 2026-10-04 | planning (status board order) | The board was ordered by README folder names; the first file, `household/setup`, needs six later account types | Order by reading scenarios and grepping cross-type references; the count is now in each wave-1 Notes cell | first occurrence, none |
| 2026-10-04 | 00 foundations | Idle time at checkpoint; open questions answered mid-run | Read the coverage script and e2e stack before writing rules | first occurrence, none |
| 2026-10-04 | 01 accounts/checking/setup | Tests that need an empty database collided (shared Spring context; file-ordered e2e specs); an edit script failed on quoting and I only noticed because I re-read the "green" output | Pitfalls 34 and 35 written; numbered e2e specs; `@DirtiesContext` on API test classes; check that an edit script printed "applied" before running tests | first occurrence, none |
| 2026-10-04 | 02 household/members/manage-members (parked) | Row placed by position; 1 of 6 scenarios citeable, found only at checkpoint 1; same miss as the board-order error | Orient counts citeable scenarios; under half, checkpoint 1 offers "move this row later" before any task list | `feature-session` Orient step, see `improvements.md` |
| 2026-10-04 | 03 accounts/checking/activity (dissolved) | Row placed by position again; 0 of 11 citeable, found at orient; the keyword count counted account mentions, not the other steps | Map every scenario to capabilities and order by them (`dependency-map.md`); rows become slices (D-018) | `improvements.md`, see git log |
| 2026-10-04 | planning (dependency map) | Reading 39 files took most of the box; the first board counted references, not steps | Scripted checks on the map (262 IDs, placement = latest capability); asked for answers to Q-016 to Q-023 at one checkpoint | `improvements.md`, see git log |
| 2026-10-04 | 01a checking money out | Checkstyle failed only in lint and push, not in `npm run check`; UI state bugs (open category across months, late date check) found only by looking at the running app | Pitfall 36; run lint before reporting backend work done; click the main path once before the checkpoint | first occurrence, none |
