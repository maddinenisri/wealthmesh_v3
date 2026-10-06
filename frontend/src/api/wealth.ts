import { request } from './client'

/** One account inside a wealth group. `balance` keeps the asset sign: a card that is owed is negative. */
export type WealthLine = {
  accountId: string
  name: string
  type: string
  status: string
  balance: string
}

export type WealthGroup = { total: string; accounts: WealthLine[] }

/**
 * Money strings. Debts is a positive amount owed. `bankMoney` and `cards` are the groups, with every account
 * (archived and closed too, by status); `debtLines` is what makes up debts: owed cards and overdrawn bank accounts.
 */
export type Wealth = {
  financialAssets: string
  debts: string
  netWorth: string
  bankMoney: WealthGroup
  cards: WealthGroup
  debtLines: WealthLine[]
}

const bad = () => new Error('Unexpected response from the server.')

function text(value: unknown): string {
  if (typeof value !== 'string') throw bad()
  return value
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw bad()
  return value as Record<string, unknown>
}

function parseLine(value: unknown): WealthLine {
  const data = record(value)
  return {
    accountId: text(data.accountId),
    name: text(data.name),
    type: text(data.type),
    status: text(data.status),
    balance: text(data.balance),
  }
}

function parseLines(value: unknown): WealthLine[] {
  if (!Array.isArray(value)) throw bad()
  return value.map(parseLine)
}

function parseGroup(value: unknown): WealthGroup {
  const data = record(value)
  return { total: text(data.total), accounts: parseLines(data.accounts) }
}

function parseWealth(value: unknown): Wealth {
  const data = record(value)
  return {
    financialAssets: text(data.financialAssets),
    debts: text(data.debts),
    netWorth: text(data.netWorth),
    bankMoney: parseGroup(data.bankMoney),
    cards: parseGroup(data.cards),
    debtLines: parseLines(data.debtLines),
  }
}

export const getWealth = () => request('/wealth', { parse: parseWealth })
