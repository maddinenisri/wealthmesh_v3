import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Activity } from '../../api/activity'
import type { Member } from '../../api/household'
import type { Transfer } from '../../api/transfers'
import { Button, Card, CardTitle, FormAlert, SelectField, TextField } from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useLoanPayment, useSaveTransfer, useTransferPreview } from '../../hooks/useTransfers'
import { formatMoney, parseAmount } from '../../lib/money'
import {
  capitalNoun,
  debtNoun,
  debtNounOf,
  interestCategoryName,
  isDebt,
} from '../accounts/accountTypes'
import { balanceText, isCard } from '../accounts/cardBalance'
import { OVERDRAFT_NOTICE } from '../accounts/Overdrawn'
import { EnteredBy } from '../activity/EnteredBy'
import { accountChoice, usableAccounts } from '../transfers/accountChoice'
import { useRevealReview } from '../transfers/useRevealReview'
import { unassigned } from './unassigned'

type Values = {
  fromAccountId: string
  toAccountId: string
  amount: string
  principal: string
  interest: string
  occurredOn: string
  description: string
  reason: string
}

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = (): string => globalThis.crypto.randomUUID()

/**
 * A payment to a loan (LOAN_003): the whole payment leaves a checking or savings account, the principal reduces the
 * debt and the interest is spending. Fill in, review, then confirm; nothing is saved until Confirm. `account` is the
 * page it opens from: the paying account (the person chooses the loan) or the loan (the person chooses the payer).
 * Editing corrects the whole payment; the original stays in history.
 */
export function LoanPaymentForm({
  account,
  members,
  today,
  editing,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  /** A payment row being corrected, from either side. */
  editing?: Activity
  onDone: (message?: string) => void
}) {
  const saved = useLoanPayment(editing?.movementId ?? undefined)
  if (editing && saved.isPending) return <p className="text-sm text-ink-muted">Loading payment</p>
  if (editing && saved.isError) return <p role="alert">{saved.error.message}</p>
  return (
    <LoanPaymentFields
      account={account}
      members={members}
      today={today}
      editing={saved.data}
      onDone={onDone}
    />
  )
}

function LoanPaymentFields({
  account,
  members,
  today,
  editing,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  editing: Transfer | undefined
  onDone: (message?: string) => void
}) {
  const accounts = useAccounts()
  const fromLoan = isDebt(account.type)
  const kept = [account.id, editing?.from.accountId ?? '', editing?.to.accountId ?? ''].filter(
    Boolean,
  )
  const usable = usableAccounts(accounts.data, ...kept)
  const payers = usable.filter((candidate) => !isCard(candidate.type) && !isDebt(candidate.type))
  const loans = (accounts.data ?? []).filter(
    (candidate) =>
      isDebt(candidate.type) && (candidate.status === 'active' || kept.includes(candidate.id)),
  )
  const byId = (id: string) => accounts.data?.find((candidate) => candidate.id === id)
  // What this payment calls the debt: the fixed account's own noun, else what the choice offers.
  const noun = fromLoan
    ? debtNoun(account.type)
    : debtNounOf(loans.map((candidate) => candidate.type))
  const save = useSaveTransfer(editing?.movementId, 'loan-payments')
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Values | null>(null)
  const [key] = useState(newKey)
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: {
      fromAccountId: editing ? editing.from.accountId : fromLoan ? '' : account.id,
      toAccountId: editing ? editing.to.accountId : fromLoan ? account.id : '',
      amount: editing?.amount ?? '',
      principal: editing?.principal ?? '',
      interest: editing?.interest && Number(editing.interest) !== 0 ? editing.interest : '',
      occurredOn: editing?.occurredOn ?? today,
      description: editing?.description ?? '',
      reason: '',
    },
  })
  const [amount, principal, interest] = useWatch({
    control,
    name: ['amount', 'principal', 'interest'],
  })
  const left = unassigned(amount, principal, interest)
  const effect = useTransferPreview(
    {
      fromAccountId: reviewing?.fromAccountId ?? '',
      toAccountId: reviewing?.toAccountId ?? '',
      amount: (reviewing && parseAmount(reviewing.amount)) || undefined,
      principal: (reviewing && parseAmount(reviewing.principal)) || undefined,
      interest: reviewing ? (parseAmount(reviewing.interest) ?? '0.00') : undefined,
      occurredOn: reviewing?.occurredOn,
      movementId: editing?.movementId,
    },
    'loan-payments',
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
          principal: parseAmount(reviewing.principal)!,
          interest: parseAmount(reviewing.interest) ?? '0.00',
          occurredOn: reviewing.occurredOn,
          description: reviewing.description.trim() || undefined,
          enteredByMemberId: member.id,
          reason: editing ? reviewing.reason.trim() || undefined : undefined,
        },
      },
      {
        onSuccess: (result) =>
          onDone(
            `${editing ? 'Changed' : 'Saved'} the ${formatMoney(Number(result.amount))} payment to ${result.to.accountName}: ${formatMoney(Number(result.principal ?? 0))} principal, ${formatMoney(Number(result.interest ?? 0))} interest.`,
          ),
      },
    )
  }

  // Back from the review brings the form back in place; its heading takes focus, not the page body.
  const wasReviewing = useRef(false)
  useEffect(() => {
    if (reviewing) wasReviewing.current = true
    else if (wasReviewing.current) document.getElementById('loan-payment-heading')?.focus()
  }, [reviewing])

  if (reviewing) {
    const from = byId(reviewing.fromAccountId)
    const to = byId(reviewing.toAccountId)
    const total = Number(parseAmount(reviewing.amount))
    const part = Number(parseAmount(reviewing.principal))
    const rest = Number(parseAmount(reviewing.interest) ?? '0')
    const payerAfter = effect.data?.accounts.find((entry) => entry.id === reviewing.fromAccountId)
    const overdrawn = payerAfter ? Number(payerAfter.balanceAfter) < 0 : false
    const was = (before: string | undefined, after: string) =>
      before !== undefined && before !== after ? `${before} changed to ${after}` : after
    return (
      <Card aria-labelledby="review-heading">
        <CardTitle id="review-heading" tabIndex={-1} className="scroll-mt-10 text-lg outline-none">
          {editing ? 'Review change' : 'Review payment'}
        </CardTitle>
        <FormAlert message={save.error?.message} />
        {effect.isError && <FormAlert message={effect.error.message} />}
        {overdrawn && (
          <p role="alert" className="mt-3 max-w-md rounded-control border border-line p-3 text-sm">
            This will leave {from?.name} overdrawn by{' '}
            {formatMoney(-Number(payerAfter?.balanceAfter))}. {OVERDRAFT_NOTICE}
          </p>
        )}
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label="Paid from">{was(editing?.from.accountName, from?.name ?? '')}</Item>
          <Item label={capitalNoun(debtNoun(to?.type ?? ''))}>
            {was(editing?.to.accountName, to?.name ?? '')}
          </Item>
          <Item label="Date">{was(editing?.occurredOn, reviewing.occurredOn)}</Item>
          <Item label="Payment">
            {editing && Number(editing.amount) !== total
              ? `${formatMoney(Number(editing.amount))} changed to ${formatMoney(total)}`
              : formatMoney(total)}
          </Item>
          <Item label="Principal">
            {editing?.principal && Number(editing.principal) !== part
              ? `${formatMoney(Number(editing.principal))} changed to ${formatMoney(part)}`
              : formatMoney(part)}
            <span className="block text-caption text-ink-muted">Reduces the amount owed</span>
          </Item>
          <Item label="Interest">
            {editing?.interest && Number(editing.interest) !== rest
              ? `${formatMoney(Number(editing.interest))} changed to ${formatMoney(rest)}`
              : formatMoney(rest)}
            <span className="block text-caption text-ink-muted">
              {rest > 0
                ? `Counts as spending: ${interestCategoryName(to?.type ?? '')}`
                : 'No interest in this payment'}
            </span>
          </Item>
          {reviewing.description.trim() && <Item label="Description">{reviewing.description}</Item>}
          {reviewing.reason.trim() && <Item label="Reason">{reviewing.reason.trim()}</Item>}
        </dl>
        {effect.data && (
          <section
            aria-label="Effect of this payment"
            className="mt-3 max-w-md rounded-control border border-line p-3 text-sm"
          >
            <p className="font-medium">After you confirm</p>
            <dl className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {[...effect.data.accounts]
                .sort(
                  (a, b) =>
                    Number(b.id === reviewing.fromAccountId) -
                    Number(a.id === reviewing.fromAccountId),
                )
                .map((entry) => (
                  <div key={entry.id} className="min-w-0">
                    <dt className="text-caption text-ink-muted [overflow-wrap:anywhere]">
                      {entry.name} {isDebt(byId(entry.id)?.type ?? '') ? 'Balance owed' : 'Balance'}
                    </dt>
                    <dd>{balanceText(byId(entry.id)?.type ?? '', entry.balanceAfter)}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-3 text-caption text-ink-muted">
              Only the interest is spending. The principal lowers what you owe: it is not income or
              spending.
            </p>
          </section>
        )}
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-4 flex gap-2">
          <Button onClick={confirm} disabled={save.isPending || !member || !effect.data}>
            {save.isPending ? 'Saving' : editing ? 'Confirm change' : 'Confirm payment'}
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

  const startOf = (id: string) => byId(id)?.openedOn ?? ''
  return (
    <Card aria-labelledby="loan-payment-heading">
      <CardTitle id="loan-payment-heading" tabIndex={-1} className="text-lg outline-none">
        {editing ? 'Edit payment' : 'Record payment'}
      </CardTitle>
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit(setReviewing)}
      >
        {!fromLoan && !editing ? (
          <div>
            <p className="text-sm font-medium">Paid from</p>
            <p className="mt-1">{account.name}</p>
          </div>
        ) : (
          <SelectField
            control={control}
            name="fromAccountId"
            label="Paid from"
            rules={{ required: `Choose the account that paid the ${noun}` }}
          >
            <option value="">Choose an account</option>
            {payers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {accountChoice(candidate)}
              </option>
            ))}
          </SelectField>
        )}
        {fromLoan && !editing ? (
          <div>
            <p className="text-sm font-medium">{capitalNoun(noun)}</p>
            <p className="mt-1">{account.name}</p>
          </div>
        ) : (
          <SelectField
            control={control}
            name="toAccountId"
            label={`${capitalNoun(noun)} to pay`}
            rules={{ required: `Choose the ${noun} to pay` }}
          >
            <option value="">Choose a {noun}</option>
            {loans.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {accountChoice(candidate)}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          control={control}
          name="amount"
          label="Payment amount"
          inputMode="decimal"
          placeholder="0.00"
          hint="The whole amount that leaves the paying account."
          rules={{
            validate: (value: string) => {
              const parsed = parseAmount(value)
              if (parsed === null)
                return value.trim() === '' ? 'Enter the payment amount' : 'Enter a valid amount'
              return Number(parsed) > 0 || 'Enter an amount greater than zero'
            },
          }}
        />
        <TextField
          control={control}
          name="principal"
          label="Principal"
          inputMode="decimal"
          placeholder="0.00"
          hint="The part that reduces the amount owed."
          rules={{
            validate: (value: string) => {
              const parsed = parseAmount(value)
              if (parsed === null)
                return value.trim() === '' ? 'Enter the principal' : 'Enter a valid amount'
              return Number(parsed) > 0 || 'Enter a principal above $0.00'
            },
          }}
        />
        <TextField
          control={control}
          name="interest"
          label="Interest"
          inputMode="decimal"
          placeholder="0.00"
          hint="Optional. The part that is a cost: it counts as spending."
          rules={{
            validate: (value: string, values: Values) => {
              if (value.trim() !== '') {
                const parsed = parseAmount(value)
                if (parsed === null) return 'Enter a valid amount'
                if (Number(parsed) < 0) return 'Enter zero or a positive interest'
              }
              const rest = unassigned(values.amount, values.principal, value)
              if (rest === null || rest === 0) return true
              return rest > 0
                ? `${formatMoney(rest / 100)} remains unassigned`
                : `Principal and interest are ${formatMoney(-rest / 100)} more than the payment`
            },
          }}
        />
        {left !== null && left !== 0 && !errors.interest && (
          <p role="status" className="text-sm text-ink-muted">
            {left > 0
              ? `${formatMoney(left / 100)} still to assign to principal or interest.`
              : `Principal and interest are ${formatMoney(-left / 100)} more than the payment.`}
          </p>
        )}
        <TextField
          control={control}
          name="occurredOn"
          label="Date"
          type="date"
          rules={{
            required: 'Enter a date',
            validate: (value: string, values: Values) => {
              if (value > today) return 'Future activity is not saved as completed history yet'
              const early = [values.fromAccountId, values.toAccountId].find(
                (id) => id !== '' && value < startOf(id),
              )
              return early ? `This date is before the opening date of ${byId(early)?.name}` : true
            },
          }}
        />
        <TextField control={control} name="description" label="Description" />
        {editing && <TextField control={control} name="reason" label="Reason (optional)" />}
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
