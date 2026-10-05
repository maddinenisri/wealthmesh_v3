import { useEffect, useRef, useState } from 'react'
import type { Member } from '../../api/household'
import { Avatar, Badge, Button, Card, CardTitle, FormAlert } from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { useSetMemberActive } from '../../hooks/useMembers'
import { ownerNames } from '../accounts/ownerNames'
import { MemberForm } from './HouseholdForms'

type Mode = { kind: 'edit' | 'remove'; id: string }

/** `members` is undefined while the list is still loading. */
export function MembersCard({
  householdId,
  members,
}: {
  householdId: string
  members: Member[] | undefined
}) {
  const [mode, setMode] = useState<Mode>()
  const returnTo = useRef<{ attribute: string; id: string }>(undefined)
  // Closing a form or review removes the control that had focus; hand it back to the button that opened it.
  const done = () => {
    if (mode) {
      returnTo.current = {
        attribute: mode.kind === 'edit' ? 'data-member-edit' : 'data-member-action',
        id: mode.id,
      }
    }
    setMode(undefined)
  }
  useEffect(() => {
    if (mode === undefined && returnTo.current) {
      const { attribute, id } = returnTo.current
      document.querySelector<HTMLElement>(`[${attribute}="${id}"]`)?.focus()
      returnTo.current = undefined
    }
  }, [mode])

  return (
    <Card aria-labelledby="members-heading">
      <CardTitle id="members-heading">Members</CardTitle>
      <p className="mb-4 mt-1 max-w-prose text-sm text-ink-muted">
        Members are names you attach to account ownership. They do not sign in. Removing a member
        keeps their accounts and history.
      </p>

      {members === undefined ? (
        <p className="mb-6 text-sm text-ink-muted">Loading members</p>
      ) : members.length === 0 ? (
        <p className="mb-6 text-sm text-ink-muted">No members yet. Add the first person below.</p>
      ) : (
        <ul className="mb-6 divide-y divide-line border-y border-line">
          {members.map((member) => (
            <li key={member.id} className="py-3">
              {mode?.id === member.id && mode.kind === 'edit' ? (
                <MemberForm householdId={householdId} member={member} onDone={done} />
              ) : (
                <MemberRow
                  householdId={householdId}
                  member={member}
                  members={members}
                  removing={mode?.id === member.id && mode.kind === 'remove'}
                  onEdit={() => setMode({ kind: 'edit', id: member.id })}
                  onRemove={() => setMode({ kind: 'remove', id: member.id })}
                  onDone={done}
                />
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

function MemberRow({
  householdId,
  member,
  members,
  removing,
  onEdit,
  onRemove,
  onDone,
}: {
  householdId: string
  member: Member
  members: Member[]
  removing: boolean
  onEdit: () => void
  onRemove: () => void
  onDone: () => void
}) {
  const restore = useSetMemberActive(householdId, member.id)
  // Remove and Restore swap places when the member's state changes: keep focus on whichever is now shown.
  const wasActive = useRef(member.active)
  useEffect(() => {
    if (wasActive.current !== member.active) {
      wasActive.current = member.active
      document.querySelector<HTMLElement>(`[data-member-action="${member.id}"]`)?.focus()
    }
  }, [member.active, member.id])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.name} />
        <span className="min-w-[12rem] flex-1">
          <span className="block break-words">{member.name}</span>
          {(member.label || !member.active) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {member.label && (
                <Badge className="max-w-full whitespace-normal break-words">{member.label}</Badge>
              )}
              {!member.active && <Badge tone="brass">Inactive</Badge>}
            </span>
          )}
          {member.nameHistory.map((change) => (
            <span
              key={`${change.changedAt}-${change.name}`}
              className="block break-words text-caption text-ink-muted"
            >
              Earlier name: {change.label ? `${change.name} (${change.label})` : change.name}
            </span>
          ))}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          data-member-edit={member.id}
          aria-label={`Edit member ${member.name}${member.label ? ` ${member.label}` : ''}`}
        >
          Edit
        </Button>
        {member.active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            data-member-action={member.id}
            aria-label={`Remove member ${member.name}${member.label ? ` ${member.label}` : ''}`}
          >
            Remove
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={restore.isPending}
            onClick={() => restore.mutate(true)}
            data-member-action={member.id}
            aria-label={`Restore member ${member.name}${member.label ? ` ${member.label}` : ''}`}
          >
            Restore
          </Button>
        )}
      </div>
      <FormAlert message={restore.error?.message} />
      {removing && (
        <RemoveReview householdId={householdId} member={member} members={members} onDone={onDone} />
      )}
    </div>
  )
}

/** Shows what removing does before it happens: nothing about money or ownership changes. */
function RemoveReview({
  householdId,
  member,
  members,
  onDone,
}: {
  householdId: string
  member: Member
  members: Member[]
  onDone: () => void
}) {
  const accounts = useAccounts()
  const remove = useSetMemberActive(householdId, member.id)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus()
  }, [])
  const owned = accounts.data?.filter((account) => account.ownerMemberIds.includes(member.id)) ?? []

  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-labelledby={`remove-${member.id}`}
      className="flex max-w-md flex-col gap-3 rounded-control border border-line bg-sunken p-4"
    >
      <h4 id={`remove-${member.id}`} className="font-medium">
        Review removing {member.name}
      </h4>
      <p className="text-sm">
        {member.name} will not appear in new choices, such as a new account owner. You can restore{' '}
        {member.name} later.
      </p>
      {owned.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {owned.map((account) => (
            <li key={account.id}>
              {member.name} stays listed as an owner of {account.name}
              {account.ownerMemberIds.length > 1 &&
                `, together with ${ownerNames(
                  account.ownerMemberIds.filter((id) => id !== member.id),
                  members,
                )}`}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-muted">Balances and history do not change.</p>
      <FormAlert message={remove.error?.message} />
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() => remove.mutate(false, { onSuccess: onDone })}
        >
          {remove.isPending ? 'Removing' : `Remove ${member.name}`}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
