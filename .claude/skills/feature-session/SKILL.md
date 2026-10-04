---
name: feature-session
description: Use when starting a session to build one feature file from docs/requirements, or the foundations session, in this repo. One feature per session; also use when asked how a session should be run, time-boxed, validated and handed off.
---

# Feature session

One row of `docs/features/INDEX.md` per session. All state lives in the repo, so start cold: do not rely on any earlier
conversation. Never start a second row in the same session.

**REQUIRED SUB-SKILLS:** `preflight` first, then `feature-slice` for the build, and `superpowers:test-driven-development`.

## Timeline

Record the start time. If a limit is hit, apply the stop rule below instead of pushing on.

| Step | Limit | Do |
| --- | --- | --- |
| 1 Orient | 10 min | `preflight`. Read `INDEX.md`, the feature file, `docs/guides/domain-foundations.md`, `docs/decisions/decisions.md`, the open rows in `docs/decisions/questions.md`, the last `docs/process/retro.md` rows and the previous feature's handoff. Copy `TEMPLATE.md` to `docs/features/<area>-<name>.md` and paste the kickoff prompt into its "Prompts and directions" |
| 2 Gap analysis | 10 min | Compare each scenario ID with the code that exists, and count how many are citeable now (not blocked on a later row). If fewer than half, the checkpoint 1 message leads with "move this row later" as the first option, before any task list. Open v1 at `http://localhost:3000` only to settle an unclear scenario (read only) |
| 3 Task list | | Group scenarios, give each group a test level (unit, API, UI, e2e), write it in the feature notes |
| **Checkpoint 1** | | Show the task list and stop. Proceed only when the user approves it; record the answer in the notes |
| 4 Build | 20-30 min per group | `feature-slice`, test first. Every test cites its scenario ID |
| 5 Prove | | `npm run coverage -- --require <path>`, `npm test`, `npm run e2e`, `npm run check`; then run the `validator` agent |
| **Checkpoint 2** | | Start the app (`npm run dev`), tell the user what to click, wait for their view |
| 6 Land | | Commit in logical pieces, push, update the `INDEX.md` row, fill the notes' handoff. Promote cross-cutting choices to `docs/decisions/decisions.md` and add open questions to `docs/decisions/questions.md` |
| 7 Retro | | Append a row to `docs/process/retro.md`. If the same problem is already there, change the process now (promotion rule) and log it in `docs/process/improvements.md` |

## Stop rules

- A scenario blocked for 15 minutes: add it to `docs/features/deferred.txt` as `<ID> <reason>`, move on.
- Budget used up: commit a green checkpoint, mark the row `partial`, write the handoff.
- `main` must be green and `npm run e2e` passing at the end of every session, even a partial one.
- Never report a check as passing unless you ran it. Never edit a `.feature` file; record disagreements as decisions.

## Done

The coverage script shows no missing scenarios for the file (deferred ones listed with reasons), the validator
report is clean, `npm run e2e` passes, everything is pushed and the row says `done`.

## Session 0: foundations

Target: `docs/guides/domain-foundations.md`, one page of decisions, no feature code. Cover, with the reason for each:
money type and JSON format, currency scope, dated balances and "balance as of a date", an injectable clock with a fixed
"today" for tests and e2e, the account type model, the activity (ledger) table shape, linked transfers and card
payments, corrections that never become income, member ownership and joint accounts, archive/close/delete rules, and
test-ID citation. Present the page for approval (checkpoint 1) and stop; commit it and update the row after approval.
