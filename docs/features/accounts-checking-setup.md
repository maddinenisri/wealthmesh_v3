# Checking account setup (row 01)

- Feature file: `docs/requirements/v2/accounts/checking/setup.feature`
- Status: partial (002 and 006 deferred whole, D-016)
- Started: 2026-10-04 10:39 EDT  Finished: 2026-10-04  Commit: see git log

## Prompts and directions

- Kickoff prompt (v1, plus one added paragraph):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for accounts/checking/setup.feature.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.

Row 01 has 7 scenarios. Per the board, 006 and the salary half of 002 depend on later features, so they'll be deferred whole (D-016). It will also add the clock bean, GET /api/v1/today and the e2e fixed-today export.
```

- 2026-10-04 Checkpoint 1 answer: task list approved; Q-008 yes, Q-009 yes (D-017), Q-010 yes, Q-011 yes; tool upgrades not requested (Q-004 stays open)
- 2026-10-04 Checkpoint 2 answer: "land it" (commit and push)

## Scope

7 scenarios: `@V2_CHECKING_001`, `@V2_CHECKING_002`, `@V2_CHECKING_003`, `@V2_CHECKING_004`, `@V2_CHECKING_005`,
`@V2_CHECKING_006`, `@V2_CHECKING_017`. Plus the plumbing from the foundations handoff: clock bean,
`GET /api/v1/today`, e2e fixed-today export.

Deferred whole (D-016): `V2_CHECKING_002` (salary step needs income, row 04), `V2_CHECKING_006` (older saved file,
legacy "Starting balance needed", reviewed history; no import or activity yet). The zero-start half of 002 is still
built and tested, with test titles that do not contain the ID.

## Gap analysis

Code today: household and members only (one migration, `V1`). Nothing exists for accounts, owners, money, clock or
`today`. The members API and household screen exist and are reused for the owner choice.

| ID | State | Needs |
| --- | --- | --- |
| 001 | missing | `account` + `account_owner` tables, create/list/get API, list + detail + form screens |
| 002 | half missing, half blocked | zero-start path (same as 001); salary step blocked on income (row 04) |
| 003 | missing | edit endpoint (no balance fields), edit form, "Update balance" action present |
| 004 | missing | cancel path in the form (UI only) |
| 005 | missing | name validation, field values kept, cancel leaves no account |
| 006 | blocked | needs legacy account with an expense and reviewed history (rows 03, 05) |
| 017 | missing | money parsing and message "Enter a valid amount" |

## Decisions

Feature-local choices (rules from `docs/guides/domain-foundations.md` are not restated):

1. **Cross-cutting, proposed for `decisions.md` (Q-009):** the opening amount lives on the account row
   (`opening_amount`, `opened_on`), not as an activity row. Keeps "the starting amount is not counted as income"
   structural (foundations 3, 6). Foundations 5 lists no `opening_amount` column and 10 says "the opening row", so
   this refines the page. The `activity` table arrives in row 03; its balance query adds to `opening_amount`.
2. API shape: `POST/GET /api/v1/accounts`, `GET/PUT /api/v1/accounts/{id}`. Body carries `type` (`checking` only for
   now), `name`, `institution`, `ownerMemberIds` (list; UI offers one owner until joint accounts in row 02),
   `openedOn`, `openingBalance` (string or null). `PUT` has no balance fields. The response has
   `balance: { amount, asOf }`; with no activity, `asOf` is `openedOn`.
3. Money: JSON string, two decimals, rejected otherwise (foundations 1). The form accepts `$5,000.00`, `5000`, strips
   `$` and commas, sends `"5000.00"`. Anything else shows "Enter a valid amount".
4. At least one owner is required; owners must be members of the account's household (composite FK).
5. `openedOn` after today is refused (400). Proposed from foundations 4; not stated in the scenarios (Q-011).
   `householdId` is derived server-side from the singleton household, not sent in the body; with no household the API
   answers 409 "Create the household first".
6. Clock: `java.time.Clock` bean in `America/New_York`, `wealthmesh.clock.fixed-today` property, `GET /api/v1/today`
   returns `{ "today": "YYYY-MM-DD" }`. `e2e/start-stack.sh` exports `WEALTHMESH_CLOCK_FIXED_TODAY=2026-10-03`. The
   existing `Instant.now()` in `HouseholdMemberMapper` moves to the clock.
7. Routes: `/accounts` (list), `/accounts/new`, `/accounts/:id`, `/accounts/:id/edit`; "Accounts" joins the nav.

## Task list (approved at checkpoint 1)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A. Plumbing: clock bean, `/today`, both household mappers use the clock (abstract mappers), mutable test `Clock`, e2e export, migration `V2` (account, account_owner), money parse/format helpers | none | unit + API | done |
| B. Create and find: form, list, detail, zero-start, validation, invalid amount | `V2_CHECKING_001`, `V2_CHECKING_005`, `V2_CHECKING_017` | API + UI (MSW) + e2e | done |
| C. Edit and cancel: edit form without balance, "Update balance" action, cancel leaves data | `V2_CHECKING_003`, `V2_CHECKING_004` | API + UI (MSW) + e2e | done |
| D. Deferred whole | `V2_CHECKING_002`, `V2_CHECKING_006` | none (rows in `deferred.txt`) | deferred |

## Coverage

`npm run coverage -- --require accounts/checking/setup`: 5/7 covered, 2 deferred, 0 missing.

| ID | Levels (test file) |
| --- | --- |
| `V2_CHECKING_001` | API `AccountApiTests`, UI `CheckingSetup.test.tsx`, e2e `02-checking-setup.spec.ts` |
| `V2_CHECKING_003` | same three |
| `V2_CHECKING_004` | UI and e2e (the API has nothing to cancel) |
| `V2_CHECKING_005` | same three |
| `V2_CHECKING_017` | same three |
| zero-start half of 002 | API, UI, e2e, with titles that do not cite the ID |
| `V2_CHECKING_002`, `V2_CHECKING_006` | deferred, see `deferred.txt` |

Validator run (independent): all checks green; one defect (edit with a bank name over 120 characters returned 500)
fixed and tested; thin e2e Then-step assertions tightened. "Starting amount is not counted as income" has no direct
assertion at any level, by Q-008: the proof is structural (no activity row exists).

## Open questions

Resolved at checkpoint 1, all "yes" (Q-008 to Q-011 in `docs/decisions/questions.md`; Q-009 became D-017):

- Q-008: `V2_CHECKING_001` says the starting amount "is not counted as September income", but income reporting only
  arrives in row 04. Recommended: structural proof counts (no activity row exists, detail shows empty activity), so
  001 is built now. Alternative: defer 001 whole.
- Q-009: promote decision 1 (opening amount on the account row) to `decisions.md`?
- Q-010: "Update balance" (003) and add money in/out/transfer (001) before row 03. Recommended: visible actions that
  open an amount-and-date form (Update balance) or are disabled with a note, saving enabled in row 03.
- Q-011: refuse an opening date after today (decision 5)?

## Handoff

- Built: account + owner tables (`V2`), accounts API, clock + `/today`, list/detail/setup/edit screens.
- Still to do in later rows:
  - Row 02: `account_owner` already supports joint accounts; the UI offers one owner. Deleting a member who owns an
    account returns 500 (FK); members need `active=false` (foundations 9) before that works cleanly.
  - Row 03: the `activity` table; extend `AccountMapper.balance(...)` to add activity up to the date, enable the
    "Add money in/out/transfer" buttons and make "Update balance" save (a correction, foundations 8).
  - Row 04: income reporting, and then `V2_CHECKING_002`'s salary step (remove its row from `deferred.txt`, add the
    test, cite the ID).
  - `V2_CHECKING_006` needs legacy accounts with no opening amount: `opening_amount` is NOT NULL today, so that row
    adds a migration that makes it nullable.
- Watch for: the opening date must not be in the future (Q-011); amounts are strings end to end (`lib/money.ts`,
  `Money`); e2e specs are numbered because they share one database (pitfall 35); API test classes use
  `@DirtiesContext` (pitfall 34).
- Not checked: v1 was not opened; nothing in the scenarios was unclear.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: shared Testcontainers context and file-ordered e2e specs both depend on an empty database; found only when adding the second class and spec
- What went well: tests first on every layer; the validator found a real 500 and thin e2e assertions that I fixed before landing
- Process change to try: pitfalls 34 and 35 written down; row 02 should cite them instead of rediscovering
