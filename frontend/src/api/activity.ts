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
  reason: string | null
  /** Set on a transfer row: the movement both rows share, and the account on the other side. */
  movementId: string | null
  counterAccountId: string | null
  counterAccountName: string | null
}

/** The other side of a replacement: what the entry was, where, and who saved it when. */
export type HistoryOrigin = {
  id: string
  accountId: string
  accountName: string
  kind: string
  amount: string
  occurredOn: string
  categoryName: string | null
  enteredByName: string | null
  at: string
}

/** One ledger row as history shows it: effective, replaced by a later edit, or removed. */
export type HistoryEntry = {
  id: string
  kind: string
  amount: string
  occurredOn: string
  description: string | null
  categoryName: string | null
  enteredByName: string | null
  createdAt: string
  reason: string | null
  replacesId: string | null
  replacedById: string | null
  /** The entry this one replaced, with its account (it can be on another account). */
  replaces: HistoryOrigin | null
  /** The entry that replaced this one, and where it went. */
  replacedBy: HistoryOrigin | null
  status: 'effective' | 'replaced' | 'removed'
  movementId: string | null
  counterAccountId: string | null
  counterAccountName: string | null
  /** Who replaced, removed or restored the entry and when, oldest first. */
  events: { action: 'replaced' | 'removed' | 'restored'; byName: string; at: string }[]
}

/** One money-in or money-out entry as the form sends it. */
export type NewEntry = {
  description: string
  amount: string
  occurredOn: string
  categoryId: string
  enteredByMemberId: string
}

/** A corrected entry; `accountId` moves it to another account (left out: it stays where it is). */
export type EditedEntry = NewEntry & { reason: string; accountId?: string }

/** What a replacement would change before it is saved: both Balances and both months. */
export type ReplacementPreview = {
  from: { id: string; name: string; balanceAfter: string }
  to: { id: string; name: string; balanceAfter: string }
  oldMonth: MonthFigure
  newMonth: MonthFigure
}
export type MonthFigure = {
  month: string
  kind: 'income' | 'spending'
  before: string
  after: string
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
    reason: strOrNull(data.reason),
    movementId: strOrNull(data.movementId),
    counterAccountId: strOrNull(data.counterAccountId),
    counterAccountName: strOrNull(data.counterAccountName),
  }
}

function parseOrigin(value: unknown): HistoryOrigin {
  const data = record(value)
  return {
    id: str(data.id),
    accountId: str(data.accountId),
    accountName: str(data.accountName),
    kind: str(data.kind),
    amount: str(data.amount),
    occurredOn: str(data.occurredOn),
    categoryName: strOrNull(data.categoryName),
    enteredByName: strOrNull(data.enteredByName),
    at: str(data.at),
  }
}

function parseMonth(value: unknown): MonthFigure {
  const data = record(value)
  const kind = str(data.kind)
  if (kind !== 'income' && kind !== 'spending') throw bad()
  return { month: str(data.month), kind, before: str(data.before), after: str(data.after) }
}

function parseAccountFigure(value: unknown) {
  const data = record(value)
  return { id: str(data.id), name: str(data.name), balanceAfter: str(data.balanceAfter) }
}

function parseReplacementPreview(value: unknown): ReplacementPreview {
  const data = record(value)
  return {
    from: parseAccountFigure(data.from),
    to: parseAccountFigure(data.to),
    oldMonth: parseMonth(data.oldMonth),
    newMonth: parseMonth(data.newMonth),
  }
}

function parseHistoryEntry(value: unknown): HistoryEntry {
  const data = record(value)
  const status = str(data.status)
  if (status !== 'effective' && status !== 'replaced' && status !== 'removed') throw bad()
  return {
    id: str(data.id),
    kind: str(data.kind),
    amount: str(data.amount),
    occurredOn: str(data.occurredOn),
    description: strOrNull(data.description),
    categoryName: strOrNull(data.categoryName),
    enteredByName: strOrNull(data.enteredByName),
    createdAt: str(data.createdAt),
    reason: strOrNull(data.reason),
    replacesId: strOrNull(data.replacesId),
    replacedById: strOrNull(data.replacedById),
    replaces: data.replaces == null ? null : parseOrigin(data.replaces),
    replacedBy: data.replacedBy == null ? null : parseOrigin(data.replacedBy),
    status,
    movementId: strOrNull(data.movementId),
    counterAccountId: strOrNull(data.counterAccountId),
    counterAccountName: strOrNull(data.counterAccountName),
    events: list(data.events, (entry) => {
      const event = record(entry)
      const action = str(event.action)
      if (action !== 'replaced' && action !== 'removed' && action !== 'restored') throw bad()
      return { action, byName: str(event.byName), at: str(event.at) }
    }),
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

/** Edit as replacement: the original stays in history. `key` makes a repeated save safe (D-024). */
export const replaceEntry = (
  accountId: string,
  activityId: string,
  key: string,
  entry: EditedEntry,
) =>
  request(`/accounts/${accountId}/activity/${activityId}/replacement`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: entry,
    parse: parseActivity,
  })

/** The review of a replacement that may move the entry to another account: figures only, nothing saved. */
export const previewReplacement = (
  accountId: string,
  activityId: string,
  targetAccountId: string,
  amount: string,
  occurredOn: string,
) =>
  request(
    `/accounts/${accountId}/activity/${activityId}/replacement/preview?` +
      new URLSearchParams({ targetAccountId, amount, occurredOn }).toString(),
    { parse: parseReplacementPreview },
  )

/** An entry dated before tracking began, saved together with the reviewed move of the start. */
export type HistoricalEntry = {
  kind: EntryKind
  entry: NewEntry
  startRevision: {
    openingAmount: string
    openedOn: string
    reason: string
    enteredByMemberId: string
  }
}

/** Both are saved or neither. `key` makes a repeated save safe (D-024). */
export const saveHistoricalEntry = (accountId: string, key: string, body: HistoricalEntry) =>
  request(`/accounts/${accountId}/historical-entries`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body,
    parse: parseActivity,
  })

/** Removes an entry (soft) or restores a removed one. Who did it is recorded (D-025). */
export const changeEntry = (
  accountId: string,
  activityId: string,
  action: 'removal' | 'undo',
  enteredByMemberId: string,
) =>
  request(`/accounts/${accountId}/activity/${activityId}/${action}`, {
    method: 'POST',
    body: { enteredByMemberId },
    parse: parseHistoryEntry,
  })

/** A future bill or expected income: kept as a plan, never counted as money (foundations 2). */
export type Reminder = {
  id: string
  accountId: string
  accountName: string
  kind: 'expense' | 'income'
  amount: string
  dueOn: string
  description: string | null
  categoryName: string
  enteredByName: string
}

export type NewReminder = Omit<NewEntry, 'occurredOn'> & { kind: EntryKind; dueOn: string }

function parseReminder(value: unknown): Reminder {
  const data = record(value)
  const kind = str(data.kind)
  if (kind !== 'expense' && kind !== 'income') throw bad()
  return {
    id: str(data.id),
    accountId: str(data.accountId),
    accountName: str(data.accountName),
    kind,
    amount: str(data.amount),
    dueOn: str(data.dueOn),
    description: strOrNull(data.description),
    categoryName: str(data.categoryName),
    enteredByName: str(data.enteredByName),
  }
}

/** `key` identifies one form instance, as for entries (D-024). */
export const saveReminder = (accountId: string, key: string, reminder: NewReminder) =>
  request(`/accounts/${accountId}/reminders`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: reminder,
    parse: parseReminder,
  })

export const listReminders = () =>
  request('/reminders', { parse: (value) => list(value, parseReminder) })

export const listHistory = (accountId: string) =>
  request(`/accounts/${accountId}/activity/history`, {
    parse: (value) => list(value, parseHistoryEntry),
  })

/** Balance as of a date; `amount` is null when the date is before tracking began. */
export type BalanceView = { amount: string | null; asOn: string }

/** What a correction would change, worked out by the server before anything is saved. */
export type CorrectionPreview = {
  asOn: string
  balanceOnDate: string
  requested: string
  difference: string
  currentBalance: string
  currentBalanceAfter: string
  overdraft: boolean
}

/** Make the Balance on `asOn` equal `requestedBalance`. `replacesId` corrects an earlier correction. */
export type NewCorrection = {
  requestedBalance: string
  asOn: string
  reason: string
  enteredByMemberId: string
  replacesId?: string
}

export const getBalanceAsOf = (accountId: string, asOf: string) =>
  request(`/accounts/${accountId}/balance?asOf=${asOf}`, {
    parse: (value): BalanceView => {
      const data = record(value)
      return { amount: strOrNull(data.amount), asOn: str(data.asOn) }
    },
  })

export const previewCorrection = (
  accountId: string,
  requested: string,
  asOn: string,
  replaces?: string,
) =>
  request(
    `/accounts/${accountId}/balance-corrections/preview?requested=${encodeURIComponent(requested)}&asOn=${asOn}${replaces ? `&replaces=${replaces}` : ''}`,
    {
      parse: (value): CorrectionPreview => {
        const data = record(value)
        if (typeof data.overdraft !== 'boolean') throw bad()
        return {
          asOn: str(data.asOn),
          balanceOnDate: str(data.balanceOnDate),
          requested: str(data.requested),
          difference: str(data.difference),
          currentBalance: str(data.currentBalance),
          currentBalanceAfter: str(data.currentBalanceAfter),
          overdraft: data.overdraft,
        }
      },
    },
  )

/** `key` identifies one form instance: a repeated save returns the stored correction (D-024). */
export const saveCorrection = (accountId: string, key: string, correction: NewCorrection) =>
  request(`/accounts/${accountId}/balance-corrections`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: correction,
    parse: parseActivity,
  })

/** `&accountId=...` for one account's figures, nothing for the whole household. Transfers count in neither. */
const forAccount = (accountId: string | null) => (accountId ? `&accountId=${accountId}` : '')

export const getSpending = (month: string, accountId: string | null = null) =>
  request(`/spending?month=${month}${forAccount(accountId)}`, { parse: parseSummary })

export const getIncome = (month: string, accountId: string | null = null) =>
  request(`/income?month=${month}${forAccount(accountId)}`, { parse: parseSummary })

export const listIncomeEntries = (
  month: string,
  categoryId: string,
  accountId: string | null = null,
) =>
  request(`/income/entries?month=${month}&categoryId=${categoryId}${forAccount(accountId)}`, {
    parse: (value) => list(value, parseActivity),
  })

export const getMonthReview = (month: string, accountId: string | null = null) =>
  request(`/review?month=${month}${forAccount(accountId)}`, {
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

export const listSpendingEntries = (
  month: string,
  categoryId: string,
  accountId: string | null = null,
) =>
  request(`/spending/entries?month=${month}&categoryId=${categoryId}${forAccount(accountId)}`, {
    parse: (value) => list(value, parseActivity),
  })

export const getSpendingHistory = () => request('/spending/history', { parse: parseHistory })
