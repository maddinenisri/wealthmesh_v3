# Domain foundations

Decisions every feature relies on, made once in session 0 (row 00). Status: **draft, awaiting owner approval**.
Sources: `docs/requirements/v2/README.md` and the scenarios. No code or migration is written in this session; the
sketches below are the contract the first feature sessions implement. Change a rule only by adding a decision to
`../decisions/decisions.md`.

## 1. Money type and JSON format

- Java `BigDecimal`, scale 2, `RoundingMode.HALF_EVEN`; Postgres `NUMERIC(19,2)`. Never `double`.
- JSON carries amounts as **strings** (`"5000.00"`, `"-5.00"`), in and out. The server rejects numbers and more than
  two decimals (400). The UI formats for display only (`$5,000.00`, `-$5.00`).
- Sign: stored amounts are signed as the account sees them. Activity amounts are positive magnitudes plus a `kind`
  that fixes direction (see 6); only corrections and Balances may be negative.
- Why: JS floats drift (0.1 + 0.2); strings round-trip exactly. Shares and prices (investments, wave 3) need
  more scale: they get their own `NUMERIC(19,6)` columns then, never the money type.

## 2. Currency scope

- US dollars only, implicit. No currency column or code in the API. The README fixes USD for the household.
- Adding currencies later is a new decision plus a migration (add `currency`, default `'USD'`); until then no code
  may assume or hide a second currency.

## 3. Dated balances, "balance as of a date"

- Every Balance has a date. One Balance per account (README "One Balance"), computed, never stored.
- Ledger accounts (checking, savings, card, loan, mortgage, investment cash): opening amount (dated `opened_on`)
  plus the signed sum of non-removed activity with `occurred_on <= D`.
- Valued accounts (property, other assets, defined benefit): the latest dated value with `value_on <= D`, shown with
  its date. Investment Balance = cash + holdings at the price dated `<= D` (wave 3).
- No value yet, or the date predates tracking: return **"not available"** (null), never `0.00`.
- Blank starting balance on a new checking/savings account is saved as `0.00` dated the setup day. That differs
  from a legacy account with activity but no opening amount, which shows "Starting balance needed".
- Overdrafts stay negative; wealth treats a negative bank Balance as debt, counted once.
- Account history stays reachable: any "as of" request for an earlier date returns that date's figures unchanged.

## 4. Injectable clock, fixed "today"

- One `java.time.Clock` bean, zone `America/New_York` (property `wealthmesh.clock.zone`). All "today" logic uses it;
  no `LocalDate.now()` or `Instant.now()` in services or mappers (replace the one in `HouseholdMemberMapper`).
- Fixed today: property `wealthmesh.clock.fixed-today` (env `WEALTHMESH_CLOCK_FIXED_TODAY=2026-10-03`). Unset in
  production. `e2e/start-stack.sh` exports it, so Playwright sees the same date as the scenarios.
- API tests set today per test with a mutable test clock (many scenarios say "today is 2026-09-10").
- The UI never calls `new Date()` for defaults: it reads `GET /api/v1/today` so date pickers agree with the server.
- Types: business dates are `DATE` (`occurred_on`, `opened_on`, `value_on`); audit stamps are `TIMESTAMPTZ`.
- Rules: activity dated after today is refused ("Future values are not completed account history"; offer a reminder
  or planned item instead). Activity dated before the account's opening goes through reviewed history, not silently.

## 5. Account type model

- One `account` table: `id`, `household_id`, `type` (enum: checking, savings, credit_card, brokerage, 401k,
  traditional_ira, roth_ira, hsa, defined_benefit, property, other_asset, loan, mortgage), `name`, `institution`,
  `opened_on`, `status`, timestamps.
- `kind` is derived from `type` in code, not stored: `bank`, `card`, `investment`, `valued`, `debt`, `pension`. It
  selects the balance strategy (3) and the wealth group (README table). Adding a type means adding one mapping.
- `status`: `draft` (incomplete investment setup), `active`, `archived`, `closed`. Drafts never count in wealth.
- Type-specific data (card limit, rate, holdings) goes in its own table keyed by `account_id`, added by that
  type's feature. The shared table gets no nullable type-specific columns.
- Why: one list, one balance contract, one wealth query; per-type tables only where the data really differs.

## 6. Activity (ledger) table shape

- One `activity` table: `id`, `account_id`, `kind`, `amount` (`NUMERIC(19,2)`), `occurred_on`, `description`,
  `category_id` (null), `movement_id` (null), `entered_by_member_id` (null, FK), `reason` (null), `replaces_id`
  (null), `created_at`, `removed_at` (null), `removed_by_member_id` (null).
- `kind` enum: `income`, `expense`, `transfer_in`, `transfer_out`, `card_payment`, `interest`, `fee`, `refund`,
  `correction`. Each kind fixes the sign applied to the Balance (a purchase raises a card's amount owed; income
  raises a bank Balance). Direction lives in the kind, so `amount` stays a positive magnitude, except `correction`,
  which is signed.
- Removal is soft (`removed_at`): history and Undo need the row; Balance, income and spending queries filter it out.
  Undo clears `removed_at` and records who. Rows are never updated in place for money fields: an edit is a
  replacement row (`replaces_id`) so the original stays visible.
- `entered_by_member_id` is a history annotation chosen in the UI, not authentication.
- Income = sum of `income`; spending = sum of `expense` and `fee`, less `refund`. Nothing else counts.

## 7. Linked transfers and card payments

- A transfer or card payment is two `activity` rows sharing one `movement_id` (`transfer_out` on the source,
  `transfer_in` on the target; `card_payment` on the bank side, matching card row). Created, edited, removed and
  undone in one transaction, so the pair always changes together.
- Their kinds are excluded from income and spending by definition (6), even when a single account is filtered.
- A bank-to-bank or bank-to-card movement must name two different accounts of the same household.

## 8. Corrections never become income

- A Balance correction is an `activity` row with `kind = correction`, signed amount, a required `reason`, the
  member and time. Its kind is outside the income and spending sums, so the exclusion is structural, not a filter
  someone can forget.
- Corrections change the Balance only. They are reviewed before saving (show the resulting Balance) and listed in
  history with original and corrected amounts.
- When a later fee explains a correction, the user reviews replacing it: the new row sets `replaces_id`, the old row
  shows as replaced, and the fee counts once. Debt corrections without a payment follow the same shape.

## 9. Members, ownership, joint accounts

- `account_owner(account_id, member_id)` join, primary key on the pair. Checking, savings and cards may have one or
  more owners (joint); 401k, IRAs, HSA and defined benefit exactly one (a service rule). Property and other
  assets: one or more.
- Wealth sums accounts, not owner links, so a joint account counts once. A member's view filters by the join.
- Removing a member sets `active = false` (new column when the members feature needs it). Ownership and history
  remain; the member disappears only from new choices. No cascade deletes.
- The existing `UNIQUE (household_id, id)` on `household_member` supports a composite FK so an owner link cannot
  cross households (Q-005 is not decided here).

## 10. Archive, close, delete

- **Archive**: allowed with money or debt; Balance stays in wealth with an "Archived" label; hidden from choices.
- **Close**: requires an accounted-for zero Balance; shown as closed, history kept.
- **Delete**: only for drafts or accounts with no activity and no corrections beyond the opening row. Soft delete
  (`deleted_at`) with Undo; accounts with activity can only be archived or closed.
- Archived and closed accounts can be restored to active by Undo or an explicit reopen (feature decides).

## 11. Test-ID citation

- Scenario ID format `V2_<AREA>_<NAME>_<NNN>` as in the `.feature` tags. `scripts/scenario-coverage.sh` counts an ID
  as covered when it appears as a whole word anywhere under `backend/src/test`, `frontend/src` or `e2e/tests`.
- Cite in the test **title** (JUnit `@DisplayName("V2_CHECKING_SETUP_001 ...")`, Vitest `it('V2_... ...')`,
  Playwright `test('V2_... ...')`), so a failing test names its scenario. A comment also satisfies the script but
  is not preferred.
- A scenario built only in part (for example `V2_CHECKING_002` without salary) is **deferred whole** in
  `docs/features/deferred.txt` with a reason, and no test cites its ID until it fully passes (Q-007: yes). Do not
  put a deferred ID in a test title or comment: the script would count it as covered.
