import { useQuery } from '@tanstack/react-query'
import { getWealth } from '../api/wealth'

export const wealthKey = ['wealth'] as const

export function useWealth() {
  return useQuery({ queryKey: wealthKey, queryFn: getWealth })
}
