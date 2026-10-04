---
name: feature-slice
description: Use when adding a new entity, endpoint or screen to this app end to end, spanning the database, API, UI and tests
---

# Feature slice

One vertical slice, in this order. Patterns are in `docs/02-patterns.md`; file roles in `docs/03-key-functions.md`.

**REQUIRED SUB-SKILL:** `superpowers:test-driven-development`. Write the failing test, watch it fail, then implement.

| # | Step | Where | Gate |
| --- | --- | --- | --- |
| 1 | Migration with schema-qualified tables, UUID defaults, constraints | `backend/src/main/resources/db/migration/V<n>__*.sql` | `npm run backend:test` |
| 2 | `domain/` record, `dto/` request and response, `mapper/` | `backend/.../<feature>/` | compiles; mapper compiles on records |
| 3 | `repository/`, `service/` (400 validation, 409 on constraint, 404), thin controller under `/api/v1` | same | |
| 4 | Ordered API test on the shared Testcontainers config, including conflict and blank-input cases | `backend/src/test/java/...` | `npm run backend:test` |
| 5 | `api/<feature>.ts` with parsers, then `hooks/` queries and mutations that invalidate the key | `frontend/src/` | `npm run typecheck` |
| 6 | Screen in `features/<feature>/` using `TextField`, `FormAlert`, design-system components, route with `handle.title` | same, `routes.tsx` | `npm run lint` |
| 7 | Vitest + MSW: extend `test/mockApi.ts` with the new rules; cover success, validation without a request, server error | `*.test.tsx` | `npm run frontend:test` |
| 8 | One Playwright journey spec | `e2e/tests/` | `npm run e2e` |

## Before finishing

- Every test names the scenario ID it covers (`V2_..._001` in the title or a comment). Check with `npm run coverage -- --require <feature path>`.
- Break one behavior on purpose, watch a test fail, restore it.
- `npm run check` and `npm test` pass; report what you ran.
- Update `docs/03-key-functions.md` if the slice adds a file others should know about.
