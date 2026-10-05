import type { TransferPreview } from '../../api/transfers'
import { formatMoney } from '../../lib/money'
import { balanceText, cardSide, isCard } from '../accounts/cardBalance'
import { MONTH_NAMES } from '../../lib/months'

/**
 * Each affected account's Balance after the change, from the server. A transfer moves money between accounts
 * the household owns, so it adds nothing to income or spending; a changed expense shows its month's spending.
 */
export function TransferFigures({
  preview,
  typeOf,
  payment = false,
}: {
  preview: TransferPreview
  /** The account type by id, so a card's Balance reads "owed" or "Card credit". */
  typeOf?: (id: string) => string | undefined
  payment?: boolean
}) {
  const paid = payment
    ? preview.accounts.find((account) => isCard(typeOf?.(account.id) ?? ''))
    : undefined
  return (
    <section
      aria-label={payment ? 'Effect of this payment' : 'Effect of this transfer'}
      className="mt-3 max-w-md rounded-control border border-line p-3 text-sm"
    >
      <p className="font-medium">After you confirm</p>
      <dl className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {preview.accounts.map((account) => (
          <div key={account.id} className="min-w-0">
            <dt className="text-caption text-ink-muted [overflow-wrap:anywhere]">
              {account.name} Balance
            </dt>
            <dd>{balanceText(typeOf?.(account.id) ?? '', account.balanceAfter)}</dd>
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
      {paid && Number(paid.balanceAfter) > 0 && (
        <p className="mt-3">
          This pays {formatMoney(Number(paid.balanceAfter))} more than is owed, so {paid.name} is
          left with a {formatMoney(Number(paid.balanceAfter))} {cardSide(paid.balanceAfter)}.
        </p>
      )}
      <p className="mt-3 text-caption text-ink-muted">
        {payment
          ? 'A card payment moves money you already own. It is not income or spending.'
          : 'A transfer between your own accounts is not income or spending.'}
      </p>
    </section>
  )
}
