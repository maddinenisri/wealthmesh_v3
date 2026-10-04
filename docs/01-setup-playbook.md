# Setup playbook

Do the phases in order. Each ends with a **gate**: commands that must pass before moving on. Names such as
`wealthmesh`, `com.mdstech` and ports are the WealthMesh values; replace them.

## 0. Decide first

Answer these before writing code. Each one caused rework in this build when it was left open.

| Decision                    | WealthMesh answer                                    | Why it matters                                      |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Names                       | app `wealth-mesh`, package `com.mdstech.wealthmesh`  | Renaming packages later touches every file          |
| Reactive or blocking        | Reactive (WebFlux + R2DBC)                           | Decides the test tools, JPA, virtual threads        |
| Database and schema         | PostgreSQL, schema `wealthmesh`                      | Drives Flyway, R2DBC and test container config      |
| API prefix and versioning   | `/api/v1`                                            | Changing it later breaks the client and the proxy   |
| Domain shape                | One singleton household with members                 | Singletons need a DB constraint, not just code      |
| Ports                       | db 5434, api 8081, ui 5180                           | Defaults collide with other local projects          |
| Delivery                    | One fat jar that serves UI and API                   | Needs SPA fallback and a build step in Gradle       |
| Quality gates               | Hooks on commit and on push                          | Cheaper to add before the first commit              |
| Commit policy               | Conventional Commits, no AI attribution              | Rewriting history later is avoidable                |

## 1. Preflight (5 minutes)

```sh
java -version; /usr/libexec/java_home -V; jenv versions     # is the required JDK really installed?
node -v; npm -v; docker info >/dev/null && echo docker-ok
lsof -iTCP -sTCP:LISTEN -n -P | grep -E ':(5434|8081|5180|5173|8080|5433)\b'   # what is already using ports
pm2 jlist | python3 -c 'import sys,json;print([p["name"] for p in json.load(sys.stdin)])'  # other pm2 apps
git config user.name; git config user.email
```

Resolve everything that fails here first. If an installed JDK alias points at the wrong version, fix it now
(see [04-pitfalls.md](04-pitfalls.md), JDK section).

### Verify the latest versions (do not trust memory)

```sh
npm view react version; npm view vite version; npm view tailwindcss version; npm view react-router version
npm view @tanstack/react-query version; npm view vitest version; npm view @playwright/test version
curl -s https://services.gradle.org/versions/current | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])'
curl -s https://start.spring.io/metadata/client | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["bootVersion"]["default"], [v["id"] for v in d["javaVersion"]["values"]])'
```

Starter templates lag the registry (the Vite template pinned TypeScript `~6.0.2` while 7.x was current), so
after scaffolding, run `npm outdated` and decide each major upgrade on purpose.

### Versions in this repo versus latest (checked 2026-10-04)

| Tool                | In repo   | Latest at the time | Note                                                          |
| ------------------- | --------- | ------------------ | ------------------------------------------------------------- |
| Spring Boot         | 4.1.1     | 4.1.1              | Current                                                       |
| Gradle wrapper      | 9.7.1     | 9.8.0              | Pinned by the supplied `gradle-wrapper.properties`            |
| React / React DOM   | 19.3.0    | 19.3.0             | Current                                                       |
| Vite                | 8.3.2     | 8.3.2              | Current                                                       |
| Tailwind CSS        | 4.3.3     | 4.3.3              | Current                                                       |
| react-router        | 8.4.0     | 8.4.0              | Current                                                       |
| TanStack Query      | 5.104.1   | 5.104.1            | Current                                                       |
| Vitest              | 5.0.3     | 5.0.3              | Current                                                       |
| Playwright          | 1.63.0    | 1.63.0             | Current                                                       |
| Prettier            | 3.9.9     | 3.9.9              | Current                                                       |
| TypeScript          | 6.0.3     | 7.0.2              | One major behind (Vite template pin); upgrade needs a build check |
| msw                 | 2.15.x    | 3.0.2              | One major behind; v2 of this project used 3.0.2               |
| oxlint              | 1.81+     | 1.86.0             | Caret range; `npm update` picks it up                         |

For libraries whose usage changes between majors, read the current docs page and note the version: React Router
moved to a single `react-router` package with data-mode routes; Tailwind 4 has no config file.

## 2. Backend skeleton

Order: `build.gradle` → `settings.gradle` → wrapper → `.gitignore` / `.gitattributes` → `application.yaml` →
`compose.yaml` → Flyway migration → code → tests.

1. Generate from start.spring.io or paste a known-good `build.gradle`. Dependencies used: actuator, webflux,
   data-r2dbc, flyway (starter + `flyway-database-postgresql`), MapStruct (explicit version, Boot does not manage
   it), `r2dbc-postgresql` and `postgresql` at runtime, Testcontainers.
2. `gradle wrapper --gradle-version <current>` so teammates need no Gradle install.
3. `application.yaml`: R2DBC URL with `options: search_path=<schema>`, **a separate `spring.flyway.url`** (see
   pitfalls), `spring.web.error.include-message: always`, actuator health.
4. `compose.yaml`: Postgres with a healthcheck, port bound to `127.0.0.1`, password from the environment.
5. `V1__init_schema.sql`: `CREATE SCHEMA IF NOT EXISTS`, tables qualified with the schema, UUID primary keys with
   `gen_random_uuid()` defaults.
6. Code layout per feature: `domain/`, `dto/`, `mapper/`, `repository/`, `service/`, controller (see
   [02-patterns.md](02-patterns.md)).
7. Tests: one Testcontainers config shared by the context test and the API tests.

**Gate:** `./gradlew test checkstyleMain checkstyleTest` is green (needs Docker for Testcontainers).

## 3. Frontend skeleton

```sh
cd frontend
npm create vite@latest . -- --template react-ts --no-interactive
npm install
npm install tailwindcss @tailwindcss/vite
npm install react-router @tanstack/react-query react-hook-form clsx tailwind-merge class-variance-authority
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw prettier
```

1. `vite.config.ts`: `react()`, `tailwindcss()`, `server.proxy['/api']` to the backend, and a `test` block (import
   `defineConfig` from `vitest/config`).
2. `src/index.css`: `@import "tailwindcss";` plus fonts plus the tokens file.
3. Build the design system before the screens: tokens, `cn()`, primitives, form fields.
4. Then `api/` (client + typed resource modules), `hooks/` (queries and mutations), `features/<name>/`,
   `layout/`, `routes.tsx`, `main.tsx`.
5. Tests with MSW from the first screen.

**Gate:** `npm run build && npm run lint && npm test` (build runs `tsc`, so tests are type-checked too).

## 4. Wire UI and API together

- Dev: the Vite proxy forwards `/api` so the browser sees one origin and no CORS config is needed.
- Release: Gradle `bootJar` runs the frontend build and copies `dist` into `BOOT-INF/classes/static`; a
  `WebFilter` returns `index.html` for page routes.
- Provide `-PskipFrontend` for backend-only builds so backend tests never need npm.

**Gate:** `java -jar` the built jar and request `/`, a client route like `/design`, an asset, and an API path.

## 5. Run modes (pm2)

- `npm run dev`: backend (`gradle bootRun`) and the Vite dev server as two processes.
- `npm start`: package, then run only the fat jar.
- Use a global pm2 and unique app names; never mix pm2 versions (see pitfalls).

**Gate:** both modes answer `/api/...` on their port; `npm run delete` leaves no listeners.

## 6. End-to-end tests

Playwright against the packaged jar, with its own disposable Postgres (tmpfs, no named volume), started and
removed by the script Playwright launches as `webServer`.

**Gate:** `npm run e2e` passes. Break something on purpose once and confirm a test fails.

## 7. Quality gates

| Tool                    | Runs on             | Notes                                                       |
| ----------------------- | ------------------- | ----------------------------------------------------------- |
| Prettier                | commit              | one root config; `--check` in the hook                      |
| oxlint `--deny-warnings`| commit              | fast enough to run on the whole package                     |
| ShellCheck              | commit              | `-x -P SCRIPTDIR`; `# shellcheck shell=bash` in sourced files|
| gitleaks                | commit (staged)     | allowlist in `.gitleaks.toml`, never disable rules          |
| Conventional Commits    | commit message      |                                                             |
| Typecheck + unit tests  | push                | slow checks stay off the commit path                        |
| Checkstyle + JUnit      | push                | JVM start-up makes it too slow for every commit             |

Install hooks with `pre-commit install` (config sets `default_install_hook_types` for all three stages).

**Gate:** `pre-commit run --all-files` is green **and** you have planted one defect per hook and seen it fail
(secret, lint error, bad format, bad shell, type error, bad commit message). A hook you never saw fail is not
proven.

## 8. Git and GitHub

```sh
git init -b main
git add -A && git commit -m "chore: ..."        # several commits by area, not one big one
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main                          # runs the pre-push hooks first
```

Hooks only see tracked or staged files, so stage before `pre-commit run --all-files`.

## Reference timeline (WealthMesh v3, approximate)

Reconstructed from file and log timestamps; ranges overlap and the edges are estimates.

| Clock         | Work                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| 07:39         | Backend files created (build, gitignore, yaml, application class)            |
| 07:55 - 08:20 | Testcontainers, Flyway and R2DBC schema problems found and fixed             |
| 08:10 - 08:30 | Frontend scaffold, design system, household screen, router, API, proxy       |
| 08:25 - 08:35 | Frontend tests with MSW, layout container, footer                            |
| 08:33 - 08:45 | pm2 setup, fat jar bundling and SPA fallback, Playwright suite               |
| 08:45 - 08:56 | Linting, hooks, gitleaks, commits, push                                      |

The slowest segment was the first database integration (see pitfalls 1 to 3); doing the Preflight and wiring
Flyway with its own JDBC URL up front removes most of it.
