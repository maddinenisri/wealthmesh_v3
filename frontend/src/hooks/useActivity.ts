import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSpending,
  getSpendingHistory,
  listActivity,
  listCategories,
  listSpendingEntries,
  recordExpense,
  type NewExpense,
} from '../api/activity'
import { accountsKey } from './useAccounts'

const activityKey = (accountId: string) => ['activity', accountId] as const
export const spendingKey = ['spending'] as const

export function useSpendingCategories() {
  return useQuery({
    queryKey: ['categories', 'spending'],
    queryFn: () => listCategories('spending'),
    staleTime: Infinity,
  })
}

export function useAccountActivity(accountId: string) {
  return useQuery({ queryKey: activityKey(accountId), queryFn: () => listActivity(accountId) })
}

/** Saves one expense. Repeating a call with the same `key` never saves a second one. */
export function useRecordExpense(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, expense }: { key: string; expense: NewExpense }) =>
      recordExpense(accountId, key, expense),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: spendingKey }),
      ]),
  })
}

export function useSpending(month: string) {
  return useQuery({
    queryKey: [...spendingKey, 'month', month],
    queryFn: () => getSpending(month),
    enabled: month !== '',
  })
}

export function useSpendingEntries(month: string, categoryId: string | null) {
  return useQuery({
    queryKey: [...spendingKey, 'entries', month, categoryId],
    queryFn: () => listSpendingEntries(month, categoryId!),
    enabled: month !== '' && categoryId !== null,
  })
}

export function useSpendingHistory() {
  return useQuery({ queryKey: [...spendingKey, 'history'], queryFn: getSpendingHistory })
}
