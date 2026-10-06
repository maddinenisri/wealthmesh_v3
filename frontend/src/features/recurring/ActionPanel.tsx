import type { ReactNode } from 'react'
import type { Member } from '../../api/household'
import { Button, FormAlert } from '../../design-system'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'

/**
 * A reviewed action on a schedule or suggestion that needs no fields: it says what will and will not change, asks who
 * is entering it, and Confirm or Cancel. Cancel changes nothing (RECURRING_004, 009).
 */
export function ActionPanel({
  heading,
  members,
  member,
  setMemberId,
  error,
  pending,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
  children,
}: {
  heading: string
  members: Member[]
  member: Member | undefined
  setMemberId: (id: string) => void
  error: string | undefined
  pending: boolean
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <Panel>
      <section
        aria-labelledby="recurring-action-heading"
        className="mt-3 flex max-w-md flex-col gap-3 rounded-control border border-line bg-sunken p-4"
      >
        <h3 id="recurring-action-heading" className="font-medium">
          {heading}
        </h3>
        {children}
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <FormAlert message={error} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={pending || !member}
            onClick={onConfirm}
          >
            {pending ? 'Saving' : confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </section>
    </Panel>
  )
}
