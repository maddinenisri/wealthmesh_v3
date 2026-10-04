import { useState } from 'react'
import type { Member } from '../../api/household'
import { Button, Select } from '../../design-system'
import { memberLabel } from '../accounts/ownerNames'

/** Who is entering this: "Entered by: Maya (Change)", or a chooser while no one is chosen (D-025). */
export function EnteredBy({
  members,
  member,
  setMemberId,
}: {
  members: Member[]
  member: Member | undefined
  setMemberId: (id: string) => void
}) {
  const [changing, setChanging] = useState(false)
  return (
    <div className="mt-3 max-w-md text-sm">
      {changing || !member ? (
        <Select
          label="Entered by"
          value={member?.id ?? ''}
          onChange={(event) => {
            setMemberId(event.target.value)
            setChanging(false)
          }}
        >
          <option value="">Choose who is entering this</option>
          {members.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {memberLabel(candidate)}
            </option>
          ))}
        </Select>
      ) : (
        <p>
          Entered by: <strong>{memberLabel(member)}</strong>{' '}
          <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
            Change
          </Button>
        </p>
      )}
    </div>
  )
}
