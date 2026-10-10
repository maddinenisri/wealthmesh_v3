import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Member } from '../../api/household'
import type { NewStatement, Statement, StatementReview } from '../../api/statements'
import { Button, Card, CardTitle, FormAlert, SelectField, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import {
  useAttachStatement,
  useReviewStatement,
  useReviseStatement,
} from '../../hooks/useStatements'
import { parseAmount } from '../../lib/money'
import { isInvestment } from '../accounts/accountTypes'
import { balanceText, isCard } from '../accounts/cardBalance'
import { EnteredBy } from '../activity/EnteredBy'

type Values = {
  statementOn: string
  balance: string
  balanceSide: 'owed' | 'credit'
  note: string
  reason: string
}

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

/**
 * Attach a statement, or replace the active one with a corrected version. A replacement is reviewed first: the
 * original and the corrected copy side by side, the Balance unchanged. Cancel at any step saves nothing.
 */
export function StatementForm({
  accountId,
  accountType,
  balance,
  members,
  today,
  replacing,
  linkable = false,
  onRecordPrice,
  onDone,
}: {
  accountId: string
  /** A card's statement shows what is owed or Card credit, so the form asks which. */
  accountType: string
  balance: string
  members: Member[]
  today: string
  /** The active version being replaced; left out to attach a new statement. */
  replacing?: Statement
  /** An investment account whose opening review uses no statement yet can link this one to it. */
  linkable?: boolean
  /** The review of a differing investment statement offers the price form (cash and quantity come later). */
  onRecordPrice?: () => void
  /** `saved` is true after a statement was saved; Cancel leaves it out. `sentence` replaces the usual one. */
  onDone: (saved?: boolean, sentence?: string) => void
}) {
  const card = isCard(accountType)
  const money = (value: string | number) => balanceText(accountType, String(value))
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Values | null>(null)
  // An investment account's new statement is reviewed by the server against the calculated Balance on its date.
  const differenceReview = isInvestment(accountType) && !replacing
  const reviewMutation = useReviewStatement(accountId)
  const [difference, setDifference] = useState<{
    statement: NewStatement
    review: StatementReview
  } | null>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const formHeading = useRef<HTMLHeadingElement>(null)
  const cameBack = useRef(false)
  useEffect(() => {
    if (difference) reviewHeading.current?.focus()
  }, [difference])
  useEffect(() => {
    // Back from the review returns to the form's heading with the values kept; the first open is the Panel's.
    if (!difference && cameBack.current) {
      cameBack.current = false
      formHeading.current?.focus()
    }
  }, [difference])
  const [supportsOpening, setSupportsOpening] = useState(false)
  const [key] = useState(newKey)
  const attach = useAttachStatement(accountId)
  const revise = useReviseStatement(accountId, replacing?.id ?? '')
  const saving = attach.isPending || revise.isPending
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: {
      statementOn: replacing?.statementOn ?? '',
      // A card's statement is stored with the asset sign; the form shows the size and the side apart.
      balance: replacing
        ? card
          ? Math.abs(Number(replacing.balance)).toFixed(2)
          : replacing.balance
        : '',
      balanceSide: replacing && Number(replacing.balance) > 0 ? 'credit' : 'owed',
      note: replacing?.note ?? '',
      reason: '',
    },
  })

  const statementOf = (values: Values): NewStatement | null =>
    member
      ? {
          statementOn: values.statementOn,
          balance: parseAmount(values.balance)!,
          ...(card ? { balanceSide: values.balanceSide } : {}),
          note: values.note.trim(),
          enteredByMemberId: member.id,
          ...(supportsOpening ? { supportsOpening } : {}),
        }
      : null

  const save = (values: Values) => {
    const statement = statementOf(values)
    if (!statement) return
    if (replacing) {
      revise.mutate(
        { key, revision: { ...statement, reason: values.reason.trim() } },
        { onSuccess: () => onDone(true) },
      )
    } else {
      attach.mutate({ key, statement }, { onSuccess: () => onDone(true) })
    }
  }

  if (difference) {
    return (
      <Card aria-labelledby="statement-difference-heading">
        <CardTitle
          ref={reviewHeading}
          id="statement-difference-heading"
          tabIndex={-1}
          className="text-lg outline-none"
        >
          Review the statement
        </CardTitle>
        <FormAlert message={attach.error?.message} />
        <p className="mt-3 max-w-prose text-sm">{difference.review.message}</p>
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              attach.mutate(
                { key, statement: difference.statement },
                { onSuccess: () => onDone(true, difference.review.afterSave) },
              )
            }
            disabled={saving || !member}
          >
            {saving ? 'Saving' : 'Save statement'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cameBack.current = true
              attach.reset()
              setDifference(null)
            }}
            disabled={saving}
          >
            Back
          </Button>
          {difference.review.differs && onRecordPrice && (
            <Button variant="secondary" onClick={onRecordPrice} disabled={saving}>
              Record a price
            </Button>
          )}
          <Button variant="ghost" onClick={() => onDone()} disabled={saving}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  if (reviewing && replacing) {
    return (
      <Card aria-labelledby="statement-review-heading">
        <CardTitle id="statement-review-heading" className="text-lg">
          Review statement replacement
        </CardTitle>
        <FormAlert message={revise.error?.message} />
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label="Original statement">
            {replacing.note || 'Statement'} dated {replacing.statementOn},{' '}
            {money(replacing.balance)}
          </Item>
          <Item label="Corrected statement">
            {reviewing.note.trim() || 'Statement'} dated {reviewing.statementOn},{' '}
            {card
              ? `${money(Number(parseAmount(reviewing.balance)) * (reviewing.balanceSide === 'owed' ? -1 : 1))}`
              : money(Number(parseAmount(reviewing.balance)))}
          </Item>
          <Item label="Reason">{reviewing.reason.trim()}</Item>
        </dl>
        <p className="mt-3 max-w-md text-sm text-ink-muted">
          The original stays available and linked. Your Balance stays {money(balance)}; a statement
          never changes it. No entry or Balance correction is saved.
        </p>
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-3 flex gap-2">
          <Button onClick={() => save(reviewing)} disabled={saving || !member}>
            {saving ? 'Saving' : 'Confirm replacement'}
          </Button>
          <Button variant="secondary" onClick={() => setReviewing(null)} disabled={saving}>
            Back
          </Button>
          <Button variant="ghost" onClick={() => onDone()} disabled={saving}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="statement-form-heading">
      <CardTitle
        ref={formHeading}
        id="statement-form-heading"
        tabIndex={-1}
        className="text-lg outline-none"
      >
        {replacing ? 'Replace with corrected version' : 'Attach statement'}
      </CardTitle>
      <FormAlert message={attach.error?.message ?? reviewMutation.error?.message} />
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) => {
          if (replacing) return setReviewing(values)
          if (!differenceReview) return save(values)
          const statement = statementOf(values)
          if (!statement) return
          reviewMutation.mutate(statement, {
            onSuccess: (review) => setDifference({ statement, review }),
          })
        })}
      >
        <TextField
          control={control}
          name="statementOn"
          label="Statement date"
          type="date"
          rules={{
            required: 'Enter the statement date',
            validate: (value) => value <= today || 'A statement cannot be dated in the future',
          }}
        />
        <TextField
          control={control}
          name="balance"
          label="Statement balance"
          inputMode="decimal"
          placeholder="0.00"
          rules={{
            validate: (value) => {
              const amount = parseAmount(value)
              return (
                (amount !== null && !(card && amount.startsWith('-'))) || 'Enter a valid amount'
              )
            },
          }}
        />
        {card && (
          <SelectField control={control} name="balanceSide" label="Statement shows">
            <option value="owed">Owed</option>
            <option value="credit">Card credit</option>
          </SelectField>
        )}
        <TextField control={control} name="note" label="Note" />
        {linkable && !replacing && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={supportsOpening}
              onChange={(event) => setSupportsOpening(event.target.checked)}
              className="mt-1"
            />
            <span>
              This statement supports the opening cash and holdings
              <span className="block text-caption text-ink-muted">
                Optional. The opening breakdown stays even if the statement is removed later.
              </span>
            </span>
          </label>
        )}
        {replacing && (
          <TextField
            control={control}
            name="reason"
            label="Reason"
            rules={{ validate: (value) => value.trim() !== '' || 'Enter a reason' }}
          />
        )}
        {!replacing && <EnteredBy members={members} member={member} setMemberId={setMemberId} />}
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={saving || reviewMutation.isPending || (!replacing && !member)}
          >
            {replacing || differenceReview
              ? reviewMutation.isPending
                ? 'Reviewing'
                : 'Review'
              : saving
                ? 'Saving'
                : 'Save statement'}
          </Button>
          <Button variant="ghost" onClick={() => onDone()} disabled={saving}>
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
