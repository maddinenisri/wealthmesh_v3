import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listOpeningRevisions,
  previewOpening,
  saveOpening,
  type NewOpeningRevision,
  type PendingEntry,
} from '../api/startingBalance'
import { accountsKey } from './useAccounts'
import { wealthKey } from './useWealth'

export const openingRevisionsKey = (accountId: string) => ['opening-revisions', accountId] as const

export function useOpeningRevisions(accountId: string) {
  return useQuery({
    queryKey: openingRevisionsKey(accountId),
    queryFn: () => listOpeningRevisions(accountId),
  })
}

/** The review: figures from the server, nothing saved. */
export function useOpeningPreview(
  accountId: string,
  openingAmount: string,
  openedOn: string,
  entry?: PendingEntry,
) {
  return useQuery({
    queryKey: ['opening-preview', accountId, openingAmount, openedOn, entry ?? null],
    queryFn: () => previewOpening(accountId, openingAmount, openedOn, entry),
    enabled: openingAmount !== '' && openedOn !== '',
    gcTime: 0,
  })
}

/** Saves a correction. Repeating a call with the same `key` never saves a second one. */
export function useSaveOpening(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, correction }: { key: string; correction: NewOpeningRevision }) =>
      saveOpening(accountId, key, correction),
    // The Balance, the list, wealth, history and the as-of view all start from the opening amount.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: openingRevisionsKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
        queryClient.invalidateQueries({ queryKey: ['activity', accountId] }),
        queryClient.invalidateQueries({ queryKey: ['balance', accountId] }),
      ]),
  })
}
