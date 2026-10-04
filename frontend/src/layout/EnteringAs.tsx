import { Select } from '../design-system'
import { memberLabel } from '../features/accounts/ownerNames'
import { useEnteringAs } from '../hooks/useEnteringAs'
import { useHousehold } from '../hooks/useHousehold'
import { useMembers } from '../hooks/useMembers'

/** Header chooser for who is entering records. Not a sign-in: anyone can change it (D-025). */
export function EnteringAs() {
  const household = useHousehold()
  const members = useMembers(household.data?.id)
  const { member, setMemberId } = useEnteringAs(members.data)

  if (!members.data || members.data.length === 0) return null
  return (
    <div className="ml-auto flex items-center gap-2 text-sm">
      <Select
        label="Entering as"
        value={member?.id ?? ''}
        onChange={(event) => setMemberId(event.target.value)}
      >
        <option value="">Choose a name</option>
        {members.data.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {memberLabel(candidate)}
          </option>
        ))}
      </Select>
    </div>
  )
}
