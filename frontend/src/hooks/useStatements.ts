import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  attachStatement,
  listStatements,
  reviseStatement,
  type NewStatement,
  type StatementRevision,
} from '../api/statements'

const statementsKey = (accountId: string) => ['statements', accountId] as const

export function useStatements(accountId: string) {
  return useQuery({ queryKey: statementsKey(accountId), queryFn: () => listStatements(accountId) })
}

/** Statements change no Balance or total, so only their own list refreshes. */
export function useAttachStatement(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, statement }: { key: string; statement: NewStatement }) =>
      attachStatement(accountId, key, statement),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statementsKey(accountId) }),
  })
}

export function useReviseStatement(accountId: string, statementId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, revision }: { key: string; revision: StatementRevision }) =>
      reviseStatement(accountId, statementId, key, revision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statementsKey(accountId) }),
  })
}
