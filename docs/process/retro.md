# Process retro log

The feedback loop. Each session appends one row when it finishes: what slowed it down, and one change to try. Do
not rewrite old rows.

**Promotion rule:** when the same problem appears in two rows, change the process in that session: update a skill,
`AGENTS.md`, a doc or a script, put the commit hash in the last column and add a row to `improvements.md`. A problem that only shows up once stays
a note.

| Date | Session | What slowed it | Change to try | Promoted (commit) |
| --- | --- | --- | --- | --- |
| 2026-10-04 | setup (project bootstrap) | Integration bugs found late; port and JDK surprises | Added `preflight`, pitfalls list and playbook gates | `docs: add project playbook` |
