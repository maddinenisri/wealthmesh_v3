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
import type { EntryKind } from '../../api/activity'
import type { Activity as ActivityEntry } from '../../api/activity'
import { AddEntry } from '../activity/AddEntry'
import { ActivityList } from '../activity/ActivityList'
import { Panel } from '../activity/Panel'
import { RemindersCard } from '../activity/RemindersCard'
import { ChangeEntry, type ChangeTarget } from '../activity/ChangeEntry'
import { OVERDRAFT_NOTICE, OverdrawnLabel } from './Overdrawn'
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
            <OverdrawnLabel balance={account.balance.amount} />
            <span className="block text-caption text-ink-muted">as of {account.balance.asOf}</span>
            {Number(account.balance.amount) < 0 && (
              <span className="mt-1 block max-w-prose text-sm text-ink-muted">
                {OVERDRAFT_NOTICE}
              </span>
            )}
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

/** Money in and out are live; transfers stay visible but inactive until they are built. */
function Activity({ account, members }: { account: Account; members: Member[] | undefined }) {
  const [adding, setAdding] = useState<EntryKind | null>(null)
  const [editing, setEditing] = useState<ActivityEntry | null>(null)
  const [changing, setChanging] = useState<{ mode: 'remove' | 'undo'; entry: ChangeTarget } | null>(
    null,
  )
  const today = useToday()
  const ready = !adding && !editing && !changing && !!today.data && !!members

  return (
    <>
      {adding && today.data && members && (
        <Panel key={adding}>
          <AddEntry
            kind={adding}
            account={account}
            members={members}
            today={today.data}
            onDone={() => setAdding(null)}
          />
        </Panel>
      )}
      {editing && today.data && members && (
        <Panel key={editing.id}>
          <AddEntry
            kind={editing.kind === 'income' ? 'income' : 'expense'}
            account={account}
            members={members}
            today={today.data}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        </Panel>
      )}
      {changing && members && (
        <Panel key={`${changing.mode}-${changing.entry.id}`}>
          <ChangeEntry
            mode={changing.mode}
            account={account}
            entry={changing.entry}
            members={members}
            onDone={() => setChanging(null)}
          />
        </Panel>
      )}
      <Card aria-labelledby="activity-heading">
        <CardTitle id="activity-heading" className="text-lg">
          Activity
        </CardTitle>
        <ActivityList
          accountId={account.id}
          members={members}
          onEdit={ready ? setEditing : undefined}
          onRemove={ready ? (entry) => setChanging({ mode: 'remove', entry }) : undefined}
          onUndo={ready ? (entry) => setChanging({ mode: 'undo', entry }) : undefined}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding('income')}
            disabled={!ready}
          >
            Add money in
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding('expense')}
            disabled={!ready}
          >
            Add money out
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Add transfer
          </Button>
        </div>
        <p className="mt-3 text-caption text-ink-muted">
          Transfers become available with a later feature.
        </p>
      </Card>
      <RemindersCard accountId={account.id} />
    </>
  )
}
