# WealthMesh

Shared instructions for every coding agent (Claude Code, Codex, Cursor, Copilot, Gemini). `CLAUDE.md` imports this file.

Household finance app. Monorepo: `backend/` (Java 25, Spring Boot 4.1 WebFlux, R2DBC, Flyway, MapStruct, Gradle),
`frontend/` (React 19, Vite, Tailwind 4, react-router data mode, TanStack Query, react-hook-form),
`e2e/` (Playwright against the packaged jar). Docs: `docs/README.md`.

## Read first

- Setting up or rebuilding the stack: `docs/01-setup-playbook.md`, after the `preflight` skill.
- Writing code: `docs/02-patterns.md`. Finding things: `docs/03-key-functions.md`.
- Something fails or surprises you: `docs/04-pitfalls.md` before debugging from scratch.

## Commands (run from the repo root)

| Task | Command |
| --- | --- |
| Database up / reset | `npm run db:up` / `npm run db:reset` |
| Dev (backend + Vite) | `npm run dev`, then `npm run delete` to stop |
| Fat jar (UI + API) | `npm run package`, run with `npm start` |
| Tests | `npm test` (backend + frontend), `npm run e2e` |
| Quality | `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run check` (all hooks) |

## Conventions

- Conventional Commits (`feat:`, `fix(api):`). **No AI co-author trailer or attribution, ever.**
- Do not commit or push unless asked. Hooks only see staged files: `git add` before `npm run check`.
- Ports: db 5434, backend 8081, frontend 5180. Open Vite at `http://localhost:5180`, not `127.0.0.1`.
- Run Gradle through `scripts/gradle.sh` (it finds JDK 25). Never report a check as passing unless you ran it.
- The pm2 daemon is shared with other projects: only touch `wm-*` apps, never `pm2 delete all`.
- Prefer the standard library over a hand-built layer (see pitfall 32).

## Skills and agents

Claude Code skills in `.claude/skills/`: `preflight`, `bootstrap-fullstack`, `feature-slice`, `release-jar`.
Claude Code agents in `.claude/agents/` (use on request): `validator` (independent evidence, no edits),
`pattern-reviewer` (conformance to `docs/02`).

Other tools: the skill files are plain Markdown runbooks. Open the matching `SKILL.md` and follow it step by step;
the validator and reviewer files describe the checks to run and report.
