/** The opening components of an investment account, as the mock server keeps them (slice 17), mirroring `OpeningComponents`. */
export type MockHolding = {
  symbol: string
  quantity: string
  price: string
  valueOn: string
  cost?: string | null
}

export type MockOpening = {
  total: string | null
  cash: string | null
  blank: boolean
  holdings: MockHolding[]
  statementId: string | null
}

type Body = { total?: unknown; cash?: unknown; holdings?: unknown } | null | undefined

const QUANTITY = /^\d{1,13}(\.\d{1,6})?$/
const PRICE = /^-?\d{1,15}(\.\d{1,4})?$/
const MONEY = /^-?\d{1,17}(\.\d{1,2})?$/
const cents = (value: number) => Math.round(value * 100) / 100
const two = (value: number) => cents(value).toFixed(2)

/** A price keeps at least two decimals: "100" is "100.00", "12.3400" is "12.34". */
const priceText = (text: string) => {
  const trimmed = text.includes('.') ? text.replace(/0+$/, '') : text
  const [whole, fraction = ''] = trimmed.split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export const holdingValue = (line: MockHolding) => cents(Number(line.quantity) * Number(line.price))

/** The components as the server judges them: a message (400), or the parsed opening. */
export function judgeOpening(
  body: Body,
  setupOn: string,
  today: string,
): { error: string } | { opening: MockOpening } {
  if (body == null)
    return { opening: { total: null, cash: '0.00', blank: true, holdings: [], statementId: null } }
  const amount = (value: unknown, negative: string): string | null | { error: string } => {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null
    if (typeof value !== 'string' || !MONEY.test(value.trim()))
      return { error: 'Enter a valid amount' }
    return value.trim().startsWith('-') ? { error: negative } : two(Number(value))
  }
  const total = amount(body.total, 'Opening total must be zero or greater')
  if (total !== null && typeof total === 'object') return total
  const cash = amount(body.cash, 'Cash must be zero or greater')
  if (cash !== null && typeof cash === 'object') return cash
  const lines = Array.isArray(body.holdings) ? (body.holdings as Record<string, unknown>[]) : []
  const holdings: MockHolding[] = []
  for (const line of lines) {
    const symbol = typeof line.symbol === 'string' ? line.symbol.trim() : ''
    if (symbol === '') return { error: "Enter the holding's name or symbol" }
    const quantity = typeof line.quantity === 'string' ? line.quantity.trim() : ''
    if (!QUANTITY.test(quantity) || Number(quantity) <= 0)
      return { error: 'Enter more than zero shares' }
    const price = typeof line.price === 'string' ? line.price.trim() : ''
    if (!PRICE.test(price)) return { error: 'Enter a valid amount' }
    if (price.startsWith('-')) return { error: 'Holding market price must be zero or greater' }
    const valueOn = typeof line.valueOn === 'string' && line.valueOn ? line.valueOn : setupOn
    if (valueOn > today) return { error: 'Future values are not completed account history' }
    if (valueOn < setupOn)
      return {
        error: `Review the earlier tracking start before saving. The Setup date is ${setupOn}.`,
      }
    const cost = amount(line.cost, 'Purchase cost must be zero or greater')
    if (cost !== null && typeof cost === 'object') return cost
    holdings.push({
      symbol,
      quantity: String(Number(quantity)),
      price: priceText(price),
      valueOn,
      cost,
    })
  }
  const blank = total === null && cash === null && holdings.length === 0
  return {
    opening: { total, cash: blank ? '0.00' : cash, blank, holdings, statementId: null },
  }
}

export const holdingsValue = (opening: MockOpening) =>
  cents(opening.holdings.reduce((sum, line) => sum + holdingValue(line), 0))

/** Cash plus holdings, or null while the cash is unanswered. */
export const calculated = (opening: MockOpening): number | null =>
  opening.cash === null ? null : cents(Number(opening.cash) + holdingsValue(opening))

export type OpeningState = 'complete' | 'draft' | 'mismatch'

export function stateOf(opening: MockOpening): OpeningState {
  const balance = calculated(opening)
  if (balance === null) return 'draft'
  return opening.total !== null && cents(Number(opening.total)) !== balance
    ? 'mismatch'
    : 'complete'
}

const dollars = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const mismatchMessage = (opening: MockOpening) =>
  `The opening total ${dollars(Number(opening.total))} does not match cash plus holdings ${dollars(
    calculated(opening) ?? 0,
  )}. Correct the components or the opening total; no difference becomes cash.`

const linesOf = (opening: MockOpening) =>
  opening.holdings.map((line) => ({
    ...line,
    value: two(holdingValue(line)),
    cost: line.cost ?? null,
    gain: line.cost == null ? null : two(holdingValue(line) - Number(line.cost)),
  }))

export function previewBody(opening: MockOpening) {
  const state = stateOf(opening)
  const balance = calculated(opening)
  return {
    state,
    canSave: state !== 'mismatch',
    cash: opening.cash,
    holdingsValue: two(holdingsValue(opening)),
    calculatedBalance: balance === null ? null : two(balance),
    openingTotal: opening.total,
    difference:
      opening.total === null || balance === null
        ? null
        : two(Math.abs(Number(opening.total) - balance)),
    missing: state === 'draft' ? ['cash'] : [],
    message:
      state === 'draft'
        ? `Enter the opening cash. ${opening.total === null ? 'This account' : 'It is not worked out from the total, so this account'} stays a draft and adds nothing to household wealth.`
        : state === 'mismatch'
          ? mismatchMessage(opening)
          : null,
    holdings: linesOf(opening),
  }
}

export function viewBody(opening: MockOpening, statementRemoved: boolean) {
  return {
    total: opening.total,
    cash: opening.cash,
    holdingsValue: two(holdingsValue(opening)),
    noStartingAmount: opening.blank,
    holdings: linesOf(opening),
    statementId: opening.statementId,
    statementRemoved,
  }
}

const percent = (known: number, shares: number) => `${((known * 100) / shares).toFixed(2)}%`
const percentOf = (value: number, balance: number) => `${((value * 100) / balance).toFixed(2)}%`

/** The holdings read of a completed account, mirroring `Holdings.view`: lines of one symbol are added together. */
export function holdingsBody(
  opening: MockOpening,
  balance: string,
  balanceOn: string,
  prices: MockPrice[] = [],
) {
  const bySymbol = new Map<string, MockHolding[]>()
  const now = effectiveLines(opening, prices, '9999-12-31')
  // The lines at the price that counts now (a recorded price, else the opening one) and its date.
  const effective = opening.holdings.map((line, i) => ({
    ...line,
    price: now[i].price,
    valueOn: now[i].priceOn,
  }))
  for (const line of effective)
    bySymbol.set(line.symbol, [...(bySymbol.get(line.symbol) ?? []), line])
  const securities = [...bySymbol.entries()].map(([symbol, lines]) => {
    const shares = lines.reduce((sum, l) => sum + Number(l.quantity), 0)
    const value = cents(lines.reduce((sum, l) => sum + holdingValue(l), 0))
    const known = lines.filter((l) => l.cost != null)
    const knownShares = known.reduce((sum, l) => sum + Number(l.quantity), 0)
    const knownValue = cents(known.reduce((sum, l) => sum + holdingValue(l), 0))
    const knownCost = cents(known.reduce((sum, l) => sum + Number(l.cost), 0))
    const all = known.length === lines.length
    const prices = new Set(lines.map((l) => l.price))
    return {
      symbol,
      shares: String(shares),
      price: prices.size === 1 ? lines[0].price : null,
      priceOn: lines.map((l) => l.valueOn).sort()[lines.length - 1],
      value: two(value),
      knownShares: String(knownShares),
      knownValue: known.length ? two(knownValue) : null,
      knownCost: known.length ? two(knownCost) : null,
      knownGain: known.length ? two(knownValue - knownCost) : null,
      coverage: percent(knownShares, shares),
      cost: all ? two(knownCost) : null,
      gain: all ? two(value - knownCost) : null,
      shareOfBalance: Number(balance) > 0 ? percentOf(value, Number(balance)) : null,
    }
  })
  const full = securities.length > 0 && securities.every((s) => s.cost !== null)
  const cost = full ? cents(securities.reduce((sum, s) => sum + Number(s.cost), 0)) : null
  return {
    cash: opening.cash ?? '0.00',
    holdingsValue: two(effective.reduce((sum, l) => sum + holdingValue(l), 0)),
    balance,
    balanceOn,
    securities,
    cost: cost === null ? null : two(cost),
    gain: cost === null ? null : two(effective.reduce((sum, l) => sum + holdingValue(l), 0) - cost),
  }
}

/** A price recorded on one holding after setup, as the mock server keeps it (slice 19b). */
export type MockPrice = {
  id: string
  accountId: string
  symbol: string
  price: string
  valueOn: string
  enteredByMemberId: string
  enteredByName: string
  enteredAt: string
  replacedAt: string | null
  key: string
}

/**
 * Each opening line's effective price on a date, mirroring `HoldingDeltaSql`: the latest of the line's own opening
 * price and the recorded price of that symbol dated on or before the date; a recorded price wins a tie.
 */
export function effectiveLines(opening: MockOpening, prices: MockPrice[], on: string) {
  return opening.holdings.map((line) => {
    const recorded = prices
      .filter((p) => !p.replacedAt && p.symbol === line.symbol && p.valueOn <= on)
      .sort((a, b) =>
        a.valueOn === b.valueOn
          ? a.enteredAt < b.enteredAt
            ? 1
            : -1
          : a.valueOn < b.valueOn
            ? 1
            : -1,
      )[0]
    const uses = !!recorded && recorded.valueOn >= line.valueOn
    return {
      price: uses ? recorded.price : line.price,
      priceOn: uses ? recorded.valueOn : line.valueOn,
      recordedOn: uses ? recorded.valueOn : null,
    }
  })
}

/** The price part of a Balance on a date: each line to the cent against its opening price. */
export function priceDelta(opening: MockOpening, prices: MockPrice[], on: string): number {
  const lines = effectiveLines(opening, prices, on)
  return cents(
    opening.holdings.reduce(
      (sum, line, i) =>
        sum + cents(Number(line.quantity) * Number(lines[i].price)) - holdingValue(line),
      0,
    ),
  )
}

/** One account of the investment group as the mock server reads it. */
export type GroupEntry = {
  id: string
  name: string
  type: string
  status: string
  balance: string
  opening: MockOpening | undefined
  prices: MockPrice[]
}

/** The whole-investment read, mirroring `InvestmentHoldingsService`: every account once, each security across them. */
export function groupBody(entries: GroupEntry[]) {
  const total = cents(entries.reduce((sum, e) => sum + Number(e.balance), 0))
  const per = entries.map((e) => ({
    entry: e,
    view: e.opening ? holdingsBody(e.opening, e.balance, '9999-12-31', e.prices) : null,
    lines: e.opening
      ? effectiveLines(e.opening, e.prices, '9999-12-31').map((now, i) => ({
          ...e.opening!.holdings[i],
          price: now.price,
          valueOn: now.priceOn,
        }))
      : [],
  }))
  const symbols = [...new Set(per.flatMap((p) => p.lines.map((l) => l.symbol)))]
  const securities = symbols.map((symbol) => {
    const lines = per.flatMap((p) => p.lines.filter((l) => l.symbol === symbol))
    const shares = lines.reduce((sum, l) => sum + Number(l.quantity), 0)
    const value = cents(lines.reduce((sum, l) => sum + holdingValue(l), 0))
    const known = lines.filter((l) => l.cost != null)
    const knownShares = known.reduce((sum, l) => sum + Number(l.quantity), 0)
    const knownValue = cents(known.reduce((sum, l) => sum + holdingValue(l), 0))
    const knownCost = cents(known.reduce((sum, l) => sum + Number(l.cost), 0))
    const all = known.length === lines.length
    const positions = per
      .map((p) => ({ p, security: p.view?.securities.find((s) => s.symbol === symbol) }))
      .filter((x) => x.security)
      .map(({ p, security }) => ({
        accountId: p.entry.id,
        accountName: p.entry.name,
        accountStatus: p.entry.status,
        shares: security!.shares,
        price: security!.price,
        priceOn: security!.priceOn,
        value: security!.value,
        knownShares: security!.knownShares,
        knownCost: security!.knownCost,
        cost: security!.cost,
        gain: security!.gain,
        coverage: security!.coverage,
      }))
    return {
      symbol,
      shares: String(shares),
      value: two(value),
      accountCount: positions.length,
      knownShares: String(knownShares),
      knownValue: known.length ? two(knownValue) : null,
      knownCost: known.length ? two(knownCost) : null,
      knownGain: known.length ? two(knownValue - knownCost) : null,
      coverage: percent(knownShares, shares),
      cost: all ? two(knownCost) : null,
      gain: all ? two(value - knownCost) : null,
      shareOfBalance: total > 0 ? percentOf(value, total) : null,
      positions,
    }
  })
  return {
    total: two(total),
    accounts: per.map(({ entry, view }) => ({
      accountId: entry.id,
      name: entry.name,
      type: entry.type,
      status: entry.status,
      balance: entry.balance,
      pricesOn: view
        ? (view.securities
            .map((s) => s.priceOn)
            .sort()
            .at(-1) ?? null)
        : null,
      cash: view ? view.cash : null,
      holdingsValue: view ? view.holdingsValue : null,
    })),
    securities,
  }
}
