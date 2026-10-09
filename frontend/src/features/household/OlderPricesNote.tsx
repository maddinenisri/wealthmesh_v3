import type { Wealth } from '../../api/wealth'

/** More accounts than this are folded into a "Show the accounts" disclosure, so the note stays one line long. */
const LISTED = 3

/**
 * WEALTH_004: an investment account whose latest price is dated before the wealth date counts that older price, so the
 * total mixes dates. This says so with a count and names each account with the date its prices were last updated, as a
 * list (folded when long). It is not the 30-day "Older value" flag of a manually valued account.
 */
export function OlderPricesNote({ wealth }: { wealth: Wealth }) {
  const older = wealth.olderPrices
  if (older.length === 0) return null
  const list = (
    <ul className="mt-1 list-disc pl-5">
      {older.map((item) => (
        <li key={item.accountId}>
          {item.name}: prices last updated <span className="whitespace-nowrap">{item.priceOn}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="max-w-prose text-sm text-ink-muted">
      <p>
        These balances come from different dates: {older.length} investment{' '}
        {older.length === 1 ? 'account uses' : 'accounts use'} prices dated before{' '}
        <span className="whitespace-nowrap">{wealth.asOf}</span>.
      </p>
      {older.length > LISTED ? (
        <details>
          <summary className="mt-1 cursor-pointer underline-offset-2 hover:underline">
            Show the accounts
          </summary>
          {list}
        </details>
      ) : (
        list
      )}
    </div>
  )
}
