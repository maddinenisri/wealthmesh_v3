import type { Portion } from '../../api/activity'
import { formatMoney } from '../../lib/money'
import { classText } from './classes'

/** The portions of a split expense, one line each: "Groceries $90.00 · Essential". Renders nothing if not split. */
export function PortionList({ portions }: { portions: Portion[] | undefined }) {
  if (!portions || portions.length === 0) return null
  return (
    <ul aria-label="Split portions" className="mt-1 text-caption text-ink-muted">
      {portions.map((portion, index) => (
        <li key={index} className="[overflow-wrap:anywhere]">
          {portion.categoryName} {formatMoney(Number(portion.amount))} ·{' '}
          {classText(portion.classification)}
          {portion.categoryArchived && ' (archived)'}
        </li>
      ))}
    </ul>
  )
}
