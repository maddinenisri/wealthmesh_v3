import { request } from './client'

/** Money strings. Debts is a positive amount owed. */
export type Wealth = { financialAssets: string; debts: string }

function parseWealth(value: unknown): Wealth {
  const bad = () => new Error('Unexpected response from the server.')
  if (typeof value !== 'object' || value === null) throw bad()
  const data = value as Record<string, unknown>
  if (typeof data.financialAssets !== 'string' || typeof data.debts !== 'string') throw bad()
  return { financialAssets: data.financialAssets, debts: data.debts }
}

export const getWealth = () => request('/wealth', { parse: parseWealth })
