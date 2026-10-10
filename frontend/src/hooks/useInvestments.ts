import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NewAccount } from '../api/accounts'
import {
  discardDraft,
  finishSetup,
  getHoldings,
  getInvestmentGroup,
  getOpening,
  previewOpening,
} from '../api/investments'
import { accountsKey } from './useAccounts'
import { wealthKey } from './useWealth'

export const openingKey = (accountId: string) => ['opening', accountId] as const
export const holdingsKey = (accountId: string) => ['holdings', accountId] as const

/** The review of an opening: the same checks as the save, writing nothing. */
export function usePreviewOpening() {
  return useMutation({
    mutationFn: ({ account, accountId }: { account: NewAccount; accountId?: string }) =>
      previewOpening(account, accountId),
  })
}

/** What an investment account was opened with: cash, holding lines, the statement its review used. */
export function useOpening(accountId: string) {
  return useQuery({ queryKey: openingKey(accountId), queryFn: () => getOpening(accountId) })
}

/** The holdings of a completed investment account: shares, value, cost and gain, "not available" when unknown. */
export function useHoldings(accountId: string, enabled = true) {
  return useQuery({
    queryKey: holdingsKey(accountId),
    queryFn: () => getHoldings(accountId),
    enabled,
  })
}

/** The whole-investment view (slice 19c): refreshed by anything that moves a Balance (it hangs under `wealth`). */
export function useInvestmentGroup() {
  return useQuery({ queryKey: [...wealthKey, 'investment-group'], queryFn: getInvestmentGroup })
}

/** Finish setup: the account (and wealth, once it is complete) and its opening all refresh. */
export function useFinishSetup(accountId: string, memberId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (opening: NewAccount['opening']) => finishSetup(accountId, opening, memberId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
        queryClient.invalidateQueries({ queryKey: openingKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: holdingsKey(accountId) }),
      ]),
  })
}

/** Cancel on a draft: it leaves the list at once, and its own page is dropped so it is not read again. */
export function useDiscardDraft(accountId: string, memberId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => discardDraft(accountId, memberId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...accountsKey, accountId] })
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
      ])
    },
  })
}
