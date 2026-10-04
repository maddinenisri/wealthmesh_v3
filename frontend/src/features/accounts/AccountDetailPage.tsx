import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
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
import { AddExpense } from '../activity/AddExpense'
import { ActivityList } from '../activity/ActivityList'
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
          <Activity account={account.data} members={members} />
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

/** Money out is live; money in and transfers stay visible but inactive until they are built. */
function Activity({ account, members }: { account: Account; members: Member[] | undefined }) {
  const [adding, setAdding] = useState(false)
  const today = useToday()

  return (
    <>
      {adding && today.data && members && (
        <AddExpense
          key="add-expense"
          account={account}
          members={members}
          today={today.data}
          onDone={() => setAdding(false)}
        />
      )}
      <Card aria-labelledby="activity-heading">
        <CardTitle id="activity-heading" className="text-lg">
          Activity
        </CardTitle>
        <ActivityList accountId={account.id} members={members} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled>
            Add money in
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
            disabled={adding || !today.data || !members}
          >
            Add money out
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Add transfer
          </Button>
        </div>
        <p className="mt-3 text-caption text-ink-muted">
          Money in and transfers become available with later features.
        </p>
      </Card>
    </>
  )
}
