# WealthMesh

Shared instructions for every coding agent (Claude Code, Codex, Cursor, Copilot, Gemini). `CLAUDE.md` imports this file.

Household finance app. Monorepo: `backend/` (Java 25, Spring Boot 4.1 WebFlux, R2DBC, Flyway, MapStruct, Gradle),
`frontend/` (React 19, Vite, Tailwind 4, react-router data mode, TanStack Query, react-hook-form),
`e2e/` (Playwright against the packaged jar). Docs: `docs/README.md`.

## Read first

- How we work and how it improves: `docs/process/workflow.md`. Choices already made and open questions:
  `docs/decisions/decisions.md` and `docs/decisions/questions.md` (check them before asking the user anything).
- Setting up or rebuilding the stack: `docs/guides/setup-playbook.md`, after the `preflight` skill.
- Writing code: `docs/guides/patterns.md`. Finding things: `docs/guides/key-functions.md`.
- Something fails or surprises you: `docs/guides/pitfalls.md` before debugging from scratch.

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
- Scripted edits (sed, python, heredocs) must assert they matched, for example `assert s.count(old) == 1`, or use the Edit tool.
  After a change to several files, grep to prove each change landed before running tests.
- The pm2 daemon is shared with other projects: only touch `wm-*` apps, never `pm2 delete all`.
- Prefer the standard library over a hand-built layer (see pitfall 32).

## Feature sessions

The product is built one slice per session (scenario IDs in `docs/features/slices.txt`, order in `docs/features/dependency-map.md`), from `docs/requirements/v2` (39 files, 262 scenarios with
stable `@V2_...` IDs; a read-only snapshot). Status board: `docs/features/INDEX.md`. Run the `feature-session` skill.

- Every test cites the scenario ID(s) it covers. `npm run coverage -- --require --slice NN` checks it.
- v1 is running at `http://localhost:3000` as a read-only UX reference. Never change its data or its repository.
- Never edit a `.feature` file. Record deviations as decisions in the feature's notes.
- Each session ends green: `npm run e2e` passes on `main`. Add a retro row in `docs/process/retro.md`.
- Keep the kickoff prompt and the owner's checkpoint answers in the feature's notes. Never store transcripts or secrets.
- Cross-cutting choices go to `docs/decisions/decisions.md`; feature-local ones stay in the feature's notes.

## Skills and agents

Claude Code skills in `.claude/skills/`: `preflight`, `bootstrap-fullstack`, `feature-session`, `feature-slice`, `release-jar`.
Claude Code agents in `.claude/agents/` (use on request): `validator` (independent evidence, no edits),
`visual-reviewer` (screenshots of new screens at 710px and 1280px read against the UI checklist).

Other tools: the skill files are plain Markdown runbooks. Open the matching `SKILL.md` and follow it step by step;
the validator and reviewer files describe the checks to run and report.
