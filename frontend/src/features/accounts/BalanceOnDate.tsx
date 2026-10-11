import { useState } from 'react'
import type { Account } from '../../api/accounts'
import { Card, CardTitle } from '../../design-system'
import { useBalanceAsOf } from '../../hooks/useActivity'
import { isValued } from './accountTypes'
import { balanceText } from './cardBalance'

/**
 * Reads the Balance on an earlier date without changing the current one (V2_CHECKING_018). Every kind of account has
 * it: a checking account, an investment account (with the prices in force that day), a valued account and a debt.
 */
export function BalanceOnDate({ account, today }: { account: Account; today: string }) {
  const [date, setDate] = useState('')
  // A property or plan has a Value, never a Balance (owner 2026-10-06).
  const noun = isValued(account.type) ? 'Value' : 'Balance'
  const view = useBalanceAsOf(account.id, date > today ? '' : date)

  return (
    <Card aria-labelledby="as-of-heading">
      <CardTitle id="as-of-heading" className="text-lg">
        {noun} on a date
      </CardTitle>
      <div className="mt-3 flex max-w-md flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          View {noun} on
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
            <>
              {noun} on {view.data.asOn}: not available. Tracking began on {account.openedOn}.
            </>
          ) : (
            <>
              {noun} on {view.data.asOn}:{' '}
              <strong>{balanceText(account.type, view.data.amount)}</strong>. The current {noun} (
              {balanceText(account.type, account.balance.amount)}) is unchanged.
            </>
          )}
        </p>
      )}
    </Card>
  )
}
