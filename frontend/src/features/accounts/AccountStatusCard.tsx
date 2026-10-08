import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Account } from '../../api/accounts'
import { Badge, Button, Card, CardTitle, FormAlert } from '../../design-system'
import {
  useAccountEvents,
  useAccountLifecycle,
  useChangeAccountStatus,
  useDeleteAccount,
} from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { stamp } from '../../lib/stamp'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { debtNoun, isDebt, isValued, typeTraits } from './accountTypes'
import { balanceText, isCard } from './cardBalance'
import { memberLabel } from './ownerNames'
import { STATUS_LABEL } from './statusLabel'
import { useAccountContext } from './useAccountContext'
import { useStateChangeFocus } from './useStateChangeFocus'

const EVENT_LABEL: Record<string, string> = {
  archived: 'Archived',
  restored: 'Restored',
  closed: 'Closed',
  reopened: 'Reopened',
  deleted: 'Deleted',
  undeleted: 'Deleted, then brought back',
  set_up: 'Set up',
  drafted: 'Draft saved',
  setup_finished: 'Setup finished',
  discarded: 'Draft cancelled',
}

type Review = 'archive' | 'restore' | 'close' | 'reopen' | 'delete'

/** Archive, restore, close or reopen: each reviewed first, and none of them changes money (A1, A2). */
export function AccountStatusCard({
  account,
  onReview,
  staleAfter = 0,
}: {
  account: Account
  /** Called when a review opens, so a sentence another card still shows from an earlier page can go. */
  onReview?: () => void
  /** Counts changes made by another card (a statement panel opened or saved): the sentence here is then out of date. */
  staleAfter?: number
}) {
  const [review, setReview] = useState<Review | null>(null)
  const {
    message,
    statusRef,
    begin: beginFocus,
    changed,
    clear,
  } = useStateChangeFocus(review !== null)
  const begin = () => {
    beginFocus()
    onReview?.()
  }
  useEffect(() => {
    if (staleAfter > 0) clear()
    // `clear` is new every render; only a change from the other card matters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [staleAfter])
  const { members } = useAccountContext()
  const { member, setMemberId } = useEnteringAs(members)
  const change = useChangeAccountStatus(account.id, member?.id)
  const remove = useDeleteAccount(account.id, member?.id)
  const events = useAccountEvents(account.id)
  const facts = useAccountLifecycle(account.id, review === 'delete' || review === 'close')
  const closeBlocked = review === 'close' ? (facts.data?.closeBlockedBy ?? []) : []
  const navigate = useNavigate()
  // A refused Confirm leaves its message on the review; focus goes there, not to the page (the button was disabled).
  const failed = !!change.error || !!remove.error
  useEffect(() => {
    if (failed) document.getElementById('status-review-heading')?.focus({ preventScroll: true })
  }, [failed])
  const figure = balanceText(account.type, account.balance.amount)
  const word = isValued(account.type) ? 'value' : 'Balance'
  const debt = isDebt(account.type)
  const atZero = Number(account.balance.amount) === 0

  // Deleting takes the account's page away, so the account list takes focus there (its status line, with Undo).
  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () =>
        navigate('/accounts', {
          state: {
            deleted: { id: account.id, name: account.name, draft: account.status === 'draft' },
          },
        }),
    })

  const confirm = (action: Exclude<Review, 'delete'>) =>
    change.mutate(action, {
      onSuccess: () => {
        setReview(null)
        changed(
          {
            archive: `${account.name} is archived. Its ${figure} stays in wealth${typeTraits(account.type).plan ? ' and in Retirement' : ''}.`,
            restore: `${account.name} is active again with its ${figure} and complete history.`,
            close: debt
              ? `${account.name} is closed at ${figure}. Its history is kept.`
              : `${account.name} is closed with a ${figure} ${word}. Its history is kept.`,
            reopen: `${account.name} is open again. Its history is as it was.`,
          }[action],
        )
      },
    })

  return (
    <Card aria-labelledby="status-heading">
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle id="status-heading" className="text-lg">
          Account status
        </CardTitle>
        <Badge tone={account.status === 'active' ? 'positive' : 'neutral'}>
          {STATUS_LABEL[account.status] ?? account.status}
        </Badge>
      </div>
      {message && (
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="mt-2 max-w-md rounded-control border border-line p-3 text-sm outline-none"
        >
          {message}
        </p>
      )}
      {account.status === 'closed' && !message && (
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          Closed: it takes no new{' '}
          {isValued(account.type) ? 'values' : debt ? 'payments' : 'entries'} and no changes until
          you reopen it. Its history stays.
        </p>
      )}
      {account.status === 'archived' && !message && (
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          {isValued(account.type)
            ? 'Archived: hidden from the active list and from new values.'
            : debt
              ? 'Archived: hidden from the active list and from new payments.'
              : 'Archived: hidden from the active list and from new entries, transfers and payments.'}{' '}
          Its {figure} still counts in wealth.
        </p>
      )}
      {review && (
        <Panel key={review}>
          <section
            aria-labelledby="status-review-heading"
            className="mt-3 flex max-w-md flex-col gap-3 rounded-control border border-line bg-sunken p-4"
          >
            <h3 id="status-review-heading" tabIndex={-1} className="font-medium outline-none">
              {
                {
                  archive: `Review archiving ${account.name}`,
                  restore: `Review restoring ${account.name}`,
                  close: `Review closing ${account.name}`,
                  reopen: `Review reopening ${account.name}`,
                  delete: `Review deleting ${account.name}`,
                }[review]
              }
            </h3>
            {review === 'archive' ? (
              <>
                <p className="text-sm">
                  Its {figure} will remain in wealth
                  {(isCard(account.type) && Number(account.balance.amount) < 0) || debt
                    ? ' as debt'
                    : typeTraits(account.type).plan
                      ? ' and in Retirement'
                      : ''}
                  , with a visible archived label.
                </p>
                <p className="text-sm">
                  {isValued(account.type)
                    ? `${account.name} leaves the active account list and takes no new ${typeTraits(account.type).plan ? 'statements' : 'values'} until you restore it. This changes the household list only.`
                    : debt
                      ? `${account.name} leaves the active account list and every choice for new payments. This changes the household list. It does not close the ${debtNoun(account.type)} at its lender.`
                      : `${account.name} leaves the active account list and every choice for new entries, transfers and payments. This changes the household list. It does not close an account at its bank.`}
                </p>
              </>
            ) : review === 'restore' ? (
              <p className="text-sm">
                {account.name} returns to the active list with the same{' '}
                {debt ? 'balance owed' : word} ({figure}) and complete history.
              </p>
            ) : review === 'close' ? (
              closeBlocked.length > 0 && atZero ? (
                <p className="text-sm">{closeBlocked.join(' ')}</p>
              ) : atZero ? (
                <p className="text-sm">
                  {debt
                    ? `${account.name} will be marked closed at ${figure} and its history kept.`
                    : `${account.name} will be marked closed with a ${figure} ${word} and its history kept.`}{' '}
                  It takes no new{' '}
                  {isValued(account.type) ? 'values' : debt ? 'payments' : 'entries'} until you
                  reopen it. Wealth does not change.
                </p>
              ) : isValued(account.type) ? (
                <p className="text-sm">
                  Closing needs a zero value. {account.name} has {figure}: record a $0.00{' '}
                  {typeTraits(account.type).plan ? 'plan value' : 'value'} first (for example when{' '}
                  {typeTraits(account.type).plan ? 'the plan ends' : 'it is sold'}), then review
                  closing again.
                </p>
              ) : debt ? (
                <>
                  <p className="text-sm">
                    Closing needs a zero Balance owed. {account.name} has {figure}: record a payment
                    for it, then review closing again.
                  </p>
                  {closeBlocked.length > 0 && <p className="text-sm">{closeBlocked.join(' ')}</p>}
                </>
              ) : typeTraits(account.type).kind === 'investment' ? (
                <p className="text-sm">
                  Closing needs a zero Balance. {account.name} has {figure}. Moving money out of an
                  investment account comes later, so it cannot be closed with a Balance yet.
                </p>
              ) : (
                <p className="text-sm">
                  Closing needs a zero Balance. {account.name} has {figure}, which must be accounted
                  for first: {isCard(account.type) ? 'record a payment' : 'record a transfer'} for
                  it, then review closing again.
                </p>
              )
            ) : review === 'delete' ? (
              <>
                {facts.isPending && <p className="text-sm">Checking what is saved on it</p>}
                {facts.isError && <FormAlert message={facts.error.message} />}
                {facts.data?.canDelete && (
                  <p className="text-sm">
                    {account.name} has no saved entries, reminders or statements, so it can be
                    deleted. It leaves the account list and wealth does not change. You can Undo
                    right after.
                  </p>
                )}
                {facts.data && !facts.data.canDelete && (
                  <>
                    <p className="text-sm">
                      Saved history must be retained, so {account.name} cannot be deleted:
                    </p>
                    <ul className="list-disc pl-5 text-sm">
                      {facts.data.deleteBlockedBy.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <p className="text-sm">
                      Choose Archive to hide it, or Close once its {debt ? 'balance owed' : word} is
                      zero. Nothing changes until you do.
                    </p>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm">
                {account.name} returns to the active list. Its history is as it was.
              </p>
            )}
            <EnteredBy members={members ?? []} member={member} setMemberId={setMemberId} />
            <FormAlert message={(review === 'delete' ? remove.error : change.error)?.message} />
            <div className="flex flex-wrap gap-2">
              {review === 'delete' && facts.data && !facts.data.canDelete && (
                <>
                  <Button variant="secondary" onClick={() => setReview('archive')}>
                    Review archiving instead
                  </Button>
                  {account.status === 'active' && (
                    <Button variant="secondary" onClick={() => setReview('close')}>
                      Review closing instead
                    </Button>
                  )}
                </>
              )}
              {review === 'delete' ? (
                facts.data?.canDelete && (
                  <Button
                    variant="danger"
                    disabled={remove.isPending || !member}
                    onClick={confirmDelete}
                  >
                    {remove.isPending ? 'Deleting' : `Delete ${account.name}`}
                  </Button>
                )
              ) : (
                <Button
                  disabled={
                    change.isPending ||
                    !member ||
                    (review === 'close' && (!atZero || closeBlocked.length > 0))
                  }
                  onClick={() => confirm(review)}
                >
                  {change.isPending
                    ? 'Saving'
                    : `${{ archive: 'Archive', restore: 'Restore', close: 'Close', reopen: 'Reopen' }[review]} ${account.name}`}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  change.reset()
                  remove.reset()
                  setReview(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </section>
        </Panel>
      )}
      {
        <div className="mt-3 flex flex-wrap gap-2">
          {account.status === 'active' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                begin()
                setReview('archive')
              }}
            >
              Archive account
            </Button>
          )}
          {account.status === 'active' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                begin()
                setReview('close')
              }}
            >
              Close account
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              begin()
              setReview('delete')
            }}
          >
            Delete account
          </Button>
          {account.status === 'closed' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                begin()
                setReview('reopen')
              }}
            >
              Reopen account
            </Button>
          )}
          {account.status === 'archived' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                begin()
                setReview('restore')
              }}
            >
              Restore account
            </Button>
          )}
        </div>
      }
      {events.data && events.data.length > 0 && (
        <section aria-labelledby="status-history-heading" className="mt-4">
          <h3 id="status-history-heading" className="text-sm font-medium">
            Status history
          </h3>
          <ul className="mt-1 text-sm text-ink-muted">
            {events.data.map((event) => (
              <li key={`${event.at}-${event.action}`}>
                {EVENT_LABEL[event.action] ?? event.action}
                {event.memberId &&
                  members?.find((m) => m.id === event.memberId) &&
                  ` by ${memberLabel(members.find((m) => m.id === event.memberId)!)}`}
                {' · '}
                {stamp(event.at)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  )
}
