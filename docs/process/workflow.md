# How we work

One slice (capabilities plus the scenario IDs they make citeable; D-018) is built per session, in a fresh session, in the order on
[`features/INDEX.md`](../features/INDEX.md). The runbook is the `feature-session` skill; this page is the summary.

## The loop

1. **Start**: paste the kickoff prompt from [prompts.md](prompts.md). The session reads the repo, not any earlier chat.
2. **Checkpoint 1**: you approve the task list (scenario groups and test levels). Nothing is built before this.
3. **Build**: test first, every test cites its scenario ID. Stuck for 15 minutes means defer the scenario with a reason.
4. **Prove**: `npm run coverage -- --require <path>`, `npm test`, `npm run e2e`, `npm run check`, then the `validator` agent.
5. **Checkpoint 2**: you look at the running app.
6. **Land**: commit in logical pieces, push, update the board, write the handoff in the feature notes.
7. **Retro**: one row in [retro.md](retro.md). The same problem twice means a process change, logged in
   [improvements.md](improvements.md).

## Where things live

| Question | Place |
| --- | --- |
| What is built, and what is next | `features/INDEX.md` |
| What happened in one feature, including the prompt and your directions | `features/<area>-<name>.md` |
| A choice that affects more than one feature | `decisions/decisions.md` |
| Something waiting on the product owner | `decisions/questions.md` |
| What slowed us down and what we changed | `process/retro.md`, `process/improvements.md` |
| How to build and what to avoid | `guides/` |
| Reusable prompts | `process/prompts.md` |

## Roles

You decide scope and approve at the two checkpoints. The assistant builds. The `validator` agent checks the result
independently and cannot edit. The `pattern-reviewer` agent checks conformance to `guides/patterns.md`. Hooks check
every commit and push. No agent approves its own work, and no agent approves on your behalf.

## Rules that never bend

- `main` is green and `npm run e2e` passes at the end of every session, even a partial one.
- Never report a check as passing unless it was run. Never edit a `.feature` file.
- Synthetic data only. No secrets, real financial records or private reasoning in any document.
