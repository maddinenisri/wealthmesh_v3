import { request } from './client'

/** One version of an optional supporting statement. Never part of the Balance. */
export type Statement = {
  id: string
  statementOn: string
  balance: string
  note: string | null
  reason: string | null
  replacesId: string | null
  replacedById: string | null
  /** True when nothing replaces it: the active supporting version. */
  latest: boolean
  enteredByName: string
  createdAt: string
  /** When a removed statement was removed (it stays in the list, for history); null while it is active. */
  removedAt: string | null
  removedByName: string | null
  /** True when an investment account's opening review is linked to this statement. */
  usedByOpening: boolean
}

export type NewStatement = {
  statementOn: string
  balance: string
  /** A card's amount is positive; this says if it is owed or Card credit. Left out for other accounts. */
  balanceSide?: 'owed' | 'credit'
  note: string
  enteredByMemberId: string
  /** Links the statement to the completed opening review of an investment account. */
  supportsOpening?: boolean
}

/** A corrected version of a statement; the reason is required. */
export type StatementRevision = NewStatement & { reason: string }

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

function parseStatement(value: unknown): Statement {
  const data = record(value)
  if (typeof data.latest !== 'boolean') throw bad()
  return {
    id: str(data.id),
    statementOn: str(data.statementOn),
    balance: str(data.balance),
    note: strOrNull(data.note),
    reason: strOrNull(data.reason),
    replacesId: strOrNull(data.replacesId),
    replacedById: strOrNull(data.replacedById),
    latest: data.latest,
    enteredByName: str(data.enteredByName),
    createdAt: str(data.createdAt),
    removedAt: strOrNull(data.removedAt),
    removedByName: strOrNull(data.removedByName),
    usedByOpening: data.usedByOpening === true,
  }
}

export const listStatements = (accountId: string) =>
  request(`/accounts/${accountId}/statements`, {
    parse: (value) => {
      if (!Array.isArray(value)) throw bad()
      return value.map(parseStatement)
    },
  })

/** `key` identifies one form instance: a repeated save returns the stored statement (D-024). */
export const attachStatement = (accountId: string, key: string, statement: NewStatement) =>
  request(`/accounts/${accountId}/statements`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: statement,
    parse: parseStatement,
  })

export const reviseStatement = (
  accountId: string,
  statementId: string,
  key: string,
  revision: StatementRevision,
) =>
  request(`/accounts/${accountId}/statements/${statementId}/revision`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: revision,
    parse: parseStatement,
  })

/** What removing a statement does, before Confirm. */
export type RemovalReview = { openingBreakdowns: number; balance: string; message: string }

export const getRemovalReview = (accountId: string, statementId: string) =>
  request(`/accounts/${accountId}/statements/${statementId}/removal`, {
    parse: (value): RemovalReview => {
      const data = record(value)
      if (typeof data.openingBreakdowns !== 'number') throw bad()
      return {
        openingBreakdowns: data.openingBreakdowns,
        balance: str(data.balance),
        message: str(data.message),
      }
    },
  })

/** Removes the statement from active records; the Balance and the opening breakdown are untouched. */
export const removeStatement = (accountId: string, statementId: string, memberId: string) =>
  request(`/accounts/${accountId}/statements/${statementId}/removal`, {
    method: 'POST',
    body: { enteredByMemberId: memberId },
    parse: parseStatement,
  })
