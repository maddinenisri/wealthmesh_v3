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
 * Money strings. Debts is a positive amount owed. `bankMoney`, `cards` and `loans` are the groups, with every account
 * (archived and closed too, by status); `debtLines` is what makes up debts: owed cards, loans and overdrawn bank accounts.
 */
export type Wealth = {
  asOf: string
  financialAssets: string
  debts: string
  netWorth: string
  bankMoney: WealthGroup
  cards: WealthGroup
  loans: WealthGroup
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
  /** Each Balance correction dated in the period (a loan's is a debt correction). */
  correctionLines: {
    accountId: string
    name: string
    type: string
    amount: string
    reason: string | null
    on: string
  }[]
  /** Each starting amount corrected in the period: the figures on every date already use the corrected amount. */
  restatements: {
    accountId: string
    name: string
    type: string
    previousAmount: string
    amount: string
    change: string
    reason: string | null
    madeOn: string
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
    loans: parseGroup(data.loans),
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
  if (!Array.isArray(data.correctionLines) || !Array.isArray(data.restatements)) throw bad()
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
    correctionLines: data.correctionLines.map((item) => {
      const line = record(item)
      return {
        accountId: text(line.accountId),
        name: text(line.name),
        type: text(line.type),
        amount: text(line.amount),
        reason: line.reason == null ? null : text(line.reason),
        on: text(line.on),
      }
    }),
    restatements: data.restatements.map((item) => {
      const line = record(item)
      return {
        accountId: text(line.accountId),
        name: text(line.name),
        type: text(line.type),
        previousAmount: text(line.previousAmount),
        amount: text(line.amount),
        change: text(line.change),
        reason: line.reason == null ? null : text(line.reason),
        madeOn: text(line.madeOn),
      }
    }),
  }
}

/** Wealth today, or as of a date (YYYY-MM-DD) up to today. */
export const getWealth = (asOf?: string) =>
  request(asOf ? `/wealth?asOf=${asOf}` : '/wealth', { parse: parseWealth })

export const getWealthChange = (from: string, to: string) =>
  request(`/wealth/change?from=${from}&to=${to}`, { parse: parseChange })
