import { useState } from 'react'
import { Amount, Badge, Card, CardTitle } from '../../design-system'
import { useToday } from '../../hooks/useAccounts'
import { useWealth, useWealthChange } from '../../hooks/useWealth'
import { formatMoney } from '../../lib/money'
import { accountTypeLabel, isDebt } from '../accounts/accountTypes'
import { balanceText } from '../accounts/cardBalance'
import { Dated } from '../values/Dated'

/**
 * Wealth on an earlier date (W4) and what changed between two dates (W5). A manually valued account shows the date of
 * its value and is flagged when that value is old; an account that had not begun tracking is named, never counted as
 * zero. The change is explained as income minus spending, asset value changes, corrections and accounts added.
 */
export function WealthOverTime() {
  const today = useToday()
  const max = today.data
  const [asOf, setAsOf] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const future = !!asOf && !!max && asOf > max
  // A date after today is explained, not sent: the server refuses it, and today's figure must not stand in for it.
  const wealth = useWealth(future ? undefined : asOf || undefined, !future)
  const change = useWealthChange(from, to)

  return (
    <Card aria-labelledby="over-time-heading">
      <CardTitle id="over-time-heading">Wealth on a date</CardTitle>
      <div className="mt-3 flex max-w-md flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Show wealth on
          <input
            type="date"
            value={asOf}
            max={max}
            onChange={(event) => setAsOf(event.target.value)}
            className="rounded-control border border-line bg-surface px-3 py-2"
          />
        </label>
      </div>
      {future && (
        <p role="alert" className="mt-3 text-sm">
          The date cannot be in the future
        </p>
      )}
      {wealth.isError && !future && (
        <p role="alert" className="mt-3 text-sm">
          {wealth.error.message}
        </p>
      )}
      {wealth.data && !future && (
        <div className="mt-3 flex flex-col gap-3" aria-live="polite">
          <p>
            Household wealth on {wealth.data.asOf} <Amount value={Number(wealth.data.netWorth)} />
          </p>
          {wealth.data.propertyAndOther.accounts.length > 0 && (
            <section aria-label="Property and other assets on this date">
              <h3 className="font-medium">Property and other assets</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {wealth.data.propertyAndOther.accounts.map((line) => (
                  <li key={line.accountId} className="py-2">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span>
                        {line.name}{' '}
                        <span className="text-sm text-ink-muted">
                          {accountTypeLabel(line.type)}
                        </span>
                      </span>
                      <Amount value={Number(line.balance)} />
                    </span>
                    <span className="block text-sm text-ink-muted">
                      Value dated {line.valueDate} {line.stale && <Badge>Older value</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {wealth.data.notTracked.length > 0 && (
            <div className="text-sm text-ink-muted">
              <p>
                Not tracking yet on <Dated on={wealth.data.asOf} />, so not counted:
              </p>
              <ul aria-label="Not tracking yet" className="mt-1 list-disc pl-5">
                {wealth.data.notTracked.map((item) => (
                  <li key={item.accountId}>
                    {item.name} (from <Dated on={item.openedOn} />)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <h3 className="mt-6 font-medium" id="what-changed-heading">
        What changed
      </h3>
      <div className="mt-2 flex max-w-md flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            type="date"
            value={from}
            max={max}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-control border border-line bg-surface px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input
            type="date"
            value={to}
            max={max}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-control border border-line bg-surface px-3 py-2"
          />
        </label>
      </div>
      {from && to && from > to && (
        <p role="alert" className="mt-3 text-sm">
          The start date must be on or before the end date
        </p>
      )}
      {change.isError && (
        <p role="alert" className="mt-3 text-sm">
          {change.error.message}
        </p>
      )}
      {change.data && <Explanation change={change.data} />}
    </Card>
  )
}

function Explanation({
  change,
}: {
  change: NonNullable<ReturnType<typeof useWealthChange>['data']>
}) {
  const rows: { label: string; value: number; note?: string; always?: boolean }[] = [
    { label: 'Income', value: Number(change.income), always: true },
    { label: 'Spending', value: -Number(change.spending), always: true },
    {
      label: 'Asset value change',
      value: Number(change.valueChange),
      note: 'Property, other assets and plans re-valued: an estimate, never income or spending',
      always: true,
    },
    {
      label: 'Pay credits',
      value: Number(change.payCredits),
      note: 'Credited by a defined benefit plan: part of its plan value, never income',
    },
    {
      label: 'Benefit interest',
      value: Number(change.benefitInterest),
      note: 'Credited by a defined benefit plan: part of its plan value, never income',
    },
    {
      label: 'Balance corrections',
      value: Number(change.corrections),
      note: 'Changes to a Balance that are neither income nor spending',
    },
    {
      label: 'Accounts added',
      value: Number(change.accountsAdded),
      note: 'Starting amounts of accounts that began in this period',
    },
    {
      label: 'Not explained',
      value: Number(change.other),
      note: 'Shown so nothing is hidden',
    },
  ]
  return (
    <div className="mt-3 flex flex-col gap-3" role="region" aria-label="Wealth change">
      <p>
        Wealth went from {formatMoney(Number(change.startWealth))} on <Dated on={change.from} /> to{' '}
        {formatMoney(Number(change.endWealth))} on <Dated on={change.to} />: a change of{' '}
        <Amount value={Number(change.change)} />.
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {rows
          .filter((row) => row.always || row.value !== 0)
          .map((row) => (
            <li
              key={row.label}
              className="flex flex-wrap items-baseline justify-between gap-x-4 py-2"
            >
              <span>
                {row.label}
                {row.note && <span className="block text-sm text-ink-muted">{row.note}</span>}
              </span>
              <Amount value={row.value} />
            </li>
          ))}
      </ul>
      <p className="text-sm text-ink-muted">
        Transfers, card payments and loan or mortgage principal cancel out, so they change nothing
        here.
      </p>
      {(change.correctionLines.length > 0 || change.restatements.length > 0) && (
        <ul className="list-disc pl-5 text-sm" aria-label="Corrections">
          {change.correctionLines.map((line, index) => (
            <li key={`${line.accountId}-${line.on}-${index}`}>
              {line.name}:{' '}
              {isDebt(line.type)
                ? `a ${formatMoney(Math.abs(Number(line.amount)))} debt correction, ${
                    Number(line.amount) > 0 ? 'lowering' : 'raising'
                  } what is owed`
                : `a ${formatMoney(Math.abs(Number(line.amount)))} Balance correction`}
              {line.reason ? ` (${line.reason})` : ''}, dated <Dated on={line.on} />.
            </li>
          ))}
          {change.restatements.map((line, index) => (
            <li key={`${line.accountId}-${line.madeOn}-${index}`}>
              {line.name}:{' '}
              {isDebt(line.type)
                ? `the initial amount owed was corrected from ${balanceText(line.type, line.previousAmount)} to ${balanceText(line.type, line.amount)}`
                : `the starting balance was corrected from ${formatMoney(Number(line.previousAmount))} to ${formatMoney(Number(line.amount))}`}{' '}
              on <Dated on={line.madeOn} />
              {line.reason ? ` (${line.reason})` : ''}
              {isDebt(line.type)
                ? `: a ${formatMoney(Math.abs(Number(line.change)))} debt correction, ${
                    Number(line.change) > 0 ? 'lowering' : 'raising'
                  } what is owed`
                : ''}
              . Wealth on every date already uses the corrected amount.
            </li>
          ))}
        </ul>
      )}
      {change.creditLines.length > 0 && (
        <ul className="text-sm" aria-label="Plan credits">
          {change.creditLines.map((line, index) => (
            <li key={`${line.accountId}-${line.on}-${index}`}>
              {line.name}: pay credit {formatMoney(Number(line.payCredit))} and benefit interest{' '}
              {formatMoney(Number(line.interestCredit))}, dated <Dated on={line.on} />. Part of the
              plan value, not income, spending or a salary.
            </li>
          ))}
        </ul>
      )}
      {change.valueMoves.length > 0 && (
        <ul className="text-sm" aria-label="Value changes">
          {change.valueMoves.map((move) => {
            const delta = Number(move.change)
            // The range includes the credits listed above; the figure here is what is left after them.
            const credited = change.creditLines
              .filter((line) => line.accountId === move.accountId)
              .reduce((sum, line) => sum + Number(line.payCredit) + Number(line.interestCredit), 0)
            return (
              <li key={move.accountId}>
                {move.name} {delta > 0 ? 'value increase' : 'value decrease'} of{' '}
                {formatMoney(Math.abs(delta))} ({formatMoney(Number(move.start))} to{' '}
                {formatMoney(Number(move.end))}
                {credited > 0 && `; ${formatMoney(credited)} of that range is the credits above`}),
                an asset value change rather than income or spending.
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
