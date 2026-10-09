import { request } from './client'

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

/** One recorded price with who entered it and when. A replaced price stays in the history but no longer counts. */
export type PriceView = {
  id: string
  symbol: string
  price: string
  valueOn: string
  enteredByMemberId: string
  enteredByName: string
  enteredAt: string
  replaced: boolean
  replacedAt: string | null
}

/** The review of a price before it is saved; nothing is written until Confirm. */
export type PriceReview = {
  symbol: string
  shares: string
  price: string
  valueOn: string
  /** A known price of $0.00: the review highlights it. */
  zero: boolean
  /** False when an older price is already in force, so the Balance does not change. */
  changesBalance: boolean
  holdingBefore: string
  holdingAfter: string
  balanceBefore: string
  balanceAfter: string
  netWorthBefore: string
  netWorthAfter: string
  replaces: PriceView | null
  message: string
}

export type PriceResult = {
  price: PriceView
  shares: string
  holdingValue: string
  balance: string
  balanceOn: string
  message: string
}

export type PriceHistory = {
  prices: PriceView[]
  points: { on: string; balance: string }[]
  /** Opening prices that a recorded price of the same date replaced; they stay in the opening holdings. */
  overridden: { symbol: string; price: string; valueOn: string }[]
}

export type PriceInput = {
  symbol: string
  price: string
  valueOn: string
  enteredByMemberId: string
}

function parsePrice(value: unknown): PriceView {
  const data = record(value)
  if (typeof data.replaced !== 'boolean') throw bad()
  return {
    id: str(data.id),
    symbol: str(data.symbol),
    price: str(data.price),
    valueOn: str(data.valueOn),
    enteredByMemberId: str(data.enteredByMemberId),
    enteredByName: str(data.enteredByName),
    enteredAt: str(data.enteredAt),
    replaced: data.replaced,
    replacedAt: strOrNull(data.replacedAt),
  }
}

function parseReview(value: unknown): PriceReview {
  const data = record(value)
  if (typeof data.zero !== 'boolean' || typeof data.changesBalance !== 'boolean') throw bad()
  return {
    symbol: str(data.symbol),
    shares: str(data.shares),
    price: str(data.price),
    valueOn: str(data.valueOn),
    zero: data.zero,
    changesBalance: data.changesBalance,
    holdingBefore: str(data.holdingBefore),
    holdingAfter: str(data.holdingAfter),
    balanceBefore: str(data.balanceBefore),
    balanceAfter: str(data.balanceAfter),
    netWorthBefore: str(data.netWorthBefore),
    netWorthAfter: str(data.netWorthAfter),
    replaces: data.replaces == null ? null : parsePrice(data.replaces),
    message: str(data.message),
  }
}

function parseResult(value: unknown): PriceResult {
  const data = record(value)
  return {
    price: parsePrice(data.price),
    shares: str(data.shares),
    holdingValue: str(data.holdingValue),
    balance: str(data.balance),
    balanceOn: str(data.balanceOn),
    message: str(data.message),
  }
}

function parseHistory(value: unknown): PriceHistory {
  const data = record(value)
  if (!Array.isArray(data.prices) || !Array.isArray(data.points)) throw bad()
  return {
    prices: data.prices.map(parsePrice),
    points: data.points.map((item) => {
      const point = record(item)
      return { on: str(point.on), balance: str(point.balance) }
    }),
    overridden: (Array.isArray(data.overridden) ? data.overridden : []).map((item: unknown) => {
      const line = record(item)
      return { symbol: str(line.symbol), price: str(line.price), valueOn: str(line.valueOn) }
    }),
  }
}

/** The review of a price: the same checks as the save, writing nothing. */
export const reviewPrice = (accountId: string, input: PriceInput) =>
  request(`/accounts/${accountId}/prices/review`, {
    method: 'POST',
    body: input,
    parse: parseReview,
  })

/** Saves a reviewed price under a save key: a retry with the same key returns the saved price. */
export const savePrice = (accountId: string, input: PriceInput, key: string) =>
  request(`/accounts/${accountId}/prices`, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': key },
    parse: parseResult,
  })

export const getPrices = (accountId: string) =>
  request(`/accounts/${accountId}/prices`, { parse: parseHistory })
