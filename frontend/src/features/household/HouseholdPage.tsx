import { useState } from 'react'
import type { Household, Member } from '../../api/household'
import { Avatar, Badge, Button, Card, CardTitle, EmptyState, PageHeader } from '../../design-system'
import { CreateHouseholdForm, MemberForm, RenameHouseholdForm } from './HouseholdForms'
import { useHousehold } from '../../hooks/useHousehold'
import { useMembers } from '../../hooks/useMembers'

export function HouseholdPage() {
  const household = useHousehold()
  const members = useMembers(household.data?.id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Household"
        description="The people in your household and the name it goes by."
      />
      {household.isPending && <p className="text-ink-muted">Loading household</p>}
      {household.isMissing && (
        <Card>
          <CardTitle>Create your household</CardTitle>
          <p className="mb-4 mt-1 max-w-prose text-sm text-ink-muted">
            Give it a name. You can add the people in it next.
          </p>
          <CreateHouseholdForm />
        </Card>
      )}
      {household.isError && !household.isMissing && (
        <EmptyState
          title="Could not load the household"
          description={household.error.message}
          action={<Button onClick={() => void household.refetch()}>Try again</Button>}
        />
      )}
      {household.data && (
        <>
          <HouseholdDetails household={household.data} />
          {members.isError ? (
            <EmptyState
              title="Could not load members"
              description={members.error.message}
              action={<Button onClick={() => void members.refetch()}>Try again</Button>}
            />
          ) : (
            <Members householdId={household.data.id} members={members.data ?? []} />
          )}
        </>
      )}
    </div>
  )
}

function HouseholdDetails({ household }: { household: Household }) {
  const [renaming, setRenaming] = useState(false)

  return (
    <Card aria-label="Household details">
      {renaming ? (
        <RenameHouseholdForm household={household} onDone={() => setRenaming(false)} />
      ) : (
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{household.name}</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>
            Rename household
          </Button>
        </div>
      )}
    </Card>
  )
}

function Members({ householdId, members }: { householdId: string; members: Member[] }) {
  const [editingId, setEditingId] = useState<string>()

  return (
    <Card aria-labelledby="members-heading">
      <CardTitle id="members-heading">Members</CardTitle>
      <p className="mb-4 mt-1 max-w-prose text-sm text-ink-muted">
        Members are names you attach to account ownership. They do not sign in.
      </p>

      {members.length === 0 ? (
        <p className="mb-6 text-sm text-ink-muted">No members yet. Add the first person below.</p>
      ) : (
        <ul className="mb-6 divide-y divide-line border-y border-line">
          {members.map((member) => (
            <li key={member.id} className="py-3">
              {editingId === member.id ? (
                <MemberForm
                  householdId={householdId}
                  member={member}
                  onDone={() => setEditingId(undefined)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} />
                  <span className="flex-1">{member.name}</span>
                  {member.label && <Badge>{member.label}</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(member.id)}
                    aria-label={`Edit member ${member.name}${member.label ? ` ${member.label}` : ''}`}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-3 font-medium">Add member</h3>
      <MemberForm householdId={householdId} />
    </Card>
  )
}
