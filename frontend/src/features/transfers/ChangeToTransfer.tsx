import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Activity } from '../../api/activity'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, SelectField, TextField } from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useConvertToTransfer, useTransferPreview } from '../../hooks/useTransfers'
import { formatMoney } from '../../lib/money'
import { ACCOUNT_TYPES } from '../accounts/accountTypes'
import { EnteredBy } from '../activity/EnteredBy'
import { TransferFigures } from './TransferFigures'
import { accountChoice } from './accountChoice'
import { useRevealReview } from './useRevealReview'

const newKey = (): string => globalThis.crypto.randomUUID()

/**
 * An expense that was really a transfer between the household's own accounts (V2_EXPENSE_008): choose where the
 * money went, review the Balances and the month's spending, give a reason, confirm. The expense stays in history.
 */
export function ChangeToTransfer({
  account,
  entry,
  members,
  onDone,
}: {
  account: Account
  entry: Activity
  members: Member[]
  onDone: (saved?: boolean) => void
}) {
  const accounts = useAccounts()
  const choices = (accounts.data ?? []).filter(
    (candidate) =>
      candidate.id !== account.id &&
      ACCOUNT_TYPES.some((type) => type.ready && type.value === candidate.type),
  )
  const convert = useConvertToTransfer(account.id, entry.id)
  const { member, setMemberId } = useEnteringAs(members)
  const [destination, setDestination] = useState<string | null>(null)
  const [key] = useState(newKey)
  const { control, handleSubmit } = useForm<{ toAccountId: string }>({
    defaultValues: { toAccountId: '' },
  })
  const reasonForm = useForm<{ reason: string }>({ defaultValues: { reason: '' } })
  const effect = useTransferPreview({
    fromAccountId: account.id,
    toAccountId: destination ?? '',
    activityId: entry.id,
  })
  useRevealReview(destination !== null)

  if (destination !== null) {
    const target = choices.find((candidate) => candidate.id === destination)
    const confirm = ({ reason }: { reason: string }) => {
      if (!member) return
      convert.mutate(
        { key, toAccountId: destination, enteredByMemberId: member.id, reason: reason.trim() },
        { onSuccess: () => onDone(true) },
      )
    }
    return (
      <Card aria-labelledby="review-heading">
        <CardTitle id="review-heading" tabIndex={-1} className="scroll-mt-10 text-lg outline-none">
          Review change to transfer
        </CardTitle>
        <FormAlert message={convert.error?.message} />
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label="From">{account.name}</Item>
          <Item label="To">{target?.name}</Item>
          <Item label="Date">{entry.occurredOn}</Item>
          <Item label="Amount">{formatMoney(Number(entry.amount))}</Item>
          <Item label="Was recorded as">{entry.categoryName ?? 'an expense'}</Item>
        </dl>
        {effect.data && <TransferFigures preview={effect.data} />}
        {effect.isError && <FormAlert message={effect.error.message} />}
        <form noValidate className="mt-3 max-w-md" onSubmit={reasonForm.handleSubmit(confirm)}>
          <TextField
            control={reasonForm.control}
            name="reason"
            label="Reason"
            rules={{
              validate: (value: string) => value.trim() !== '' || 'Give a reason for the change',
            }}
          />
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={convert.isPending || !member || !effect.data}>
              {convert.isPending ? 'Saving' : 'Confirm transfer'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDestination(null)}
              disabled={convert.isPending}
            >
              Back
            </Button>
            <Button variant="ghost" onClick={() => onDone()} disabled={convert.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="convert-heading">
      <CardTitle id="convert-heading" className="text-lg">
        Change to transfer
      </CardTitle>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        {formatMoney(Number(entry.amount))} on {entry.occurredOn} from {account.name} was recorded
        as {entry.categoryName ?? 'an expense'}. Choose the account it really went to.
      </p>
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) => setDestination(values.toAccountId))}
      >
        <SelectField
          control={control}
          name="toAccountId"
          label="Destination"
          rules={{ required: 'Choose the account the money went to' }}
        >
          <option value="">Choose an account</option>
          {choices.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {accountChoice(candidate)}
            </option>
          ))}
        </SelectField>
        <div className="flex gap-2">
          <Button type="submit">Review</Button>
          <Button variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
