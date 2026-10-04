import { Card, CardTitle } from '../../design-system'
import { useReminders } from '../../hooks/useActivity'
import { formatMoney } from '../../lib/money'

/**
 * Future bills and expected income of one account. They are plans: nothing here is in the Balance, income or
 * spending until a real entry is recorded.
 */
export function RemindersCard({ accountId }: { accountId: string }) {
  const reminders = useReminders()
  const mine = reminders.data?.filter((r) => r.accountId === accountId) ?? []

  return (
    <Card aria-labelledby="reminders-heading" className="mt-4">
      <CardTitle id="reminders-heading" className="text-lg">
        Reminders
      </CardTitle>
      {reminders.isError ? (
        <p role="alert">{reminders.error.message}</p>
      ) : mine.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">No reminders have been saved.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {mine.map((reminder) => (
            <li key={reminder.id}>
              <strong>{reminder.description || reminder.categoryName}</strong>
              {reminder.description ? ` (${reminder.categoryName})` : ''}{' '}
              {formatMoney(Number(reminder.amount))}{' '}
              {reminder.kind === 'income' ? 'expected' : 'due'} {reminder.dueOn}
              <span className="text-ink-muted"> · not yet in your Balance</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
