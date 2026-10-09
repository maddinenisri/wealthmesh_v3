import type { HoldingInput, OpeningInput } from '../../api/accounts'
import { parseAmount } from '../../lib/money'

/** One holding line as typed in the form. */
export type HoldingValues = {
  symbol: string
  quantity: string
  price: string
  valueOn: string
  /** The purchase cost of these shares; blank means the cost is not known. */
  cost: string
}

/** The opening components as typed: a blank cash is "not answered", and a blank total is "no total typed". */
export type OpeningValues = { total: string; cash: string; holdings: HoldingValues[] }

export const blankHolding = (valueOn: string): HoldingValues => ({
  symbol: '',
  quantity: '',
  price: '',
  valueOn,
  cost: '',
})

/** The most an opening amount can be (the server refuses more than this, to the cent). */
const LARGEST = 999_999_999_999_999
const QUANTITY = /^\d{1,13}(\.\d{1,6})?$/
const PRICE = /^-?\d{1,15}(\.\d{1,4})?$/

/** "$1,234.5" to "1234.5": the price keeps up to four decimals, unlike a money amount. */
function cleanPrice(text: string): string {
  return text
    .trim()
    .replace(/^(-?)\$\s*/, '$1')
    .replaceAll(',', '')
}

/** The components as the API takes them: blank text becomes null, amounts become strings of cents. */
export function toOpening(values: OpeningValues, setupOn: string): OpeningInput {
  const amount = (text: string) => (text.trim() === '' ? null : parseAmount(text))
  return {
    total: amount(values.total),
    cash: amount(values.cash),
    holdings: values.holdings.map((holding): HoldingInput => ({
      symbol: holding.symbol.trim(),
      quantity: holding.quantity.trim(),
      price: cleanPrice(holding.price),
      valueOn: holding.valueOn.trim() === '' ? setupOn : holding.valueOn,
      cost: holding.cost.trim() === '' ? null : parseAmount(holding.cost),
    })),
  }
}

/** Optional amount fields: blank is fine; the message for a negative one is the scenario's own words. */
export const amountRules = (negative: string) => ({
  validate: (value: string) => {
    if (value.trim() === '') return true
    const amount = parseAmount(value)
    if (amount === null) return 'Enter a valid amount'
    return !amount.startsWith('-') || negative
  },
})

export const cashRules = amountRules('Cash must be zero or greater')
export const totalRules = amountRules('Opening total must be zero or greater')

/** The rules of one holding line; the same words the server answers with (V2_*_005). */
export function holdingRules(setupOn: () => string, today: string, index: number) {
  return {
    symbol: {
      validate: (value: string) => value.trim() !== '' || "Enter the holding's name or symbol",
      maxLength: { value: 120, message: 'Use 120 characters or fewer.' },
    },
    quantity: {
      validate: (value: string) => {
        const text = value.trim()
        if (!QUANTITY.test(text.replace(/^-/, ''))) return 'Enter a valid number of shares'
        return Number(text) > 0 || 'Enter more than zero shares'
      },
    },
    price: {
      validate: (value: string, form: OpeningValues) => {
        const text = cleanPrice(value)
        if (!PRICE.test(text)) return 'Enter a valid amount'
        if (text.startsWith('-')) return 'Holding market price must be zero or greater'
        const shares = Number(form.holdings[index]?.quantity.trim())
        return !(shares * Number(text) > LARGEST) || 'That amount is too large to record'
      },
    },
    cost: amountRules('Purchase cost must be zero or greater'),
    valueOn: {
      validate: (value: string) => {
        if (value.trim() === '') return true
        if (value > today) return 'Future values are not completed account history'
        return (
          value >= setupOn() ||
          `Review the earlier tracking start before saving. The Setup date is ${setupOn()}.`
        )
      },
    },
  }
}
