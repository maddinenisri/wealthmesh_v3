import { useState } from 'react'
import type { Statement } from '../../api/statements'
import type { Member } from '../../api/household'
import type { OpeningView } from '../../api/investments'
import { Button, Card, CardTitle, FormAlert } from '../../design-system'
import { EnteredBy } from '../activity/EnteredBy'
import { useReturnFocus } from '../activity/useReturnFocus'
import {
  useRemovalReview,
  useRemoveStatement,
  useRestoreStatement,
  useStatements,
} from '../../hooks/useStatements'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { isInvestment } from '../accounts/accountTypes'
import { balanceText } from '../accounts/cardBalance'
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
  accountType,
  balance,
  members,
  today,
  opening,
}: {
  accountId: string
  accountType: string
  /** The calculated Balance, shown in the review so it is clear it will not move. */
  balance: string
  members: Member[] | undefined
  today: string | undefined
  /** An investment account's opening: a statement can back it, and removing the statement keeps it. */
  opening?: OpeningView
}) {
  const statements = useStatements(accountId)
  const [form, setForm] = useState<{ replacing?: Statement } | null>(null)
  const [removing, setRemoving] = useState<Statement | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const returnFocus = useReturnFocus(!!form || !!removing)
  const ready = !form && !removing && !!members && !!today
  const removable = isInvestment(accountType)
  // The sentence says what changed; the opener may be gone, so the card's heading takes focus.
  const announce = (sentence: string) => {
    returnFocus.cancel()
    setNotice(sentence)
    requestAnimationFrame(() => {
      const heading = document.getElementById('statements-heading')
      heading?.scrollIntoView?.({ block: 'start' })
      heading?.focus({ preventScroll: true })
    })
  }

  return (
    <>
      {form && members && today && (
        <Panel key={form.replacing?.id ?? 'attach'}>
          <StatementForm
            accountId={accountId}
            accountType={accountType}
            balance={balance}
            members={members}
            today={today}
            replacing={form.replacing}
            linkable={!!opening && opening.statementId === null}
            onDone={(saved, sentence) => {
              setForm(null)
              if (saved)
                announce(sentence ?? 'Statement saved. A statement never changes the Balance.')
            }}
          />
        </Panel>
      )}
      {removing && members && (
        <Panel key={`remove-${removing.id}`}>
          <StatementRemoval
            accountId={accountId}
            statement={removing}
            members={members}
            onDone={(sentence) => {
              setRemoving(null)
              if (sentence) announce(sentence)
            }}
          />
        </Panel>
      )}
      <Card aria-labelledby="statements-heading" className={opening ? undefined : 'mt-4'}>
        <CardTitle id="statements-heading" tabIndex={-1} className="text-lg outline-none">
          Supporting statements
        </CardTitle>
        {notice && ready && (
          <p role="status" className="mt-2 max-w-md rounded-control border border-line p-3 text-sm">
            {notice}
          </p>
        )}
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
                  {balanceText(accountType, statement.balance)}
                </span>
                <span className="text-ink-muted">
                  <strong>
                    {statement.removedAt
                      ? 'Removed'
                      : statement.latest
                        ? 'Active version'
                        : 'Replaced'}
                  </strong>{' '}
                  · attached by {statement.enteredByName} {stamp(statement.createdAt)}
                  {statement.reason ? ` · Reason: ${statement.reason}` : ''}
                  {statement.replacesId ? ' · replaces an earlier version' : ''}
                  {statement.usedByOpening && !statement.removedAt ? ' · supports the opening' : ''}
                </span>
                {statement.usedByOpening &&
                  !statement.removedAt &&
                  Number(statement.balance) !== Number(balance) && (
                    <span className="text-ink-muted">
                      The statement shows {balanceText(accountType, statement.balance)}; the Balance
                      is {balanceText(accountType, balance)}. A statement never changes the Balance.
                    </span>
                  )}
                {statement.removedAt && (
                  <span className="text-ink-muted">
                    Removed by {statement.removedByName} {stamp(statement.removedAt)}. The recorded
                    cash, shares and price stay.
                  </span>
                )}
                {/* While removed, the sentence above is the history; once restored, the list keeps both. */}
                {statement.events.some((event) => event.action === 'restored') && (
                  <ul aria-label="Statement history" className="text-ink-muted">
                    {statement.events.map((event, index) => (
                      <li key={`${event.action}-${event.at}-${index}`}>
                        {event.action === 'removed' ? 'Removed' : 'Restored (Undo)'} by{' '}
                        {event.memberName} {stamp(event.at)}
                      </li>
                    ))}
                  </ul>
                )}
                {statement.removedAt && members && removable && (
                  <UndoRemoval
                    accountId={accountId}
                    statement={statement}
                    members={members}
                    disabled={!ready}
                    onDone={announce}
                  />
                )}
                {statement.latest && !statement.removedAt && (
                  <span className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!ready}
                      onClick={() => {
                        setNotice(null)
                        returnFocus()
                        setForm({ replacing: statement })
                      }}
                    >
                      Replace with corrected version
                    </Button>
                    {removable && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!ready}
                        onClick={() => {
                          setNotice(null)
                          returnFocus()
                          setRemoving(statement)
                        }}
                      >
                        Remove statement
                      </Button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={!ready}
            onClick={() => {
              setNotice(null)
              returnFocus()
              setForm({})
            }}
          >
            Attach statement
          </Button>
        </div>
      </Card>
    </>
  )
}

/**
 * The reviewed removal of a statement (V2_INV_CORRECTION_005): how many opening breakdowns use it, and that the
 * recorded cash, shares, price and Balance stay. Cancel saves nothing; Confirm ends with a sentence and focus on the
 * statements heading (the caller).
 */
function StatementRemoval({
  accountId,
  statement,
  members,
  onDone,
}: {
  accountId: string
  statement: Statement
  members: Member[]
  /** `sentence` is absent when nothing changed. */
  onDone: (sentence?: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const review = useRemovalReview(accountId, statement.id, true)
  const remove = useRemoveStatement(accountId, statement.id, member?.id ?? '')
  const name = statement.note || 'The statement'
  return (
    <Card aria-labelledby="statement-removal-heading">
      <CardTitle id="statement-removal-heading" tabIndex={-1} className="text-lg outline-none">
        Review removing the statement
      </CardTitle>
      <p className="mt-2 text-sm">
        {name} dated {statement.statementOn}.
      </p>
      {review.isPending && <p className="mt-2 text-sm text-ink-muted">Checking what uses it</p>}
      {review.isError && <FormAlert message={review.error.message} />}
      {review.data && (
        <>
          <p className="mt-2 max-w-prose text-sm">{review.data.message}</p>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            You can Undo the removal afterwards; the removal and the Undo both stay in history.
          </p>
        </>
      )}
      <FormAlert message={remove.error?.message} />
      <EnteredBy members={members} member={member} setMemberId={setMemberId} />
      <div className="mt-3 flex gap-2">
        <Button
          variant="danger"
          disabled={!review.data || remove.isPending || !member}
          onClick={() =>
            remove.mutate(undefined, {
              onSuccess: () =>
                onDone(
                  `${name} is removed. The recorded cash, shares and price and the Balance stay as they were, and the removal is in history.`,
                ),
            })
          }
        >
          {remove.isPending ? 'Removing' : 'Remove statement'}
        </Button>
        <Button variant="ghost" disabled={remove.isPending} onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

/**
 * Undo of a removal (SUPPORTING_RECORD_002): the same statement is an active supporting record again, still linked to
 * the opening review; no cash, shares, price or Balance moves. The Undo is recorded with who did it, the removal stays
 * in history, and the sentence says so (the caller moves focus to the statements heading).
 */
function UndoRemoval({
  accountId,
  statement,
  members,
  disabled,
  onDone,
}: {
  accountId: string
  statement: Statement
  members: Member[]
  disabled: boolean
  onDone: (sentence: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const restore = useRestoreStatement(accountId, statement.id, member?.id ?? '')
  const name = statement.note || 'The statement'
  return (
    <span className="flex flex-col items-start gap-2">
      <FormAlert message={restore.error?.message} />
      {!member && <EnteredBy members={members} member={member} setMemberId={setMemberId} />}
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || !member || restore.isPending}
        onClick={() =>
          restore.mutate(undefined, {
            onSuccess: () =>
              onDone(
                `${name} is restored once. It is an active supporting statement again${
                  statement.usedByOpening ? ', still linked to the opening review,' : ''
                } and the recorded cash, shares and price and the Balance are as they were. The removal and the Undo are in history.`,
              ),
          })
        }
      >
        {restore.isPending ? 'Restoring' : 'Undo removal'}
      </Button>
    </span>
  )
}
