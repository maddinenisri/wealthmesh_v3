# Slice 03: balance corrections

- Slice: 03 in `docs/features/INDEX.md` (IDs in `slices.txt`); feature files touched: `accounts/checking/activity.feature`, `household/members/manage-members.feature`
- Status: done
- Started: 2026-10-04 18:29  Finished: 2026-10-04  Commit: `02851d2`, `4ad7a55`, `f9fd8ac`, `4ddb5b8` (pushed)

## Prompts and directions

- Kickoff prompt (v2):

```text
Work in /Users/srini/workspace/mdstect_ws/wealthmesh_v3. Run the feature-session skill for slice 03 in docs/features/INDEX.md (IDs in docs/features/slices.txt).
Repository facts supersede this prompt. Stop at the task-list approval and again when the app is ready to look at.
```

- 2026-10-04 Checkpoint 1 answer: approved, follow recommendations (kind `expense` + Bank fees; zero-difference guard kept; same-date match in 014).
- 2026-10-04 Checkpoint 2 answer: owner's click-through passed all five checks; fixed missing-reason visibility and the edit-correction prefill (original reason shown); Balance and Initial Balance use the page font, same size, date on its own line; approved to commit and push. Layout polish left for later (see handoff).

## Scope

`@V2_CHECKING_009`, `@V2_CHECKING_013`, `@V2_CHECKING_014`, `@V2_CHECKING_018`, `@V2_MEMBERS_003`. Capability added: L5 (balance correction). All 5 citeable once L5 exists (needs only slice 01 and 02 capabilities); none deferred. Preflight: JDK 25, docker, db 5434, `wm-backend` 8081, `wm-frontend` 5180 up; git clean.

## Gap analysis (2026-10-04)

Have: `activity.kind = 'correction'` allowed in the schema (signed amount, `reason`, `replaces_id`); `SIGNED` SQL already adds corrections to Balance and keeps them out of income and spending (expense and income sums filter by kind); `EntryChangeService` (replacement swap, events, soft remove); `EntryValidator`; entered-by chooser; idempotency keys (D-024); basic wealth sums deltas; disabled "Update balance" action (Q-010).

Missing:
- No Balance as of a date (only current: opening + all activity). 009 and 018 need "current at 9/30" and "current after later activity".
- No correction endpoint, no review (preview) figures, no UI form (button is inactive).
- History lists only `expense` and `income` rows and not the account's initial amount (009 needs "initial amount, expense and dated correction"). No "viewing September 30" view (018).
- 014 replaces a `correction` with an `expense` (replacement across kinds); `original()` accepts only expense and income.
- 013 edits a correction: preview must compute the Balance on the date without the correction being replaced.
- MEMBERS_003 wording: "selected household member who entered the record, not a sign-in".

## Decisions (proposed, for approval)

1. Correction amount = requested Balance minus Balance as of the date D (activity with `occurred_on <= D`, opening included), stored signed. Later activity stays; current Balance moves by the same difference (018: 4,900 to 5,000 at 9/30, current 5,900 to 6,000).
2. The review is a server preview (`GET /accounts/{id}/balance-corrections/preview`, informational only): Balance on D now, requested, difference, current Balance after, and an advisory warning if current Balance would be negative. The save (`POST`) sends requested Balance, as-of date, reason, member and key, and the server computes the signed amount at save time (`requested - Balance as of D`), so a stale preview cannot store a wrong figure. A replayed key compares on those requested figures (D-024).
3. As-of date: not after today (400). Before `opened_on`: the as-of view returns "not available" (foundations 3) and a correction is refused (tracking-start review is slice 04). Reason is required. Optional guard (drop if you prefer): a new correction with zero difference is refused ("Balance already matches"); editing may land on zero (013).
4. Edit of a correction = replacement row (same mechanism as slice 02), date and requested Balance can change; original stays in history as replaced. Exclusion rule: the Balance on D is computed without the row being replaced (013: 5,000 - 100 correction + 0 = 4,900 as requested, so the new correction is 0.00).
5. Replace with the actual fee (014) starts in the expense form, as the scenario says ("finds a fee and chooses to record it"). The expense review detects an effective correction on the same account whose signed amount is minus the fee amount and offers "replace that correction" instead of a second entry; no match means a normal expense save. Confirm posts to a replacement endpoint that accepts a different kind (today `swap()` keeps `original.kind()` and `original()` allows only expense and income; both generalize). The new row is a Bank fees `expense` that replaces the correction; preview shows Balance unchanged and month spending after. **Owner decision:** use kind `expense` with category Bank fees (spending sums unchanged; proposed) or kind `fee` (foundations 6 lists it, but spending SQL counts only `expense`, so the filters widen now). Recorded in `decisions.md` either way. Same-date match required (proposed; loosen if you disagree).
6. Account history becomes a full ledger view: initial amount row (from the account row, D-017), expenses, income, corrections, with status, who, time, reason. Existing history for expenses and income stays as is.
7. "View as of" date control on the account detail shows that date's Balance without changing the current one (018). Read-only, backed by `GET /accounts/{id}/balance?asOf=`.
8. Entered-by note under history rows: "Selected household member who entered this record. Not proof of sign-in." (MEMBERS_003).

## Task list (for approval)

| Group | Scenario IDs | Test level | Status |
| --- | --- | --- | --- |
| A as-of Balance + new correction: balance-as-of endpoint, preview, save with reason and key, Update balance form and review, correction in history with initial amount, who/time/reason and the not-a-sign-in note, view-as-of date, Balance consistent in list, detail and wealth, Income and spending unchanged | `V2_CHECKING_009`, `V2_CHECKING_018`, `V2_MEMBERS_003` | unit (delta math) + API + UI (MSW) + e2e | todo |
| B edit a correction: replacement preview (original, corrected, date, reason), cancel leaves Balance, confirm keeps both versions in history, expense still once | `V2_CHECKING_013` | API + UI (MSW) + e2e | todo |
| C replace a correction with the actual fee: offer on a correction, preview (Balance unchanged, spending after), confirm, history shows "replaced by fee" | `V2_CHECKING_014` | API + UI (MSW) + e2e | todo |

Group A is heavy, so it lands as green commits by layer (as-of Balance and preview, then save and history, then UI and e2e). `ActivityList` also renders correction rows (signed amount, reason, no category). Commit order: A, B, C. Each ID is cited only by the commit that makes it fully pass (D-016).

## Data plan

e2e fixed today is 2026-10-03; new accounts per spec (`07-corrections.spec.ts`) so figures are exact; household-wide totals in API tests on `LedgerApiTestBase`.

## Coverage

`npm run coverage -- --require --slice 03`: 5/5 covered. Nothing deferred. No feature file is completed by this slice.

| ID | API | UI (MSW) | e2e |
| --- | --- | --- | --- |
| `V2_CHECKING_009` | `BalanceCorrectionApiTests` | `BalanceCorrection.test.tsx` | `07-corrections.spec.ts` |
| `V2_CHECKING_018` | `BackdatedCorrectionApiTests` | `BalanceCorrection.test.tsx` | `07-corrections.spec.ts` |
| `V2_MEMBERS_003` | `BalanceCorrectionApiTests` | `BalanceCorrection.test.tsx` | `07-corrections.spec.ts` |
| `V2_CHECKING_013` | `CorrectCorrectionApiTests` | `BalanceCorrection.test.tsx` | `07-corrections.spec.ts` |
| `V2_CHECKING_014` | `CorrectCorrectionApiTests` | `BalanceCorrection.test.tsx` | `07-corrections.spec.ts` |

Also tested: retry of a correction save after later activity (D-024), concurrent saves apply once, correction cannot be removed or undone, replaced correction cannot be replaced again, as-of before opening is "not available". Mutation check: dropping the "leave out the replaced correction" rule failed both 013 API tests; restored. Validator found the retry and concurrency bugs; both fixed with tests.

## Open questions

Fee kind (`expense` + Bank fees vs `fee`), decision 5; optional zero-difference guard, decision 3.

## Handoff

- Built: `BalanceCorrectionService` (as-of Balance, preview, save, edit as replacement), `BalanceController` (`GET /accounts/{id}/balance?asOf=`, `GET .../balance-corrections/preview`, `POST .../balance-corrections`), `ActivityStore.changeUpTo` and `lockAccount`, `V6__correction_requested_balance.sql`; fee replacement reuses `POST .../activity/{id}/replacement` (a correction is replaced by an expense; amount and date must match). UI: `BalanceCorrection` (Update balance form, review, reason, edit), history with the Initial Balance row, a not-a-sign-in note and "Replaced by the Bank fees expense", "Balance on a date" card, replacement offer in `AddEntry`. `ActivityResponse` gained `reason`.
- Decisions: D-028, D-029. Feature-local: the zero-difference guard (a new correction that changes nothing is refused; an edit may land on zero); a correction cannot be removed, undone or dated in the future; a date before opening is refused (slice 04 owns tracking-start review).
- The Update balance form is live; the old inactive form and its tests were replaced (`CheckingSetup.test.tsx`, `02-checking-setup.spec.ts`).
- Left for later (owner's review, not done): tables still scroll inside their card at 710px (Activity 7px too wide, history Reason column cut off); history rows are tall and repetitive; long correction descriptions wrap to five lines; the replacement offer is the default whenever amount and date match, and "separate" does not reset when the amount or date changes. If a fee expense is later removed its replaced correction does not return, so the Balance moves (slice 02 rules).
- Account detail: Balance and Initial Balance use the page font at the same size (the `Amount` component stays serif elsewhere; owner may want it everywhere).
- Fee replacement checks amount and date only, not the category; the scenario uses Bank fees (D-029).
- Watch for: `post()` in `LedgerApiTestBase` encodes a slash in its path argument, so nested paths need `webTestClient` directly; `Amount` keeps cents in a nested span, so use `toHaveTextContent`.

## Retro (3 lines, also appended to `docs/process/retro.md`)

- What slowed this session: the validator found a retry bug and a concurrent-save race after the build, second session in a row with a post-build race; owner found form usability gaps (reason message off-screen, empty edit form) at checkpoint 2.
- What went well: three groups on one service, a server-computed amount, a stored requested figure and an account lock; mutation check caught the edit rule.
- Process change to try: for any save with an idempotency key, test the retry after the ledger changed and a concurrent save before the validator; for edit forms, prefill and show original values.
