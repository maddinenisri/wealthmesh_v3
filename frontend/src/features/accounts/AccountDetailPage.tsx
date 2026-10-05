import { useState } from 'react'
import { useBalanceAsOf } from '../../hooks/useActivity'
import { formatMoney } from '../../lib/money'
import { Link, useParams } from 'react-router'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import {
  Amount,
  Button,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  buttonStyles,
} from '../../design-system'
import { useAccount, useToday } from '../../hooks/useAccounts'
import type { EntryKind } from '../../api/activity'
import type { Activity as ActivityEntry } from '../../api/activity'
import { AddEntry } from '../activity/AddEntry'
import { UpdateBalance } from '../activity/UpdateBalance'
import { ActivityList } from '../activity/ActivityList'
import { Panel } from '../activity/Panel'
import { RemindersCard } from '../activity/RemindersCard'
import { StatementsCard } from '../statements/StatementsCard'
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
            <Amount
              value={Number(account.balance.amount)}
              className="font-sans text-2xl normal-nums"
            />
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
            <Amount
              value={Number(account.openingAmount)}
              className="font-sans text-2xl normal-nums"
            />
            <span className="block text-caption text-ink-muted">{` on ${account.openedOn}`}</span>
          </dd>
        </div>
      </dl>
    </Card>
  )
}

/** Reads the Balance on an earlier date without changing the current one (V2_CHECKING_018). */
function BalanceOnDate({ account, today }: { account: Account; today: string }) {
  const [date, setDate] = useState('')
  const view = useBalanceAsOf(account.id, date > today ? '' : date)

  return (
    <Card aria-labelledby="as-of-heading">
      <CardTitle id="as-of-heading" className="text-lg">
        Balance on a date
      </CardTitle>
      <div className="mt-3 flex max-w-md flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          View Balance on
          <input
            type="date"
            value={date}
            max={today}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-control border border-line bg-surface px-3 py-2"
          />
        </label>
      </div>
      {view.data && (
        <p className="mt-3 text-sm" role="status">
          {view.data.amount === null ? (
            <>Balance on {view.data.asOn}: not available (before tracking began)</>
          ) : (
            <>
              Balance on {view.data.asOn}: <strong>{formatMoney(Number(view.data.amount))}</strong>.
              The current Balance ({formatMoney(Number(account.balance.amount))}) is unchanged.
            </>
          )}
        </p>
      )}
    </Card>
  )
}

/** Money in and out are live; transfers stay visible but inactive until they are built. */
function Activity({ account, members }: { account: Account; members: Member[] | undefined }) {
  const [adding, setAdding] = useState<EntryKind | null>(null)
  const [editing, setEditing] = useState<ActivityEntry | null>(null)
  const [correcting, setCorrecting] = useState<{ editing?: ActivityEntry } | null>(null)
  const [changing, setChanging] = useState<{ mode: 'remove' | 'undo'; entry: ChangeTarget } | null>(
    null,
  )
  const today = useToday()
  const ready = !adding && !editing && !correcting && !changing && !!today.data && !!members

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
      {correcting && today.data && members && (
        <Panel key={`correct-${correcting.editing?.id ?? 'new'}`}>
          <UpdateBalance
            account={account}
            members={members}
            today={today.data}
            editing={correcting.editing}
            onDone={() => setCorrecting(null)}
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
          opening={{ amount: account.openingAmount, on: account.openedOn }}
          members={members}
          onEdit={ready ? setEditing : undefined}
          onEditCorrection={ready ? (entry) => setCorrecting({ editing: entry }) : undefined}
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
          <Button variant="secondary" size="sm" onClick={() => setCorrecting({})} disabled={!ready}>
            Update balance
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Add transfer
          </Button>
        </div>
        <p className="mt-3 text-caption text-ink-muted">
          Transfers become available with a later feature.
        </p>
      </Card>
      {today.data && <BalanceOnDate account={account} today={today.data} />}
      <RemindersCard accountId={account.id} />
      <StatementsCard
        accountId={account.id}
        balance={account.balance.amount}
        members={members}
        today={today.data}
      />
    </>
  )
}
