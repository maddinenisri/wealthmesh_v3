import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useExtendStart, useReviewExtension } from '../../hooks/useValues'
import { formatMoney } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'

const newKey = () => globalThis.crypto.randomUUID()

/**
 * Review before moving a property or other asset's start earlier (DATED_VALUE_002): the new opening, and the old
 * opening and every saved value kept as values on their own dates. Cancel leaves everything as it was; Confirm needs a
 * reason. It adds history only: no income, spending or transfer.
 */
export function ExtendStart({
  account,
  members,
  draft,
  onBack,
  onDone,
}: {
  account: Account
  members: Member[]
  draft: { amount: string; valueOn: string; reason: string }
  onBack: (draft: { amount: string; valueOn: string; reason: string }) => void
  /** Called with a sentence saying what changed, or nothing when cancelled. */
  onDone: (message?: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const [key] = useState(newKey)
  const review = useReviewExtension(account.id)
  const save = useExtendStart(account.id)
  const { control, handleSubmit, getValues } = useForm<{ reason: string }>({
    defaultValues: { reason: draft.reason },
  })
  const { mutate } = review
  useEffect(() => {
    mutate({ amount: draft.amount, valueOn: draft.valueOn, enteredByMemberId: '' })
  }, [mutate, draft.amount, draft.valueOn])

  const confirm = handleSubmit((values) => {
    if (!member) return
    save.mutate(
      {
        key,
        body: {
          amount: draft.amount,
          valueOn: draft.valueOn,
          reason: values.reason.trim(),
          enteredByMemberId: member.id,
        },
      },
      {
        onSuccess: (result) =>
          onDone(
            `${account.name} now starts at ${formatMoney(Number(result.amount))} on ${result.openedOn}. Value is ${formatMoney(Number(result.balance))}, dated ${result.balanceOn}.`,
          ),
      },
    )
  })

  return (
    <Panel>
      <Card aria-labelledby="extend-heading">
        <CardTitle id="extend-heading" className="text-lg">
          Review earlier start
        </CardTitle>
        <FormAlert message={review.error?.message ?? save.error?.message} />
        <p className="mt-3 max-w-md text-sm">
          {draft.valueOn} is before {account.name} began tracking ({account.openedOn}). You can add
          it by extending the account&apos;s history.
        </p>
        {review.data && (
          <>
            <ul
              className="mt-3 flex max-w-md flex-col gap-1 text-sm"
              aria-label="Values after the change"
            >
              {review.data.timeline.map((point) => (
                <li key={`${point.kind}-${point.on}-${point.amount}`}>
                  {point.on}: {point.kind === 'opening' ? 'opening' : 'value'}{' '}
                  {formatMoney(Number(point.amount))}
                </li>
              ))}
            </ul>
            <p className="mt-3 max-w-md text-sm text-ink-muted">
              Value stays {formatMoney(Number(review.data.balance))}, dated {review.data.balanceOn}.
              This adds history only: no income, spending or transfer is created.
            </p>
          </>
        )}
        <form noValidate className="mt-3 flex max-w-md flex-col gap-4" onSubmit={confirm}>
          <TextField
            control={control}
            name="reason"
            label="Reason"
            rules={{ validate: (value) => value.trim() !== '' || 'Enter a reason' }}
          />
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending || !member || !review.data}>
              {save.isPending ? 'Saving' : 'Confirm earlier start'}
            </Button>
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => onBack({ ...draft, reason: getValues('reason') })}
            >
              Back
            </Button>
            <Button variant="ghost" onClick={() => onDone()} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </Panel>
  )
}
