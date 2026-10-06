import { useQuery } from '@tanstack/react-query'
import { getWealth, getWealthChange } from '../api/wealth'

export const wealthKey = ['wealth'] as const

/** Wealth today, or as of a date (one query per date; a save refreshes them all). */
export function useWealth(asOf?: string) {
  return useQuery({ queryKey: [...wealthKey, asOf ?? 'today'], queryFn: () => getWealth(asOf) })
}

/** What explains the change in wealth between two dates; waits until both dates are chosen. */
export function useWealthChange(from: string, to: string) {
  return useQuery({
    queryKey: [...wealthKey, 'change', from, to],
    queryFn: () => getWealthChange(from, to),
    enabled: !!from && !!to && from <= to,
  })
}
