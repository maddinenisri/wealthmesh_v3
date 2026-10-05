import { useState } from 'react'
import type { Statement } from '../../api/statements'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle } from '../../design-system'
import { useStatements } from '../../hooks/useStatements'
import { formatMoney } from '../../lib/money'
import { Panel } from '../activity/Panel'
import { StatementForm } from './StatementForm'

/** "2026-10-04 17:50" in the viewer's time zone, the same style as every date in the app. */
function stamp(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Optional supporting statements of one account. A statement explains a figure; it never replaces the calculated
 * Balance. A revision keeps the original, linked to the corrected copy (V2_SUPPORTING_RECORD_003).
 */
export function StatementsCard({
  accountId,
  balance,
  members,
  today,
}: {
  accountId: string
  /** The calculated Balance, shown in the review so it is clear it will not move. */
  balance: string
  members: Member[] | undefined
  today: string | undefined
}) {
  const statements = useStatements(accountId)
  const [form, setForm] = useState<{ replacing?: Statement } | null>(null)
  const ready = !form && !!members && !!today

  return (
    <>
      {form && members && today && (
        <Panel key={form.replacing?.id ?? 'attach'}>
          <StatementForm
            accountId={accountId}
            balance={balance}
            members={members}
            today={today}
            replacing={form.replacing}
            onDone={() => setForm(null)}
          />
        </Panel>
      )}
      <Card aria-labelledby="statements-heading" className="mt-4">
        <CardTitle id="statements-heading" className="text-lg">
          Supporting statements
        </CardTitle>
        <p className="mt-1 text-sm text-ink-muted">
          Optional. A statement never replaces the calculated Balance.
        </p>
        {statements.isError ? (
          <p role="alert">{statements.error.message}</p>
        ) : !statements.data ? (
          <p className="mt-2 text-sm text-ink-muted">Loading statements</p>
        ) : statements.data.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No statements are attached.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3 text-sm">
            {statements.data.map((statement) => (
              <li key={statement.id} className="flex flex-col gap-1">
                <span>
                  <strong>{statement.note || 'Statement'}</strong> dated {statement.statementOn},{' '}
                  {formatMoney(Number(statement.balance))}
                </span>
                <span className="text-ink-muted">
                  <strong>{statement.latest ? 'Active version' : 'Replaced'}</strong> · attached by{' '}
                  {statement.enteredByName} {stamp(statement.createdAt)}
                  {statement.reason ? ` · Reason: ${statement.reason}` : ''}
                  {statement.replacesId ? ' · replaces an earlier version' : ''}
                </span>
                {statement.latest && (
                  <span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!ready}
                      onClick={() => setForm({ replacing: statement })}
                    >
                      Replace with corrected version
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Button variant="secondary" size="sm" disabled={!ready} onClick={() => setForm({})}>
            Attach statement
          </Button>
        </div>
      </Card>
    </>
  )
}
