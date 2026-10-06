import type { Account } from '../../api/accounts'
import { Card, CardTitle } from '../../design-system'
import { formatMoney } from '../../lib/money'

/**
 * What a property or other asset shows in place of money activity (T3): its dated values. A valued account holds no
 * activity, so there are no money buttons; its one Balance is the latest effective value.
 */
export function ValuedAccount({ account }: { account: Account }) {
  return (
    <Card aria-labelledby="values-heading">
      <CardTitle id="values-heading" className="text-lg">
        Value history
      </CardTitle>
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        <li>
          Initial value {formatMoney(Number(account.openingAmount))} on {account.openedOn}
        </li>
      </ul>
    </Card>
  )
}
