import { request } from './client'

/** One account inside a wealth group. `balance` keeps the asset sign: a card that is owed is negative. */
export type WealthLine = {
  accountId: string
  name: string
  type: string
  status: string
  balance: string
  /** A manually valued account: the date of the value it counts (null for every other account). */
  valueDate: string | null
  /** True when that value is dated more than 30 days before the wealth date. */
  stale: boolean
}

/** An account that had not begun tracking on the wealth date: named, never counted as zero. */
export type NotTracked = { accountId: string; name: string; type: string; openedOn: string }

export type WealthGroup = { total: string; accounts: WealthLine[] }

/**
 * Money strings. Debts is a positive amount owed. `bankMoney` and `cards` are the groups, with every account
 * (archived and closed too, by status); `debtLines` is what makes up debts: owed cards and overdrawn bank accounts.
 */
export type Wealth = {
  asOf: string
  financialAssets: string
  debts: string
  netWorth: string
  bankMoney: WealthGroup
  cards: WealthGroup
  propertyAndOther: WealthGroup
  debtLines: WealthLine[]
  notTracked: NotTracked[]
}

/** What explains the change in wealth between two dates; every figure is a money string. */
export type WealthChange = {
  from: string
  to: string
  startWealth: string
  endWealth: string
  change: string
  income: string
  spending: string
  valueChange: string
  corrections: string
  accountsAdded: string
  transfers: string
  other: string
  valueMoves: {
    accountId: string
    name: string
    type: string
    start: string
    end: string
    change: string
  }[]
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
    valueDate: data.valueDate == null ? null : text(data.valueDate),
    stale: data.stale === true,
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
  if (!Array.isArray(data.notTracked)) throw bad()
  return {
    asOf: text(data.asOf),
    financialAssets: text(data.financialAssets),
    debts: text(data.debts),
    netWorth: text(data.netWorth),
    bankMoney: parseGroup(data.bankMoney),
    cards: parseGroup(data.cards),
    propertyAndOther: parseGroup(data.propertyAndOther),
    debtLines: parseLines(data.debtLines),
    notTracked: data.notTracked.map((item) => {
      const missing = record(item)
      return {
        accountId: text(missing.accountId),
        name: text(missing.name),
        type: text(missing.type),
        openedOn: text(missing.openedOn),
      }
    }),
  }
}

function parseChange(value: unknown): WealthChange {
  const data = record(value)
  if (!Array.isArray(data.valueMoves)) throw bad()
  return {
    from: text(data.from),
    to: text(data.to),
    startWealth: text(data.startWealth),
    endWealth: text(data.endWealth),
    change: text(data.change),
    income: text(data.income),
    spending: text(data.spending),
    valueChange: text(data.valueChange),
    corrections: text(data.corrections),
    accountsAdded: text(data.accountsAdded),
    transfers: text(data.transfers),
    other: text(data.other),
    valueMoves: data.valueMoves.map((item) => {
      const move = record(item)
      return {
        accountId: text(move.accountId),
        name: text(move.name),
        type: text(move.type),
        start: text(move.start),
        end: text(move.end),
        change: text(move.change),
      }
    }),
  }
}

/** Wealth today, or as of a date (YYYY-MM-DD) up to today. */
export const getWealth = (asOf?: string) =>
  request(asOf ? `/wealth?asOf=${asOf}` : '/wealth', { parse: parseWealth })

export const getWealthChange = (from: string, to: string) =>
  request(`/wealth/change?from=${from}&to=${to}`, { parse: parseChange })
