# Key functions and files

The files that carry the design, and what breaks or gets harder without each. Paths are relative to the repo root.

## Backend (`backend/src/main/java/com/mdstech/wealthmesh/`)

| Where                                          | What it does                                                                  | Why it matters                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `household/service/HouseholdService`           | `get`, `create`, `rename` for the single household; validates; maps 409/404   | Holds the rules; the singleton conflict becomes a clean 409 |
| `household/service/HouseholdMemberService`     | CRUD plus `validate` (name 1-120, label up to 80) and `duplicate` (409)       | One place for member rules and error mapping                |
| `household/mapper/HouseholdMemberMapper`       | `toResponse`, `toNewEntity`, `toUpdatedEntity` (two sources), `@Named` helpers| Normalises names, builds keys and timestamps for records    |
| `household/mapper/HouseholdMapper`             | Same for the household                                                        | Keeps entities out of controllers                           |
| `household/domain/*`                           | Table-mapped records with `@Id UUID`                                          | DB-generated ids; null id means insert                      |
| `web/SpaFallbackFilter.isPageRequest`          | Decides which GET/HEAD requests get `index.html`                              | Refresh and deep links work; assets and API are untouched   |
| `resources/application.yaml`                   | R2DBC `options: search_path`, `spring.flyway.url`, error messages             | Three of the four setup traps live here                     |
| `resources/db/migration/V1__init_schema.sql`   | Schema, tables, constraints                                                   | Source of truth, applied by Flyway in dev, jar and tests    |
| `backend/build.gradle`                         | Plugins, MapStruct, Checkstyle, `frontendInstall`/`frontendBuild`, `bootJar`  | Builds the fat jar with the UI; `-PskipFrontend` for speed  |
| `backend/config/checkstyle/checkstyle.xml`     | Style and complexity limits                                                   | Enforced on push                                            |

Backend tests (`backend/src/test/java/com/mdstech/wealthmesh/`):

| Where                                   | What it does                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `TestcontainersConfiguration`           | Starts `postgres:17`; `DynamicPropertyRegistrar` sets R2DBC and Flyway properties|
| `HouseholdMemberApiTests`               | Ordered end-to-end API journey: create, conflict, validate, edit, list, delete   |
| `web/SpaFallbackFilterTests`            | Parameterised cases for `isPageRequest` plus rewrite behaviour                   |

## Frontend (`frontend/src/`)

| Where                                         | What it does                                                                    | Why it matters                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `api/client.ts` `request()`                   | Typed fetch under `/api/v1`; absolute URL; `ApiError`; 204 handling             | Single place for URL, errors and network failure             |
| `api/household.ts`                            | `getHousehold`, `createHousehold`, `renameHousehold`, member functions, parsers | Components never build URLs or trust raw JSON                |
| `hooks/useHousehold.ts`                       | `useHousehold` (adds `isMissing` for 404), create and rename mutations          | Screens branch on state, not on exceptions                   |
| `hooks/useMembers.ts`                         | `useMembers`, `useAddMember`, `useUpdateMember`                                 | Invalidates the list key after every change                  |
| `design-system/tokens.css`                    | Light and dark variables, `@theme inline`, focus ring, reduced motion           | The one place to restyle the app                             |
| `design-system/cn.ts`                         | `cn(...)` = `clsx` + `tailwind-merge`                                           | Safe class overrides                                         |
| `design-system/forms/TextField.tsx`           | react-hook-form `useController` bound to `Field`                                | Reusable controlled input with validation messages           |
| `design-system/forms/FormAlert.tsx`           | Form-level error with `role="alert"`                                            | Consistent server-error display                              |
| `design-system/components/Container.tsx`      | Width and gutter wrapper (`sm`/`md`/`lg`, `as`)                                 | Shared page width                                            |
| `design-system/components/Amount.tsx`         | Money formatting with `Intl.NumberFormat`, small cents, sign colour             | Figures are the core content of a finance app                |
| `routes.tsx`                                  | Exported `routes` array and `createAppRouter()`                                 | Same routes in the app and in tests                          |
| `layout/AppLayout.tsx`, `AppFooter.tsx`       | Shell: skip link, nav, main, sticky footer                                      | Accessibility and consistent chrome                          |
| `layout/useDocumentTitle.ts`                  | Sets the tab title from `handle.title` of the deepest route                     | Titles stay next to the route definition                     |
| `features/household/HouseholdPage.tsx`        | Loading, error, create, details and members states                              | The reference screen to copy                                 |
| `features/household/HouseholdForms.tsx`       | Create, rename and member forms                                                 | Shows the form pattern end to end                            |
| `test/mockApi.ts`                             | In-memory backend for MSW: rules, 404/400/409, request log                      | Fast, realistic UI tests without a server                    |
| `test/render.tsx`                             | `renderWithProviders`, `renderRoute(path)`                                      | Fresh query cache, no retries, real routes                   |
| `test/setup.ts`                               | Starts MSW with `onUnhandledRequest: 'error'`                                   | Stray requests fail tests                                    |

## Root, scripts and e2e

| Where                                  | What it does                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `package.json`                         | Task runner: db, build, package, test, lint, format, typecheck, dev/start, e2e       |
| `ecosystem.config.cjs`                 | pm2 apps: `[backend, frontend]` in dev, `[backend]` (jar) in prod; reads `.env`      |
| `scripts/java-env.sh` `find_jdk25`     | Finds a JDK 25 from `WM_JAVA_HOME`, `JAVA_HOME`, jenv, `java_home`; exports it       |
| `scripts/gradle.sh`                    | Runs the wrapper under that JDK                                                      |
| `scripts/run-backend-jar.sh`           | Finds the jar (skips `-plain`), optionally requires the bundled UI, runs it          |
| `scripts/test-run-backend-jar.sh`      | Tests the jar runner's UI guard with a fake JDK and fake jars; pass another script path to test it  |
| `scripts/db.sh`                        | `up`, `down`, `reset`, `logs`, `status` for the dev database                         |
| `e2e/start-stack.sh`                   | Disposable DB, then jar as a child; `trap` removes the DB on exit                    |
| `e2e/playwright.config.ts`             | `webServer` runs the stack, `workers: 1`, health URL, graceful shutdown              |
| `e2e/tests/household.spec.ts`          | The ordered journey from an empty database                                           |
| `e2e/tests/shell.spec.ts`              | Shell, navigation without reload, not-found view, API and health endpoints           |
| `.pre-commit-config.yaml`              | All hooks, grouped by stage                                                          |
