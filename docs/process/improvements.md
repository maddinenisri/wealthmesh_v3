# Improvement ledger

Every change made to the process itself, newest last. A row is added when the retro promotion rule fires (same problem
in two [retro](retro.md) rows) or when a session finds a process defect on its own. Each row names the change and the
commit, so the effect can be judged in later retro rows.

| Date | Trigger | Change | Where | Commit |
| --- | --- | --- | --- | --- |
| 2026-10-04 | First setup was slow; integration bugs found late | `preflight` skill, pitfalls list, setup playbook with gates | `.claude/skills/preflight`, `guides/` | 32dfe62 |
| 2026-10-04 | Guard misreported the UI under `pipefail`; found only by running the script | Script self-tests plus a hook; lesson "test guards by running the script" | `scripts/test-run-backend-jar.sh`, `guides/pitfalls.md` | 6018d0c, 988e639 |
| 2026-10-04 | A pattern review found untested validation and missing API tests after the build | `validator` and `pattern-reviewer` agents; validator runs before landing | `.claude/agents/` | 3e1ff41 |
| 2026-10-04 | No way to prove every requirement scenario has a test | Scenario coverage script citing `@V2_...` IDs | `scripts/scenario-coverage.sh` | 3e1ff41 |
| 2026-10-04 | Process notes had no home; v2's heavy registers were rejected | Docs organised into guides, process, decisions, features | `docs/` | see git log |

## How to judge a change

After three sessions, read the retro rows that followed it. If the problem it targeted is gone, keep it. If it
did not help, or added ceremony, remove it and say so here.
