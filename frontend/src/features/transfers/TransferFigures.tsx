import type { TransferPreview } from '../../api/transfers'
import { formatMoney } from '../../lib/money'
import { MONTH_NAMES } from '../../lib/months'

/**
 * Each affected account's Balance after the change, from the server. A transfer moves money between accounts
 * the household owns, so it adds nothing to income or spending; a changed expense shows its month's spending.
 */
export function TransferFigures({ preview }: { preview: TransferPreview }) {
  return (
    <section
      aria-label="Effect of this transfer"
      className="mt-3 max-w-md rounded-control border border-line p-3 text-sm"
    >
      <p className="font-medium">After you confirm</p>
      <dl className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {preview.accounts.map((account) => (
          <div key={account.id} className="min-w-0">
            <dt className="text-caption text-ink-muted [overflow-wrap:anywhere]">
              {account.name} Balance
            </dt>
            <dd>{formatMoney(Number(account.balanceAfter))}</dd>
          </div>
        ))}
        {preview.spending && (
          <div className="min-w-0">
            <dt className="text-caption text-ink-muted">
              {MONTH_NAMES[Number(preview.spending.month.slice(5, 7)) - 1]} spending
            </dt>
            <dd>
              {formatMoney(Number(preview.spending.after))}
              <span className="block text-caption text-ink-muted">
                was {formatMoney(Number(preview.spending.before))}
              </span>
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-caption text-ink-muted">
        A transfer between your own accounts is not income or spending.
      </p>
    </section>
  )
}
