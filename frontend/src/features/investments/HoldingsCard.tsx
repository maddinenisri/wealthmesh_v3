import type { Account } from '../../api/accounts'
import type { Security } from '../../api/investments'
import { Card, CardTitle, FormAlert } from '../../design-system'
import { useHoldings } from '../../hooks/useInvestments'
import { formatMoney } from '../../lib/money'

const dollars = (text: string) => formatMoney(Number(text))
const NOT_AVAILABLE = 'Not available'

/** One security: its shares and value, and what is known of its purchase cost (never zero when unknown). */
function SecurityBlock({ security }: { security: Security }) {
  const partly = security.cost === null && Number(security.knownShares) > 0
  const id = `security-${security.symbol.replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1 border-t border-line pt-3">
      <h3 id={id} className="font-medium">
        {security.symbol}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-ink-muted">Shares</dt>
        <dd className="normal-nums">{security.shares}</dd>
        <dt className="text-ink-muted">Market price</dt>
        <dd className="normal-nums">
          {security.price === null ? 'Prices differ by line' : dollars(security.price)}{' '}
          <span className="whitespace-nowrap text-ink-muted">on {security.priceOn}</span>
        </dd>
        <dt className="text-ink-muted">Value</dt>
        <dd className="normal-nums">{dollars(security.value)}</dd>
        <dt className="text-ink-muted">Purchase cost</dt>
        <dd className="normal-nums">
          {security.cost === null ? NOT_AVAILABLE : dollars(security.cost)}
        </dd>
        <dt className="text-ink-muted">Gain</dt>
        <dd className="normal-nums">
          {security.gain === null ? NOT_AVAILABLE : dollars(security.gain)}
        </dd>
      </dl>
      {partly && (
        <p className="text-sm">
          The cost is known for {security.knownShares} of {security.shares} shares (
          {security.coverage} of the shares). Those {security.knownShares} are worth{' '}
          {dollars(security.knownValue ?? '0')}, cost {dollars(security.knownCost ?? '0')} and show
          a gain of {dollars(security.knownGain ?? '0')}. No gain is worked out for the others.
        </p>
      )}
    </section>
  )
}

/**
 * The holdings of a completed investment account (HOLDINGS_004, *_001): the cash, the holdings and the one Balance the
 * list and wealth show, then each security with its cost and gain. A cost that is not known says "Not available";
 * the figures of the shares whose cost is known are shown beside it, never mixed into the whole.
 */
export function HoldingsCard({ account }: { account: Account }) {
  const holdings = useHoldings(account.id)
  return (
    <Card aria-labelledby="holdings-heading">
      <CardTitle id="holdings-heading" tabIndex={-1} className="text-lg outline-none">
        Holdings
      </CardTitle>
      {holdings.isPending && <p className="mt-2 text-sm text-ink-muted">Loading the holdings</p>}
      {holdings.isError && <FormAlert message={holdings.error.message} />}
      {holdings.data && (
        <div className="mt-3 flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-ink-muted">Cash</dt>
            <dd className="normal-nums">{dollars(holdings.data.cash)}</dd>
            <dt className="text-ink-muted">Holdings</dt>
            <dd className="normal-nums">{dollars(holdings.data.holdingsValue)}</dd>
            <dt className="text-ink-muted">Balance</dt>
            <dd className="normal-nums">
              <strong>{dollars(holdings.data.balance)}</strong>{' '}
              <span className="whitespace-nowrap text-ink-muted">
                dated {holdings.data.balanceOn}
              </span>
            </dd>
            {holdings.data.securities.length > 0 && (
              <>
                <dt className="text-ink-muted">Purchase cost</dt>
                <dd className="normal-nums">
                  {holdings.data.cost === null ? NOT_AVAILABLE : dollars(holdings.data.cost)}
                </dd>
                <dt className="text-ink-muted">Gain</dt>
                <dd className="normal-nums">
                  {holdings.data.gain === null ? NOT_AVAILABLE : dollars(holdings.data.gain)}
                </dd>
              </>
            )}
          </dl>
          {holdings.data.securities.length === 0 ? (
            <p className="text-sm text-ink-muted">No holdings are recorded. The Balance is cash.</p>
          ) : (
            holdings.data.securities.map((security) => (
              <SecurityBlock key={security.symbol} security={security} />
            ))
          )}
        </div>
      )}
    </Card>
  )
}
