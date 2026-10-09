import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { wealthKey } from './useWealth'
import {
  changeAccountStatus,
  correctOwners,
  createAccount,
  getAccountEvents,
  getAccountLifecycle,
  getAccount,
  getToday,
  listAccounts,
  reviewOwnerCorrection,
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
    // A name or owner shows in the account, its history and the wealth groups that list it.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
      ]),
  })
}

/** The review of an owner correction: reads the server's checks, writes nothing. */
export function useReviewOwnerCorrection(id: string) {
  return useMutation({
    mutationFn: (v: { ownerMemberIds: string[]; enteredByMemberId: string | undefined }) =>
      reviewOwnerCorrection(id, v.ownerMemberIds, v.enteredByMemberId),
  })
}

/** Changes who owns the account: the account, its history, the list and the per-person views read it. */
export function useCorrectOwners(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { ownerMemberIds: string[]; enteredByMemberId: string | undefined }) =>
      correctOwners(id, v.ownerMemberIds, v.enteredByMemberId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
      ]),
  })
}

/** Archive, restore, close or reopen: the account, the list and wealth all read the new status. */
export function useChangeAccountStatus(id: string, memberId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: AccountAction) => changeAccountStatus(id, action, memberId),
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
export function useDeleteAccount(id: string, memberId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => changeAccountStatus(id, 'delete', memberId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...accountsKey, id] })
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsKey }),
        queryClient.invalidateQueries({ queryKey: wealthKey }),
      ])
    },
  })
}

/** Who changed the account's state and when, newest first. */
export function useAccountEvents(id: string) {
  return useQuery({ queryKey: [...accountsKey, id, 'events'], queryFn: () => getAccountEvents(id) })
}
