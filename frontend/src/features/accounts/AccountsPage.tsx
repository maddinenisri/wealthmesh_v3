import { Link } from 'react-router'
import {
  Amount,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  buttonStyles,
} from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { OverdrawnLabel } from './Overdrawn'
import { ownerNames } from './ownerNames'
import { useAccountContext } from './useAccountContext'

export function AccountsPage() {
  const accounts = useAccounts()
  const { members } = useAccountContext()

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
      {accounts.data && accounts.data.length > 0 && (
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
              {accounts.data.map((account) => (
                <tr key={account.id}>
                  <Td>
                    <Link
                      to={`/accounts/${account.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {account.name}
                    </Link>
                  </Td>
                  <Td>{ownerNames(account.ownerMemberIds, members)}</Td>
                  <Td>{account.institution}</Td>
                  <Td className="text-right">
                    <Amount value={Number(account.balance.amount)} />
                    <OverdrawnLabel balance={account.balance.amount} />
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
