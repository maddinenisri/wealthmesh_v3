# Prompt library

The reusable prompts, versioned. Improve a prompt by editing it here and adding a line to the change log; the retro
log says when a prompt caused trouble. Prompts contain no secrets and no real financial data.

## What is preserved for each feature

Not transcripts. For each feature session, the feature notes file (`features/slice-NN-<name>.md`) keeps, under
"Prompts and directions":

1. the exact kickoff prompt that started the session (the version and any change you made to it),
2. your answers at each checkpoint and any instruction that changed the plan, with the date,
3. the approved task list (already in the notes).

That is enough to replay or audit a session. Scenarios are not given prompts of their own: a scenario is traced by its
ID to its tests, and its task group appears in the task list.

## Kickoff: slice session (v2)

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice <NN> in docs/features/INDEX.md.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

## Kickoff: foundations session (v1)

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for row 00 foundations.
Repository facts supersede this prompt. Stop at the task-list approval and again when the work is ready to review.
```

## Validator brief (v1)

```text
Validate <revision or staged changes> in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Claims to verify: <list>.
Record the tested revision, run the checks, tie each claim to evidence, plant one defect to confirm a test or hook
fails (then undo it), and report what you did not run.
```

## Pattern review brief (v1)

```text
Review <paths or diff> against docs/guides/patterns.md and AGENTS.md. Report Blocking and Suggestions with file,
line and the guide section for each. Say briefly what conforms.
```

## Change log

| Date | Prompt | Change | Why |
| --- | --- | --- | --- |
| 2026-10-04 | all | Created at version 1 | Preserve what starts and checks each session |
| 2026-10-04 | kickoff | Feature session v1 becomes slice session v2: names a slice, not a feature path (D-018) | Feature files cut across capabilities; rows 02 and 03 stalled |
