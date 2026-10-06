import { useState } from 'react'
import { Link } from 'react-router'
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  buttonStyles,
} from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { accountTypeLabel } from './accountTypes'
import { BalanceFigure } from './BalanceFigure'
import { STATUS_LABEL } from './statusLabel'
import { ownerNames } from './ownerNames'
import { useAccountContext } from './useAccountContext'

export function AccountsPage() {
  const accounts = useAccounts()
  const { members } = useAccountContext()
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
