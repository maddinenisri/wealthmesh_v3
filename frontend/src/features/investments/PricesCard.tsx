import type { Account } from '../../api/accounts'
import { Badge, Button, Card, CardTitle, FormAlert } from '../../design-system'
import { usePriceHistory } from '../../hooks/usePrices'
import { formatMoney } from '../../lib/money'
import { stamp } from '../../lib/stamp'

const dollars = (text: string) => formatMoney(Number(text))

/**
 * The prices recorded on an account's holdings (slice 19b) and the Balance on each date it changed. A replaced price
 * stays here with who saved it and when; the older Balance stays visible beside the newer one. Recording is offered
 * on an active account only (a draft, archived or closed account refuses it).
 */
export function PricesCard({
  account,
  canRecord,
  onRecord,
}: {
  account: Account
  /** The account has holdings to price. */
  canRecord: boolean
  onRecord: () => void
}) {
  const history = usePriceHistory(account.id)
  const active = account.status === 'active'
  return (
    <Card aria-labelledby="prices-heading">
      <CardTitle id="prices-heading" tabIndex={-1} className="text-lg outline-none">
        Prices
      </CardTitle>
      {history.isPending && <p className="mt-2 text-sm text-ink-muted">Loading the prices</p>}
      {history.isError && <FormAlert message={history.error.message} />}
      {history.data && (
        <div className="mt-3 flex flex-col gap-4">
          {history.data.prices.length === 0 ? (
            <p className="text-sm">
              No price has been recorded since setup, so each holding is still worth its opening
              price.
            </p>
          ) : (
            <ul aria-label="Recorded prices" className="divide-y divide-line border-y border-line">
              {history.data.prices.map((price) => (
                <li key={price.id} className="py-2 text-sm">
                  <span className="font-medium">{price.symbol}</span>{' '}
                  <span className="normal-nums">{dollars(price.price)}</span> for{' '}
                  <span className="whitespace-nowrap">{price.valueOn}</span>{' '}
                  {price.replaced && <Badge>Replaced</Badge>}
                  <span className="block text-ink-muted">
                    Entered by {price.enteredByName} on {stamp(price.enteredAt)}
                    {price.replacedAt && `, replaced on ${stamp(price.replacedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {history.data.overridden.length > 0 && (
            <ul aria-label="Replaced opening prices" className="text-sm">
              {history.data.overridden.map((line) => (
                <li key={`${line.symbol}-${line.valueOn}-${line.price}`}>
                  <Badge>Opening price replaced</Badge>: {line.symbol}{' '}
                  <span className="normal-nums">{dollars(line.price)}</span> for{' '}
                  <span className="whitespace-nowrap">{line.valueOn}</span>. It stays in the opening
                  holdings.
                </li>
              ))}
            </ul>
          )}
          {history.data.points.length > 1 && (
            <section aria-labelledby="balance-history-heading">
              <h3 id="balance-history-heading" className="font-medium">
                Balance history
              </h3>
              <ul className="mt-1 text-sm">
                {history.data.points.map((point) => (
                  <li key={point.on}>
                    <span className="whitespace-nowrap">{point.on}</span>{' '}
                    <span className="normal-nums">{dollars(point.balance)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {canRecord && active && (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRecord}>
            Record a price
          </Button>
        </div>
      )}
      {canRecord && !active && (
        <p className="mt-3 text-sm text-ink-muted">
          {account.name} is {account.status}, so no price can be recorded until it is active.
        </p>
      )}
    </Card>
  )
}
