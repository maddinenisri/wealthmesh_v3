import { Link } from 'react-router'
import type { Activity } from '../../api/activity'
import { formatMoney } from '../../lib/money'

/** The actual expenses that support an estimate. They are recorded bills, never part of the estimate. */
export function Bills({
  bills,
  label = 'Supporting bills',
}: {
  bills: Activity[]
  label?: string
}) {
  if (bills.length === 0) return null
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer">
        {label} ({bills.length})
      </summary>
      <ul className="mt-1 flex flex-col gap-1">
        {bills.map((bill) => (
          <li key={bill.id}>
            {bill.occurredOn} {formatMoney(Number(bill.amount))}{' '}
            <Link className="underline" to={`/accounts/${bill.accountId}`}>
              {bill.description ?? bill.categoryName} on {bill.accountName}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}
