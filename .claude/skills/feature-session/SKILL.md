---
name: feature-session
description: Use when starting a session to build one slice (a set of scenario IDs from docs/requirements, in docs/features/slices.txt), or the foundations session, in this repo. One slice per session; also use when asked how a session should be run, time-boxed, validated and handed off.
---

# Feature session

One row (slice) of `docs/features/INDEX.md` per session; its scenario IDs are in `docs/features/slices.txt` and may span several feature files (D-018). All state lives in the repo, so start cold: do not rely on any earlier
conversation. Never start a second row in the same session.

**REQUIRED SUB-SKILLS:** `preflight` first, then `feature-slice` for the build, and `superpowers:test-driven-development`.

## Timeline

Record the start time. If a limit is hit, apply the stop rule below instead of pushing on.

| Step | Limit | Do |
| --- | --- | --- |
| 1 Orient | 10 min | `preflight`. Read `INDEX.md`, the slice's IDs in `slices.txt`, the feature files that contain them and `dependency-map.md`, `docs/guides/domain-foundations.md`, `docs/decisions/decisions.md`, the open rows in `docs/decisions/questions.md`, the last `docs/process/retro.md` rows and the previous slice's handoff. Copy `TEMPLATE.md` to `docs/features/slice-NN-<name>.md` and paste the kickoff prompt into its "Prompts and directions" |
| 2 Gap analysis | 10 min | Compare each scenario ID with the code that exists, and confirm each ID of the slice is citeable now (the map says it should be). If one is blocked, say so at checkpoint 1 and defer it whole (D-016); if fewer than half are citeable the map is wrong, so lead with that. Open v1 at `http://localhost:3000` only to settle an unclear scenario (read only) |
| 3 Task list | | Group scenarios, give each group a test level (unit, API, UI, e2e), write it in the feature notes |
| **Checkpoint 1** | | Show the task list and stop. Proceed only when the user approves it; record the answer in the notes |
| 4 Build | 20-30 min per group | `feature-slice`, test first. Every test cites its scenario ID. A save with an idempotency key or a state swap also gets a concurrent-save test and a retry-after-the-ledger-changed test (slices 02, 03 and 04 each had a race found only by the validator). When a capability changes a row that other saves read (opening amount, start date, status), list every writer of that row, take the account lock in each and race each one against the change. Edit forms start from the current values and show the original. Every new page or panel gets a Playwright assertion at 710px and 1280px (panel in view, no sideways scroll), and every form one for the first error being in view and focused |
| 5 Prove | | `npm run coverage -- --require --slice NN` (plus `--require <path>` for each feature file this slice completes), `npm test`, `npm run e2e`, `npm run lint` (Checkstyle runs here, not in `check`), `npm run check`; then run the `validator` agent and fix its findings before Checkpoint 2, not after |
| **Checkpoint 2** | | Start the app (`npm run dev`), then click every new path yourself at 710px and at 1280px wide: the panel it opens is in view, nothing scrolls sideways, figures and dates match the other tables (slices 01a and 02 each had UI faults found only by the user). Tell the user what to click, wait for their view |
| 6 Land | | Write the retro row and update the `INDEX.md` row first, then commit in logical pieces (push only when the owner says, D-002), fill the notes' handoff. Promote cross-cutting choices to `docs/decisions/decisions.md` and add open questions to `docs/decisions/questions.md` |
| 7 Retro | | Append a row to `docs/process/retro.md`. If the same problem is already there, change the process now (promotion rule) and log it in `docs/process/improvements.md` |

## Stop rules

- A scenario blocked for 15 minutes: add it to `docs/features/deferred.txt` as `<ID> <reason>`, move on.
- Budget used up: commit a green checkpoint, mark the row `partial`, write the handoff.
- `main` must be green and `npm run e2e` passing at the end of every session, even a partial one.
- Never report a check as passing unless you ran it. Never edit a `.feature` file; record disagreements as decisions.

## Done

The coverage script shows no missing scenarios for the slice (deferred ones listed with reasons), the validator
report is clean, `npm run e2e` passes, everything is pushed and the row says `done`.

## Session 0: foundations

Target: `docs/guides/domain-foundations.md`, one page of decisions, no feature code. Cover, with the reason for each:
money type and JSON format, currency scope, dated balances and "balance as of a date", an injectable clock with a fixed
"today" for tests and e2e, the account type model, the activity (ledger) table shape, linked transfers and card
payments, corrections that never become income, member ownership and joint accounts, archive/close/delete rules, and
test-ID citation. Present the page for approval (checkpoint 1) and stop; commit it and update the row after approval.
