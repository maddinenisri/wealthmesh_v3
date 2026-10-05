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
}

export type NewStatement = {
  statementOn: string
  balance: string
  note: string
  enteredByMemberId: string
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
