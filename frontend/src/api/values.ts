import { request } from './client'

/** One value in a property or other asset's history. `status` says how it counts now. */
export type ValueRow = {
  id: string | null
  valueOn: string
  amount: string
  reason: string | null
  status: 'current' | 'earlier' | 'replaced' | 'removed' | 'planned'
  enteredBy: string | null
  createdAt: string
  replacesId: string | null
  removedBy: string | null
  removedAt: string | null
  planned: boolean
  /** The setup value that lives on the account row. */
  initial: boolean
  /** A defined benefit statement's credits (null on any other value). */
  payCredit: string | null
  interestCredit: string | null
}

export type ValueEvent = {
  action: string
  valueOn: string | null
  amount: string | null
  detail: string | null
  byName: string
  at: string
}

export type ValueHistory = { values: ValueRow[]; events: ValueEvent[] }

/** What saving a value would do: nothing is written until it is confirmed. */
export type ValueReview = {
  accountName: string
  type: string
  valueOn: string
  amount: string
  reason: string | null
  plan: boolean
  earlierAmount: string | null
  earlierOn: string | null
  change: string | null
  balanceBefore: string
  balanceBeforeOn: string
  balanceAfter: string
  balanceAfterOn: string
  replacesAmount: string | null
  replacesOn: string | null
  /** A defined benefit statement: its credits, and the household and Retirement totals before and after. */
  payCredit: string | null
  interestCredit: string | null
  netWorthBefore: string | null
  netWorthAfter: string | null
  retirementBefore: string | null
  retirementAfter: string | null
}

/** The value that was saved, corrected, removed or restored, and the account's Balance before and after. */
export type ValueResult = {
  value: ValueRow
  balanceBefore: string
  balanceAfter: string
  balanceAfterOn: string
}

/** What moving the start earlier would do: the values as they will read afterwards, the new opening first. */
export type ExtensionReview = {
  accountName: string
  type: string
  amount: string
  openedOn: string
  previousAmount: string | null
  previousOn: string | null
  timeline: { kind: 'opening' | 'value'; on: string; amount: string }[]
  balance: string
  balanceOn: string
}

export type NewValue = {
  /** Left out when a defined benefit statement sends its credits instead. */
  amount?: string
  payCredit?: string
  interestCredit?: string
  valueOn?: string
  reason?: string
  enteredByMemberId: string
  plan?: boolean
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    throw new Error('Unexpected response from the server.')
  return value as Record<string, unknown>
}

const text = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Unexpected response from the server.')
  return value
}
const maybe = (value: unknown): string | null => (value == null ? null : text(value))

function parseRow(value: unknown): ValueRow {
  const data = record(value)
  return {
    id: maybe(data.id),
    valueOn: text(data.valueOn),
    amount: text(data.amount),
    reason: maybe(data.reason),
    status: text(data.status) as ValueRow['status'],
    enteredBy: maybe(data.enteredBy),
    createdAt: text(data.createdAt),
    replacesId: maybe(data.replacesId),
    removedBy: maybe(data.removedBy),
    removedAt: maybe(data.removedAt),
    planned: data.planned === true,
    initial: data.initial === true,
    payCredit: maybe(data.payCredit),
    interestCredit: maybe(data.interestCredit),
  }
}

function parseHistory(value: unknown): ValueHistory {
  const data = record(value)
  if (!Array.isArray(data.values) || !Array.isArray(data.events))
    throw new Error('Unexpected response from the server.')
  return {
    values: data.values.map(parseRow),
    events: data.events.map((event) => {
      const e = record(event)
      return {
        action: text(e.action),
        valueOn: maybe(e.valueOn),
        amount: maybe(e.amount),
        detail: maybe(e.detail),
        byName: text(e.byName),
        at: text(e.at),
      }
    }),
  }
}

function parseReview(value: unknown): ValueReview {
  const d = record(value)
  return {
    accountName: text(d.accountName),
    type: text(d.type),
    valueOn: text(d.valueOn),
    amount: text(d.amount),
    reason: maybe(d.reason),
    plan: d.plan === true,
    earlierAmount: maybe(d.earlierAmount),
    earlierOn: maybe(d.earlierOn),
    change: maybe(d.change),
    balanceBefore: text(d.balanceBefore),
    balanceBeforeOn: text(d.balanceBeforeOn),
    balanceAfter: text(d.balanceAfter),
    balanceAfterOn: text(d.balanceAfterOn),
    replacesAmount: maybe(d.replacesAmount),
    replacesOn: maybe(d.replacesOn),
    payCredit: maybe(d.payCredit),
    interestCredit: maybe(d.interestCredit),
    netWorthBefore: maybe(d.netWorthBefore),
    netWorthAfter: maybe(d.netWorthAfter),
    retirementBefore: maybe(d.retirementBefore),
    retirementAfter: maybe(d.retirementAfter),
  }
}

function parseResult(value: unknown): ValueResult {
  const d = record(value)
  return {
    value: parseRow(d.value),
    balanceBefore: text(d.balanceBefore),
    balanceAfter: text(d.balanceAfter),
    balanceAfterOn: text(d.balanceAfterOn),
  }
}

function parseExtension(value: unknown): ExtensionReview {
  const d = record(value)
  if (!Array.isArray(d.timeline)) throw new Error('Unexpected response from the server.')
  return {
    accountName: text(d.accountName),
    type: text(d.type),
    amount: text(d.amount),
    openedOn: text(d.openedOn),
    previousAmount: maybe(d.previousAmount),
    previousOn: maybe(d.previousOn),
    timeline: d.timeline.map((point) => {
      const p = record(point)
      return { kind: text(p.kind) as 'opening' | 'value', on: text(p.on), amount: text(p.amount) }
    }),
    balance: text(d.balance),
    balanceOn: text(d.balanceOn),
  }
}

export const getValues = (accountId: string) =>
  request(`/accounts/${accountId}/values`, { parse: parseHistory })

export const reviewValue = (accountId: string, body: NewValue, replacesId?: string) =>
  request(
    replacesId
      ? `/accounts/${accountId}/values/${replacesId}/correction/review`
      : `/accounts/${accountId}/values/review`,
    { method: 'POST', body, parse: parseReview },
  )

/** Saves a value or a plan; a repeat with the same key saves nothing twice (D-024). */
export const saveValue = (accountId: string, key: string, body: NewValue) =>
  request(`/accounts/${accountId}/values`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
    parse: parseResult,
  })

export const correctValue = (accountId: string, valueId: string, key: string, body: NewValue) =>
  request(`/accounts/${accountId}/values/${valueId}/correction`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
    parse: parseResult,
  })

export const reviewValueRemoval = (accountId: string, valueId: string) =>
  request(`/accounts/${accountId}/values/${valueId}/removal/review`, { parse: parseResult })

export const changeValue = (
  accountId: string,
  valueId: string,
  action: 'removal' | 'undo',
  memberId: string,
) =>
  request(`/accounts/${accountId}/values/${valueId}/${action}`, {
    method: 'POST',
    body: { enteredByMemberId: memberId },
    parse: parseResult,
  })

export const reviewExtension = (accountId: string, body: NewValue) =>
  request(`/accounts/${accountId}/values/start-extension/review`, {
    method: 'POST',
    body,
    parse: parseExtension,
  })

/** Moves the start earlier; a repeat with the same key changes nothing twice (D-024). */
export const extendStart = (accountId: string, key: string, body: NewValue) =>
  request(`/accounts/${accountId}/values/start-extension`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
    parse: parseExtension,
  })
