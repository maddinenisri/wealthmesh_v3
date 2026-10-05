import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeTransfer,
  convertToTransfer,
  previewTransfer,
  replaceTransfer,
  saveTransfer,
  type NewTransfer,
} from '../api/transfers'
import { accountsKey } from './useAccounts'
import { spendingKey } from './useActivity'
import { wealthKey } from './useWealth'

/** A transfer changes two accounts, so every account's Balance, activity and history, and the wealth figures, refresh. */
function useRefreshTransfers() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
      queryClient.invalidateQueries({ queryKey: accountsKey }),
      queryClient.invalidateQueries({ queryKey: wealthKey }),
      queryClient.invalidateQueries({ queryKey: spendingKey }),
    ])
}

/** Saves a new transfer, or with `movementId` corrects that one. Repeating a `key` never saves twice. */
export function useSaveTransfer(movementId?: string) {
  const refresh = useRefreshTransfers()
  return useMutation({
    mutationFn: ({ key, transfer }: { key: string; transfer: NewTransfer }) =>
      movementId ? replaceTransfer(movementId, key, transfer) : saveTransfer(key, transfer),
    onSuccess: refresh,
  })
}

export function useChangeTransfer(movementId: string, action: 'removal' | 'undo') {
  const refresh = useRefreshTransfers()
  return useMutation({
    mutationFn: (memberId: string) => changeTransfer(movementId, action, memberId),
    onSuccess: refresh,
  })
}

export function useConvertToTransfer(accountId: string, activityId: string) {
  const refresh = useRefreshTransfers()
  return useMutation({
    mutationFn: (args: {
      key: string
      toAccountId: string
      enteredByMemberId: string
      reason: string
    }) =>
      convertToTransfer(accountId, activityId, args.key, {
        toAccountId: args.toAccountId,
        enteredByMemberId: args.enteredByMemberId,
        reason: args.reason,
      }),
    onSuccess: refresh,
  })
}

/** The review figures. Waits until both accounts differ and the amount and date are filled in. */
export function useTransferPreview(query: {
  fromAccountId: string
  toAccountId: string
  amount?: string
  occurredOn?: string
  movementId?: string
  activityId?: string
}) {
  const ready =
    query.fromAccountId !== '' &&
    query.toAccountId !== '' &&
    query.fromAccountId !== query.toAccountId &&
    (!!query.activityId || (!!query.amount && !!query.occurredOn))
  return useQuery({
    queryKey: ['transfer-preview', query],
    queryFn: () => previewTransfer(query),
    enabled: ready,
    gcTime: 0,
  })
}
