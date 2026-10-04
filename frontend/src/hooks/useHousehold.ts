import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { createHousehold, getHousehold, renameHousehold } from '../api/household'

export const householdKey = ['household'] as const

/** The single household. `isMissing` is true until one has been created. */
export function useHousehold() {
  const query = useQuery({ queryKey: householdKey, queryFn: getHousehold })
  const isMissing = query.error instanceof ApiError && query.error.status === 404
  return { ...query, isMissing }
}

export function useCreateHousehold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createHousehold(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKey }),
  })
}

export function useRenameHousehold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => renameHousehold(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKey }),
  })
}
