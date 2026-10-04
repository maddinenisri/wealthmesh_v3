import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Account } from '../../api/accounts'
import {
  Amount,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  PageHeader,
  buttonStyles,
} from '../../design-system'
import { useAccount, useToday } from '../../hooks/useAccounts'
import { ownerNames } from './ownerNames'
import { useAccountContext } from './useAccountContext'

export function AccountDetailPage() {
  const { id = '' } = useParams()
  const account = useAccount(id)
  const { members } = useAccountContext()

  return (
    <div className="flex flex-col gap-6">
      {account.isPending && <p className="text-ink-muted">Loading account</p>}
      {account.isError && (
        <EmptyState
          title="Could not load the account"
          description={account.error.message}
          action={
            <Link to="/accounts" className={buttonStyles({})}>
              Back to accounts
            </Link>
          }
        />
      )}
      {account.data && (
        <>
          <PageHeader
            title={account.data.name}
            description="Checking account"
            actions={
              <div className="flex gap-2">
                <Link
                  to={`/accounts/${account.data.id}/edit`}
                  className={buttonStyles({ variant: 'secondary' })}
                >
                  Edit account
                </Link>
              </div>
            }
          />
          <Details
            account={account.data}
            owners={ownerNames(account.data.ownerMemberIds, members)}
          />
          <UpdateBalance />
          <Activity />
        </>
      )}
    </div>
  )
}

function Details({ account, owners }: { account: Account; owners: string }) {
  return (
    <Card aria-label="Account details">
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-caption text-ink-muted">Owner</dt>
          <dd>{owners}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Bank</dt>
          <dd>{account.institution ?? 'Not set'}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Balance</dt>
          <dd>
            <Amount value={Number(account.balance.amount)} size="lg" />
            <span className="block text-caption text-ink-muted">as of {account.balance.asOf}</span>
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Initial Balance</dt>
          <dd>
            <Amount value={Number(account.openingAmount)} />
            {` on ${account.openedOn}`}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

/** Update balance is its own action, separate from Edit account. Saving arrives with account activity. */
function UpdateBalance() {
  const [open, setOpen] = useState(false)
  const today = useToday()

  return (
    <Card aria-labelledby="balance-heading">
      <div className="flex items-center justify-between gap-4">
        <CardTitle id="balance-heading" className="text-lg">
          Update balance
        </CardTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Hide' : 'Update balance'}
        </Button>
      </div>
      {open && (
        <form
          className="mt-4 flex max-w-md flex-col gap-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field label="Amount" inputMode="decimal" placeholder="0.00" />
          <Field label="Date" type="date" defaultValue={today.data} />
          <p className="text-sm text-ink-muted">
            Saving a balance update comes with account activity. Nothing is changed yet.
          </p>
          <div>
            <Button type="submit" disabled>
              Save balance
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

/** There is no activity yet; the actions are visible but inactive until activity is built. */
function Activity() {
  return (
    <Card aria-labelledby="activity-heading">
      <CardTitle id="activity-heading" className="text-lg">
        Activity
      </CardTitle>
      <p className="mb-4 mt-1 text-sm text-ink-muted">No money activity has been recorded yet.</p>
      <div className="flex flex-wrap gap-2">
        {['Add money in', 'Add money out', 'Add transfer'].map((label) => (
          <Button key={label} variant="secondary" size="sm" disabled>
            {label}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        These actions become available with account activity.
      </p>
    </Card>
  )
}
