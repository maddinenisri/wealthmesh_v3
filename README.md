# WealthMesh

Spring Boot (WebFlux, R2DBC, Flyway) backend in `backend/`, React (Vite, Tailwind) frontend in `frontend/`,
Playwright end-to-end tests in `e2e/`. Everything is driven from the root `package.json`.

## Prerequisites

JDK 25, Node 24+, Docker, and for the dev tooling: `brew install gitleaks shellcheck pre-commit`
(or `pipx install pre-commit`). pm2 is used to run the apps: `npm i -g pm2`.

## First run

```sh
cp .env.example .env     # set DB_PASSWORD
npm run install:all      # frontend dependencies
npm run hooks:install    # git hooks (needs a git repo)
npm run db:up            # Postgres in Docker
npm run dev              # backend + frontend dev servers via pm2
```

## Commands

| Task                   | Command                                           |
| ---------------------- | ------------------------------------------------- |
| Dev (2 processes)      | `npm run dev`, `stop`, `restart`, `delete`, `logs`|
| Run the fat jar (1)    | `npm start` (builds the jar with the UI first)    |
| Build the fat jar      | `npm run build` (same as `npm run package`)       |
| Backend-only jar       | `npm run backend:build`                           |
| Tests                  | `npm test`, `npm run e2e`                         |
| Lint                   | `npm run lint` (oxlint, checkstyle, shellcheck, gitleaks) |
| Format                 | `npm run format`, `npm run format:check`          |
| Type check             | `npm run typecheck`                               |
| All hooks by hand      | `npm run check`                                   |

## Git hooks (pre-commit)

- On commit: whitespace and file hygiene, private-key detection, **gitleaks** on staged changes,
  Prettier, oxlint (warnings are errors), ShellCheck.
- On commit message: Conventional Commits (`feat:`, `fix(api):`, ...).
- On push: frontend type check and tests, backend Checkstyle and tests.

Skip a hook only with a reason, for example `SKIP=gitleaks git commit ...` for a known false positive,
and prefer an allowlist entry: create `.gitleaks.toml` with `[extend] useDefault = true` plus an `[[allowlists]]` block.
