import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getIncome,
  getMonthReview,
  getSpending,
  getSpendingHistory,
  listActivity,
  listCategories,
  listIncomeEntries,
  listSpendingEntries,
  recordEntry,
  type EntryKind,
  type NewEntry,
} from '../api/activity'
import { accountsKey } from './useAccounts'
import { wealthKey } from './useWealth'

const activityKey = (accountId: string) => ['activity', accountId] as const
export const spendingKey = ['spending'] as const

export function useCategories(kind: EntryKind) {
  return useQuery({
    queryKey: ['categories', kind],
    queryFn: () => listCategories(kind === 'income' ? 'income' : 'spending'),
    staleTime: Infinity,
  })
}

export function useAccountActivity(accountId: string) {
  return useQuery({ queryKey: activityKey(accountId), queryFn: () => listActivity(accountId) })
}

/** Saves one entry. Repeating a call with the same `key` never saves a second one. */
export function useRecordEntry(accountId: string, kind: EntryKind) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, entry }: { key: string; entry: NewEntry }) =>
      recordEntry(accountId, kind, key, entry),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
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

export function useIncome(month: string) {
  return useQuery({
    queryKey: [...spendingKey, 'income', month],
    queryFn: () => getIncome(month),
    enabled: month !== '',
  })
}

export function useIncomeEntries(month: string, categoryId: string | null) {
  return useQuery({
    queryKey: [...spendingKey, 'income-entries', month, categoryId],
    queryFn: () => listIncomeEntries(month, categoryId!),
    enabled: month !== '' && categoryId !== null,
  })
}

export function useMonthReview(month: string) {
  return useQuery({
    queryKey: [...spendingKey, 'review', month],
    queryFn: () => getMonthReview(month),
    enabled: month !== '',
  })
}

export function useSpendingHistory() {
  return useQuery({ queryKey: [...spendingKey, 'history'], queryFn: getSpendingHistory })
}
