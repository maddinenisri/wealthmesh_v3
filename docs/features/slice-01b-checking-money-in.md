# Slice 01b: checking money in (income entry, overdraft, basic wealth, income minus spending)

- Slice: 01b in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/checking/setup.feature`, `accounts/checking/activity.feature`, `household/setup/set-up-household.feature`, `spending/income/record-income.feature`, `spending/monthly-review/review-spending.feature`
- Status: in-progress (built and proved; waiting for checkpoint 2)
- Started: 2026-10-04 15:33  Finished:  Commit:

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 01b in docs/features/INDEX.md.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

- 2026-10-04 Checkpoint 1 answer: all six proposals approved (income reuses the entry service with an explicit kind; Balance date unchanged; overdraft as debt counted once; advisory client-side warning; Spending page becomes the month review; type field on Add account). Caveats: write the backdated-overdraft gap down as known for slice 03; show disabled account types with "coming soon" wording.
- <date> Checkpoint 2 answer:

## Scope

Scenario IDs (D-023): `@V2_CHECKING_002`, `@V2_CHECKING_015`, `@V2_HOUSEHOLD_SETUP_003`, `@V2_INCOME_001`, `@V2_INCOME_005`, `@V2_MONTHLY_004`.

Capabilities added: L3 (income entry), L4 (expense entry, overdraft warning part), P1 (review/confirm, reused), S1 (month summary, income part and Income minus spending), W1 (basic wealth: financial assets and debts, overdraft as debt, D-022).

## Gap analysis (2026-10-04)

Code today: expense entry (`ExpenseService`, `POST /accounts/{id}/expenses`, key handling D-024), seeded income categories (Salary, Interest), `ActivityStore.SIGNED` already signs income, spending summary and history, "Entering as" (D-025), accounts with Balance. Missing: income entry (endpoint, form), month Income and Income minus spending, wealth totals and any household overview of accounts, overdraft warning and label, "Add account" entry point on the overview. All 6 IDs are citeable once those exist (6 of 6 after this slice). Nothing blocked. v1 not opened; no scenario unclear.

`V2_CHECKING_002` is in `deferred.txt` (waiting for this slice); remove that line when it is built and cited.

## Decisions (proposed, for approval)

- Income entry reuses the expense machinery: `ExpenseService` becomes one entry service with a `kind` (expense or income); same key rules (D-024), same entered-by rule (D-025), income categories only in the income chooser. Endpoint `POST /accounts/{id}/income`.
- Balance date: 01a's handoff suggested an explicit as-of query. Proposed instead: keep "as of the later of opening date and latest entry"; no ID in scope needs a query for another date (foundations 3 as-of lands with the first scenario that does). `MONTHLY_004` is built with the salary dated 2026-09-30, so the Balance reads "dated 2026-09-30".
- Wealth (W1): `GET /wealth` returns financial assets (sum of positive bank Balances) and debts (sum of overdrafts as positive numbers) as of today. A negative checking Balance counts once, as debt, and stays negative on its own account (D-022).
- Overdraft: the expense review step shows a warning when the save would take the Balance below zero; Confirm still saves it. The warning is advisory and client-side (current Balance minus the entry); the server saves without a flag, and backdated entries do not recompute it. After saving, Balance shows "Overdrawn by $30.00" with the notice that this records what happened and does not authorize a bank payment.
- Monthly review: the Spending page becomes the month review with Income, Spending and "Income minus spending" for the month; Income drills to its entries like spending does. Route and nav label stay `spending` until slice 13 unless you say otherwise.
- Household overview: the home page gains an accounts-and-wealth card ("No accounts have been added", $0.00 assets, $0.00 debts, "Add account"); "Add account" opens the account form with a type field where Checking is the only enabled option until slice 06 (the scenario says she chooses checking). The form needs an owner, so Maya must exist as a member (e2e has her from 01; the UI test seeds her).

## Task list (awaiting approval)

Citation rule (D-016): an ID is cited only by the commit that makes it fully pass, so groups are ordered by what each ID needs.

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A income entry: generalise the entry service by kind (replay compares `kind`), `POST /accounts/{id}/income` (amount > 0, no future date, income category, entered by, repeat-safe), form with review and confirm, kept values on error, "Add money in" enabled | `V2_INCOME_005` | API + UI (MSW) + e2e | todo |
| B month review and basic wealth: Income, Income minus spending, income entries and entry detail (amount, date, account, category, entered by), `GET /wealth` (assets, debts), Balance on list/detail/wealth, opening amount is not income; cites CHECKING_002 once salary shows as September income | `V2_INCOME_001`, `V2_CHECKING_002`, `V2_MONTHLY_004` | API + UI (MSW) + e2e | todo |
| C overdraft: advisory warning on the expense review, "Overdrawn by $30.00" label on list and detail, notice, wealth shows it as debt | `V2_CHECKING_015` | API + UI (MSW) + e2e | todo |
| D household overview: accounts and wealth card, empty state, "Add account" with a type chooser, open the account and add the first transaction | `V2_HOUSEHOLD_SETUP_003` | API (empty wealth) + UI (MSW) + e2e | todo |

Commit order: A, B, C, D. Extra tests owed from 01a: income and other non-expense kinds are excluded from spending.

## Data plan (shared e2e database)

Specs run in file order on one database. After `03-expenses` the household has Everyday Checking ($5,000.00 from 2026-09-01) and Household Checking ($5,000.00 from 2026-09-01) with September expenses of exactly $3,660.00 ($100.00 first purchase, $180.00 Electricity, $3,380.00 from the API rows) and Household Checking at $1,340.00.

- Exact household figures (September spending $0.00, wealth $0.00 and $0.00, Balance $5,120.00 from an opening of $2,780.00) are asserted in API tests on a fresh `@DirtiesContext` class and in UI tests on the MSW mock; they cannot be asserted in e2e.
- e2e asserts what is stable: the account's own Balance (list, detail), the entry detail, and income, spending and Income minus spending for September built on 03's $3,660.00 (salary $6,000.00 dated 2026-09-30 into Household Checking gives $7,340.00 and $2,340.00).
- The empty-overview assertions for `HOUSEHOLD_SETUP_003` go into `01-household.spec.ts` (after the household and members exist, before any account); the add-account path runs in a new account named differently from the existing ones.
- Overdraft in e2e uses a new account opened at $50.00.

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites it by name.

## Coverage

`npm run coverage -- --require --slice 01b`: 6/6 covered. `deferred.txt` lost the `V2_CHECKING_002` line. No feature file is completed by this slice, so no `--require <path>`.

| ID | API | UI (MSW) | e2e |
| --- | --- | --- | --- |
| `V2_INCOME_005` | `IncomeApiTests` | `Income.test.tsx` | `04-income.spec.ts` |
| `V2_INCOME_001` | `IncomeApiTests` | `MonthReview.test.tsx` | `04-income.spec.ts` |
| `V2_CHECKING_002` | `ZeroStartIncomeApiTests` | `MonthReview.test.tsx` | `04-income.spec.ts` |
| `V2_MONTHLY_004` | `MonthReviewApiTests` | `MonthReview.test.tsx` | `04-income.spec.ts` |
| `V2_CHECKING_015` | `WealthApiTests` | `Overdraft.test.tsx` | `04-income.spec.ts` |
| `V2_HOUSEHOLD_SETUP_003` | `WealthApiTests` | `HouseholdOverview.test.tsx` | `01-household.spec.ts` (empty overview), `04-income.spec.ts` (add and open) |

Also tested: income never counts as spending (`IncomeApiTests`). Other kinds (transfers, corrections) cannot be created yet; SQL filters by kind and slice 07 and 03 must test them. The `kind` check in `EntryService.replay` is redundant with category kind today (the validator could not prove it by a test).

## Known gaps

- The overdraft warning compares the entry with the current Balance, so a backdated entry that would have overdrawn the account earlier gets no warning. Slice 03 (corrections, backdating) revisits it.
- `CHECKING_002` ("Examples") runs both choices against one household in `ZeroStartIncomeApiTests`, so it asserts September income as a running total (6,000.00, then 12,000.00).
- A first run of `ZeroStartIncomeApiTests` once failed with `401 UNAUTHORIZED` on household creation while sibling classes were failing; it did not recur. Not diagnosed.

## Open questions

## Handoff

- Built: `EntryService` (was `ExpenseService`) takes a kind (`expense` or `income`); `POST /accounts/{id}/income`; `GET /income`, `/income/entries`, `/review` (income, spending, Income minus spending); `GET /wealth` (financial assets, debts; a negative bank Balance counts once as debt). UI: Add money in (same form as money out), Spending page now shows Month review, Income and Spending sections, overdraft warning on review plus "Overdrawn by" label and notice, household overview card "Accounts and wealth", Add account with an Account type chooser (Checking only; the rest "coming soon").
- Test base: `LedgerApiTestBase` gives each API class its own database and helpers (household, account, income, expense). Use it for new ledger tests.
- Slice 02 must add tests for removed rows (SQL already filters `removed_at IS NULL`) and apply Edit, Remove and Undo to income too. Slice 03 owns the as-of Balance query and the backdated overdraft warning.
- Watch for: Playwright `getByLabel('Month')` also matches the "Month review" region, so use `{ exact: true }`; e2e figures depend on file order (01 to 04), see the data plan.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session:
- What went well:
- Process change to try:
