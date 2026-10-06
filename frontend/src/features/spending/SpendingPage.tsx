import { useState } from 'react'
import { Amount, Button, Card, CardTitle, Field, PageHeader, Select } from '../../design-system'
import { useAccounts, useToday } from '../../hooks/useAccounts'
import {
  useIncome,
  useIncomeEntries,
  useMonthReview,
  useSpending,
  useSpendingEntries,
  useSpendingHistory,
} from '../../hooks/useActivity'
import { accountChoice } from '../transfers/accountChoice'
import { UNCATEGORIZED } from '../../api/activity'
import { BudgetSection } from '../budgets/BudgetSection'
import { Entries } from './EntriesTable'

/** "October" or "September 2026" from "2026-10". */
function monthName(month: string, withYear = false): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleString('en-US', {
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`

export function SpendingPage() {
  const today = useToday()
  const [chosen, setChosen] = useState<string | null>(null)
  // One account's figures, or the whole household. Transfers are neither income nor spending in either view.
  const [accountId, setAccountId] = useState<string | null>(null)
  const accounts = useAccounts()
  const month = chosen ?? today.data?.slice(0, 7) ?? ''

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spending"
        description="What came in and what the household spent, month by month."
      />
      {month === '' ? (
        <p className="text-ink-muted">Loading</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <div className="w-full max-w-xs">
              <Field
                label="Month"
                type="month"
                value={month}
                onChange={(event) => {
                  if (event.target.value) setChosen(event.target.value)
                }}
              />
            </div>
            <div className="w-full max-w-xs">
              <Select
                label="Account"
                value={accountId ?? ''}
                onChange={(event) => setAccountId(event.target.value || null)}
              >
                <option value="">All accounts</option>
                {accounts.data?.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountChoice(account)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Review month={month} accountId={accountId} />
          {accountId === null ? (
            <BudgetSection key={`budget-${month}`} month={month} />
          ) : (
            <Card aria-labelledby="budget-heading">
              <CardTitle id="budget-heading" className="text-lg">
                Budget
              </CardTitle>
              <p className="mt-3 text-sm text-ink-muted">
                A Budget is for the whole household. Choose All accounts to see this month's Budget.
              </p>
            </Card>
          )}
          <MonthSection
            key={`income-${month}-${accountId}`}
            kind="income"
            month={month}
            accountId={accountId}
          />
          <MonthSection
            key={`expense-${month}-${accountId}`}
            kind="expense"
            month={month}
            accountId={accountId}
          />
          <History onMonth={setChosen} />
        </>
      )}
    </div>
  )
}

/** Income, spending and the difference for the chosen month. */
function Review({ month, accountId }: { month: string; accountId: string | null }) {
  const review = useMonthReview(month, accountId)

  return (
    <Card aria-labelledby="review-heading">
      <CardTitle id="review-heading" className="text-lg">
        Month review
      </CardTitle>
      {review.isPending && <p className="mt-3 text-sm text-ink-muted">Loading the month</p>}
      {review.isError && (
        <p role="alert" className="mt-3">
          {review.error.message}
        </p>
      )}
      {review.data && (
        <div className="mt-3 flex flex-col gap-1">
          <p>
            Income <Amount value={Number(review.data.income)} />
          </p>
          <p>
            Spending <Amount value={Number(review.data.spending)} />
          </p>
          <p>
            Income minus spending <Amount value={Number(review.data.incomeMinusSpending)} />
          </p>
        </div>
      )}
    </Card>
  )
}

const KIND = {
  expense: {
    summary: useSpending,
    entries: useSpendingEntries,
    list: 'Spending by category',
    table: 'Expenses in this category',
    details: 'Expense details',
    noun: 'entry',
    nouns: 'entries',
    column: 'Expense',
    place: 'Paid from',
  },
  income: {
    summary: useIncome,
    entries: useIncomeEntries,
    list: 'Income by category',
    table: 'Income entries',
    details: 'Income details',
    noun: 'income entry',
    nouns: 'income entries',
    column: 'Income',
    place: 'Received into',
  },
} as const

/** One kind of money for the month: the total, one row per category and the entries behind a category. */
function MonthSection({
  kind,
  month,
  accountId,
}: {
  kind: 'expense' | 'income'
  month: string
  accountId: string | null
}) {
  const words = KIND[kind]
  const totals = words.summary(month, accountId)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const entries = words.entries(month, categoryId, accountId)
  // Income is its own region named "Income"; spending keeps the month name as its heading.
  const heading = kind === 'income' ? 'Income' : monthName(month, true)

  return (
    <Card aria-labelledby={`${kind}-heading`}>
      <CardTitle id={`${kind}-heading`} className="text-lg">
        {heading}
      </CardTitle>
      {totals.isPending && <p className="mt-4 text-sm text-ink-muted">Loading</p>}
      {totals.isError && (
        <p role="alert" className="mt-4">
          {totals.error.message}
        </p>
      )}
      {totals.data && totals.data.categories.length === 0 && (
        <p className="mt-4">
          No {kind === 'income' ? 'income' : 'expenses'} recorded for {monthName(month)}
        </p>
      )}
      {totals.data && totals.data.categories.length > 0 && (
        <>
          <p className="mt-4">
            {kind === 'income' ? 'Income' : 'Spending'} <Amount value={Number(totals.data.total)} />
            {totals.data.note && (
              <span className="block text-caption text-ink-muted">{totals.data.note}</span>
            )}
          </p>
          {totals.data.classes && (
            <ul aria-label="Spending by class" className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
              <li>
                Essential <Amount value={Number(totals.data.classes.essential)} />
              </li>
              <li>
                Discretionary <Amount value={Number(totals.data.classes.discretionary)} />
              </li>
              <li>
                Unclassified <Amount value={Number(totals.data.classes.unclassified)} />
              </li>
            </ul>
          )}
          <ul aria-label={words.list} className="mt-3 flex flex-col gap-1">
            {totals.data.categories.map((category) => {
              const id = category.categoryId ?? UNCATEGORIZED
              return (
                <li key={id}>
                  <Button
                    variant={id === categoryId ? 'primary' : 'secondary'}
                    size="sm"
                    aria-pressed={id === categoryId}
                    onClick={() => setCategoryId(id)}
                  >
                    {category.name}
                    {category.archived && ' (archived)'}
                  </Button>{' '}
                  <Amount value={Number(category.total)} /> (
                  {plural(category.count, words.noun, words.nouns)})
                  {category.categoryId === null && kind === 'expense' && (
                    <span className="block text-caption text-ink-muted">
                      Needs a category: open an entry and choose one.
                    </span>
                  )}
                  {category.note && (
                    <span className="block text-caption text-ink-muted">{category.note}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {categoryId && entries.data && entries.data.length > 0 && (
        <Entries entries={entries.data} words={words} categoryId={categoryId} />
      )}
    </Card>
  )
}

/** Months with a recorded expense, the average of those months and an estimate that says what it rests on. */
function History({ onMonth }: { onMonth: (month: string) => void }) {
  const history = useSpendingHistory()

  return (
    <Card aria-labelledby="history-heading">
      <CardTitle id="history-heading" className="text-lg">
        Spending history
      </CardTitle>
      {history.isPending && <p className="mt-3 text-sm text-ink-muted">Loading history</p>}
      {history.isError && (
        <p role="alert" className="mt-3">
          {history.error.message}
        </p>
      )}
      {history.data && history.data.recordedMonths === 0 && (
        <p className="mt-3">No expenses have been recorded yet.</p>
      )}
      {history.data && history.data.recordedMonths > 0 && (
        <>
          <ul aria-label="Months" className="mt-3 flex flex-wrap gap-2">
            {history.data.months.map((entry) => (
              <li key={entry.month}>
                <Button variant="secondary" size="sm" onClick={() => onMonth(entry.month)}>
                  {monthName(entry.month, true)}
                </Button>{' '}
                <Amount value={Number(entry.total)} />
              </li>
            ))}
          </ul>
          <p className="mt-4">
            Average recorded month <Amount value={Number(history.data.averageRecordedMonth)} />{' '}
            based on {plural(history.data.recordedMonths, 'recorded month')}
          </p>
          <p className="mt-1">
            Annual spending estimate <Amount value={Number(history.data.annualEstimate)} /> based on{' '}
            {history.data.recordedMonths === 1
              ? 'that one month'
              : plural(history.data.recordedMonths, 'recorded month')}
          </p>
          {history.data.recordedMonths < 12 && (
            <p className="mt-1 text-sm text-ink-muted">
              This is an estimate, not twelve months of actual spending.
            </p>
          )}
        </>
      )}
    </Card>
  )
}
