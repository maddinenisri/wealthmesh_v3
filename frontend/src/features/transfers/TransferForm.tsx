import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Activity } from '../../api/activity'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, SelectField, TextField } from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useSaveTransfer, useTransferPreview } from '../../hooks/useTransfers'
import { formatMoney, parseAmount } from '../../lib/money'
import { ACCOUNT_TYPES } from '../accounts/accountTypes'
import { isCard } from '../accounts/cardBalance'
import { OVERDRAFT_NOTICE } from '../accounts/Overdrawn'
import { EnteredBy } from '../activity/EnteredBy'
import { givesMoney, isPayment } from '../activity/transferRows'
import { accountChoice } from './accountChoice'
import { TransferFigures } from './TransferFigures'
import { useRevealReview } from './useRevealReview'

type Values = {
  fromAccountId: string
  toAccountId: string
  amount: string
  occurredOn: string
  description: string
  reason: string
}

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = (): string => globalThis.crypto.randomUUID()

const WORDS = {
  transfer: {
    add: 'Add transfer',
    edit: 'Edit transfer',
    review: 'Review transfer',
    confirm: 'Confirm transfer',
  },
  payment: {
    add: 'Record payment',
    edit: 'Edit payment',
    review: 'Review payment',
    confirm: 'Confirm payment',
  },
} as const

/**
 * Moving money between two accounts of the household: fill in, review, then confirm. Nothing is saved until
 * Confirm. Both accounts' Balances after the move come from the server. Editing a transfer corrects the pair.
 * A payment is the same pair with the card fixed as the destination: the person chooses the bank account that paid.
 */
export function TransferForm({
  account,
  members,
  today,
  editing,
  payment,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  /** A transfer row being corrected: the form starts from both of its sides. */
  editing?: Activity
  /** A payment to a card (the card is `account`, or the other side of `editing`); a plain transfer otherwise. */
  payment?: boolean
  /** `saved` is true after Confirm, so the page can show the new row. */
  onDone: (saved?: boolean) => void
}) {
  const accounts = useAccounts()
  const isPay = payment ?? (editing ? isPayment(editing) : false)
  const words = WORDS[isPay ? 'payment' : 'transfer']
  // A card is paid, never moved to or from: transfer choices leave cards out, payment sources are banks only.
  const choices = (accounts.data ?? []).filter(
    (candidate) =>
      ACCOUNT_TYPES.some((type) => type.ready && type.value === candidate.type) &&
      !isCard(candidate.type),
  )
  const cardOf = (id: string) => accounts.data?.find((candidate) => candidate.id === id)
  const outgoing = editing ? givesMoney(editing) : !isPay
  const other = editing?.counterAccountId ?? ''
  const save = useSaveTransfer(
    editing?.movementId ?? undefined,
    isPay ? 'card-payments' : 'transfers',
  )
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Values | null>(null)
  const [key] = useState(newKey)
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: {
      fromAccountId: editing ? (outgoing ? account.id : other) : isPay ? '' : account.id,
      toAccountId: editing ? (outgoing ? other : account.id) : isPay ? account.id : '',
      amount: editing?.amount ?? '',
      occurredOn: editing?.occurredOn ?? today,
      description: editing?.description ?? '',
      reason: '',
    },
  })
  const fromId = useWatch({ control, name: 'fromAccountId' })
  const toId = useWatch({ control, name: 'toAccountId' })
  const byId = (id: string) => choices.find((candidate) => candidate.id === id) ?? cardOf(id)
  const reviewAmount = reviewing ? parseAmount(reviewing.amount) : null
  const effect = useTransferPreview(
    {
      fromAccountId: reviewing?.fromAccountId ?? '',
      toAccountId: reviewing?.toAccountId ?? '',
      amount: reviewAmount ?? undefined,
      occurredOn: reviewing?.occurredOn,
      movementId: editing?.movementId ?? undefined,
    },
    isPay ? 'card-payments' : 'transfers',
  )
  useRevealReview(reviewing !== null)

  const confirm = () => {
    if (!reviewing || !member) return
    save.mutate(
      {
        key,
        transfer: {
          fromAccountId: reviewing.fromAccountId,
          toAccountId: reviewing.toAccountId,
          amount: parseAmount(reviewing.amount)!,
          occurredOn: reviewing.occurredOn,
          description: reviewing.description.trim() || undefined,
          enteredByMemberId: member.id,
          reason: editing ? reviewing.reason.trim() || undefined : undefined,
        },
      },
      { onSuccess: () => onDone(true) },
    )
  }

  if (reviewing) {
    const from = byId(reviewing.fromAccountId)
    const to = byId(reviewing.toAccountId)
    const sourceAfter = effect.data?.accounts.find((entry) => entry.id === reviewing.fromAccountId)
    const overdrawn = sourceAfter ? Number(sourceAfter.balanceAfter) < 0 : false
    const was = (before: string | undefined, after: string) =>
      before !== undefined && before !== after ? `${before} changed to ${after}` : after
    const original = editing
      ? {
          from: outgoing ? account.name : editing.counterAccountName,
          to: outgoing ? editing.counterAccountName : account.name,
        }
      : undefined
    return (
      <Card aria-labelledby="review-heading">
        <CardTitle id="review-heading" tabIndex={-1} className="scroll-mt-10 text-lg outline-none">
          {editing ? 'Review change' : words.review}
        </CardTitle>
        <FormAlert message={save.error?.message} />
        {overdrawn && (
          <p role="alert" className="mt-3 max-w-md rounded-control border border-line p-3 text-sm">
            This will leave {from?.name} overdrawn by{' '}
            {formatMoney(-Number(sourceAfter?.balanceAfter))}. {OVERDRAFT_NOTICE}
          </p>
        )}
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label="From">{was(original?.from ?? undefined, from?.name ?? '')}</Item>
          <Item label="To">{was(original?.to ?? undefined, to?.name ?? '')}</Item>
          <Item label="Date">{was(editing?.occurredOn, reviewing.occurredOn)}</Item>
          <Item label="Amount">
            {editing && Number(editing.amount) !== Number(reviewAmount)
              ? `${formatMoney(Number(editing.amount))} changed to ${formatMoney(Number(reviewAmount))}`
              : formatMoney(Number(reviewAmount))}
          </Item>
          {reviewing.description.trim() && <Item label="Description">{reviewing.description}</Item>}
          {reviewing.reason.trim() && <Item label="Reason">{reviewing.reason.trim()}</Item>}
        </dl>
        {effect.data && (
          <TransferFigures
            preview={effect.data}
            payment={isPay}
            typeOf={(id) => cardOf(id)?.type}
          />
        )}
        {effect.isError && <FormAlert message={effect.error.message} />}
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-4 flex gap-2">
          <Button onClick={confirm} disabled={save.isPending || !member || !effect.data}>
            {save.isPending ? 'Saving' : words.confirm}
          </Button>
          <Button variant="secondary" onClick={() => setReviewing(null)} disabled={save.isPending}>
            Back
          </Button>
          <Button variant="ghost" onClick={() => onDone()} disabled={save.isPending}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  const rangeOf = (id: string) => byId(id)?.openedOn ?? ''
  return (
    <Card aria-labelledby="transfer-heading">
      <CardTitle id="transfer-heading" className="text-lg">
        {editing ? words.edit : words.add}
      </CardTitle>
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit(setReviewing)}
      >
        <SelectField
          control={control}
          name="fromAccountId"
          label={isPay ? 'Paid from' : 'From'}
          rules={{
            required: isPay
              ? 'Choose the bank account that paid the card'
              : 'Choose the account the money comes from',
          }}
        >
          <option value="">Choose an account</option>
          {choices.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {accountChoice(candidate)}
            </option>
          ))}
        </SelectField>
        {isPay ? (
          <div>
            <p className="text-sm font-medium">Paid to</p>
            <p className="mt-1">{cardOf(toId)?.name ?? ''}</p>
          </div>
        ) : (
          <SelectField
            control={control}
            name="toAccountId"
            label="To"
            rules={{
              required: 'Choose the account the money goes to',
              validate: (value, values) =>
                value !== values.fromAccountId || 'Choose a different account',
            }}
          >
            <option value="">Choose an account</option>
            {choices.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {accountChoice(candidate)}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          control={control}
          name="amount"
          label="Amount"
          inputMode="decimal"
          placeholder="0.00"
          rules={{
            validate: (value: string) => {
              const amount = parseAmount(value)
              if (amount === null) return 'Enter a valid amount'
              return Number(amount) > 0 || 'Enter an amount greater than zero'
            },
          }}
        />
        <TextField
          control={control}
          name="occurredOn"
          label="Date"
          type="date"
          rules={{
            required: 'Enter a date',
            validate: (value: string) => {
              if (value > today) return 'Future activity is not saved as completed history yet'
              const early = [fromId, toId].find((id) => id !== '' && value < rangeOf(id))
              return early ? `This date is before the opening date of ${byId(early)?.name}` : true
            },
          }}
        />
        <TextField control={control} name="description" label="Description" />
        {editing && <TextField control={control} name="reason" label="Reason" />}
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
