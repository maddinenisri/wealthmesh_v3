import { useState } from 'react'
import { useBalanceAsOf } from '../../hooks/useActivity'
import { Link, useParams } from 'react-router'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, EmptyState, PageHeader, buttonStyles } from '../../design-system'
import { useAccount, useAccounts, useToday } from '../../hooks/useAccounts'
import type { EntryKind } from '../../api/activity'
import type { Activity as ActivityEntry } from '../../api/activity'
import { AddEntry } from '../activity/AddEntry'
import { BatchEntry } from '../activity/BatchEntry'
import { SplitEntry } from '../activity/SplitEntry'
import { UpdateBalance } from '../activity/UpdateBalance'
import { ActivityList } from '../activity/ActivityList'
import { Panel } from '../activity/Panel'
import { useReturnFocus } from '../activity/useReturnFocus'
import { RemindersCard } from '../activity/RemindersCard'
import { StatementsCard } from '../statements/StatementsCard'
import { ChangeEntry, type ChangeTarget } from '../activity/ChangeEntry'
import { isMovement } from '../activity/transferRows'
import { ChangeToTransfer } from '../transfers/ChangeToTransfer'
import { TransferChange, type TransferTarget } from '../transfers/TransferChange'
import { TransferForm } from '../transfers/TransferForm'
import { accountTypeLabel } from './accountTypes'
import { BalanceFigure } from './BalanceFigure'
import { balanceText, isCard } from './cardBalance'
import { OVERDRAFT_NOTICE } from './Overdrawn'
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
            description={`${accountTypeLabel(account.data.type)} account`}
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
          <dt className="text-caption text-ink-muted">
            {account.ownerMemberIds.length > 1 ? 'Owners' : 'Owner'}
          </dt>
          <dd>{owners}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">
            {isCard(account.type) ? 'Issuer' : 'Bank'}
          </dt>
          <dd>{account.institution ?? 'Not set'}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Balance</dt>
          <dd>
            <BalanceFigure
              type={account.type}
              amount={account.balance.amount}
              className="font-sans text-2xl normal-nums"
            />
            <span className="block text-caption text-ink-muted">as of {account.balance.asOf}</span>
            {!isCard(account.type) && Number(account.balance.amount) < 0 && (
              <span className="mt-1 block max-w-prose text-sm text-ink-muted">
                {OVERDRAFT_NOTICE}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Initial Balance</dt>
          <dd>
            <BalanceFigure
              type={account.type}
              amount={account.openingAmount}
              overdraft={false}
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
              Balance on {view.data.asOn}:{' '}
              <strong>{balanceText(account.type, view.data.amount)}</strong>. The current Balance (
              {balanceText(account.type, account.balance.amount)}) is unchanged.
            </>
          )}
        </p>
      )}
    </Card>
  )
}

/** The transfer panel that is open: a new transfer, a correction, a removal, an Undo, or an expense changed. */
type TransferPanel =
  | { kind: 'new'; payment?: boolean; fromBank?: boolean }
  | { kind: 'edit'; entry: ActivityEntry }
  | { kind: 'remove' | 'undo'; entry: TransferTarget }
  | { kind: 'convert'; entry: ActivityEntry }

/** A new panel for a different transfer: the key changes with the panel's kind and the row it works on. */
function transferKey(panel: TransferPanel): string {
  if (!('entry' in panel)) return panel.kind
  const { entry } = panel
  return `${panel.kind}-${entry.movementId ?? ('id' in entry ? entry.id : '')}`
}

/** Money in and out, transfers and Balance updates: each opens one panel above the activity table. */
function Activity({ account, members }: { account: Account; members: Member[] | undefined }) {
  const [adding, setAdding] = useState<EntryKind | null>(null)
  const [editing, setEditing] = useState<ActivityEntry | null>(null)
  const [correcting, setCorrecting] = useState<{ editing?: ActivityEntry } | null>(null)
  const [changing, setChanging] = useState<{ mode: 'remove' | 'undo'; entry: ChangeTarget } | null>(
    null,
  )
  const [transfer, setTransfer] = useState<TransferPanel | null>(null)
  const [batching, setBatching] = useState(false)
  // A new split expense, or a split payment being corrected (SPLITS_001, SPLITS_002).
  const [splitting, setSplitting] = useState<{ editing?: ActivityEntry } | null>(null)
  const accounts = useAccounts()
  // "Pay a card" needs a card to pay (Q-034).
  const hasCard = (accounts.data ?? []).some((candidate) => isCard(candidate.type))
  const today = useToday()
  const ready =
    !adding &&
    !editing &&
    !correcting &&
    !changing &&
    !transfer &&
    !batching &&
    !splitting &&
    !!today.data &&
    !!members
  // After a save the new row is what the person came for, so the table's top is brought into view.
  const closeTransfer = (saved?: boolean) => {
    setTransfer(null)
    if (saved) {
      requestAnimationFrame(() =>
        document.getElementById('activity-heading')?.scrollIntoView?.({ block: 'start' }),
      )
    }
  }
  const remember = useReturnFocus(
    !!adding || !!editing || !!correcting || !!changing || !!transfer || batching || !!splitting,
  )

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
      {batching && today.data && members && (
        <Panel>
          <BatchEntry
            account={account}
            members={members}
            today={today.data}
            onDone={() => {
              setBatching(false)
              requestAnimationFrame(() =>
                document.getElementById('activity-heading')?.scrollIntoView?.({ block: 'start' }),
              )
            }}
          />
        </Panel>
      )}
      {splitting && today.data && members && (
        <Panel key={`split-${splitting.editing?.id ?? 'new'}`}>
          <SplitEntry
            account={account}
            members={members}
            today={today.data}
            editing={splitting.editing}
            onDone={(saved) => {
              setSplitting(null)
              if (saved) {
                // The row that changed is what the person came for; the opener may be gone (an edit replaces it).
                remember.cancel()
                requestAnimationFrame(() => {
                  const heading = document.getElementById('activity-heading')
                  heading?.scrollIntoView?.({ block: 'start' })
                  heading?.focus({ preventScroll: true })
                })
              }
            }}
          />
        </Panel>
      )}
      {editing && today.data && members && (
        <Panel key={editing.id}>
          <AddEntry
            kind={
              editing.kind === 'income'
                ? 'income'
                : editing.kind === 'refund'
                  ? 'refund'
                  : 'expense'
            }
            account={account}
            members={members}
            today={today.data}
            editing={editing}
            onChangeToTransfer={
              isCard(account.type)
                ? undefined
                : () => {
                    setTransfer({ kind: 'convert', entry: editing })
                    setEditing(null)
                  }
            }
            onDone={() => setEditing(null)}
          />
        </Panel>
      )}
      {transfer && today.data && members && (
        <Panel key={transferKey(transfer)}>
          {(transfer.kind === 'new' || transfer.kind === 'edit') && (
            <TransferForm
              account={account}
              members={members}
              today={today.data}
              editing={transfer.kind === 'edit' ? transfer.entry : undefined}
              payment={transfer.kind === 'new' ? transfer.payment : undefined}
              fromBank={transfer.kind === 'new' ? transfer.fromBank : undefined}
              onDone={closeTransfer}
            />
          )}
          {(transfer.kind === 'remove' || transfer.kind === 'undo') && (
            <TransferChange
              mode={transfer.kind}
              account={account}
              entry={transfer.entry}
              members={members}
              onDone={closeTransfer}
            />
          )}
          {transfer.kind === 'convert' && (
            <ChangeToTransfer
              account={account}
              entry={transfer.entry}
              members={members}
              onDone={closeTransfer}
            />
          )}
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
        <CardTitle id="activity-heading" tabIndex={-1} className="text-lg outline-none">
          Activity
        </CardTitle>
        <ActivityList
          accountId={account.id}
          accountType={account.type}
          opening={{ amount: account.openingAmount, on: account.openedOn, type: account.type }}
          members={members}
          onEdit={
            ready
              ? (entry) => {
                  remember()
                  if (isMovement(entry)) setTransfer({ kind: 'edit', entry })
                  else if (entry.portions.length > 0) setSplitting({ editing: entry })
                  else setEditing(entry)
                }
              : undefined
          }
          onEditCorrection={
            ready
              ? (entry) => {
                  remember()
                  setCorrecting({ editing: entry })
                }
              : undefined
          }
          onRemove={
            ready
              ? (entry) => {
                  remember()
                  if (isMovement(entry)) setTransfer({ kind: 'remove', entry })
                  else setChanging({ mode: 'remove', entry })
                }
              : undefined
          }
          onUndo={
            ready
              ? (entry) => {
                  remember()
                  if (entry.movementId) setTransfer({ kind: 'undo', entry })
                  else setChanging({ mode: 'undo', entry })
                }
              : undefined
          }
        />
        {isCard(account.type) ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setAdding('expense')
              }}
              disabled={!ready}
            >
              Record purchase
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setBatching(true)
              }}
              disabled={!ready}
            >
              Add several purchases
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setSplitting({})
              }}
              disabled={!ready}
            >
              Split a purchase
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setAdding('refund')
              }}
              disabled={!ready}
            >
              Record refund
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setTransfer({ kind: 'new', payment: true })
              }}
              disabled={!ready}
            >
              Record payment
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setCorrecting({})
              }}
              disabled={!ready}
            >
              Update balance
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setAdding('income')
              }}
              disabled={!ready}
            >
              Add money in
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setAdding('expense')
              }}
              disabled={!ready}
            >
              Add money out
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setBatching(true)
              }}
              disabled={!ready}
            >
              Add several expenses
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setSplitting({})
              }}
              disabled={!ready}
            >
              Split an expense
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setCorrecting({})
              }}
              disabled={!ready}
            >
              Update balance
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setTransfer({ kind: 'new' })
              }}
              disabled={!ready}
            >
              Add transfer
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                remember()
                setTransfer({ kind: 'new', payment: true, fromBank: true })
              }}
              disabled={!ready || !hasCard}
              title={hasCard ? undefined : 'Add a credit card to pay it from here'}
            >
              Pay a card
            </Button>
            {!hasCard && (
              <span className="self-center text-caption text-ink-muted">
                Add a credit card to pay it from here.
              </span>
            )}
          </div>
        )}
      </Card>
      {today.data && <BalanceOnDate account={account} today={today.data} />}
      <RemindersCard accountId={account.id} />
      <StatementsCard
        accountId={account.id}
        accountType={account.type}
        balance={account.balance.amount}
        members={members}
        today={today.data}
      />
    </>
  )
}
