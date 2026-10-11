import { useState } from 'react'
import { Amount, Badge, Card, CardTitle } from '../../design-system'
import { useToday } from '../../hooks/useAccounts'
import { useWealth, useWealthChange } from '../../hooks/useWealth'
import { formatMoney } from '../../lib/money'
import { accountTypeLabel, isDebt } from '../accounts/accountTypes'
import { balanceText, isCard } from '../accounts/cardBalance'
import { STATUS_LABEL } from '../accounts/statusLabel'
import { Dated } from '../values/Dated'
import type { Wealth, WealthGroup, WealthLine } from '../../api/wealth'
import { OlderPricesNote } from './OlderPricesNote'

/**
 * Wealth on an earlier date (W4) and what changed between two dates (W5). A manually valued account shows the date of
 * its value and is flagged when that value is old; an account that had not begun tracking is named, never counted as
 * zero. The change is explained as income minus spending, asset value changes, corrections and accounts added.
 */
export function WealthOverTime({ person }: { person?: string }) {
  const today = useToday()
  const max = today.data
  const [asOf, setAsOf] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const future = !!asOf && !!max && asOf > max
  // A date after today is explained, not sent: the server refuses it, and today's figure must not stand in for it.
  const wealth = useWealth(future ? undefined : asOf || undefined, !future)
  const change = useWealthChange(from, to)
  // Assets no list above carries: a defined benefit plan, and a card whose balance is Card credit.
  const otherAssets = wealth.data ? plansAndCredit(wealth.data) : { total: '0.00', accounts: [] }

  return (
    <Card aria-labelledby="over-time-heading">
      <CardTitle id="over-time-heading">Wealth on a date</CardTitle>
      {person && (
        <p className="mt-1 text-sm text-ink-muted">
          This is for the whole household, not {person}&apos;s accounts alone.
        </p>
      )}
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
          <p>
            Financial assets <Amount value={Number(wealth.data.financialAssets)} />
          </p>
          <p>
            Debts <Amount value={Number(wealth.data.debts)} />
          </p>
          <p className="text-sm text-ink-muted">
            Household wealth is financial assets minus debts.
          </p>
          <OlderPricesNote wealth={wealth.data} />
          <DatedList
            label="Checking and savings balances on this date"
            title="Bank money"
            group={wealth.data.bankMoney}
            note={
              wealth.data.bankMoney.accounts.some((line) => Number(line.balance) < 0)
                ? 'An overdrawn account shows its negative amount here and is counted once, as debt.'
                : undefined
            }
          />
          <DatedList
            label="Investment balances on this date"
            title="Investments"
            group={wealth.data.investments}
            detail={(line) =>
              line.valueDate && (
                <>
                  Prices last updated <Dated on={line.valueDate} />
                </>
              )
            }
          />
          <DatedList
            label="Property and other assets on this date"
            title="Property and other assets"
            group={wealth.data.propertyAndOther}
            detail={(line) => (
              <>
                Value dated {line.valueDate} {line.stale && <Badge>Older value</Badge>}
              </>
            )}
          />
          <DatedList
            label="Plans and card credit on this date"
            title="Plans and card credit"
            group={otherAssets}
          />
          <DatedList
            label="Debts on this date"
            title="What makes up debts"
            group={{ total: wealth.data.debts, accounts: wealth.data.debtLines }}
            owed
          />
          <p className="text-sm text-ink-muted">
            The assets add up from Bank money without any overdrawn account, Investments, Property
            and other assets, and Plans and card credit. Retirement and Health savings accounts are
            in Investments, so no group is added twice.
          </p>
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
          From must be on or before To.
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
      label: 'Investment price changes',
      value: Number(change.priceChange),
      note: 'Holdings re-priced: a price move is never income or spending',
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
              <span className="ml-auto">
                <Amount value={row.value} />
              </span>
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
      {change.priceMoves.length > 0 && (
        <ul className="text-sm" aria-label="Price changes">
          {change.priceMoves.map((move) => {
            const delta = Number(move.change)
            return (
              <li key={move.accountId}>
                {move.name} price {delta > 0 ? 'increase' : 'decrease'} of{' '}
                {formatMoney(Math.abs(delta))}, a price move rather than income or spending.
              </li>
            )
          })}
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

/** Assets no other list carries: a defined benefit plan, and a card whose Balance is Card credit. */
function plansAndCredit(wealth: Wealth): WealthGroup {
  const listed = ['bankMoney', 'investments', 'propertyAndOther']
  const seen = new Set<string>()
  const accounts = [...wealth.retirement.accounts, ...wealth.cards.accounts].filter((line) => {
    if (seen.has(line.accountId)) return false
    seen.add(line.accountId)
    return Number(line.balance) > 0 && !line.groups.some((group) => listed.includes(group))
  })
  const total = accounts.reduce((sum, line) => sum + Number(line.balance), 0)
  return { total: total.toFixed(2), accounts }
}

/**
 * One list of accounts on the chosen date with its total in the amount column. An archived or closed account is
 * labeled; `owed` shows each debt as an amount owed (or overdrawn), `detail` adds a line under a row.
 */
function DatedList({
  label,
  title,
  group,
  note,
  detail,
  owed = false,
}: {
  label: string
  title: string
  group: WealthGroup
  note?: string
  detail?: (line: WealthLine) => React.ReactNode
  owed?: boolean
}) {
  if (group.accounts.length === 0) return null
  return (
    <section aria-label={label}>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {group.accounts.map((line) => (
          <li key={line.accountId} className="py-2">
            <span className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span>
                {line.name}{' '}
                <span className="text-sm text-ink-muted">{accountTypeLabel(line.type)}</span>{' '}
                {line.status !== 'active' && (
                  <Badge>{STATUS_LABEL[line.status] ?? line.status}</Badge>
                )}
              </span>
              <span className="ml-auto">
                {owed ? (
                  <>
                    <Amount value={Math.abs(Number(line.balance))} />{' '}
                    <span className="text-sm text-ink-muted">
                      {isCard(line.type) || isDebt(line.type) ? 'owed' : 'overdrawn'}
                    </span>
                  </>
                ) : (
                  <Amount value={Number(line.balance)} />
                )}
              </span>
            </span>
            {detail?.(line) ? (
              <span className="block text-sm text-ink-muted">{detail(line)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 text-sm font-medium">
        <span>Total</span>
        <Amount value={Number(group.total)} className="ml-auto" />
      </div>
      {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
    </section>
  )
}
