# Slice 01a: checking money out (expense entry and spending view)

Copy this file to `docs/features/slice-NN-<name>.md` at the start of the session. One file per slice, edited only by
the session working it. Keep it short; it exists so the next session needs no memory of this one.

- Slice: 01a in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/checking/activity.feature`, `spending/expenses/record-expenses.feature`, `household/members/manage-members.feature`, `spending/monthly-review/review-spending.feature`
- Status: done (committed locally, not pushed)
- Started: 2026-10-04  Finished:  Commit:

## Prompts and directions

Paste, verbatim, the kickoff prompt that started this session (see `docs/process/prompts.md`, note its version), then
add each instruction or answer the product owner gave at a checkpoint, with the date. No transcripts, no secrets.

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 01a in docs/features/INDEX.md.
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

- 2026-10-04 Checkpoint 1 answer: approved the task list. Idempotency key per form, replay returns the original, same key with different content is rejected, keys kept for a limited time (D-024). App-level "Entering as" chooser, remembered per browser, member id sent as a body field, and "Entered by: <name> (change)" shown on every review step (D-025). Temporary 400 messages must not claim to be final. Keep tool versions; Q-004 stays open.
- <date> Checkpoint 2 answer:

## Scope

Scenario IDs (D-023): `@V2_CHECKING_011`, `@V2_EXPENSE_001`, `@V2_EXPENSE_010`, `@V2_MEMBERS_001`, `@V2_MONTHLY_005`.

Capabilities added: L1 (activity ledger, dated Balance), L2 (seeded category list, D-020), L4 (expense entry, expense part only), P1 (review/confirm, repeat-safe save), P4 (entered-by chooser), S1 (month summary, spending part only).

## Gap analysis (2026-10-04)

Code today: accounts, owners, members, clock, `Money`; migrations V1, V2 only. No activity, category, expense or spending code. All 5 IDs are citeable once the capabilities above exist (5 of 5 after this slice; 0 of 5 today). Nothing deferred. v1 not opened; no scenario unclear.

## Decisions

Choices made that the feature file does not settle, each with the reason. Keep feature-local choices here; promote
a choice to `docs/decisions/decisions.md` only when other features will rely on it. Foundation rules live in
`docs/guides/domain-foundations.md`; do not restate them, only link.

- Future-dated expense: 400 with the foundations-4 message until P5 exists. Expense dated before `opened_on`: 400 until L8 (slice 04).
- `MONTHLY_005`: the Given is checking-only expenses totalling 3,660.00 in September (no card yet); "average recorded month" = months with at least one expense; fixed today 2026-10-03 makes October the empty month.
- Category seed: name and kind (spending/income) only; income categories never appear in the expense chooser.

## Task list (approved at checkpoint 1, 2026-10-04)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A ledger and categories: `activity` + `category` tables (V3), seeded categories, Balance = opening + activity to a date, `GET /categories` | supports all (no ID of its own) | API (Testcontainers) | todo |
| B expense entry, review and confirm, entered-by: `POST` expense (amount > 0, date not future, category, entered-by member), repeat-safe confirm, form keeps entered values on error; members in owner and entered-by choosers | `V2_EXPENSE_010`, `V2_CHECKING_011`, `V2_MEMBERS_001` | API + UI (MSW) + e2e | todo |
| C monthly spending view: month totals, by category, entries per category, entry detail; Balance after save | `V2_EXPENSE_001` | API + UI (MSW) + e2e | todo |
| D spending history and annual estimate: average recorded month, "based on one month" label, empty-month message | `V2_MONTHLY_005` | API + UI (MSW) + e2e | todo |

Commit order: A+B green first, then C, then D.

Levels: unit, API (Testcontainers), UI (Vitest + MSW), e2e (Playwright). Each ID needs at least one test that cites
it by name, for example in the test title or a comment.

## Coverage

`npm run coverage -- --require --slice 01a`: 5/5 covered. Nothing deferred.

| ID | API (`ExpenseApiTests`) | UI (`Expenses.test.tsx`) | e2e (`03-expenses.spec.ts`) |
| --- | --- | --- | --- |
| `V2_EXPENSE_010` | yes | yes | yes |
| `V2_CHECKING_011` | yes (replay, conflict, two forms) | yes (lost first answer, same key) | yes (slow double submit) |
| `V2_EXPENSE_001` | yes | yes | yes |
| `V2_MEMBERS_001` | - | yes | yes |
| `V2_MONTHLY_005` | yes | yes | yes |

Not tested (no path creates the rows yet): removed rows and non-expense kinds are excluded in SQL (`removed_at IS NULL`, `kind = 'expense'`) but untested until slice 02 (remove, Undo) and 01b (income). `V2_MEMBERS_001` has UI and e2e tests only. Validator note: the idempotency lookup before insert is equivalent to the duplicate-key fallback, so tests cannot tell them apart.

## Open questions

Anything that needs the product owner. Add it to `docs/decisions/questions.md` as well (that is the register the
next session reads), and mark the answer and date in both places when resolved.

## Handoff

- Built: `V3` migration (`category` seeded, `activity` ledger with `idempotency_key`), `ActivityStore` SQL (Balance deltas, entries, spending by category and month), `ExpenseService` (validation, repeat-safe save), `SpendingService`, endpoints `GET /categories`, `GET /accounts/{id}/activity`, `POST /accounts/{id}/expenses` (header `Idempotency-Key`), `GET /spending`, `/spending/entries`, `/spending/history`. UI: Add money out (form, review, confirm), activity list, Spending page, header "Entering as" (D-024, D-025).
- 01b needs: income entry (reuse `ExpenseService` shape and key handling; income categories are seeded), overdraft warning and basic wealth (`CHECKING_015`, D-022), `MONTHLY_004` wants "Balance dated 2026-09-30": Balance `asOf` is today the latest entry date, so add an explicit as-of query. `ActivityStore.SIGNED` already signs income and refund.
- Slice 02 must add tests for removed rows (SQL already filters `removed_at IS NULL`); slice 01b for non-expense kinds in spending.
- Known: a lost answer followed by an edited retry returns 409 "already used with different details"; the message should say the first save went through. The pre-insert key lookup is equivalent to the duplicate-key fallback (tests cannot tell them apart). `V2_MEMBERS_001` has UI and e2e tests only.
- Watch for: `npm run check` skips checkstyle (pitfall 36); e2e specs are numbered and each test starts with a fresh browser, so choose "Entering as" again in every test.
- Not checked: v1 was not opened; nothing in the scenarios was unclear.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: checkstyle failed only at lint, not in `npm run check`, and the validator found it on the index; two review rounds found real gaps (stale category, late date check) that tests written from the scenario text missed
- What went well: writing the API tests first made the repeat-safe save and the 409 cases concrete; the validator's planted defect caught a hole in the key tests
- Process change to try: run `npm run lint` and `git add -A` before every `npm run check`; at Prove, click the main path in the running app once before the checkpoint (pitfall 36)
