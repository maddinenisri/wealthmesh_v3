import { useEffect, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Activity } from '../../api/activity'
import type { Member } from '../../api/household'
import {
  Amount,
  Button,
  Card,
  CardTitle,
  FormAlert,
  SelectField,
  Table,
  Td,
  TextField,
  Th,
} from '../../design-system'
import {
  useCategories,
  useRecordSplit,
  useReplaceSplit,
  useReplacementPreview,
} from '../../hooks/useActivity'
import { useAccounts } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney, parseAmount } from '../../lib/money'
import { ACCOUNT_TYPES } from '../accounts/accountTypes'
import { balanceText, isCard } from '../accounts/cardBalance'
import { CLASS_LABEL, classText } from './classes'
import { EnteredBy } from './EnteredBy'
import { MoveFigures } from './MoveFigures'
import { assignment, splitSummary } from './splitFigures'

/** The most portions one payment holds; the server enforces the same limit. */
const MAX_PORTIONS = 20

type PortionValues = { categoryId: string; classification: string; amount: string }
type Values = {
  description: string
  amount: string
  occurredOn: string
  /** The account the payment lands on; only an edit can choose another one. */
  accountId: string
  reason: string
  portions: PortionValues[]
}

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = (): string => globalThis.crypto.randomUUID()

const CARD_ONLY_CATEGORIES = ['Interest charged', 'Annual fee']

const blank = (): PortionValues => ({ categoryId: '', classification: '', amount: '' })

const amountRules = {
  validate: (value: string) => {
    const amount = parseAmount(value)
    if (amount === null) return 'Enter a valid amount'
    return Number(amount) > 0 || 'Enter an amount greater than zero'
  },
}

/**
 * One payment explained by several spending categories (SPLITS_001 to 005): fill in the payment and its portions,
 * review what is assigned and what is still to assign, then confirm. Nothing is saved until Confirm and the portions
 * must add up to the payment. Editing replaces the payment (the original and its split stay in history).
 */
export function SplitEntry({
  account,
  members,
  today,
  editing,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  /** A split payment being corrected: the form starts from it and saving replaces it. */
  editing?: Activity
  onDone: (saved?: boolean) => void
}) {
  const onCard = isCard(account.type)
  const noun = onCard ? 'purchase' : 'expense'
  const place = onCard ? 'Charged to' : 'Paid from'
  const categories = useCategories('expense', !!editing)
  const record = useRecordSplit(account.id)
  const replace = useReplaceSplit(account.id, editing?.id ?? '')
  const save = editing ? replace : record
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Values | null>(null)
  const [key] = useState(newKey)
  const { control, handleSubmit, getValues } = useForm<Values>({
    defaultValues: {
      description: editing?.description ?? '',
      amount: editing?.amount ?? '',
      occurredOn: editing?.occurredOn ?? today,
      accountId: account.id,
      reason: '',
      portions: editing
        ? editing.portions.map((p) => ({
            categoryId: p.categoryId,
            classification: p.classification ?? '',
            amount: p.amount,
          }))
        : [blank(), blank()],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'portions' })
  const watchedAmount = useWatch({ control, name: 'amount' })
  const watchedPortions = useWatch({ control, name: 'portions' })
  const chosenAccount = useWatch({ control, name: 'accountId' })

  // An edit may move the payment to another account that holds money activity (the server decides, too).
  const accounts = useAccounts()
  const choices = (accounts.data ?? []).filter((candidate) =>
    ACCOUNT_TYPES.some((type) => type.ready && type.value === candidate.type),
  )
  const target =
    choices.find((candidate) => candidate.id === (reviewing?.accountId ?? chosenAccount)) ?? account
  const moving = !!editing && target.id !== account.id
  const reviewAmount = reviewing ? parseAmount(reviewing.amount) : null
  const effect = useReplacementPreview(
    account.id,
    editing && reviewing ? editing.id : '',
    target.id,
    reviewAmount ?? '',
    reviewing?.occurredOn ?? '',
  )

  const inReview = reviewing !== null
  useEffect(() => {
    if (!inReview) return
    const heading = document.getElementById('split-review-heading')
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [inReview])

  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? ''
  const classOf = (row: PortionValues) =>
    row.classification ||
    categories.data?.find((c) => c.id === row.categoryId)?.defaultClass ||
    null
  const keptIds = editing?.portions.map((p) => p.categoryId) ?? []
  const live = assignment(watchedAmount, watchedPortions ?? [])

  const confirm = () => {
    if (!reviewing || !member) return
    const split = {
      description: reviewing.description.trim(),
      amount: parseAmount(reviewing.amount)!,
      occurredOn: reviewing.occurredOn,
      enteredByMemberId: member.id,
      portions: reviewing.portions.map((p) => ({
        categoryId: p.categoryId,
        classification: p.classification,
        amount: parseAmount(p.amount)!,
      })),
    }
    if (editing) {
      replace.mutate(
        {
          key,
          split: {
            ...split,
            reason: reviewing.reason.trim(),
            ...(moving ? { accountId: target.id } : {}),
          },
        },
        { onSuccess: () => onDone(true) },
      )
    } else {
      record.mutate({ key, split }, { onSuccess: () => onDone(true) })
    }
  }

  if (reviewing) {
    const figures = assignment(reviewing.amount, reviewing.portions)
    const balanceAfter = Number(account.balance.amount) - Number(reviewAmount)
    return (
      <Card aria-labelledby="split-review-heading">
        <CardTitle
          id="split-review-heading"
          tabIndex={-1}
          className="scroll-mt-10 text-lg outline-none"
        >
          {editing ? 'Review change' : `Review split ${noun}`}
        </CardTitle>
        <FormAlert message={save.error?.message} />
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label={place}>
            {editing && moving ? `${account.name} changed to ${target.name}` : target.name}
          </Item>
          <Item label="Date">
            {editing && editing.occurredOn !== reviewing.occurredOn
              ? `${editing.occurredOn} changed to ${reviewing.occurredOn}`
              : reviewing.occurredOn}
          </Item>
          <Item label="Amount">
            {editing && Number(editing.amount) !== Number(reviewAmount) ? (
              `${formatMoney(Number(editing.amount))} changed to ${formatMoney(Number(reviewAmount))}`
            ) : (
              <Amount value={Number(reviewAmount)} />
            )}
          </Item>
          {!editing && (
            <Item label={`${account.name} Balance after`}>
              {onCard ? balanceText(account.type, String(balanceAfter)) : formatMoney(balanceAfter)}
            </Item>
          )}
          {reviewing.description.trim() && <Item label="Description">{reviewing.description}</Item>}
          {reviewing.reason.trim() && <Item label="Reason">{reviewing.reason.trim()}</Item>}
        </dl>
        <div className="mt-3">
          <Table aria-label="Portions">
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {reviewing.portions.map((row, index) => (
                <tr key={index}>
                  <Td>
                    {categoryName(row.categoryId)}
                    <span className="block text-caption text-ink-muted">
                      {classText(classOf(row))}
                    </span>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Amount value={Number(parseAmount(row.amount))} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        {editing && (
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Before:{' '}
            {editing.portions
              .map((p) => `${p.categoryName} ${formatMoney(Number(p.amount))}`)
              .join(', ')}
            . The original split stays in history.
          </p>
        )}
        <p
          role={figures.remaining === 0 ? 'status' : 'alert'}
          className="mt-3 max-w-md rounded-control border border-line p-3 text-sm"
        >
          {splitSummary(figures)}
        </p>
        {editing && effect.data && (
          <MoveFigures
            preview={effect.data}
            typeOf={(id) => accounts.data?.find((candidate) => candidate.id === id)?.type}
          />
        )}
        {editing && effect.isError && <FormAlert message={effect.error.message} />}
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-4 flex gap-2">
          <Button
            onClick={confirm}
            disabled={
              save.isPending || !member || figures.remaining !== 0 || (moving && !effect.data)
            }
          >
            {save.isPending ? 'Saving' : 'Confirm saving'}
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

  return (
    <Card aria-labelledby="split-heading">
      <CardTitle id="split-heading" tabIndex={-1} className="scroll-mt-10 text-lg outline-none">
        {editing ? `Edit split ${noun}` : `Split ${onCard ? 'a purchase' : 'an expense'}`}
      </CardTitle>
      <form
        noValidate
        className="mt-3 flex max-w-3xl flex-col gap-4"
        onSubmit={handleSubmit((values) => setReviewing(values))}
      >
        {editing ? (
          <SelectField control={control} name="accountId" label={place}>
            {(choices.length > 0 ? choices : [account]).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="text-sm text-ink-muted">
            {place} <strong>{account.name}</strong>
          </p>
        )}
        <div className="grid max-w-md gap-4">
          <TextField control={control} name="description" label="Description" />
          <TextField
            control={control}
            name="amount"
            label="Amount"
            inputMode="decimal"
            placeholder="0.00"
            rules={amountRules}
          />
          <TextField
            control={control}
            name="occurredOn"
            label="Date"
            type="date"
            rules={{
              required: 'Enter a date',
              validate: (value) =>
                value > today
                  ? 'A split is completed spending: choose today or an earlier date'
                  : value >= target.openedOn || "This date is before the account's opening date",
            }}
          />
        </div>
        {fields.map((field, index) => {
          const n = index + 1
          return (
            <fieldset
              key={field.id}
              className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-3"
            >
              <legend className="px-1 text-sm font-medium">Portion {n}</legend>
              <SelectField
                control={control}
                name={`portions.${index}.categoryId`}
                label={`Category ${n}`}
                rules={{
                  required: 'Choose a category',
                  validate: (value) =>
                    getValues('portions').filter((p) => p.categoryId === value).length < 2 ||
                    'Each category can be used once in a split',
                }}
              >
                <option value="">Choose a category</option>
                {categories.data
                  ?.filter((category) => !category.archived || keptIds.includes(category.id))
                  .filter((category) => onCard || !CARD_ONLY_CATEGORIES.includes(category.name))
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </SelectField>
              <SelectField
                control={control}
                name={`portions.${index}.classification`}
                label={`Class ${n}`}
              >
                <option value="">Category default</option>
                {Object.entries(CLASS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <TextField
                control={control}
                name={`portions.${index}.amount`}
                label={`Portion amount ${n}`}
                inputMode="decimal"
                placeholder="0.00"
                rules={amountRules}
              />
              {fields.length > 2 && (
                <div className="flex items-end sm:col-span-3">
                  <Button variant="ghost" size="sm" onClick={() => remove(index)}>
                    Remove portion {n}
                  </Button>
                </div>
              )}
            </fieldset>
          )
        })}
        <p role="status" className="max-w-md rounded-control border border-line p-3 text-sm">
          {splitSummary(live)}
        </p>
        {editing && (
          <div className="max-w-md">
            <TextField control={control} name="reason" label="Reason" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => append(blank())}
            disabled={fields.length >= MAX_PORTIONS}
          >
            Add a portion
          </Button>
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
