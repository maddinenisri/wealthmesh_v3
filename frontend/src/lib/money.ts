const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** "$30.00" for display. */
export const formatMoney = (value: number): string => USD.format(value)

const AMOUNT = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/

/**
 * Turns what a person types ("$5,000.00", "5000", "5,000.5") into the API's amount string ("5000.00").
 * Returns null when the text is not an amount. Blank input is the caller's business.
 */
export function parseAmount(text: string): string | null {
  const cleaned = text.trim().replace(/^(-?)\$\s*/, '$1')
  if (!AMOUNT.test(cleaned)) return null
  const [whole, cents = ''] = cleaned.replaceAll(',', '').split('.')
  return `${whole}.${cents.padEnd(2, '0')}`
}
