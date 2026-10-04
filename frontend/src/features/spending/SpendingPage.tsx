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
import { useSpending, useSpendingEntries, useSpendingHistory } from '../../hooks/useActivity'
import type { Activity } from '../../api/activity'

/** "October" or "September 2026" from "2026-10". */
function monthName(month: string, withYear = false): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleString('en-US', {
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function SpendingPage() {
  const today = useToday()
  const [chosen, setChosen] = useState<string | null>(null)
  const month = chosen ?? today.data?.slice(0, 7) ?? ''

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Spending" description="What the household spent, month by month." />
      {month === '' ? (
        <p className="text-ink-muted">Loading</p>
      ) : (
        <>
          <MonthSpending key={month} month={month} onMonth={setChosen} />
          <History onMonth={setChosen} />
        </>
      )}
    </div>
  )
}

function MonthSpending({ month, onMonth }: { month: string; onMonth: (month: string) => void }) {
  const spending = useSpending(month)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const entries = useSpendingEntries(month, categoryId)

  return (
    <Card aria-labelledby="month-heading">
      <CardTitle id="month-heading" className="text-lg">
        {monthName(month, true)}
      </CardTitle>
      <div className="mt-3 max-w-xs">
        <Field
          label="Month"
          type="month"
          value={month}
          onChange={(event) => {
            if (event.target.value) onMonth(event.target.value)
          }}
        />
      </div>
      {spending.isPending && <p className="mt-4 text-sm text-ink-muted">Loading spending</p>}
      {spending.isError && (
        <p role="alert" className="mt-4">
          {spending.error.message}
        </p>
      )}
      {spending.data && spending.data.categories.length === 0 && (
        <p className="mt-4">No expenses recorded for {monthName(month)}</p>
      )}
      {spending.data && spending.data.categories.length > 0 && (
        <>
          <p className="mt-4">
            Spending <Amount value={Number(spending.data.total)} size="lg" />
          </p>
          <ul aria-label="Spending by category" className="mt-3 flex flex-col gap-1">
            {spending.data.categories.map((category) => (
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
                <Amount value={Number(category.total)} /> ({plural(category.count, 'expense')})
              </li>
            ))}
          </ul>
        </>
      )}
      {categoryId && entries.data && entries.data.length > 0 && <Entries entries={entries.data} />}
    </Card>
  )
}

function Entries({ entries }: { entries: Activity[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = entries.find((entry) => entry.id === openId)

  return (
    <div className="mt-4">
      <Table aria-label="Expenses in this category">
        <thead>
          <tr>
            <Th>Expense</Th>
            <Th>Date</Th>
            <Th>Paid from</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <Td>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(entry.id)}>
                  {entry.description ?? entry.categoryName ?? 'Expense'}
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
        <dl aria-label="Expense details" className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
          <Detail label="Account">{open.accountName}</Detail>
          <Detail label="Date">{open.occurredOn}</Detail>
          <Detail label="Amount">
            <Amount value={Number(open.amount)} />
          </Detail>
          <Detail label="Category">{open.categoryName ?? 'Uncategorized'}</Detail>
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
