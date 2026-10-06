import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { wealthKey } from './useWealth'
import {
  changeAccountStatus,
  createAccount,
  getAccountLifecycle,
  getAccount,
  getToday,
  listAccounts,
  updateAccount,
  type AccountDetails,
  type NewAccount,
} from '../api/accounts'

type AccountAction = Parameters<typeof changeAccountStatus>[1]

export const accountsKey = ['accounts'] as const

/** The server's date, so date fields agree with the server (and with e2e's fixed today). */
export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: getToday, staleTime: 60_000 })
}

export function useAccounts() {
  return useQuery({ queryKey: accountsKey, queryFn: listAccounts })
}

export function useAccount(id: string) {
  return useQuery({ queryKey: [...accountsKey, id], queryFn: () => getAccount(id) })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (account: NewAccount) => createAccount(account),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
      ]),
  })
}

export function useUpdateAccount(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (details: AccountDetails) => updateAccount(id, details),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  })
}

/** Archive, restore, close or reopen: the account, the list and wealth all read the new status. */
export function useChangeAccountStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: AccountAction) => changeAccountStatus(id, action),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
      ]),
  })
}

/** The delete review's facts. Read fresh each time the review opens; the delete checks again on the server. */
export function useAccountLifecycle(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...accountsKey, id, 'lifecycle'],
    queryFn: () => getAccountLifecycle(id),
    enabled,
    gcTime: 0,
  })
}

/** Deleting leaves the account list and wealth; the account's own page is dropped so it is not read again. */
export function useDeleteAccount(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => changeAccountStatus(id, 'delete'),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...accountsKey, id] })
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
      ])
    },
  })
}
