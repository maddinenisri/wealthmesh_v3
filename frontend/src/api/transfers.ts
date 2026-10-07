import type { ReplacementPreview } from './activity'
import { request } from './client'

export type TransferLeg = { activityId: string; accountId: string; accountName: string }

/** One transfer as the server reports it: both accounts, amount, date, and whether it still counts. */
export type Transfer = {
  movementId: string
  from: TransferLeg
  to: TransferLeg
  amount: string
  occurredOn: string
  description: string | null
  enteredByName: string | null
  reason: string | null
  status: 'effective' | 'replaced' | 'removed'
  /** A loan payment only: `amount` is the whole payment, split into what reduces the debt and what is interest. */
  principal: string | null
  interest: string | null
}

/** The Balances a transfer would leave, and for an expense that becomes a transfer the month's spending. */
export type TransferPreview = {
  accounts: { id: string; name: string; balanceAfter: string }[]
  spending: ReplacementPreview['oldMonth'] | null
}

export type NewTransfer = {
  fromAccountId: string
  toAccountId: string
  amount: string
  occurredOn: string
  description?: string
  enteredByMemberId: string
  /** Optional on a correction; shown in history. */
  reason?: string
  /** A loan payment only: both are refused on a transfer or a card payment. Interest may be left out (none). */
  principal?: string
  interest?: string
}

/** A transfer, a payment to a card and a payment to a loan are the same pair on the server, under three routes. */
export type MovementPath = 'transfers' | 'card-payments' | 'loan-payments'

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

function leg(value: unknown): TransferLeg {
  const data = record(value)
  return {
    activityId: str(data.activityId),
    accountId: str(data.accountId),
    accountName: str(data.accountName),
  }
}

function parseTransfer(value: unknown): Transfer {
  const data = record(value)
  const status = str(data.status)
  if (status !== 'effective' && status !== 'replaced' && status !== 'removed') throw bad()
  return {
    movementId: str(data.movementId),
    from: leg(data.from),
    to: leg(data.to),
    amount: str(data.amount),
    occurredOn: str(data.occurredOn),
    description: strOrNull(data.description),
    enteredByName: strOrNull(data.enteredByName),
    reason: strOrNull(data.reason),
    status,
    principal: strOrNull(data.principal),
    interest: strOrNull(data.interest),
  }
}

function parsePreview(value: unknown): TransferPreview {
  const data = record(value)
  if (!Array.isArray(data.accounts)) throw bad()
  let spending: TransferPreview['spending'] = null
  if (data.spending != null) {
    const month = record(data.spending)
    spending = {
      month: str(month.month),
      kind: month.kind === 'income' ? 'income' : 'spending',
      before: str(month.before),
      after: str(month.after),
    }
  }
  return {
    accounts: data.accounts.map((entry) => {
      const account = record(entry)
      return {
        id: str(account.id),
        name: str(account.name),
        balanceAfter: str(account.balanceAfter),
      }
    }),
    spending,
  }
}

/** `key` identifies one form instance: a repeat of the same save returns the stored transfer (D-024). */
export const saveTransfer = (
  key: string,
  transfer: NewTransfer,
  path: MovementPath = 'transfers',
) =>
  request(`/${path}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: transfer,
    parse: parseTransfer,
  })

/** A correction replaces the whole pair; the original stays in history. */
export const replaceTransfer = (
  movementId: string,
  key: string,
  transfer: NewTransfer,
  path: MovementPath = 'transfers',
) =>
  request(`/${path}/${movementId}/replacement`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: transfer,
    parse: parseTransfer,
  })

/** Removes both rows of a transfer, or brings a removed one back. Who did it is recorded (D-025). */
export const changeTransfer = (
  movementId: string,
  action: 'removal' | 'undo',
  enteredByMemberId: string,
  path: MovementPath = 'transfers',
) =>
  request(`/${path}/${movementId}/${action}`, {
    method: 'POST',
    body: { enteredByMemberId },
    parse: parseTransfer,
  })

/** One loan payment with its portions, for correcting or removing it from either account's list. */
export const getLoanPayment = (movementId: string) =>
  request(`/loan-payments/${movementId}`, { parse: parseTransfer })

/** An expense that was really a transfer into `toAccountId`. A reason is required. */
export const convertToTransfer = (
  accountId: string,
  activityId: string,
  key: string,
  body: { toAccountId: string; enteredByMemberId: string; reason: string },
) =>
  request(`/accounts/${accountId}/activity/${activityId}/transfer`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body,
    parse: parseTransfer,
  })

/** What the transfer would leave in each account, from the server. Nothing is saved. */
export const previewTransfer = (
  query: {
    fromAccountId: string
    toAccountId: string
    amount?: string
    principal?: string
    interest?: string
    occurredOn?: string
    movementId?: string
    activityId?: string
  },
  path: MovementPath = 'transfers',
) => {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([name, value]) => value && params.set(name, value))
  return request(`/${path}/preview?${params.toString()}`, { parse: parsePreview })
}
