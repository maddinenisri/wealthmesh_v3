import { request } from './client'

/** What a starting-balance correction would change, worked out by the server before anything is saved. */
export type OpeningPreview = {
  originalAmount: string
  originalOn: string
  openingAmount: string
  openedOn: string
  currentBalance: string
  currentBalanceAfter: string
  overdraft: boolean
  /** Only when the review includes an entry dated before the earlier start. */
  balanceWithEntry: string | null
  monthIncomeAfter: string | null
  monthSpendingAfter: string | null
}

/** An entry that waits on the tracking start moving, as the preview needs it. */
export type PendingEntry = { kind: 'expense' | 'income'; amount: string; on: string }

/** One saved correction of the starting balance: what it replaced, what it set, who and why. */
export type OpeningRevision = {
  id: string
  previousAmount: string
  previousOn: string
  openingAmount: string
  openedOn: string
  reason: string
  enteredByName: string
  createdAt: string
}

export type NewOpeningRevision = {
  openingAmount: string
  openedOn: string
  reason: string
  enteredByMemberId: string
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

const strOrNull = (value: unknown) => (value == null ? null : str(value))

function parseRevision(value: unknown): OpeningRevision {
  const data = record(value)
  return {
    id: str(data.id),
    previousAmount: str(data.previousAmount),
    previousOn: str(data.previousOn),
    openingAmount: str(data.openingAmount),
    openedOn: str(data.openedOn),
    reason: str(data.reason),
    enteredByName: str(data.enteredByName),
    createdAt: str(data.createdAt),
  }
}

export const listOpeningRevisions = (accountId: string) =>
  request(`/accounts/${accountId}/starting-balance-corrections`, {
    parse: (value) => {
      if (!Array.isArray(value)) throw bad()
      return value.map(parseRevision)
    },
  })

export const previewOpening = (
  accountId: string,
  openingAmount: string,
  openedOn: string,
  entry?: PendingEntry,
) =>
  request(
    `/accounts/${accountId}/starting-balance-corrections/preview?openingAmount=${encodeURIComponent(openingAmount)}&openedOn=${openedOn}${entry ? `&entryKind=${entry.kind}&entryAmount=${encodeURIComponent(entry.amount)}&entryOn=${entry.on}` : ''}`,
    {
      parse: (value): OpeningPreview => {
        const data = record(value)
        if (typeof data.overdraft !== 'boolean') throw bad()
        return {
          originalAmount: str(data.originalAmount),
          originalOn: str(data.originalOn),
          openingAmount: str(data.openingAmount),
          openedOn: str(data.openedOn),
          currentBalance: str(data.currentBalance),
          currentBalanceAfter: str(data.currentBalanceAfter),
          overdraft: data.overdraft,
          balanceWithEntry: strOrNull(data.balanceWithEntry),
          monthIncomeAfter: strOrNull(data.monthIncomeAfter),
          monthSpendingAfter: strOrNull(data.monthSpendingAfter),
        }
      },
    },
  )

/** `key` identifies one form instance: a repeated save returns the stored correction (D-024). */
export const saveOpening = (accountId: string, key: string, correction: NewOpeningRevision) =>
  request(`/accounts/${accountId}/starting-balance-corrections`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: correction,
    parse: parseRevision,
  })
