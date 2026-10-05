import { request } from './client'

export type Account = {
  id: string
  type: string
  name: string
  institution: string | null
  ownerMemberIds: string[]
  openedOn: string
  openingAmount: string
  balance: { amount: string; asOf: string }
  status: string
}

export type NewAccount = {
  /** A wire type such as 'checking' or 'savings'; the server refuses one it cannot set up yet. */
  type: string
  name: string
  institution: string
  ownerMemberIds: string[]
  openedOn: string
  /** An amount string such as "5000.00", or null to start at 0.00. */
  openingBalance: string | null
}

export type AccountDetails = { name: string; institution: string; ownerMemberIds: string[] }

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    throw new Error('Unexpected response from the server.')
  return value as Record<string, unknown>
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Unexpected response from the server.')
  return value
}

function parseAccount(value: unknown): Account {
  const data = record(value)
  const balance = record(data.balance)
  if (!Array.isArray(data.ownerMemberIds)) throw new Error('Unexpected response from the server.')
  return {
    id: str(data.id),
    type: str(data.type),
    name: str(data.name),
    institution: data.institution == null ? null : str(data.institution),
    ownerMemberIds: data.ownerMemberIds.map(str),
    openedOn: str(data.openedOn),
    openingAmount: str(data.openingAmount),
    balance: { amount: str(balance.amount), asOf: str(balance.asOf) },
    status: str(data.status),
  }
}

function parseAccounts(value: unknown): Account[] {
  if (!Array.isArray(value)) throw new Error('Unexpected response from the server.')
  return value.map(parseAccount)
}

export const getToday = () => request('/today', { parse: (value) => str(record(value).today) })

export const listAccounts = () => request('/accounts', { parse: parseAccounts })

export const getAccount = (id: string) => request(`/accounts/${id}`, { parse: parseAccount })

export const createAccount = (account: NewAccount) =>
  request('/accounts', {
    method: 'POST',
    body: {
      type: account.type,
      name: account.name,
      institution: account.institution,
      ownerMemberIds: account.ownerMemberIds,
      openedOn: account.openedOn,
      openingBalance: account.openingBalance,
    },
    parse: parseAccount,
  })

export const updateAccount = (id: string, details: AccountDetails) =>
  request(`/accounts/${id}`, {
    method: 'PUT',
    body: {
      name: details.name,
      institution: details.institution,
      ownerMemberIds: details.ownerMemberIds,
    },
    parse: parseAccount,
  })
