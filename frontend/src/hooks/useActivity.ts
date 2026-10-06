import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeCategory,
  changeEntry,
  createCategory,
  getCategoryHistory,
  getCategoryUsage,
  mergeCategories,
  undoCategoryMerge,
  type CategoryAction,
  type NewMerge,
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
  recordBatch,
  recordEntry,
  recordSplit,
  previewReplacement,
  replaceEntry,
  replaceSplit,
  saveCorrection,
  saveHistoricalEntry,
  saveReminder,
  type EditedEntry,
  type EditedSplit,
  type NewSplit,
  type HistoricalEntry,
  type EntryKind,
  type NewCorrection,
  type NewReminder,
  type NewBatchEntry,
  type NewEntry,
} from '../api/activity'
import { accountsKey } from './useAccounts'
import { openingRevisionsKey } from './useStartingBalance'
import { wealthKey } from './useWealth'

const activityKey = (accountId: string) => ['activity', accountId] as const
const remindersKey = ['reminders'] as const
const historyKey = (accountId: string) => ['activity', accountId, 'history'] as const
export const spendingKey = ['spending'] as const

export function useCategories(kind: EntryKind, includeArchived = false) {
  return useQuery({
    queryKey: ['categories', kind, includeArchived],
    queryFn: () => listCategories(kind === 'income' ? 'income' : 'spending', includeArchived),
    staleTime: Infinity,
  })
}

/** Adds a category and refreshes every list that offers one. */
export function useCreateCategory() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  })
}

/** One change to a category (rename, default, archive, restore); every list that offers one refreshes. */
export function useChangeCategory(id: string, action: CategoryAction) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { name?: string; defaultClass?: string; enteredByMemberId: string }) =>
      changeCategory(id, action, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useMergeCategories() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (merge: NewMerge) => mergeCategories(merge),
    // A merge moves figures between categories everywhere: Spending, entries and history all re-read.
    onSuccess: () =>
      Promise.all([client.invalidateQueries(), client.resetQueries({ queryKey: spendingKey })]),
  })
}

export function useUndoMerge(mergeId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (enteredByMemberId: string) => undoCategoryMerge(mergeId, enteredByMemberId),
    onSuccess: () => client.invalidateQueries(),
  })
}

export function useCategoryUsage(id: string | null) {
  return useQuery({
    queryKey: ['categories', 'usage', id],
    queryFn: () => getCategoryUsage(id!),
    enabled: id !== null,
    staleTime: 0,
  })
}

export function useCategoryHistory(id: string | null) {
  return useQuery({
    queryKey: ['categories', 'history', id],
    queryFn: () => getCategoryHistory(id!),
    enabled: id !== null,
    staleTime: 0,
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

/** Saves one expense split across categories. Repeating a call with the same `key` never saves a second one. */
export function useRecordSplit(accountId: string) {
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, split }: { key: string; split: NewSplit }) =>
      recordSplit(accountId, key, split),
    onSuccess: refresh,
  })
}

/** Replaces a split expense with a corrected one (SPLITS_002); the original stays in history. */
export function useReplaceSplit(accountId: string, activityId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, split }: { key: string; split: EditedSplit }) =>
      replaceSplit(accountId, activityId, key, split),
    onSuccess: () =>
      Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['activity'] })]),
  })
}

/** Saves several expenses together. Repeating a call with the same `key` never saves them twice. */
export function useRecordBatch(accountId: string) {
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({
      key,
      memberId,
      entries,
    }: {
      key: string
      memberId: string
      entries: NewBatchEntry[]
    }) => recordBatch(accountId, key, memberId, entries),
    onSuccess: refresh,
  })
}

/** Saves an entry dated before tracking began together with the reviewed move of the start. */
export function useSaveHistoricalEntry(accountId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: HistoricalEntry }) =>
      saveHistoricalEntry(accountId, key, body),
    onSuccess: async () => {
      await refresh()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: openingRevisionsKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: ['balance', accountId] }),
      ])
    },
  })
}

/** Refreshes what a saved entry changes: the account's list, Balances, wealth and the month figures. */
export function useRefreshMoney(accountId: string) {
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
  const queryClient = useQueryClient()
  const refresh = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, entry }: { key: string; entry: EditedEntry }) =>
      replaceEntry(accountId, activityId, key, entry),
    // The entry may have moved to another account, so every account's activity and history is stale.
    onSuccess: () =>
      Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['activity'] })]),
  })
}

/** The review of a replacement: both accounts' Balances and both months, from the server. Nothing is saved. */
export function useReplacementPreview(
  accountId: string,
  activityId: string,
  targetAccountId: string,
  amount: string,
  occurredOn: string,
) {
  return useQuery({
    queryKey: ['replacement-preview', accountId, activityId, targetAccountId, amount, occurredOn],
    queryFn: () => previewReplacement(accountId, activityId, targetAccountId, amount, occurredOn),
    enabled: activityId !== '' && targetAccountId !== '' && amount !== '' && occurredOn !== '',
    gcTime: 0,
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
  side?: 'owed' | 'credit',
) {
  return useQuery({
    queryKey: ['correction-preview', accountId, requested, asOn, replaces ?? null, side ?? null],
    queryFn: () => previewCorrection(accountId, requested, asOn, replaces, side),
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

export function useSpending(month: string, accountId: string | null = null) {
  return useQuery({
    queryKey: [...spendingKey, 'month', month, accountId],
    queryFn: () => getSpending(month, accountId),
    enabled: month !== '',
  })
}

export function useSpendingEntries(
  month: string,
  categoryId: string | null,
  accountId: string | null = null,
) {
  return useQuery({
    queryKey: [...spendingKey, 'entries', month, categoryId, accountId],
    queryFn: () => listSpendingEntries(month, categoryId!, accountId),
    enabled: month !== '' && categoryId !== null,
  })
}

export function useIncome(month: string, accountId: string | null = null) {
  return useQuery({
    queryKey: [...spendingKey, 'income', month, accountId],
    queryFn: () => getIncome(month, accountId),
    enabled: month !== '',
  })
}

export function useIncomeEntries(
  month: string,
  categoryId: string | null,
  accountId: string | null = null,
) {
  return useQuery({
    queryKey: [...spendingKey, 'income-entries', month, categoryId, accountId],
    queryFn: () => listIncomeEntries(month, categoryId!, accountId),
    enabled: month !== '' && categoryId !== null,
  })
}

export function useMonthReview(month: string, accountId: string | null = null) {
  return useQuery({
    queryKey: [...spendingKey, 'review', month, accountId],
    queryFn: () => getMonthReview(month, accountId),
    enabled: month !== '',
  })
}

export function useSpendingHistory() {
  return useQuery({ queryKey: [...spendingKey, 'history'], queryFn: getSpendingHistory })
}
