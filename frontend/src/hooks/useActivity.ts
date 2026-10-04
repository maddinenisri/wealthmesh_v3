import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeEntry,
  getBalanceAsOf,
  getIncome,
  getMonthReview,
  getSpending,
  getSpendingHistory,
  listActivity,
  listHistory,
  listReminders,
  listCategories,
  listIncomeEntries,
  listSpendingEntries,
  previewCorrection,
  recordEntry,
  replaceEntry,
  saveCorrection,
  saveReminder,
  type EditedEntry,
  type EntryKind,
  type NewCorrection,
  type NewReminder,
  type NewEntry,
} from '../api/activity'
import { accountsKey } from './useAccounts'
import { wealthKey } from './useWealth'

const activityKey = (accountId: string) => ['activity', accountId] as const
const remindersKey = ['reminders'] as const
const historyKey = (accountId: string) => ['activity', accountId, 'history'] as const
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
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, entry }: { key: string; entry: NewEntry }) =>
      recordEntry(accountId, kind, key, entry),
    onSuccess: refresh,
  })
}

function useRefreshMoney(accountId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: activityKey(accountId) }),
      queryClient.invalidateQueries({ queryKey: accountsKey }),
      queryClient.invalidateQueries({ queryKey: wealthKey }),
      queryClient.invalidateQueries({ queryKey: spendingKey }),
    ])
}

export function useAccountHistory(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: historyKey(accountId),
    queryFn: () => listHistory(accountId),
    enabled,
  })
}

/** Replaces one entry with a corrected one. Repeating a call with the same `key` saves nothing twice. */
export function useReplaceEntry(accountId: string, activityId: string) {
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, entry }: { key: string; entry: EditedEntry }) =>
      replaceEntry(accountId, activityId, key, entry),
    onSuccess: refresh,
  })
}

/** Balance on a date, read-only; the current Balance is not touched. Pass '' for no date. */
export function useBalanceAsOf(accountId: string, date: string) {
  return useQuery({
    queryKey: ['balance', accountId, date],
    queryFn: () => getBalanceAsOf(accountId, date),
    enabled: date !== '',
  })
}

/** The review of a correction: figures from the server, nothing saved. */
export function useCorrectionPreview(
  accountId: string,
  requested: string,
  asOn: string,
  replaces?: string,
) {
  return useQuery({
    queryKey: ['correction-preview', accountId, requested, asOn, replaces ?? null],
    queryFn: () => previewCorrection(accountId, requested, asOn, replaces),
    enabled: requested !== '' && asOn !== '',
    gcTime: 0,
  })
}

/** Saves a correction. Repeating a call with the same `key` never saves a second one. */
export function useSaveCorrection(accountId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, correction }: { key: string; correction: NewCorrection }) =>
      saveCorrection(accountId, key, correction),
    onSuccess: async () => {
      await refresh()
      await queryClient.invalidateQueries({ queryKey: ['balance', accountId] })
    },
  })
}

export function useReminders() {
  return useQuery({ queryKey: remindersKey, queryFn: listReminders })
}

/** Saves a reminder. It changes no Balance or total, so only the reminder list refreshes. */
export function useSaveReminder(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, reminder }: { key: string; reminder: NewReminder }) =>
      saveReminder(accountId, key, reminder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: remindersKey }),
  })
}

/** Removes an entry, or brings a removed one back. */
export function useChangeEntry(accountId: string, activityId: string, action: 'removal' | 'undo') {
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: (memberId: string) => changeEntry(accountId, activityId, action, memberId),
    onSuccess: refresh,
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
