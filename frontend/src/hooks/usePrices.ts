import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPrices, reviewPrice, savePrice, type PriceInput } from '../api/prices'
import { accountsKey } from './useAccounts'
import { holdingsKey, openingKey } from './useInvestments'
import { wealthKey } from './useWealth'

export const pricesKey = (accountId: string) => ['prices', accountId] as const

/** Every price recorded on the account with who and when, and the Balance on each date it changed. */
export function usePriceHistory(accountId: string, enabled = true) {
  return useQuery({ queryKey: pricesKey(accountId), queryFn: () => getPrices(accountId), enabled })
}

/** The review of a price: the same checks as the save, writing nothing. */
export function useReviewPrice(accountId: string) {
  return useMutation({ mutationFn: (input: PriceInput) => reviewPrice(accountId, input) })
}

/**
 * A saved price moves the account's one Balance, so the account, the lists, wealth, the holdings and the history all
 * refresh. It changes no entry, so nothing about spending or income is touched.
 */
export function useSavePrice(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, key }: { input: PriceInput; key: string }) =>
      savePrice(accountId, input, key),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
        queryClient.invalidateQueries({ queryKey: holdingsKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: openingKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: pricesKey(accountId) }),
      ]),
  })
}
