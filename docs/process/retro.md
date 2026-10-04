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
