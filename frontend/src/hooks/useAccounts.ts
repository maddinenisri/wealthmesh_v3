import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAccount,
  getAccount,
  getToday,
  listAccounts,
  updateAccount,
  type AccountDetails,
  type NewAccount,
} from '../api/accounts'

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  })
}

export function useUpdateAccount(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (details: AccountDetails) => updateAccount(id, details),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  })
}
