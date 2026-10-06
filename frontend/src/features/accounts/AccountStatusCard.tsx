import { useState } from 'react'
import type { Account } from '../../api/accounts'
import { Badge, Button, Card, CardTitle, FormAlert } from '../../design-system'
import { useChangeAccountStatus } from '../../hooks/useAccounts'
import { Panel } from '../activity/Panel'
import { balanceText, isCard } from './cardBalance'
import { STATUS_LABEL } from './statusLabel'
import { useStateChangeFocus } from './useStateChangeFocus'

type Review = 'archive' | 'restore'

/** Archive or restore: reviewed first, nothing about money changes (A1). */
export function AccountStatusCard({ account }: { account: Account }) {
  const [review, setReview] = useState<Review | null>(null)
  const { message, statusRef, begin, changed } = useStateChangeFocus(review !== null)
  const change = useChangeAccountStatus(account.id)
  const figure = balanceText(account.type, account.balance.amount)

  const confirm = (action: Review) =>
    change.mutate(action, {
      onSuccess: () => {
        setReview(null)
        changed(
          action === 'archive'
            ? `${account.name} is archived. Its ${figure} stays in wealth.`
            : `${account.name} is active again with its ${figure} and complete history.`,
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
      {account.status === 'archived' && !message && (
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          Archived: hidden from the active list and from new entries, transfers and payments. Its{' '}
          {figure} still counts in wealth.
        </p>
      )}
      {review && (
        <Panel key={review}>
          <section
            aria-labelledby="status-review-heading"
            className="mt-3 flex max-w-md flex-col gap-3 rounded-control border border-line bg-sunken p-4"
          >
            <h3 id="status-review-heading" className="font-medium">
              {review === 'archive'
                ? `Review archiving ${account.name}`
                : `Review restoring ${account.name}`}
            </h3>
            {review === 'archive' ? (
              <>
                <p className="text-sm">
                  Its {figure} will remain in wealth
                  {isCard(account.type) && Number(account.balance.amount) < 0 ? ' as debt' : ''},
                  with a visible archived label.
                </p>
                <p className="text-sm">
                  {account.name} leaves the active account list and every choice for new entries,
                  transfers and payments. This changes the household list. It does not close an
                  account at its bank.
                </p>
              </>
            ) : (
              <p className="text-sm">
                {account.name} returns to the active list with the same Balance ({figure}) and
                complete history.
              </p>
            )}
            <FormAlert message={change.error?.message} />
            <div className="flex gap-2">
              <Button disabled={change.isPending} onClick={() => confirm(review)}>
                {change.isPending
                  ? 'Saving'
                  : review === 'archive'
                    ? `Archive ${account.name}`
                    : `Restore ${account.name}`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  change.reset()
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
    </Card>
  )
}
