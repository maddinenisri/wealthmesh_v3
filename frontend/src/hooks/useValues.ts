import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeValue,
  correctValue,
  extendStart,
  getValues,
  reviewExtension,
  reviewValue,
  reviewValueRemoval,
  saveValue,
  type NewValue,
} from '../api/values'
import { accountsKey } from './useAccounts'
import { wealthKey } from './useWealth'

const valuesKey = (accountId: string) => ['values', accountId] as const

export function useValueHistory(accountId: string) {
  return useQuery({ queryKey: valuesKey(accountId), queryFn: () => getValues(accountId) })
}

/** What a value does to the Balance changes the account, wealth and the value history. */
function useRefreshValues(accountId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: valuesKey(accountId) }),
      queryClient.invalidateQueries({ queryKey: accountsKey }),
      queryClient.invalidateQueries({ queryKey: wealthKey }),
    ])
}

/** A review writes nothing: it asks the server what the value would do. */
export function useReviewValue(accountId: string, replacesId?: string) {
  return useMutation({ mutationFn: (body: NewValue) => reviewValue(accountId, body, replacesId) })
}

/** Saves a value or a plan, or corrects one when `replacesId` is given. The form carries its own key. */
export function useSaveValue(accountId: string, replacesId?: string) {
  const refresh = useRefreshValues(accountId)
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: NewValue }) =>
      replacesId ? correctValue(accountId, replacesId, key, body) : saveValue(accountId, key, body),
    onSuccess: refresh,
  })
}

/** A review of moving the start earlier writes nothing. */
export function useReviewExtension(accountId: string) {
  return useMutation({ mutationFn: (body: NewValue) => reviewExtension(accountId, body) })
}

export function useExtendStart(accountId: string) {
  const refresh = useRefreshValues(accountId)
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: NewValue }) =>
      extendStart(accountId, key, body),
    onSuccess: refresh,
  })
}

export function useRemovalReview(accountId: string, valueId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...valuesKey(accountId), 'removal-review', valueId],
    queryFn: () => reviewValueRemoval(accountId, valueId),
    enabled,
    gcTime: 0,
  })
}

export function useChangeValue(accountId: string, valueId: string) {
  const refresh = useRefreshValues(accountId)
  return useMutation({
    mutationFn: ({ action, memberId }: { action: 'removal' | 'undo'; memberId: string }) =>
      changeValue(accountId, valueId, action, memberId),
    onSuccess: refresh,
  })
}
