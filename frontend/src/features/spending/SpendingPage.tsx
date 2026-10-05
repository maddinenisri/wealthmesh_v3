import { useState } from 'react'
import {
  Amount,
  Button,
  Card,
  CardTitle,
  Field,
  PageHeader,
  Table,
  Td,
  Th,
} from '../../design-system'
import { useToday } from '../../hooks/useAccounts'
import {
  useIncome,
  useIncomeEntries,
  useMonthReview,
  useSpending,
  useSpendingEntries,
  useSpendingHistory,
} from '../../hooks/useActivity'
import { ownerNames } from '../accounts/ownerNames'
import { useAccountContext } from '../accounts/useAccountContext'
import type { Activity } from '../../api/activity'

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
          <div className="max-w-xs">
            <Field
              label="Month"
              type="month"
              value={month}
              onChange={(event) => {
                if (event.target.value) setChosen(event.target.value)
              }}
            />
          </div>
          <Review month={month} />
          <MonthSection key={`income-${month}`} kind="income" month={month} />
          <MonthSection key={`expense-${month}`} kind="expense" month={month} />
          <History onMonth={setChosen} />
        </>
      )}
    </div>
  )
}

/** Income, spending and the difference for the chosen month. */
function Review({ month }: { month: string }) {
  const review = useMonthReview(month)

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
    noun: 'expense',
    nouns: 'expenses',
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
function MonthSection({ kind, month }: { kind: 'expense' | 'income'; month: string }) {
  const words = KIND[kind]
  const totals = words.summary(month)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const entries = words.entries(month, categoryId)
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
          </p>
          <ul aria-label={words.list} className="mt-3 flex flex-col gap-1">
            {totals.data.categories.map((category) => (
              <li key={category.categoryId ?? category.name}>
                <Button
                  variant={category.categoryId === categoryId ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={category.categoryId === categoryId}
                  disabled={category.categoryId === null}
                  onClick={() => setCategoryId(category.categoryId)}
                >
                  {category.name}
                </Button>{' '}
                <Amount value={Number(category.total)} /> (
                {plural(category.count, words.noun, words.nouns)})
              </li>
            ))}
          </ul>
        </>
      )}
      {categoryId && entries.data && entries.data.length > 0 && (
        <Entries entries={entries.data} words={words} />
      )}
    </Card>
  )
}

function Entries({
  entries,
  words,
}: {
  entries: Activity[]
  words: (typeof KIND)[keyof typeof KIND]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = entries.find((entry) => entry.id === openId)
  const { members } = useAccountContext()

  return (
    <div className="mt-4">
      <Table aria-label={words.table}>
        <thead>
          <tr>
            <Th>{words.column}</Th>
            <Th>Date</Th>
            <Th>{words.place}</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <Td>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(entry.id)}>
                  {entry.description ?? entry.categoryName ?? words.column}
                </Button>
              </Td>
              <Td>{entry.occurredOn}</Td>
              <Td>{entry.accountName}</Td>
              <Td className="text-right">
                <Amount value={Number(entry.amount)} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {open && (
        <dl aria-label={words.details} className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
          <Detail label="Account">{open.accountName}</Detail>
          <Detail label="Date">{open.occurredOn}</Detail>
          <Detail label="Amount">
            <Amount value={Number(open.amount)} />
          </Detail>
          <Detail label="Category">{open.categoryName ?? 'Uncategorized'}</Detail>
          <Detail label="Entered by">
            {open.enteredByMemberId ? ownerNames([open.enteredByMemberId], members) : ''}
          </Detail>
        </dl>
      )}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
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
