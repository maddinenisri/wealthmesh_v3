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
| `account/service/AccountService`               | `create`, `update`, `findAll`, `findById`; `parse` validates (name, amount, type, date); owners must belong to the household | One place for account rules; edit never touches money (D-017) |
| `account/repository/AccountOwnerStore`         | Owner links (composite key) with plain SQL: `replace`, `ownersByAccount`, `ownersOf` | Joint accounts later need no schema change                  |
| `activity/service/EntryService`                | `record(accountId, key, kind, request)`: validates and saves an expense or income; replay by key (D-024) | One place for money in and out; `kind` picks the category kind and the Balance direction |
| `activity/service/EntryChangeService`          | `replace` (edit as replacement), `remove`, `undo`, `history` with who/when events (`activity_event`) | Money rows are never updated in place; a replacement and the original swap in one transaction |
| `activity/service/EntryValidator`              | `parse` (entries) and `parseReminder`: amount, date, category kind, member    | One place for entry rules; the date rule differs for reminders |
| `statement/service/StatementService`           | `attach`, `revise` (repeat-safe), `ofAccount`; table `statement` (V7), `UNIQUE (replaces_id)` | Statements never feed Balance; only one revision per version, so concurrent revisions cannot both win (slice 04) |
| `opening/service/OpeningRevisionService`       | `preview` (optionally with a pending entry), `save`, `applyLocked`; table `opening_revision` (V8) | Starting-balance and tracking-start correction under the account lock; keeps the replaced amount and date; never income or spending |
| `activity/service/HistoricalEntryService`      | `save`: move the start, then check and save an entry dated before it, one transaction | An entry before tracking is saved only with its reviewed setup (V2_CHECKING_016) |
| `reminder/service/ReminderService`             | `save` (repeat-safe, D-024) and `all`; table `reminder` (V4)                  | Reminders never reach `activity`, so Balance and totals cannot count them |
| `activity/service/BalanceCorrectionService`    | `balanceAsOf`, `preview`, `save` (new correction or edit as replacement)       | Amount is computed at save under an account lock; a retry replays from `requested_balance` (V6, D-028) |
| `activity/BalanceController`                   | `GET /accounts/{id}/balance?asOf=`, `GET .../balance-corrections/preview`, `POST .../balance-corrections` | Preview is informational only |
| `frontend/src/features/activity/BalanceCorrection.tsx` | Update balance form, review, reason, edit of a correction          | Edit starts from the Balance the correction made |
| `frontend/src/features/activity/signedAmount.ts` | Effect of a row on the Balance (expense negative, others as stored)           | Shared by the list and history |
| `activity/repository/ActivityStore`            | SQL: Balance deltas, account activity, month totals and entries by kind       | Removed rows never count; transfers and corrections stay out of income and spending |
| `spending/service/SpendingService`             | Month income, spending, `review` (Income minus spending), history              | The month review reads only `income` and `expense` rows    |
| `wealth/service/WealthService`                 | `summary`: positive bank Balances are assets, negative are debts (D-022)       | The one place household totals are computed                |
| `account/mapper/AccountMapper`                 | Abstract mapper; `balance(account)` is the one place Balance is computed      | Row 03 adds activity to this method                         |
| `money/Money`                                  | `parse` (string, two decimals) and `format`                                   | JSON money is a string (foundations 1)                      |
| `clock/ClockConfiguration`, `TodayController`  | The one `Clock` bean (zone, `wealthmesh.clock.fixed-today`) and `GET /api/v1/today` | Never call `now()` without it; the UI reads today from here |
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
| `AccountApiTests`                       | Ordered API journey for accounts and `/today`; `@DirtiesContext` gives it its own database |
| `MutableClock`                          | `@Primary` test clock (from `TestcontainersConfiguration`); `setToday(date)`     |
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
| `lib/money.ts` `parseAmount`                  | "$5,000.00" to "5000.00", or null when it is not an amount                      | Same rule as the backend, so the form and API agree          |
| `api/accounts.ts`, `hooks/useAccounts.ts`     | Account calls with parsers; `useToday` reads the server date                    | Date defaults come from the server, never `new Date()`       |
| `features/accounts/*`                         | List, detail, setup and edit forms; `useAccountContext` loads household + members | Reference for a second screen set                            |
| `design-system/components/Select.tsx`, `forms/SelectField.tsx` | Labelled select and its react-hook-form binding        | Counterpart of Field and TextField                           |
| `features/activity/AddEntry.tsx`              | Money in or out, and edit (`editing` prop); a date after today becomes "Save reminder" | One form for add, correct and reminder; review before save |
| `features/activity/ChangeEntry.tsx`           | Review for remove and Undo with the Balance and month figure after             | Nothing changes until Confirm; Cancel leaves it as it was    |
| `features/activity/EntryHistory.tsx`, `RemindersCard.tsx` | History table (replaced and removed rows, Undo) and the account's reminders | Where the originals and plans are visible                    |
| `features/statements/*`                       | `StatementsCard` list and `StatementForm` (attach; revise with review and Cancel) | Supporting statements beside Reminders; no money effect     |
| `features/activity/UpdateBalance.tsx`, `StartingBalanceCorrection.tsx`, `HistoricalSetup.tsx` | Update balance choice, starting-balance review, reviewed move of the start for a pre-start entry | Where L8 and L9 live in the UI |
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
| `e2e/start-stack.sh`                   | Disposable DB, then jar as a child; exports `WEALTHMESH_CLOCK_FIXED_TODAY=2026-10-03`; `trap` removes the DB |
| `e2e/playwright.config.ts`             | `webServer` runs the stack, `workers: 1`, health URL, graceful shutdown              |
| `e2e/tests/01-household.spec.ts`       | The ordered journey from an empty database; specs run by file name, so the number is the order |
| `e2e/tests/02-checking-setup.spec.ts`  | Checking setup journey; needs the household and members left by 01                  |
| `e2e/tests/shell.spec.ts`              | Shell, navigation without reload, not-found view, API and health endpoints           |
| `.pre-commit-config.yaml`              | All hooks, grouped by stage                                                          |
