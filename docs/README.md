# Project docs

Notes for building WealthMesh and for standing up the next project faster. They come from the v3 build (Spring Boot
and React monorepo, from an empty folder to a pushed repo with tests, hooks and a one-jar release in about 1h20m).

## Four homes

| Folder | Purpose | Start with |
| --- | --- | --- |
| [guides/](guides/) | How to build: setup, patterns, key files, pitfalls, domain foundations | [setup-playbook.md](guides/setup-playbook.md), [pitfalls.md](guides/pitfalls.md) |
| [process/](process/) | How we work and how it improves: workflow, retro, improvement ledger, prompts | [workflow.md](process/workflow.md) |
| [decisions/](decisions/) | Project-level decisions and open questions for the product owner | [decisions.md](decisions/decisions.md), [questions.md](decisions/questions.md) |
| [features/](features/) | The status board, one notes file per feature, deferred scenarios | [INDEX.md](features/INDEX.md) |

[requirements/](requirements/) holds the read-only snapshot of the product features (39 files, 262 scenarios).

| Guide | Use it to |
| --- | --- |
| [setup-playbook.md](guides/setup-playbook.md) | Bootstrap a project in order, with a verification gate after each phase |
| [patterns.md](guides/patterns.md) | Copy the architecture and code patterns that worked |
| [key-functions.md](guides/key-functions.md) | Find the important files and functions and why each exists |
| [pitfalls.md](guides/pitfalls.md) | Skip the problems that cost time: symptom, cause, fix |
| [domain-foundations.md](guides/domain-foundations.md) | The money, date and account rules every feature relies on (written in session 0) |

## The feedback loop

Each feature session ends with a retro row ([process/retro.md](process/retro.md)). The same problem twice changes the
process, and the change is logged in [process/improvements.md](process/improvements.md). Cross-cutting choices go to
[decisions/decisions.md](decisions/decisions.md); anything waiting on the product owner goes to
[decisions/questions.md](decisions/questions.md). Reusable prompts are in [process/prompts.md](process/prompts.md).

## Stack at a glance

- **Backend:** Java 25, Spring Boot 4.1 (WebFlux), R2DBC and PostgreSQL, Flyway, MapStruct, Gradle 9.7.
- **Frontend:** React 19, Vite 8, TypeScript 6, Tailwind CSS 4, react-router 8 (data mode), TanStack Query 5,
  react-hook-form 7.
- **Tests:** JUnit and Testcontainers, Vitest with Testing Library and MSW, Playwright against the packaged jar.
- **Quality:** Prettier, oxlint, Checkstyle, ShellCheck, gitleaks, pre-commit hooks, Conventional Commits.
- **Run:** pm2 (dev: two processes, prod: one fat jar serving UI and API), Postgres in Docker Compose.

## Reusing this on another project

Copy `AGENTS.md`, `CLAUDE.md`, `.claude/` and `docs/` (without `requirements/` and `features/`) into the new repo, then
rename the app, package and ports. `AGENTS.md` is the shared instruction file (Codex, Cursor, Copilot and Gemini read
it); `CLAUDE.md` only imports it. For skills available in every project, copy `preflight` and `bootstrap-fullstack` to
`~/.claude/skills/`.

## Working with an AI coding agent

Paste this at the start of a setup session:

```text
Build <app> as a monorepo: backend/ (Spring Boot WebFlux, R2DBC, Flyway), frontend/ (React, Vite, Tailwind),
e2e/ (Playwright). Follow docs/guides/setup-playbook.md. Use the latest stable versions and verify them against the
registry, not memory. Check ports and installed JDK/Node first. After each phase run its gate and show the result.
Ask me only about decisions listed under "Decide first" that I have not answered. Do not commit or push unless I
ask. Commit messages are Conventional Commits with no AI co-author trailer.
```

For feature sessions, use the prompts in [process/prompts.md](process/prompts.md).
