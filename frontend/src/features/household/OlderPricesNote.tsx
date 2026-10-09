import type { Wealth } from '../../api/wealth'

/**
 * WEALTH_004: an investment account whose latest price is dated before the wealth date counts that older price, so the
 * total mixes dates. This says so, naming each account and the date its prices were last updated. It is not the
 * 30-day "Older value" flag of a manually valued account.
 */
export function OlderPricesNote({ wealth }: { wealth: Wealth }) {
  if (wealth.olderPrices.length === 0) return null
  return (
    <p className="max-w-prose text-sm text-ink-muted">
      These balances come from different dates. On{' '}
      <span className="whitespace-nowrap">{wealth.asOf}</span>,{' '}
      {wealth.olderPrices.map((older, index) => (
        <span key={older.accountId}>
          {index > 0 && '; '}
          {older.name} still uses prices last updated on{' '}
          <span className="whitespace-nowrap">{older.priceOn}</span>
        </span>
      ))}
      .
    </p>
  )
}
