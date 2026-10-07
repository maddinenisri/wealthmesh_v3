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
  /** A card's amount is positive; this says if it is owed or Card credit. Left out for every other type. */
  balanceSide?: 'owed' | 'credit' | null
  /** An investment account's opening cash and holdings, instead of one balance (slice 17). */
  opening?: OpeningInput
}

export type HoldingInput = {
  symbol: string
  /** Shares, for example "200" or "12.5". */
  quantity: string
  /** The market price of one share, for example "100.00". */
  price: string
  /** The date of the price; null means the setup date. */
  valueOn: string | null
}

/** Cash and holdings as typed. A null cash is "not answered" (a draft when anything else was entered). */
export type OpeningInput = { total: string | null; cash: string | null; holdings: HoldingInput[] }

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

export function parseAccount(value: unknown): Account {
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
      ...(account.balanceSide ? { balanceSide: account.balanceSide } : {}),
      ...(account.opening ? { opening: account.opening } : {}),
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

/** Archive, restore, close, reopen, delete or undo a delete of an account: the same account comes back with its new status (a repeat changes nothing). */
export const changeAccountStatus = (
  id: string,
  action: 'archive' | 'restore' | 'close' | 'reopen' | 'delete' | 'undo-delete',
  memberId?: string,
) =>
  request(`/accounts/${id}/${action}`, {
    method: 'POST',
    body: memberId ? { enteredByMemberId: memberId } : {},
    parse: parseAccount,
  })

/** One change of an account's state: who entered it (null when unknown) and when. */
export type AccountEvent = { action: string; memberId: string | null; at: string }

export const getAccountEvents = (id: string) =>
  request(`/accounts/${id}/events`, {
    parse: (value): AccountEvent[] => {
      if (!Array.isArray(value)) throw new Error('Unexpected response from the server.')
      return value.map((item) => {
        const data = record(item)
        return {
          action: str(data.action),
          memberId: data.memberId == null ? null : str(data.memberId),
          at: str(data.at),
        }
      })
    },
  })

/** Why an account can or cannot be deleted right now: the review explains it before Confirm. */
export type AccountLifecycle = {
  canDelete: boolean
  deleteBlockedBy: string[]
  /** What stops a close besides the Balance (a plan on a property or other asset). */
  closeBlockedBy: string[]
}

export const getAccountLifecycle = (id: string) =>
  request(`/accounts/${id}/lifecycle`, {
    parse: (value): AccountLifecycle => {
      const data = record(value)
      if (typeof data.canDelete !== 'boolean' || !Array.isArray(data.deleteBlockedBy))
        throw new Error('Unexpected response from the server.')
      return {
        canDelete: data.canDelete,
        deleteBlockedBy: data.deleteBlockedBy.map(str),
        closeBlockedBy: Array.isArray(data.closeBlockedBy) ? data.closeBlockedBy.map(str) : [],
      }
    },
  })
