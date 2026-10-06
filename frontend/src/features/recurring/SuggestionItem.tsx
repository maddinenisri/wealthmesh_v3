import type { Suggestion } from '../../api/recurring'
import { Button } from '../../design-system'
import { formatMoney } from '../../lib/money'
import { Bills } from './Bills'
import { FREQUENCY_LABEL } from './recurringText'

/** A suggestion: an estimate found in recorded bills, to confirm as a schedule or dismiss (RECURRING_001, 002, 009). */
export function SuggestionItem({
  suggestion,
  onConfirm,
  onDismiss,
}: {
  suggestion: Suggestion
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <li className="rounded-control border border-line p-3">
      <p>
        <strong>{suggestion.description}</strong>{' '}
        <span className="text-ink-muted">({suggestion.categoryName})</span>
      </p>
      <p className="mt-1 text-sm">
        Expected {formatMoney(Number(suggestion.amount))}, {FREQUENCY_LABEL[suggestion.frequency]},
        paid from {suggestion.accountName}
      </p>
      <p className="mt-1 text-sm">
        Last recorded bill {suggestion.lastRecordedOn}. Next expected bill{' '}
        {suggestion.nextExpectedOn}.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Estimate, not a recorded expense. Repeated purchases cannot always be detected, so a bill
        may be missing from this list.
      </p>
      <Bills bills={suggestion.bills} />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={onConfirm}>
          Review and confirm
        </Button>
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Dismiss suggestion
        </Button>
      </div>
    </li>
  )
}
