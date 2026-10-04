# WealthMesh v2 product features

Maya and Sam use one local household workspace to set up their accounts, record a month and understand why their wealth changed. These feature files describe the product to build, with concrete user actions and outcomes.

Start with the [complete household journey](household/journeys/manage-household-finances.feature), including September setup and review, October continuation and payroll retirement contributions. Each individual scenario states its own starting situation and can be read independently.

## One Balance for each account

Each account has **one Balance**, used consistently in the account list, details and household wealth. Every Balance has a date. Earlier activity and values remain available when reviewing an earlier date.

- **Checking and savings:** an optional starting Balance plus recorded income, expenses, transfers and reviewed corrections. A blank starting amount becomes $0.00 on the setup date. Saving completes that choice; there is no extra zero-confirmation step.
- **Credit cards:** one Balance labelled as an amount owed or a **Card credit**. Purchases, refunds, interest, fees and payments change that same amount.
- **Brokerage, 401k, Traditional IRA, Roth IRA and HSA:** one Balance calculated from all cash and holdings. For example, $15,000.00 cash plus 50 shares priced at $100.00 gives a $20,000.00 Balance. Cash and holdings explain the total; they are not competing account balances.
- **Defined benefit plans:** one dated, plan-reported cash value. A promised monthly pension is described separately and is not treated as money already owned.
- **Property and other assets:** one manually entered, dated value. **Loans and mortgages:** one manually entered amount owed, changed by recorded principal payments and reviewed corrections.

Investment setup with a known total requires the complete cash and holding amounts to explain it. An unexplained difference is not assumed to be cash. Incomplete setup remains a draft; a completed empty account has zero cash and no holdings. Unknown purchase cost is shown as "Not available" and does not prevent displaying a holding with a known current value.

**Edit account** changes its name, institution and permitted owner choices. **Update balance** reviews a cash, card or manually valued asset/debt correction with its amount, date and reason. Investment changes are made to cash, holdings or prices and recalculate the one Balance. Original values and corrections remain in history; corrections never silently become income or spending. If a missing fee explains a previous correction, the user reviews replacing that correction so the fee is counted once.

An account saved by an older version with activity but no starting amount shows "Starting balance needed" and guides reviewed recovery. This is different from creating a new account and saving a blank starting amount as zero.

## Household rules

- One shared local workspace contains named members. The selected entered-by name is a local history annotation, not an authenticated sign-in. Removing a member from new choices retains their existing account ownership and history.
- Joint accounts appear in each owner's view and count once for the household. Retirement plans, IRAs and HSAs have an individual owner or participant.
- Transfers and card payments are linked movements. They are excluded from income and spending even when only one account is selected.
- The preferred terms are **Budget**, **Income minus spending** and **Card credit**. Categories carry an Essential or Discretionary default, with an explicit choice on each expense. Changing a default does not rewrite past choices. Uncategorized spending remains included and flagged for review.
- Recurring bills are estimates until confirmed as actual expenses. Early payment advances from the scheduled due date. Pause, resume, dismissal, removal and overdue states retain actual payment history.
- Review shows what will change. Cancel leaves saved records unchanged. Repeated confirmation or Undo acts once. Removing saved activity preserves history; linked movements and split payments change together.
- Archiving an account with money or debt keeps its Balance in wealth. Closing requires an accounted-for zero Balance. Deletion is available for unused accounts and drafts, with Undo.
- Actual overdrafts remain visible as negative bank balances and debt. Future activity is planned rather than posted as completed. Earlier-than-opening activity requires reviewed history instead of silently counting it again.

## Wealth and investment groups

| View | Accounts included |
|---|---|
| Bank money | Checking and savings, including visible negative overdraft amounts |
| Investments | Brokerage, 401k, Traditional IRA, Roth IRA and HSA; complete cash plus holdings |
| Retirement | 401k, Traditional IRA, Roth IRA and defined benefit cash value |
| Health savings | HSA |
| Property and Other assets | Manually entered property and other asset values |
| Debts | Card debt, overdrafts, loans and mortgages |
| Household wealth | All assets minus all debts, each account counted once |

Retirement and Investments overlap. Their summaries explain membership and are never added together to create household wealth. A Card credit is an asset; it does not hide debt on another card. Archived amounts remain included. Older value dates and missing values are clearly identified rather than replaced with invented zeros.

Investment performance explains **opening + incoming funding − outgoing funding + earnings = ending**. Its simple period return uses earnings divided by opening plus incoming funding. It does not claim a time-weighted return. Withdrawals are outgoing funding, and internal movements cancel for the whole selected investment group. Missing exact period-end prices need a supplied value or an explicitly different date. Unexplained cash corrections are disclosed for review and do not become fabricated earnings.

Dividends and investment fees may appear in both Income minus spending and investment earnings. The wealth explanation identifies those shared events and counts them once. Employee payroll contributions and employer match are separate retirement funding; take-home salary is the amount recorded into checking.

## Feature library

| Folder | User journeys |
|---|---|
| household/setup | [Create the household and first accounts](household/setup/set-up-household.feature) |
| household/members | [Named members, ownership, owner views and removal](household/members/manage-members.feature) |
| household/journeys | [Setup, September, October and payroll contributions](household/journeys/manage-household-finances.feature) |
| household/overview | [Wealth, dates, groups, corrections and trends](household/overview/understand-wealth.feature) |
| household/history | [Supporting statement revisions, removal and Undo](household/history/manage-supporting-records.feature) |
| accounts/checking | [Create, view and edit](accounts/checking/setup.feature), [activity and corrections](accounts/checking/activity.feature), [linked transfers](accounts/checking/transfers.feature) |
| accounts/savings | [Create, view and edit](accounts/savings/setup.feature), [transfers, interest and withdrawals](accounts/savings/activity.feature) |
| accounts/credit-cards | [Create, view and edit](accounts/credit-cards/setup.feature), [purchases, refunds, payments, interest and credit](accounts/credit-cards/activity.feature) |
| accounts/brokerage | [Complete cash and holdings setup](accounts/brokerage/setup.feature) |
| accounts/401k | [Employer plan setup](accounts/401k/setup.feature) |
| accounts/traditional-ira | [Traditional IRA setup](accounts/traditional-ira/setup.feature) |
| accounts/roth-ira | [Roth IRA setup](accounts/roth-ira/setup.feature) |
| accounts/hsa | [Health savings setup](accounts/hsa/setup.feature) |
| accounts/defined-benefit | [Plan-reported cash value](accounts/defined-benefit/setup.feature) |
| accounts/property | [Create, value and correct a home](accounts/property/setup.feature) |
| accounts/other-assets | [Create, value and correct other assets](accounts/other-assets/setup.feature) |
| accounts/loans | [Loan setup, principal, interest and corrections](accounts/loans/manage-loans.feature) |
| accounts/mortgage | [Mortgage setup, payment splits and removal](accounts/mortgage/manage-mortgage.feature) |
| accounts/lifecycle | [Archive, close, delete and undo](accounts/lifecycle/manage-accounts.feature), [dated asset and debt history](accounts/lifecycle/dated-values.feature) |
| spending/income | [Record, view, correct and remove income](spending/income/record-income.feature) |
| spending/expenses | [Record, edit and remove expenses](spending/expenses/record-expenses.feature) |
| spending/categories | [Category management](spending/categories/manage-categories.feature), [split expenses](spending/categories/split-expenses.feature) |
| spending/monthly-review | [Monthly spending and account filters](spending/monthly-review/review-spending.feature) |
| spending/budgets | [Monthly and category budgets](spending/budgets/manage-budgets.feature) |
| spending/recurring | [Estimated bills and their lifecycle](spending/recurring/manage-recurring.feature) |
| investments | [Holdings and prices](investments/holdings.feature), [purchases](investments/purchases.feature), [sales](investments/sales.feature), [funding and withdrawals](investments/funding.feature), [dividends and fees](investments/dividends-fees.feature), [retirement and HSA activity](investments/retirement-health.feature), [corrections and removal](investments/corrections.feature), [performance](investments/performance.feature) |

## The September and October example

Maya and Sam use US dollars. Their main journey begins September 1, 2026. All investment opening totals have complete cash and holdings; month-end values use dated prices and recorded activity.

| Account | September 1 | September 30 | October 31 |
|---|---:|---:|---:|
| Everyday Checking | $5,000.00 | $5,120.00 | $7,160.00 |
| Emergency Savings | $10,000.00 | $12,000.00 | $12,500.00 |
| Everyday Credit Card, owed | $1,000.00 | $1,780.00 | $200.00 |
| Redwood Brokerage | $20,000.00 | $21,500.00 | $21,500.00 |
| Harbor 401k | $80,000.00 | $80,000.00 | $80,000.00 |
| Willow Traditional IRA | $30,000.00 | $30,000.00 | $30,000.00 |
| Harbor Cash Balance, plan cash value | $40,000.00 | $40,000.00 | $40,000.00 |
| Net worth | $184,000.00 | $186,840.00 | $190,960.00 |

September salary is $6,000.00 and spending is $3,660.00: $2,980.00 Essential and $680.00 Discretionary. Their $3,600.00 Budget is exceeded by $60.00. Transfers of $2,000.00 to savings and $1,000.00 to brokerage, and a $500.00 card payment, are neutral movements. Income minus spending is $2,340.00 and investment price growth is $500.00, explaining the $2,840.00 wealth increase. September closes with assets $188,620.00 and card debt $1,780.00.

September Investments total $131,500.00 and Retirement totals $150,000.00. Brokerage's simple period return is 2.38%; the whole investment group's is 0.38%. The defined benefit value is included in Retirement and wealth but excluded from the cash-and-holdings investment return.

October salary is $6,000.00 and spending is $1,880.00. A $1,780.00 card payment and $500.00 savings transfer are neutral. With unchanged investment and plan values, Income minus spending of $4,120.00 explains October's wealth increase. September's historical figures remain available unchanged.

## Reading and scope

`Given` describes the starting situation, `When` describes a person's action, and `Then` describes the result they should see. Later actions can continue the same journey through creating, finding, viewing and editing. Scenario outlines supply concrete alternative amounts or account types.

This is a manual-entry product. It includes reviewed recording and analysis, rather than sending bank payments or placing orders. Live bank connections, pending trade settlement, tax preparation, automatic loan amortization, separate sign-ins and a full retirement forecast are outside this v2 feature library. Recording an actual retirement or HSA movement does not make a tax eligibility decision.
