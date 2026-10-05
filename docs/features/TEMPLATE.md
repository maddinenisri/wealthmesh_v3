# <slice NN: name>

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: NN in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `docs/requirements/v2/<path>.feature`
- Status: todo / in-progress / partial / done (mirror the row in `INDEX.md`)
- Started: <date>  Finished: <date>  Commit: <hash>

## Prompts and directions

Paste, verbatim, the kickoff prompt that started this session (see `docs/process/prompts.md`, note its version), then
add each instruction or answer the product owner gave at a checkpoint, with the date. No transcripts, no secrets.

- Kickoff prompt (v2):
- <date> Checkpoint 1 answer:
- <date> Checkpoint 2 answer:

## Scope

Scenario IDs in this session (all of them, unless a split is recorded): `@V2_...`

## Decisions

Choices made that the feature file does not settle, each with the reason. Keep feature-local choices here; promote
a choice to `docs/decisions/decisions.md` only when other features will rely on it. Foundation rules live in
`docs/guides/domain-foundations.md`; do not restate them, only link.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| e.g. create a checking account | `V2_..._001`, `V2_..._002` | API + UI (MSW) + e2e | todo |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

### Inventory

Every shared row or state this slice changes, with each reader and writer (grep result, not memory):

| Row or state | Readers | Writers | Race test |
| --- | --- | --- | --- |

## Coverage

Filled from `npm run coverage -- --slice NN`: ID, test file, level. Deferred or blocked IDs also go in
`deferred.txt` with a reason.

## Open questions

Anything that needs the product owner. Add it to `docs/decisions/questions.md` as well (that is the register the
next session reads), and mark the answer and date in both places when resolved.

## Cowork findings

| # | Check | Result | Fault seen | Test added |
| --- | --- | --- | --- | --- |

## How it works

Written after Land by a read-only agent and checked against the code (brief in `docs/process/prompts.md`): what the
user can do now, what changed, how the main path works, decisions and open items, how to verify.

## Handoff

What the next session must know that is not in the code: what is half-built, what to watch for, what v1 showed.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session:
- What went well:
- Process change to try:
