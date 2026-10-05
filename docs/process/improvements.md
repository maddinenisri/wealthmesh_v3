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
| 2026-10-04 | Second row placed by position turned out acceptance-shaped (row 02: 1 of 6 citeable) | Orient counts citeable scenarios; under half, checkpoint 1 offers "move this row later" first | `.claude/skills/feature-session/SKILL.md` | see git log |
| 2026-10-04 | Third ordering miss: board by folder name, row 02 by position, row 03 by keyword count (0 of 11 citeable) | Capability dependency map; one session per slice; `--slice` coverage; seeded categories, strict Givens (D-018 to D-021) | `features/dependency-map.md`, `features/INDEX.md`, `features/slices.txt`, `scripts/scenario-coverage.sh`, `feature-session` skill | see git log |
| 2026-10-04 | Scripted edits misapplied again and again (three times in one session, plus the row 01 retro): a paren mismatch, a clobbered config, a silently failed insert | Rule: scripted edits assert the match or use the Edit tool; grep to prove a multi-file change landed | `AGENTS.md` | see git log |
| 2026-10-04 | Slice 01a retro said "run lint before reporting backend work done" but the skill's Prove step never listed it (`check` skips Checkstyle) | `npm run lint` added to the Prove step and the feature-slice finish line; a retro lesson that is a command goes into the skill at once | `.claude/skills/feature-session`, `.claude/skills/feature-slice` | see git log |
| 2026-10-04 | UI faults found only at checkpoint 2, twice (01a state bugs; 02 panels opening off-screen, history overflow, mismatched formats) | Checkpoint 2 now requires clicking each new path at 710px and 1280px first | `.claude/skills/feature-session/SKILL.md`, see git log |
| 2026-10-04 | The validator found a race or retry bug after the build in slices 02 and 03 | Build step: any keyed or state-swapping save gets a concurrent-save test and a retry-after-ledger-change test before the Prove step; edit forms prefill and show original values | `.claude/skills/feature-session/SKILL.md` | see git log |
| 2026-10-04 | Process check after slice 03: checkpoint-2 faults recurred as new variants; validator findings landed after the build; prompts.md and workflow.md had drifted from the board | Build step requires Playwright assertions at 710px and 1280px and first-error focus; validator findings fixed before Checkpoint 2; Land writes retro and board rows before the closing commit; push only on the owner's word (D-002); prompt and workflow wording aligned | `.claude/skills/feature-session/SKILL.md`, `docs/process/workflow.md`, `docs/process/prompts.md` | see git log |
| 2026-10-04 | The validator found races after the build a third time (slice 04): keyed saves were tested, but other writers of the account row were not raced against a new capability that changes it | Build step: when a capability changes a row that other saves read (opening, start date, status), list every writer of that row, take the account lock in each and race each against the new change | `.claude/skills/feature-session/SKILL.md` | see git log |
| 2026-10-05 | The validator found gaps after the build a fourth time (slice 05): a member-state rule enforced only in the UI, an unlocked writer, lock claims without a committed test | Build step: enforce a state rule where the server writes, at every use of the member; a race test holds an uncommitted write on a second connection and fails when the lock is removed; try a long name and label at 710px | Read the retro rows after slice 07; if validator findings on locks and rules are gone, keep |
| 2026-10-05 | The validator found gaps after the build a fifth time (slice 06): a Balance correction could be moved through the raw API (guard only in the UI), an enterer checked before the lock, a keyed retry that raced itself; the owner found a review panel cut off at 710px (content swapped in place, not scrolled) | Build step: a raw-API test of every forbidden case a feature adds, scroll and focus on content that swaps in place, an e2e waits for a save before leaving the page | Slice 07 retro: did the validator find a UI-only guard? |

## How to judge a change

After three sessions, read the retro rows that followed it. If the problem it targeted is gone, keep it. If it
did not help, or added ceremony, remove it and say so here.
