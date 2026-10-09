import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import type { PriceReview } from '../../api/prices'
import { Button, FormAlert, SelectField, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useReviewPrice, useSavePrice } from '../../hooks/usePrices'
import { formatMoney } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'

type Values = { symbol: string; price: string; valueOn: string }

const PRICE = /^\d{1,15}(\.\d{1,4})?$/
const dollars = (text: string) => formatMoney(Number(text))
/** One id per review: a repeat of the same save carries the same id (D-024), a changed price gets a new one. */
const newKey = () => globalThis.crypto.randomUUID()

/** The field a server refusal is about, so it is shown beside that field; null when it is about the whole price. */
function fieldOf(message: string): keyof Values | null {
  if (/cannot be dated|opening price is dated/.test(message)) return 'valueOn'
  if (/is not held in|Choose the holding/.test(message)) return 'symbol'
  if (/market price|valid amount/.test(message)) return 'price'
  return null
}

/** "$1,234.5" to "1234.5": a price keeps up to four decimals, unlike a money amount. */
const cleanPrice = (text: string) =>
  text
    .trim()
    .replace(/^(-?)\$\s*/, '$1')
    .replaceAll(',', '')

/**
 * Record a price on one holding (V2_HOLDINGS_008, V2_WEALTH_004): the holding, its market price and the date, reviewed
 * by the server before anything is saved. A known price of $0.00 is highlighted: the shares stay recorded and only
 * their value becomes zero. Confirm ends on the status line (the caller shows the sentence and moves focus); Back
 * returns to the form's heading; Cancel returns focus to the button that opened it.
 */
export function RecordPrice({
  account,
  symbols,
  members,
  today,
  onDone,
}: {
  account: Account
  /** The holdings the account has, named as its opening lines name them. */
  symbols: string[]
  members: Member[]
  today: string
  /** `message` is the sentence to show; it is absent when nothing changed (Cancel). */
  onDone: (message?: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const reviewMutation = useReviewPrice(account.id)
  const save = useSavePrice(account.id)
  const [review, setReview] = useState<{ values: Values; result: PriceReview } | null>(null)
  const [cameBack, setCameBack] = useState(false)
  const [key, setKey] = useState(newKey)
  const heading = useRef<HTMLHeadingElement>(null)
  const { control, handleSubmit, setError, setFocus } = useForm<Values>({
    defaultValues: { symbol: symbols[0] ?? '', price: '', valueOn: today },
  })
  const refusal = reviewMutation.error?.message
  const alertMessage = refusal && !fieldOf(refusal) ? refusal : undefined
  useEffect(() => {
    if (refusal) document.querySelector('[role="alert"]')?.scrollIntoView?.({ block: 'center' })
  }, [refusal])
  // Back puts focus on the form's heading, in an effect after the form is on the page again.
  useEffect(() => {
    if (!review && cameBack) heading.current?.focus()
  }, [review, cameBack])

  const input = (values: Values) => ({
    symbol: values.symbol,
    price: cleanPrice(values.price),
    valueOn: values.valueOn,
    enteredByMemberId: member?.id ?? '',
  })

  const onSubmit = handleSubmit(async (values) => {
    if (!member) return
    reviewMutation.reset()
    save.reset()
    const result = await reviewMutation.mutateAsync(input(values)).catch((error: Error) => {
      // A refusal about one field is shown beside it and takes focus; any other stays in the alert.
      const field = fieldOf(error.message)
      if (field) {
        setError(field, { type: 'server', message: error.message })
        setFocus(field)
      }
      return null
    })
    if (result) {
      setKey(newKey())
      setReview({ values, result })
    }
  })

  const confirm = async (values: Values) => {
    if (!member) return
    const saved = await save.mutateAsync({ input: input(values), key }).catch(() => null)
    if (saved) onDone(saved.message)
  }

  if (review) {
    const { result } = review
    return (
      <Panel key="review">
        <section aria-labelledby="price-review-heading" className="flex max-w-xl flex-col gap-3">
          <h2
            id="price-review-heading"
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Review the {result.symbol} price for {account.name}
          </h2>
          <FormAlert message={save.error?.message} />
          {result.zero ? (
            <p role="note" className="rounded-control border-2 border-negative p-3 font-medium">
              {result.message}
            </p>
          ) : (
            <p>{result.message}</p>
          )}
          <dl className="grid grid-cols-[auto_1fr_1fr] gap-x-6 gap-y-1 text-sm">
            <dt />
            <dd className="text-ink-muted">Now</dd>
            <dd className="text-ink-muted">After</dd>
            <dt className="text-ink-muted">{result.symbol} value</dt>
            <dd className="normal-nums">{dollars(result.holdingBefore)}</dd>
            <dd className="normal-nums">{dollars(result.holdingAfter)}</dd>
            <dt className="text-ink-muted">Balance</dt>
            <dd className="normal-nums">{dollars(result.balanceBefore)}</dd>
            <dd className="normal-nums">{dollars(result.balanceAfter)}</dd>
            <dt className="text-ink-muted">Household wealth</dt>
            <dd className="normal-nums">{dollars(result.netWorthBefore)}</dd>
            <dd className="normal-nums">{dollars(result.netWorthAfter)}</dd>
          </dl>
          <p className="text-sm text-ink-muted">
            A price is not income and creates no entry. The {result.shares} shares, the purchase
            cost and the cash stay as they are.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={save.isPending || !member}
              onClick={() => void confirm(review.values)}
            >
              {save.isPending ? 'Saving' : 'Confirm price'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                save.reset()
                setCameBack(true)
                setReview(null)
              }}
            >
              Back
            </Button>
            <Button type="button" variant="ghost" onClick={() => onDone()}>
              Cancel
            </Button>
          </div>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        </section>
      </Panel>
    )
  }

  return (
    <Panel key="form" takeFocus={!cameBack}>
      <form
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="record-price-heading"
        className="flex max-w-md flex-col gap-4"
      >
        <h2
          ref={heading}
          id="record-price-heading"
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          Record a price for {account.name}
        </h2>
        <FormAlert message={alertMessage} />
        <p className="text-sm text-ink-muted">
          A price is for one holding on one date. A second price for the same holding and date
          replaces the first; the first stays in the history.
        </p>
        <SelectField control={control} name="symbol" label="Holding">
          {symbols.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </SelectField>
        <TextField
          control={control}
          name="price"
          label="Market price"
          inputMode="decimal"
          placeholder="0.00"
          hint="The price of one share. A known price of 0.00 is allowed."
          rules={{
            validate: (value) => {
              const text = cleanPrice(value)
              if (text.startsWith('-')) return 'Holding market price must be zero or greater'
              return PRICE.test(text) || 'Enter a valid amount'
            },
          }}
        />
        <TextField
          control={control}
          name="valueOn"
          label="Price date"
          type="date"
          rules={{
            validate: (value) => {
              if (value.trim() === '') return 'Enter the price date'
              if (value > today) return 'A price cannot be dated in the future.'
              return (
                value >= account.openedOn ||
                `A price cannot be dated before tracking began on ${account.openedOn}.`
              )
            },
          }}
        />
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="flex gap-2">
          <Button type="submit" disabled={reviewMutation.isPending || !member}>
            {reviewMutation.isPending ? 'Checking' : 'Review price'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  )
}
