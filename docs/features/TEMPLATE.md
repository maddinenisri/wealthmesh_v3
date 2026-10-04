# <feature name>

Copy this file to `docs/features/<area>-<name>.md` at the start of the session. One file per feature, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Feature file: `docs/requirements/v2/<path>.feature`
- Status: todo / in-progress / partial / done (mirror the row in `INDEX.md`)
- Started: <date>  Finished: <date>  Commit: <hash>

## Scope

Scenario IDs in this session (all of them, unless a split is recorded): `@V2_...`

## Decisions

Choices made that the feature file does not settle, each with the reason. Foundation rules live in
`docs/05-domain-foundations.md`; do not restate them, only link.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| e.g. create a checking account | `V2_..._001`, `V2_..._002` | API + UI (MSW) + e2e | todo |

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

## Coverage

Filled from `npm run coverage -- <path>`: ID, test file, level. Deferred or blocked IDs also go in
`deferred.txt` with a reason.

## Open questions

Anything that needs the product owner. Mark the answer and date when resolved.

## Handoff

What the next session must know that is not in the code: what is half-built, what to watch for, what v1 showed.

## Retro (3 lines, also appended to `RETRO.md`)

- What slowed this session:
- What went well:
- Process change to try:
