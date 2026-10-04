# Pitfalls

Problems that cost time in WealthMesh v3. Each has a symptom, the cause, and the fix. Keep this list in front of
you during setup; the first three explain most of the time spent on the database.

## Database and Spring

| #  | Symptom                                                                 | Cause                                                                                                                        | Fix                                                                                                                  |
| -- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1  | Tests pass the context load but queries say `relation "x" does not exist`; no Flyway log lines | With an R2DBC `ConnectionFactory` present, Boot skips `DataSourceAutoConfiguration`, so Flyway has no DataSource (the `spring.datasource.*` block is ignored) | Give Flyway its own `spring.flyway.url`, `user`, `password`                                                          |
| 2  | `spring.r2dbc.properties.schema` has no effect                          | The `schema` property had no effect with r2dbc-postgresql 1.1.2; the driver exposes `options` (libpq-style settings)         | `spring.r2dbc.properties.options: search_path=<schema>`                                                              |
| 3  | Schema works with the real URL but not in tests using `@ServiceConnection` | The service connection supplies its own R2DBC options and drops your `options` property                                      | Set URLs and credentials with a `DynamicPropertyRegistrar` instead                                                   |
| 4  | Error responses have no `message`                                       | Not exposed by default; setting `server.error.include-message` changed nothing in tests, `spring.web.error.*` worked (Boot 4.1) | `spring.web.error.include-message: always`                                                                           |
| 5  | JPA starter present but nothing works                                   | No DataSource exists with R2DBC, so JPA is inert                                                                             | Remove `starter-data-jpa` unless you add a JDBC DataSource on purpose                                                |
| 6  | Blank input gives a 500                                                 | The database CHECK constraint fires                                                                                          | Validate in the service and return 400; map `DataIntegrityViolationException` to 409                                 |
| 7  | MapStruct update fails to compile on a record                           | Records have no setters, so no `@MappingTarget`                                                                              | Two-source mapping with `source = "existing.id"` and `"request.name"`                                                |
| 8  | Boot 4 / Testcontainers 2 imports not found                             | Packages moved: `org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient`, `org.testcontainers.postgresql.PostgreSQLContainer` | Check the jar or docs for the current package before copying an old snippet                                          |
| 9  | Virtual threads suggested                                               | Only useful for blocking MVC + JDBC; WebFlux on Netty is already non-blocking                                                | Do not enable `spring.threads.virtual.enabled` here                                                                  |

## JDK and build tools

| #  | Symptom                                                              | Cause                                                                         | Fix                                                                                       |
| -- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 10 | Gradle: "Cannot find a Java installation ... languageVersion=25"     | Toolchain detection does not see jenv shims or some brew JDKs                 | Run Gradle with `JAVA_HOME` set to a real JDK 25 (`scripts/java-env.sh`)                  |
| 11 | `jenv` alias `25` reports JDK 26                                     | Stale symlink to another keg; `brew` `openjdk@25` can point at 26               | `jenv remove` the stale aliases, `jenv add <real home>`; verify with `java -version`      |
| 12 | `npm --prefix x exec -- tsc` fails to find `tsconfig.json`           | `exec` runs in the current directory, not the prefix                          | Add a `typecheck` script in the package and call `npm --prefix x run typecheck`           |
| 13 | Vitest: `test` key rejected in `vite.config.ts`                      | `defineConfig` from `vite` has no `test` typing                               | Import `defineConfig` from `vitest/config`                                                |
| 14 | `fetch('/api/...')` throws "Invalid URL" in tests                    | Node's `fetch` needs an absolute URL even under jsdom                         | `new URL(path, window.location.origin)` in the client, and set the jsdom `url`            |
| 15 | Checkstyle `Indentation` on `@CsvSource({...})`                      | Annotation array children expected at 8 spaces                                | Indent array elements 8 spaces                                                            |

## Local environment

| #  | Symptom                                                              | Cause                                                                    | Fix                                                                                          |
| -- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 16 | "port is already allocated" / listener already present               | Another local project holds 5173, 5174, 5433 or 8080                     | Preflight with `lsof`; choose distinct defaults and make them env-overridable                |
| 17 | `127.0.0.1:5180` refuses the connection, `localhost:5180` works      | Vite binds `localhost`, which resolves to IPv6 first                     | Use `localhost` for the dev server, or pass `--host 127.0.0.1`                               |
| 18 | pm2 warns or restarts other apps                                     | One daemon is shared; a local pm2 of a different version talks to it     | Use the global pm2 only; unique app names (`wm-*`); `pm2 delete <file>` only touches that file's apps |
| 19 | `docker compose down -v` would wipe the dev database                 | The compose file used a fixed named volume shared by other projects      | Give disposable stacks their own compose file with `tmpfs`, no named volume                  |
| 20 | Dev server and jar both serve the UI in prod mode                    | The UI was bundled but the preview process still ran                     | Prod mode runs only the jar; refuse a jar without the UI (`WM_REQUIRE_UI=1`)                 |

## Quality tooling

| #  | Symptom                                                              | Cause                                                                    | Fix                                                                                          |
| -- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 21 | `pre-commit run --all-files` checks nothing                          | It only sees tracked files; a new repo has none                          | `git add -A` first (no commit needed)                                                        |
| 22 | oxlint `react(refs)` on `field.value`                                | Heuristic flags properties of an object that also holds a ref            | Targeted `// oxlint-disable-next-line react/refs` on the flagged line, with a reason          |
| 23 | A planted secret did not block a commit                                 | The AWS rule only matches `AKIA` + `[A-Z2-7]{16}`; random digits 0, 1, 8, 9 do not match | Use valid characters in the test, and guard the test so a success is undone immediately      |
| 24 | ShellCheck cannot follow `. "$here/x.sh"`                            | The source path is not set                                               | `shellcheck -x -P SCRIPTDIR`, plus `# shellcheck shell=bash` at the top of sourced files     |
| 25 | `ls dir/*.jar \| grep -v plain` flagged (SC2010)                      | Parsing `ls` output                                                      | Loop over the glob and `case` on `*-plain.jar`                                               |
| 26 | `check-json` rejects `tsconfig*.json`                                | They are JSON with comments                                              | Exclude `tsconfig.*\.json` from `check-json`                                                  |
| 27 | Prettier fails on first run across the repo                          | Code was written before the config                                       | Add the config, run `--write` once, re-run tests and build to prove nothing changed          |
| 33 | `unzip -l jar \| grep -q entry` under `set -o pipefail` always says the entry is missing | `grep -q` exits on the first match, `unzip` is killed by SIGPIPE (pipe status `141 0`), and `pipefail` turns that into failure | Ask `unzip` for the entry directly: `unzip -l jar entry >/dev/null`. Test guards by running the script; `scripts/test-run-backend-jar.sh` does this and fails on the old pipe version |

## Process

| #  | Lesson                                                                                                          |
| -- | --------------------------------------------------------------------------------------------------------------- |
| 28 | Anything that creates commits in a test (for example "commit a secret") must be guarded so a success is undone. |
| 29 | Remove an AI co-author trailer from unpushed commits with `git filter-branch --msg-filter`, then expire the reflog and `gc --prune=now`. |
| 30 | A passing test you never saw fail proves little. Break the behaviour once and confirm red, then restore.       |
| 31 | When two sources disagree (docs versus remembered API), fetch the current docs and note the version used.      |
| 32 | A heavy hand-written framework layer is a cost; prefer the standard libraries (TanStack Query, react-hook-form, MapStruct) and keep only thin wrappers. |
