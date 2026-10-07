import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  attachStatement,
  getRemovalReview,
  listStatements,
  removeStatement,
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

/** The review before a removal: read fresh each time it opens. */
export function useRemovalReview(accountId: string, statementId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...statementsKey(accountId), statementId, 'removal'],
    queryFn: () => getRemovalReview(accountId, statementId),
    enabled,
    gcTime: 0,
  })
}

/** A removal changes no Balance; the list and the opening (it names the statement) refresh. */
export function useRemoveStatement(accountId: string, statementId: string, memberId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => removeStatement(accountId, statementId, memberId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: statementsKey(accountId) }),
        queryClient.invalidateQueries({ queryKey: ['opening', accountId] }),
      ]),
  })
}
