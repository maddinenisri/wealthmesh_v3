# Project playbook

Reusable notes for standing up a full-stack project quickly and with current tooling. They were written from the
WealthMesh v3 build (Spring Boot + React monorepo, from empty folder to pushed repo with tests, hooks and a
one-jar release in about 1h20m of wall-clock time) and are meant to be reused for the next project.

| Doc                                                | Use it to                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| [01-setup-playbook.md](01-setup-playbook.md)       | Bootstrap a project in order, with a verification gate after each phase  |
| [02-patterns.md](02-patterns.md)                   | Copy the architecture and code patterns that worked                      |
| [03-key-functions.md](03-key-functions.md)         | Find the important files and functions and why each one exists           |
| [features/INDEX.md](features/INDEX.md)           | Run the product build one requirements file per session, with a status board |
| [04-pitfalls.md](04-pitfalls.md)                   | Skip the problems that cost time: symptom, cause, fix                    |

## Stack at a glance

- **Backend:** Java 25, Spring Boot 4.1 (WebFlux), R2DBC + PostgreSQL, Flyway, MapStruct, Gradle 9.7.
- **Frontend:** React 19, Vite 8, TypeScript 6, Tailwind CSS 4, react-router 8 (data mode), TanStack Query 5,
  react-hook-form 7.
- **Tests:** JUnit + Testcontainers, Vitest + Testing Library + MSW, Playwright against the packaged jar.
- **Quality:** Prettier, oxlint, Checkstyle, ShellCheck, gitleaks, pre-commit hooks, Conventional Commits.
- **Run:** pm2 (dev: two processes, prod: one fat jar that serves UI and API), Postgres in Docker Compose.

## Why the first setup was slow and what changed

Common causes of slow setups, and the habit that removes each:

1. **Deciding as you go.** Answer the questions in the setup playbook's "Decide first" list before writing code.
2. **Trusting remembered versions.** Check every version against the registry or the vendor docs the same day
   (commands in the playbook). Do not copy a version from an old project.
3. **Finding integration bugs late.** Run the real stack (database, backend, frontend, browser) as soon as the
   first vertical slice exists. Most time sinks in this build were found only by running it.
4. **Environment surprises.** Check ports, JDK and Node, Docker, and what else runs on the machine in the first
   five minutes (see the playbook's "Preflight").

## Reusing this on another project

Copy `AGENTS.md`, `CLAUDE.md`, `.claude/` and `docs/` into the new repo, then rename the app, package and ports.
`AGENTS.md` is the shared instruction file (Codex, Cursor, Copilot, Gemini read it); `CLAUDE.md` only imports it.
For skills available in every project, copy `preflight` and `bootstrap-fullstack` to `~/.claude/skills/`.

## Working with an AI coding agent

Paste this at the start of a session to avoid round trips:

```text
Build <app> as a monorepo: backend/ (Spring Boot WebFlux, R2DBC, Flyway), frontend/ (React, Vite, Tailwind),
e2e/ (Playwright). Follow docs/01-setup-playbook.md. Use the latest stable versions and verify them against the
registry, not memory. Check ports and installed JDK/Node first. After each phase run its gate and show the result.
Ask me only about decisions listed under "Decide first" that I have not answered. Do not commit or push unless I
ask. Commit messages are Conventional Commits with no AI co-author trailer.
```
