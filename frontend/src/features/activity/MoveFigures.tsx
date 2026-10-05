import type { ReplacementPreview } from '../../api/activity'
import { formatMoney } from '../../lib/money'
import { MONTH_NAMES } from '../../lib/months'
import { balanceText } from '../accounts/cardBalance'

const monthName = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1]

/**
 * What a correction will do to each account's Balance and to the month totals it leaves and joins, from the server.
 * Shown in the review; nothing has been saved yet.
 */
export function MoveFigures({
  preview,
  typeOf,
}: {
  preview: ReplacementPreview
  /** The account type by id, so a card's Balance reads "owed" or "Card credit". */
  typeOf?: (id: string) => string | undefined
}) {
  const { from, to, oldMonth, newMonth } = preview
  const months = oldMonth.month === newMonth.month ? [newMonth] : [oldMonth, newMonth]
  return (
    <section
      aria-label="Effect of this change"
      className="mt-3 max-w-md rounded-control border border-line p-3 text-sm"
    >
      <p className="font-medium">After you confirm</p>
      <dl className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <Figure label={`${from.name} Balance`} value={from.balanceAfter} type={typeOf?.(from.id)} />
        {from.id !== to.id && (
          <Figure label={`${to.name} Balance`} value={to.balanceAfter} type={typeOf?.(to.id)} />
        )}
        {months.map((month) => (
          <Figure
            key={month.month}
            label={`${monthName(month.month)} ${month.kind === 'income' ? 'Income' : 'spending'}`}
            value={month.after}
            before={month.before}
          />
        ))}
      </dl>
    </section>
  )
}

function Figure({
  label,
  value,
  before,
  type,
}: {
  label: string
  value: string
  before?: string
  /** Set for an account Balance: a card reads owed or Card credit. */
  type?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-muted [overflow-wrap:anywhere]">{label}</dt>
      <dd>
        {type === undefined ? formatMoney(Number(value)) : balanceText(type, value)}
        {before !== undefined && before !== value && (
          <span className="block text-caption text-ink-muted">
            was {formatMoney(Number(before))}
          </span>
        )}
      </dd>
    </div>
  )
}
