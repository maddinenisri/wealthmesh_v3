import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMember, listMembers, updateMember } from '../api/household'

const membersKey = (householdId: string | undefined) => ['members', householdId] as const

export function useMembers(householdId: string | undefined) {
  return useQuery({
    queryKey: membersKey(householdId),
    queryFn: () => listMembers(householdId!),
    enabled: householdId !== undefined,
  })
}

export type MemberValues = { name: string; label: string }

export function useAddMember(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, label }: MemberValues) => addMember(householdId, name, label),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(householdId) }),
  })
}

export function useUpdateMember(householdId: string, memberId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, label }: MemberValues) => updateMember(memberId, name, label),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(householdId) }),
  })
}
