import { request } from './client'

export type Category = { id: string; name: string; kind: string }

export type Activity = {
  id: string
  accountId: string
  accountName: string
  kind: string
  amount: string
  occurredOn: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  enteredByMemberId: string | null
}

/** One money-in or money-out entry as the form sends it. */
export type NewEntry = {
  description: string
  amount: string
  occurredOn: string
  categoryId: string
  enteredByMemberId: string
}

export type CategorySpending = {
  categoryId: string | null
  name: string
  total: string
  count: number
}
export type SpendingSummary = { month: string; total: string; categories: CategorySpending[] }
/** Income uses the same shape as spending: a total and one row per category. */
export type MonthReview = {
  month: string
  income: string
  spending: string
  incomeMinusSpending: string
}
export type SpendingMonth = { month: string; total: string; recorded: boolean }
export type SpendingHistory = {
  months: SpendingMonth[]
  recordedMonths: number
  averageRecordedMonth: string | null
  annualEstimate: string | null
}

const bad = () => new Error('Unexpected response from the server.')

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw bad()
  return value as Record<string, unknown>
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw bad()
  return value
}

function strOrNull(value: unknown): string | null {
  return value == null ? null : str(value)
}

function list<T>(value: unknown, item: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) throw bad()
  return value.map(item)
}

function parseCategory(value: unknown): Category {
  const data = record(value)
  return { id: str(data.id), name: str(data.name), kind: str(data.kind) }
}

function parseActivity(value: unknown): Activity {
  const data = record(value)
  return {
    id: str(data.id),
    accountId: str(data.accountId),
    accountName: str(data.accountName),
    kind: str(data.kind),
    amount: str(data.amount),
    occurredOn: str(data.occurredOn),
    description: strOrNull(data.description),
    categoryId: strOrNull(data.categoryId),
    categoryName: strOrNull(data.categoryName),
    enteredByMemberId: strOrNull(data.enteredByMemberId),
  }
}

function parseSummary(value: unknown): SpendingSummary {
  const data = record(value)
  return {
    month: str(data.month),
    total: str(data.total),
    categories: list(data.categories, (entry) => {
      const row = record(entry)
      if (typeof row.count !== 'number') throw bad()
      return {
        categoryId: strOrNull(row.categoryId),
        name: str(row.name),
        total: str(row.total),
        count: row.count,
      }
    }),
  }
}

function parseHistory(value: unknown): SpendingHistory {
  const data = record(value)
  if (typeof data.recordedMonths !== 'number') throw bad()
  return {
    months: list(data.months, (entry) => {
      const row = record(entry)
      if (typeof row.recorded !== 'boolean') throw bad()
      return { month: str(row.month), total: str(row.total), recorded: row.recorded }
    }),
    recordedMonths: data.recordedMonths,
    averageRecordedMonth: strOrNull(data.averageRecordedMonth),
    annualEstimate: strOrNull(data.annualEstimate),
  }
}

export const listCategories = (kind: 'spending' | 'income') =>
  request(`/categories?kind=${kind}`, { parse: (value) => list(value, parseCategory) })

export const listActivity = (accountId: string) =>
  request(`/accounts/${accountId}/activity`, { parse: (value) => list(value, parseActivity) })

export type EntryKind = 'expense' | 'income'

/** `key` identifies one form instance: a repeat of the same save returns the stored entry (D-024). */
export const recordEntry = (accountId: string, kind: EntryKind, key: string, entry: NewEntry) =>
  request(`/accounts/${accountId}/${kind === 'income' ? 'income' : 'expenses'}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: entry,
    parse: parseActivity,
  })

export const getSpending = (month: string) =>
  request(`/spending?month=${month}`, { parse: parseSummary })

export const getIncome = (month: string) =>
  request(`/income?month=${month}`, { parse: parseSummary })

export const listIncomeEntries = (month: string, categoryId: string) =>
  request(`/income/entries?month=${month}&categoryId=${categoryId}`, {
    parse: (value) => list(value, parseActivity),
  })

export const getMonthReview = (month: string) =>
  request(`/review?month=${month}`, {
    parse: (value): MonthReview => {
      const data = record(value)
      return {
        month: str(data.month),
        income: str(data.income),
        spending: str(data.spending),
        incomeMinusSpending: str(data.incomeMinusSpending),
      }
    },
  })

export const listSpendingEntries = (month: string, categoryId: string) =>
  request(`/spending/entries?month=${month}&categoryId=${categoryId}`, {
    parse: (value) => list(value, parseActivity),
  })

export const getSpendingHistory = () => request('/spending/history', { parse: parseHistory })
