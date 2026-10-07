import type { Account } from '../../api/accounts'
import type { ValueRow } from '../../api/values'
import { Button, Card, CardTitle, Table, Td, Th } from '../../design-system'
import { useValueHistory } from '../../hooks/useValues'
import { balanceText } from '../accounts/cardBalance'

/**
 * The plans saved for a loan or mortgage (DATED_VALUE_001): future amounts owed that nothing counts. Removed plans
 * stay listed, where Undo brings them back. Nothing is shown until one exists. `disabled` is true while another
 * panel is open.
 */
export function DebtPlans({
  account,
  disabled,
  onChange,
}: {
  account: Account
  disabled: boolean
  onChange: (mode: 'remove' | 'undo', row: ValueRow) => void
}) {
  const history = useValueHistory(account.id)
  const plans = (history.data?.values ?? []).filter((row) => row.planned)
  if (plans.length === 0) return null
  return (
    <Card aria-labelledby="plans-heading" className="mb-4">
      <CardTitle id="plans-heading" className="text-lg">
        Planned amounts owed
      </CardTitle>
      <p className="mt-1 text-sm text-ink-muted">
        A plan is never counted in the Balance owed, wealth or any past date.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Planned for</Th>
            <Th className="text-right">Amount owed</Th>
            <Th>Reason</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {plans.map((row) => (
            <tr key={row.id}>
              <Td className="whitespace-nowrap">{row.valueOn}</Td>
              <Td className="text-right whitespace-nowrap">
                {balanceText(account.type, row.amount)}
              </Td>
              <Td>{row.reason ?? ''}</Td>
              <Td>{row.status === 'removed' ? 'Removed' : 'Planned'}</Td>
              <Td>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`${row.status === 'removed' ? 'Undo' : 'Remove'} plan for ${row.valueOn}`}
                  onClick={() => onChange(row.status === 'removed' ? 'undo' : 'remove', row)}
                >
                  {row.status === 'removed' ? 'Undo' : 'Remove'}
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}
