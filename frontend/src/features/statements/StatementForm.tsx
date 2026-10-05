import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Member } from '../../api/household'
import type { Statement } from '../../api/statements'
import { Button, Card, CardTitle, FormAlert, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useAttachStatement, useReviseStatement } from '../../hooks/useStatements'
import { formatMoney, parseAmount } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'

type Values = { statementOn: string; balance: string; note: string; reason: string }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

/**
 * Attach a statement, or replace the active one with a corrected version. A replacement is reviewed first: the
 * original and the corrected copy side by side, the Balance unchanged. Cancel at any step saves nothing.
 */
export function StatementForm({
  accountId,
  balance,
  members,
  today,
  replacing,
  onDone,
}: {
  accountId: string
  balance: string
  members: Member[]
  today: string
  /** The active version being replaced; left out to attach a new statement. */
  replacing?: Statement
  onDone: () => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Values | null>(null)
  const [key] = useState(newKey)
  const attach = useAttachStatement(accountId)
  const revise = useReviseStatement(accountId, replacing?.id ?? '')
  const saving = attach.isPending || revise.isPending
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: {
      statementOn: replacing?.statementOn ?? '',
      balance: replacing?.balance ?? '',
      note: replacing?.note ?? '',
      reason: '',
    },
  })

  const save = (values: Values) => {
    if (!member) return
    const statement = {
      statementOn: values.statementOn,
      balance: parseAmount(values.balance)!,
      note: values.note.trim(),
      enteredByMemberId: member.id,
    }
    if (replacing) {
      revise.mutate(
        { key, revision: { ...statement, reason: values.reason.trim() } },
        { onSuccess: onDone },
      )
    } else {
      attach.mutate({ key, statement }, { onSuccess: onDone })
    }
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
            {formatMoney(Number(replacing.balance))}
          </Item>
          <Item label="Corrected statement">
            {reviewing.note.trim() || 'Statement'} dated {reviewing.statementOn},{' '}
            {formatMoney(Number(parseAmount(reviewing.balance)))}
          </Item>
          <Item label="Reason">{reviewing.reason.trim()}</Item>
        </dl>
        <p className="mt-3 max-w-md text-sm text-ink-muted">
          The original stays available and linked. Your Balance stays {formatMoney(Number(balance))}
          ; a statement never changes it. No entry or Balance correction is saved.
        </p>
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-3 flex gap-2">
          <Button onClick={() => save(reviewing)} disabled={saving || !member}>
            {saving ? 'Saving' : 'Confirm replacement'}
          </Button>
          <Button variant="secondary" onClick={() => setReviewing(null)} disabled={saving}>
            Back
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="statement-form-heading">
      <CardTitle id="statement-form-heading" className="text-lg">
        {replacing ? 'Replace with corrected version' : 'Attach statement'}
      </CardTitle>
      <FormAlert message={attach.error?.message} />
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) => (replacing ? setReviewing(values) : save(values)))}
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
          rules={{ validate: (value) => parseAmount(value) !== null || 'Enter a valid amount' }}
        />
        <TextField control={control} name="note" label="Note" />
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
          <Button type="submit" disabled={saving || (!replacing && !member)}>
            {replacing ? 'Review' : saving ? 'Saving' : 'Save statement'}
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={saving}>
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
