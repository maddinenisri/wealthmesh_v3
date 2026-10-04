# Decisions

| ID | Date | Subject | Decision | Why | Status |
| --- | --- | --- | --- | --- | --- |
| D-001 | 2026-10-04 | Commit messages | Conventional Commits; no AI co-author trailer or attribution, in any repo | Product owner instruction; keeps history clean | active |
| D-002 | 2026-10-04 | Commit and push | Never commit or push unless asked | Product owner approves outward-facing steps | active |
| D-003 | 2026-10-04 | Git hooks | `pre-commit` framework; fast checks on commit, slow checks on push | Polyglot repo, already installed, avoids slow commits | active |
| D-004 | 2026-10-04 | Stack | Java 25, Spring Boot 4.1 WebFlux, R2DBC, Flyway with its own JDBC URL; no virtual threads | Reactive stack chosen up front; JPA is inert with R2DBC | active |
| D-005 | 2026-10-04 | Frontend libraries | TanStack Query, react-hook-form, react-router data mode, Tailwind 4 | Prefer standard libraries over hand-built layers (v2 lesson) | active |
| D-006 | 2026-10-04 | Delivery | One fat jar serves UI and API; pm2 runs two processes in dev and one in prod | Simple to hand to a customer | active |
| D-007 | 2026-10-04 | Ports | db 5434, backend 8081, frontend 5180 | Avoid wealthmesh_v2's ports on the same machine | active |
| D-008 | 2026-10-04 | Build order | One requirements feature file per session, in dependency order; foundations (row 00) first | Time-boxed, restartable, usable product after wave 1 | active |
| D-009 | 2026-10-04 | Approval | Product owner approves the task list per feature and looks at the running app at the end; no per-sub-task approval | v2's per-step approval was too slow | active |
| D-010 | 2026-10-04 | Requirements | Snapshot lives in `docs/requirements`; read-only; `.feature` files are never edited; deviations are recorded as decisions | Keeps the source of truth stable and traceable | active |
| D-011 | 2026-10-04 | v1 application | Running at http://localhost:3000; read-only UX reference; its data and repository are never changed | Product owner answer (Q-001) | active |
| D-012 | 2026-10-04 | Evidence | Tests cite scenario IDs; `npm run coverage -- --require <path>` must pass; no check is reported as passing unless run | Makes "validated" automatic | active |
| D-013 | 2026-10-04 | Prompts | Keep each feature's kickoff prompt and the owner's checkpoint answers in its notes; no transcripts | Replay and audit without storing private reasoning | active |
| D-014 | 2026-10-04 | Process records | Four homes: guides, process, decisions, features. No coordinator role or cross-linked registers | v2's registers cost more than they saved | active |
| D-015 | 2026-10-04 | Savings setup order | `accounts/savings/setup` stays in wave 2 | Product owner answer (Q-006) | active |
| D-016 | 2026-10-04 | Partly buildable scenarios | Defer the whole scenario ID with a reason in `deferred.txt`; no test cites it until it fully passes | Product owner answer (Q-007); coverage never overstates | active |
