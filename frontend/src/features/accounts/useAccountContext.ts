import type { Member } from '../../api/household'
import { useHousehold } from '../../hooks/useHousehold'
import { useMembers } from '../../hooks/useMembers'

/** The household and its members, which every account screen needs for owner names and choices. */
export function useAccountContext(): {
  isPending: boolean
  isMissing: boolean
  error: Error | null
  members: Member[] | undefined
} {
  const household = useHousehold()
  const members = useMembers(household.data?.id)
  return {
    isPending: household.isPending || (household.data !== undefined && members.isPending),
    isMissing: household.isMissing,
    error: household.isMissing ? null : (household.error ?? members.error),
    members: members.data,
  }
}
