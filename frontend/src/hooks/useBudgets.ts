import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  copyBudget,
  getBudget,
  listBudgetMonths,
  removeBudget,
  reviewBudget,
  saveBudget,
  undoBudget,
  type BudgetBody,
} from '../api/budgets'
import { spendingKey } from './useActivity'

export const budgetKey = ['budgets'] as const

export function useBudget(month: string) {
  return useQuery({
    queryKey: [...budgetKey, 'month', month],
    queryFn: () => getBudget(month),
    enabled: month !== '',
  })
}

export function useBudgetMonths() {
  return useQuery({ queryKey: [...budgetKey, 'months'], queryFn: listBudgetMonths })
}

/** A review writes nothing: it asks the server what the month would look like. */
export function useReviewBudget(month: string) {
  return useMutation({ mutationFn: (body: BudgetBody) => reviewBudget(month, body) })
}

/** A Budget changes no money, but the month review shows it, so both refresh. */
function useBudgetWrite<V>(write: (variables: V) => ReturnType<typeof getBudget>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: budgetKey }),
        queryClient.invalidateQueries({ queryKey: spendingKey }),
      ]),
  })
}

export const useSaveBudget = (month: string) =>
  useBudgetWrite(({ key, body }: { key: string; body: BudgetBody }) => saveBudget(month, key, body))

export const useCopyBudget = (month: string) =>
  useBudgetWrite(
    ({ key, fromMonth, memberId }: { key: string; fromMonth: string; memberId: string }) =>
      copyBudget(month, key, fromMonth, memberId),
  )

export const useRemoveBudget = (month: string) =>
  useBudgetWrite((memberId: string) => removeBudget(month, memberId))

export const useUndoBudget = (month: string) =>
  useBudgetWrite((memberId: string) => undoBudget(month, memberId))
