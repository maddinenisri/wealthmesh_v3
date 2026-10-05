import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
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
import { useCategories, useRecordBatch } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney, parseAmount } from '../../lib/money'
import { balanceText, isCard } from '../accounts/cardBalance'
import { CLASS_LABEL, classText } from './classes'
import { EnteredBy } from './EnteredBy'

/** The most entries one batch holds; the server enforces the same limit. */
const MAX_ROWS = 20

type Row = {
  occurredOn: string
  amount: string
  categoryId: string
  classification: string
  description: string
}
type Values = { rows: Row[] }

function newKey(): string {
  return globalThis.crypto.randomUUID()
}

/** Charges only a card has; a bank account's fees are Bank fees. The server keeps one list (D-020). */
const CARD_ONLY_CATEGORIES = ['Interest charged', 'Annual fee']

/**
 * Several expenses (or purchases, on a card) for one account: fill in, review the dates, amounts and total, then
 * save them all or none (EXPENSE_003 to 005). Nothing is saved until Confirm; Cancel and Back keep or drop the form
 * without saving; one invalid row saves none of them and everything stays entered.
 */
export function BatchEntry({
  account,
  members,
  today,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  onDone: () => void
}) {
  const onCard = isCard(account.type)
  const noun = onCard ? 'purchase' : 'expense'
  const categories = useCategories('expense')
  const record = useRecordBatch(account.id)
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Row[] | null>(null)
  // One id per form: confirming again after a lost answer repeats the same save (D-024).
  const [key] = useState(newKey)
  const { control, handleSubmit, getValues } = useForm<Values>({
    defaultValues: { rows: [blank(), blank()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'rows' })

  const inReview = reviewing !== null
  useEffect(() => {
    if (!inReview) return
    const heading = document.getElementById('batch-review-heading')
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [inReview])

  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? ''
  const classOf = (row: Row) =>
    row.classification ||
    categories.data?.find((c) => c.id === row.categoryId)?.defaultClass ||
    null
  const total = (reviewing ?? []).reduce((sum, row) => sum + Number(parseAmount(row.amount)), 0)
  const after = Number(account.balance.amount) - total

  if (reviewing) {
    return (
      <Card aria-labelledby="batch-review-heading">
        <CardTitle
          id="batch-review-heading"
          tabIndex={-1}
          className="scroll-mt-10 text-lg outline-none"
        >
          Review {noun}s
        </CardTitle>
        <FormAlert message={record.error?.message} />
        <p className="mt-3 text-sm">
          {onCard ? 'Charged to' : 'Paid from'} <strong>{account.name}</strong>
        </p>
        <div className="mt-3">
          <Table aria-label={`Prepared ${noun}s`}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th className="hidden sm:table-cell">Description</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {reviewing.map((row, index) => (
                <tr key={index}>
                  <Td className="whitespace-nowrap">{row.occurredOn}</Td>
                  <Td>
                    {categoryName(row.categoryId) || 'No category'}
                    <span className="block text-caption text-ink-muted">
                      {classText(classOf(row))}
                    </span>
                  </Td>
                  <Td className="hidden sm:table-cell [overflow-wrap:anywhere]">
                    {row.description}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Amount value={Number(parseAmount(row.amount))} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-ink-muted">Total</dt>
            <dd>
              <Amount value={total} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">{account.name} Balance after</dt>
            <dd>{onCard ? balanceText(account.type, String(after)) : formatMoney(after)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-ink-muted">
          None of these {noun}s is saved yet. Confirming saves all of them, or none if any is
          refused.
        </p>
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() =>
              member &&
              record.mutate(
                {
                  key,
                  memberId: member.id,
                  entries: reviewing.map((row) => ({
                    description: row.description.trim(),
                    amount: parseAmount(row.amount)!,
                    occurredOn: row.occurredOn,
                    categoryId: row.categoryId,
                    classification: row.classification,
                  })),
                },
                { onSuccess: onDone },
              )
            }
            disabled={record.isPending || !member}
          >
            {record.isPending ? 'Saving' : 'Confirm saving all'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setReviewing(null)}
            disabled={record.isPending}
          >
            Back
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={record.isPending}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="batch-heading">
      <CardTitle id="batch-heading" className="text-lg">
        Add several {noun}s
      </CardTitle>
      <p className="mt-1 text-sm text-ink-muted">
        {onCard ? 'Charged to' : 'Paid from'} <strong>{account.name}</strong>. Each {noun} has its
        own date and amount.
      </p>
      <form
        noValidate
        className="mt-3 flex flex-col gap-5"
        onSubmit={handleSubmit((values) => setReviewing(values.rows))}
      >
        {fields.map((field, index) => {
          const n = index + 1
          return (
            <fieldset
              key={field.id}
              className="grid max-w-3xl gap-3 rounded-control border border-line p-3 sm:grid-cols-2"
            >
              <legend className="px-1 text-sm font-medium">
                {noun[0].toUpperCase() + noun.slice(1)} {n}
              </legend>
              <TextField
                control={control}
                name={`rows.${index}.occurredOn`}
                label={`Date ${n}`}
                type="date"
                rules={{
                  required: 'Enter a date',
                  validate: (value) =>
                    value > today
                      ? 'Future activity is a plan or reminder: record it as a reminder instead'
                      : value >= account.openedOn ||
                        "This date is before the account's opening date",
                }}
              />
              <TextField
                control={control}
                name={`rows.${index}.amount`}
                label={`Amount ${n}`}
                inputMode="decimal"
                placeholder="0.00"
                rules={{
                  validate: (value) => {
                    const amount = parseAmount(value)
                    if (amount === null) return 'Enter a valid amount'
                    return Number(amount) > 0 || 'Enter an amount greater than zero'
                  },
                }}
              />
              <SelectField
                control={control}
                name={`rows.${index}.categoryId`}
                label={`Category ${n}`}
              >
                <option value="">No category (review later)</option>
                {categories.data
                  ?.filter((category) => onCard || !CARD_ONLY_CATEGORIES.includes(category.name))
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </SelectField>
              <SelectField
                control={control}
                name={`rows.${index}.classification`}
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
                name={`rows.${index}.description`}
                label={`Description ${n}`}
              />
              {fields.length > 1 && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" onClick={() => remove(index)}>
                    Remove {noun} {n}
                  </Button>
                </div>
              )}
            </fieldset>
          )
        })}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              // A new row starts like the last: the same category and class, a date and amount still to enter.
              const last = getValues('rows').at(-1)
              append({
                ...blank(),
                categoryId: last?.categoryId ?? '',
                classification: last?.classification ?? '',
              })
            }}
            disabled={fields.length >= MAX_ROWS}
          >
            Add another {noun}
          </Button>
          <Button type="submit">Review</Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

const blank = (): Row => ({
  occurredOn: '',
  amount: '',
  categoryId: '',
  classification: '',
  description: '',
})
