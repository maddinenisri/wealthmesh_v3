# Key functions and files

The files that carry the design, and what breaks or gets harder without each. Paths are relative to the repo root.

## Backend (`backend/src/main/java/com/mdstech/wealthmesh/`)

| Where                                          | What it does                                                                  | Why it matters                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `household/service/HouseholdService`           | `get`, `create`, `rename` for the single household; validates; maps 409/404   | Holds the rules; the singleton conflict becomes a clean 409 |
| `household/service/HouseholdMemberService`     | CRUD plus `validate` (name 1-120, label up to 80) and `duplicate` (409); `update` records a rename in `member_name_change`; `deactivate`/`restore` flip `active` under a row lock; delete of a used member is 409 | One place for member rules and error mapping (slice 05)     |
| `household/repository/MemberNameHistoryStore`  | `record`, `historyByMember`: profile change history, newest first (`seq`)      | A rename keeps the earlier name; plain SQL like `AccountOwnerStore` |
| `household/mapper/HouseholdMemberMapper`       | `toResponse`, `toNewEntity`, `toUpdatedEntity` (two sources), `@Named` helpers| Normalises names, builds keys and timestamps for records    |
| `household/mapper/HouseholdMapper`             | Same for the household                                                        | Keeps entities out of controllers                           |
| `household/domain/*`                           | Table-mapped records with `@Id UUID`                                          | DB-generated ids; null id means insert                      |
| `account/service/AccountService`               | `create`, `update`, `findAll`, `findById`; `parse` validates (name, amount, type, date); owners must belong to the household; `checkOwners` reads members `FOR SHARE` and refuses a new inactive owner (an existing one may stay) | One place for account rules; edit never touches money (D-017) |
| `account/repository/AccountOwnerStore`         | Owner links (composite key) with plain SQL: `replace`, `ownersByAccount`, `ownersOf` | Joint accounts later need no schema change                  |
| `activity/service/EntryService`                | `record(accountId, key, kind, request)`: validates and saves an expense or income; replay by key (D-024) | One place for money in and out; `kind` picks the category kind and the Balance direction |
| `activity/service/EntryChangeService`          | `replace` (edit as replacement), `remove`, `undo`, `history` with who/when events (`activity_event`) | Money rows are never updated in place; a replacement and the original swap in one transaction |
| `activity/service/MoveTarget`, `ReplacementPreviewService` | `resolve`: the account a replacement lands on (same household, holds activity); `preview`: both Balances and both months after a move, read-only | A move changes two accounts; the server decides the target and the review shows the figures (slice 06, D-035) |
| `activity/service/EntryValidator`              | `parse` (entries) and `parseReminder`: amount, date, category kind, member    | One place for entry rules; the date rule differs for reminders |
| `statement/service/StatementService`           | `attach`, `revise` (repeat-safe), `ofAccount`; table `statement` (V7), `UNIQUE (replaces_id)` | Statements never feed Balance; only one revision per version, so concurrent revisions cannot both win (slice 04) |
| `statement/service/StatementService.remove`, `removalReview` | Soft removal of a statement (`removed_at`), reviewed first; a revision of a removed one is refused | Money and the opening link stay (slice 17, D-059) |
| `investment/service/OpeningComponents` | Parses and judges cash, the typed total and holding lines (messages of `*_005`, the mismatch of `*_006`); `preview()` | Pure, so the review, the save and Finish setup judge the same way (D-057) |
| `investment/service/InvestmentSetupService` | `preview`, `create` (active or draft), `finish`, `discard`, `opening`; routes under `/api/v1/accounts` (`opening-preview`, `{id}/opening`, `{id}/discard`) | The one writer of an investment account's opening; Finish and discard take the account lock first (slice 17) |
| `investment/repository/OpeningStore` | `account_opening` and `account_opening_holding` (V27) | Components of the opening; `opening_amount` on the account is cash plus holdings |
| `account/domain/AccountType.takesStatements`, `isInvestment` | Which types carry statements; the investment kind | Do not widen `holdsActivity` for investments (D-057) |
| `account/domain/AccountState.requireNotDraft` | A record about a completed opening needs the account set up | Statement writers call it (D-058) |
| `opening/service/OpeningRevisionService`       | `preview` (optionally with a pending entry), `save`, `applyLocked`; table `opening_revision` (V8) | Starting-balance and tracking-start correction under the account lock; keeps the replaced amount and date; never income or spending |
| `activity/service/HistoricalEntryService`      | `save`: move the start, then check and save an entry dated before it, one transaction | An entry before tracking is saved only with its reviewed setup (V2_CHECKING_016) |
| `reminder/service/ReminderService`             | `save` (repeat-safe, D-024) and `all`; table `reminder` (V4)                  | Reminders never reach `activity`, so Balance and totals cannot count them |
| `activity/service/BalanceCorrectionService`    | `balanceAsOf`, `preview`, `save` (new correction or edit as replacement)       | Amount is computed at save under an account lock; a retry replays from `requested_balance` (V6, D-028) |
| `activity/BalanceController`                   | `GET /accounts/{id}/balance?asOf=`, `GET .../balance-corrections/preview`, `POST .../balance-corrections` | Preview is informational only |
| `frontend/src/features/activity/BalanceCorrection.tsx` | Update balance form, review, reason, edit of a correction          | Edit starts from the Balance the correction made |
| `frontend/src/features/activity/signedAmount.ts` | Effect of a row on the Balance (expense and transfer out negative, others as stored)           | Shared by the list and history |
| `activity/service/MovementService`, `repository/MovementStore`, `TransferPreviewService`, `TransferController` | Create, replace, remove, Undo and convert-from-expense for a transfer pair; `MovementKind` is the seam for card payments; `lockAccounts` locks lowest id first; `preview` shows each account's Balance after | One movement writer, one lock order; the UI never sends one side (slice 07, D-036) |
| `activity/service/MovementConfiguration`, `CardPaymentController` | One `MovementService` bean per `MovementKind` (`transfers`, `cardPayments`); `/api/v1/card-payments` for create, preview, replacement, removal, Undo | A card payment is the transfer mechanism with `card_payment` / `card_payment_in` rows; the kind carries its pair rule (D-040) |
| `account/service/AccountService.signed` | A card's typed amount plus `balanceSide` to the stored asset-signed amount | One rule for setup, Update balance and statements (D-038) |
| `activity/repository/ActivityStore`            | SQL: Balance deltas, account activity, month totals and entries by kind       | Removed rows never count; transfers and corrections stay out of income and spending |
| `activity/repository/ActivityStore.Counted` | `Counted.of(kind, prefix)`: the filter and per-row value of a month figure (spending = expenses minus refunds, income = income) | The one definition every month reader builds from; change spending in one place (D-039) |
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
| `recurring/service/RecurringService` | `overview`, `create`, `change`, `pause`, `resume`, `delete`, `reschedule`, `dismissOccurrence`, `reviewRecord`, `record`, `dismissSuggestion`; tables `recurring_*` (V22) | A schedule is an estimate: it writes no `activity` or `reminder` row; only `record` saves an expense, through `EntryService.record`, in the same transaction (D-048). Lock order household, account, category and member share |
| `recurring/service/Recurrence`, `Suggestions` | `following` (weekly, monthly and yearly with month ends and the anchor day); `find` (three or more bills about a month apart, same account, category and description) | The one place the next occurrence is computed, and the one place a suggestion is found |
| `recurring/repository/RecurringStore` | Plain SQL for schedules, occurrences, events, dismissals; reads the category through the merge pointer and hides a deleted account's schedules | Same shape as `BudgetStore`; no spending SQL |
| `household/repository/HouseholdLock` | `lock`: the household row `FOR UPDATE` | The first lock of every Budget and recurring write, before the account row and the share locks |
| `activity/service/EntryValidator.parseForReplay` | A retry (same key) compared with the stored row without today's category, member and date rules | The one replay path for entry, batch, reminder and historical entry (Q-044); never used to save |

Backend tests (`backend/src/test/java/com/mdstech/wealthmesh/`):

| Where                                   | What it does                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `TestcontainersConfiguration`           | Starts `postgres:17`; `DynamicPropertyRegistrar` sets R2DBC and Flyway properties|
| `HouseholdMemberApiTests`               | Ordered end-to-end API journey: create, conflict, validate, edit, list, delete   |
| `MemberLifecycleApiTests`               | Joint account, rename history, deactivate/restore, inactive-owner rule and its lock (held uncommitted deactivate) |
| `AccountApiTests`                       | Ordered API journey for accounts and `/today`; `@DirtiesContext` gives it its own database |
| `MutableClock`                          | `@Primary` test clock (from `TestcontainersConfiguration`); `setToday(date)`     |
| `web/SpaFallbackFilterTests`            | Parameterised cases for `isPageRequest` plus rewrite behaviour                   |

## Frontend (`frontend/src/`)

| Where                                         | What it does                                                                    | Why it matters                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `api/client.ts` `request()`                   | Typed fetch under `/api/v1`; absolute URL; `ApiError`; 204 handling             | Single place for URL, errors and network failure             |
| `api/household.ts`                            | `getHousehold`, `createHousehold`, `renameHousehold`, member functions, parsers | Components never build URLs or trust raw JSON                |
| `hooks/useHousehold.ts`                       | `useHousehold` (adds `isMissing` for 404), create and rename mutations          | Screens branch on state, not on exceptions                   |
| `hooks/useMembers.ts`                         | `useMembers`, `useAddMember`, `useUpdateMember`, `useSetMemberActive`           | Invalidates the list key after every change                  |
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
| `features/transfers/TransferForm.tsx`, `TransferChange.tsx`, `ChangeToTransfer.tsx`, `TransferFigures.tsx` | Add or correct a transfer, review a removal or Undo, change an expense to a transfer; Balances after come from `GET /transfers/preview` | Both sides change together, so the UI only ever sends the pair (slice 07) |
| `features/accounts/cardBalance.ts`, `BalanceFigure.tsx` | `isCard`, `cardSide`, `balanceText` and the figure component: a card reads "$1,000.00 owed" or "$50.00 Card credit" from the signed Balance | Every place a Balance is shown goes through these, so a card never shows a minus sign or "Overdrawn" |
| `features/activity/EntryHistory.tsx`, `RemindersCard.tsx` | History table (replaced and removed rows, Undo) and the account's reminders | Where the originals and plans are visible                    |
| `features/statements/*`                       | `StatementsCard` list and `StatementForm` (attach; revise with review and Cancel) | Supporting statements beside Reminders; no money effect     |
| `features/investments/*`, `api/investments.ts`, `hooks/useInvestments.ts` | `OpeningFields` (total, cash, holding lines), `OpeningReview`, `FinishSetup`, `InvestmentAccount` (draft card, Opening card, statements), `openingForm.ts` (the scenario's validation words) | The investment setup and its draft; the setup form branches on `typeTraits(type).kind === 'investment'` (slice 17) |
| `features/accounts/accountTypes.ts` `typeTraits` | Kind, institution label, date label, `holdsMoney` of a type | The one helper for type branches; add a type here, not at each screen (D-060) |
| `features/activity/UpdateBalance.tsx`, `StartingBalanceCorrection.tsx`, `HistoricalSetup.tsx` | Update balance choice, starting-balance review, reviewed move of the start for a pre-start entry | Where L8 and L9 live in the UI |
| `routes.tsx`                                  | Exported `routes` array and `createAppRouter()`                                 | Same routes in the app and in tests                          |
| `layout/AppLayout.tsx`, `AppFooter.tsx`       | Shell: skip link, nav, main, sticky footer                                      | Accessibility and consistent chrome                          |
| `layout/useDocumentTitle.ts`                  | Sets the tab title from `handle.title` of the deepest route                     | Titles stay next to the route definition                     |
| `features/household/HouseholdPage.tsx`        | Loading, error, create, details and members states                              | The reference screen to copy                                 |
| `features/household/HouseholdForms.tsx`       | Create, rename and member forms; `MemberForm` reviews a rename before saving     | Shows the form pattern end to end                            |
| `features/household/MembersCard.tsx`          | Member list with Edit, Remove (review, Cancel, Confirm), Restore, earlier names   | Member lifecycle UI (slice 05)                               |
| `design-system/forms/CheckboxGroupField.tsx`  | String-array checkbox group for react-hook-form; first box takes the focus on error | Used for joint owners                                         |
| `test/mockApi.ts`                             | In-memory backend for MSW: rules, 404/400/409, request log                      | Fast, realistic UI tests without a server                    |
| `test/render.tsx`                             | `renderWithProviders`, `renderRoute(path)`                                      | Fresh query cache, no retries, real routes                   |
| `test/setup.ts`                               | Starts MSW with `onUnhandledRequest: 'error'`                                   | Stray requests fail tests                                    |
| `features/recurring/*`, `api/recurring.ts`, `hooks/useRecurring.ts` | The Recurring bills page: suggestions, schedules, `ScheduleForm` (create, confirm, change), `RecordPanel`, `SchedulePanels`, `ActionPanel` | Every change is reviewed first, Cancel and Back save nothing, each exit says what changed and takes focus |

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
| `e2e/tests/11a-savings.spec.ts`        | Savings setup, edit, interest, and moving an entry to another account at 710px and 1280px; runs before 12 because 12 renames Alex Doe |
| `e2e/tests/11c-cards.spec.ts`              | Card setup, purchases, refund, payment, Update balance and statement at 710px and 1280px; Spending for a card; runs before 12 (renames Alex Doe) |
| `e2e/tests/12-members.spec.ts`         | Joint owners, rename, remove at 710px and 1280px; renames Alex Doe to Alex Patel, so it runs last |
| `e2e/tests/shell.spec.ts`              | Shell, navigation without reload, not-found view, API and health endpoints           |
| `.pre-commit-config.yaml`              | All hooks, grouped by stage                                                          |
