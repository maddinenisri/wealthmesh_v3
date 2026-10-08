/** The opening components of an investment account, as the mock server keeps them (slice 17), mirroring `OpeningComponents`. */
export type MockHolding = { symbol: string; quantity: string; price: string; valueOn: string }

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
    holdings.push({ symbol, quantity: String(Number(quantity)), price: priceText(price), valueOn })
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
  opening.holdings.map((line) => ({ ...line, value: two(holdingValue(line)) }))

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
        ? 'Enter the opening cash. It is not worked out from the total, so this account stays a draft and adds nothing to household wealth.'
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
