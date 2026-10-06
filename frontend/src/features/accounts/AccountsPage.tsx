import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  buttonStyles,
} from '../../design-system'
import { useAccounts, useChangeAccountStatus } from '../../hooks/useAccounts'
import { accountTypeLabel } from './accountTypes'
import { BalanceFigure } from './BalanceFigure'
import { STATUS_LABEL } from './statusLabel'
import { ownerNames } from './ownerNames'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useStateChangeFocus } from './useStateChangeFocus'
import { useAccountContext } from './useAccountContext'

export function AccountsPage() {
  const accounts = useAccounts()
  const { members } = useAccountContext()
  // A delete on the account's own page lands here: the status line says so, takes focus and offers Undo (A3).
  const navigate = useNavigate()
  const arrived = (useLocation().state as { deleted?: { id: string; name: string } } | null)
    ?.deleted
  const [deleted] = useState(arrived)
  const [undone, setUndone] = useState(false)
  const { member } = useEnteringAs(members)
  const undo = useChangeAccountStatus(deleted?.id ?? '', member?.id)
  const { message, statusRef, changed } = useStateChangeFocus(
    false,
    deleted ? `${deleted.name} is deleted. Wealth does not change.` : undefined,
  )
  // Archived and closed accounts leave the active list; this switch brings them back into view (CHECKING_012).
  const [showAll, setShowAll] = useState(false)
  const hidden = (accounts.data ?? []).filter((account) => account.status !== 'active')
  const shown = (accounts.data ?? []).filter((account) => showAll || account.status === 'active')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description="Every account in the household, with its Balance and the date that Balance is as of."
        actions={
          <Link to="/accounts/new" className={buttonStyles({})}>
            Add account
          </Link>
        }
      />
      {message && (
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="flex max-w-md flex-wrap items-center gap-3 rounded-control border border-line p-3 text-sm outline-none"
        >
          {message}
          {deleted && !undone && (
            <Button
              variant="secondary"
              size="sm"
              disabled={undo.isPending}
              onClick={() =>
                undo.mutate('undo-delete', {
                  onSuccess: () => {
                    setUndone(true)
                    // A reload must not say "deleted" again for an account that is back.
                    navigate('.', { replace: true, state: null })
                    changed(`${deleted.name} is back with its Balance and no new activity.`)
                  },
                })
              }
            >
              Undo
            </Button>
          )}
        </p>
      )}
      {undo.error && (
        <p role="alert" className="text-sm">
          {undo.error.message}
        </p>
      )}
      {accounts.isPending && <p className="text-ink-muted">Loading accounts</p>}
      {accounts.isError && (
        <EmptyState title="Could not load accounts" description={accounts.error.message} />
      )}
      {accounts.data?.length === 0 && (
        <EmptyState
          title="No accounts yet"
          description="Add an account to start. Its opening Balance is optional."
        />
      )}
      {hidden.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          Show archived and closed accounts ({hidden.length})
        </label>
      )}
      {accounts.data && accounts.data.length > 0 && shown.length === 0 && (
        <EmptyState
          title="No active accounts"
          description="Every account is archived or closed. Show them to open or restore one."
        />
      )}
      {shown.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Owners</Th>
                <Th>Bank</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((account) => (
                <tr key={account.id}>
                  <Td>
                    <Link
                      to={`/accounts/${account.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {account.name}
                    </Link>
                    <span className="block text-caption text-ink-muted">
                      {accountTypeLabel(account.type)}
                      {account.status !== 'active' && (
                        <>
                          {' '}
                          <Badge>{STATUS_LABEL[account.status] ?? account.status}</Badge>
                        </>
                      )}
                    </span>
                  </Td>
                  <Td>{ownerNames(account.ownerMemberIds, members)}</Td>
                  <Td>{account.institution}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <BalanceFigure type={account.type} amount={account.balance.amount} />
                    <span className="block text-caption text-ink-muted">
                      as of {account.balance.asOf}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}
