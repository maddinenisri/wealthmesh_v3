import { useState } from 'react'
import { Link } from 'react-router'
import type { GroupAccount, GroupPosition, GroupSecurity } from '../../api/investments'
import { Amount, Badge, Card, CardTitle, FormAlert, PageHeader } from '../../design-system'
import { useInvestmentGroup } from '../../hooks/useInvestments'
import { formatMoney } from '../../lib/money'
import { accountTypeLabel } from '../accounts/accountTypes'
import { STATUS_LABEL } from '../accounts/statusLabel'

const dollars = (text: string) => formatMoney(Number(text))
const NOT_AVAILABLE = 'Not available'
/** A share count with thousands separators and up to four decimals. */
const shares = (text: string) => Number(text).toLocaleString('en-US', { maximumFractionDigits: 4 })

/** The status label of an account that is not active: archived and closed accounts stay in the group, labeled. */
function Status({ status }: { status: string }) {
  return status === 'active' ? null : <Badge>{STATUS_LABEL[status] ?? status}</Badge>
}

/** One account of the group: its own Balance, cash and holdings value, and the date its prices were last updated. */
function AccountLine({ account }: { account: GroupAccount }) {
  return (
    <li className="py-3">
      <span className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span>
          <Link
            to={`/accounts/${account.accountId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {account.name}
          </Link>{' '}
          <span className="text-sm text-ink-muted">{accountTypeLabel(account.type)}</span>{' '}
          <Status status={account.status} />
        </span>
        <Amount value={Number(account.balance)} />
      </span>
      <span className="block text-sm text-ink-muted">
        {account.cash === null || account.holdingsValue === null
          ? 'No cash or holdings are recorded for this account.'
          : `Cash ${dollars(account.cash)} and holdings ${dollars(account.holdingsValue)}.`}{' '}
        {account.pricesOn && (
          <>
            Prices last updated <span className="whitespace-nowrap">{account.pricesOn}</span>.
          </>
        )}
      </span>
    </li>
  )
}

/** One account's holding of the selected security: its own price and date, never another account's. */
function PositionLine({ position }: { position: GroupPosition }) {
  const partly = position.cost === null && Number(position.knownShares) > 0
  return (
    <li className="py-3 text-sm">
      <span className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span>
          <Link
            to={`/accounts/${position.accountId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {position.accountName}
          </Link>{' '}
          <Status status={position.accountStatus} />
        </span>
        <span className="normal-nums">{dollars(position.value)}</span>
      </span>
      <span className="block text-ink-muted">
        {shares(position.shares)} shares at{' '}
        {position.price === null ? 'prices that differ by line' : dollars(position.price)} on{' '}
        <span className="whitespace-nowrap">{position.priceOn}</span>.
      </span>
      <span className="block text-ink-muted">
        {position.cost !== null
          ? `Purchase cost ${dollars(position.cost)}, gain ${dollars(position.gain ?? '0')}.`
          : partly
            ? `Purchase cost known for ${shares(position.knownShares)} of ${shares(position.shares)} shares (${position.coverage}): ${dollars(position.knownCost ?? '0')}. Full cost: ${NOT_AVAILABLE}.`
            : `Purchase cost unknown for all ${shares(position.shares)} shares. Full cost: ${NOT_AVAILABLE}.`}
      </span>
    </li>
  )
}

/** The selected security added up across the accounts that hold it, with what is known of its purchase cost. */
function SecurityDetail({ security, total }: { security: GroupSecurity; total: string }) {
  const partly = security.cost === null && Number(security.knownShares) > 0
  const headingId = `group-security-${security.symbol.replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="font-medium">
        {security.symbol}
      </h3>
      <p>
        {shares(security.shares)} shares valued at <strong>{dollars(security.value)}</strong> across{' '}
        {security.accountCount} {security.accountCount === 1 ? 'account' : 'accounts'}.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-ink-muted">Known purchase cost</dt>
        <dd className="normal-nums">
          {security.knownCost === null ? NOT_AVAILABLE : dollars(security.knownCost)}
          {security.knownCost !== null && <> for {shares(security.knownShares)} shares</>}
        </dd>
        <dt className="text-ink-muted">Known gain</dt>
        <dd className="normal-nums">
          {security.knownGain === null ? NOT_AVAILABLE : dollars(security.knownGain)}
          {security.knownGain !== null && <> for {shares(security.knownShares)} shares</>}
        </dd>
        <dt className="text-ink-muted">Full purchase cost</dt>
        <dd className="normal-nums">
          {security.cost === null ? NOT_AVAILABLE : dollars(security.cost)}
        </dd>
        <dt className="text-ink-muted">Full gain</dt>
        <dd className="normal-nums">
          {security.gain === null ? NOT_AVAILABLE : dollars(security.gain)}
        </dd>
        <dt className="text-ink-muted">Known-cost share coverage</dt>
        <dd className="normal-nums">{security.coverage}</dd>
      </dl>
      {partly && (
        <p className="max-w-prose text-sm">
          Full purchase cost and full gain say {NOT_AVAILABLE} because{' '}
          {shares(String(Number(security.shares) - Number(security.knownShares)))} shares have
          unknown cost.
        </p>
      )}
      {security.shareOfBalance !== null && (
        <p className="max-w-prose text-sm">
          {security.symbol} is {security.shareOfBalance} of the investment Balance of{' '}
          {dollars(total)}. That is a different measure from the known-cost share coverage above.
        </p>
      )}
      <ul
        aria-label={`${security.symbol} by account`}
        className="divide-y divide-line border-y border-line"
      >
        {security.positions.map((position) => (
          <PositionLine key={position.accountId} position={position} />
        ))}
      </ul>
    </section>
  )
}

/**
 * The holdings of the whole investment group (slice 19c, HOLDINGS_002): every completed investment account once
 * (archived and closed ones labeled), the group's Balance total, and one security at a time added up across the
 * accounts. A price belongs to a holding, so the same symbol can stand at different prices in different accounts.
 * This is a separate view from one account's holdings, and its figures are never added to anything else.
 */
export function InvestmentGroupPage() {
  const group = useInvestmentGroup()
  const [picked, setPicked] = useState('')
  const securities = [...(group.data?.securities ?? [])].sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  )
  const selected = securities.find((s) => s.symbol === picked) ?? securities[0]
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Investment holdings"
        description="Every completed investment account once, and each security across them."
      />
      {group.isPending && <p className="text-ink-muted">Loading the investment holdings</p>}
      {group.isError && <FormAlert message={group.error.message} />}
      {group.data && (
        <>
          {securities.length > 0 && selected && (
            <Card aria-label="Selected security">
              <CardTitle className="text-lg">Securities</CardTitle>
              <div className="mt-2 flex max-w-xs flex-col gap-1 text-sm">
                <label htmlFor="security-chooser">Choose a security</label>
                <select
                  id="security-chooser"
                  value={selected.symbol}
                  onChange={(event) => setPicked(event.target.value)}
                  className="rounded-control border border-line bg-surface px-3 py-2"
                >
                  {securities.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4">
                <SecurityDetail security={selected} total={group.data.total} />
              </div>
            </Card>
          )}
          <Card aria-label="All investment accounts summary">
            <CardTitle className="text-lg">All investment accounts</CardTitle>
            {group.data.accounts.length === 0 ? (
              <p className="mt-2 text-ink-muted">No completed investment accounts</p>
            ) : (
              <>
                <p className="mt-2">
                  Investment Balance <Amount value={Number(group.data.total)} />
                </p>
                <ul
                  aria-label="Investment accounts"
                  className="mt-2 divide-y divide-line border-y border-line"
                >
                  {group.data.accounts.map((account) => (
                    <AccountLine key={account.accountId} account={account} />
                  ))}
                </ul>
              </>
            )}
          </Card>
          {group.data.accounts.length > 0 && securities.length === 0 && (
            <p className="text-ink-muted">No holdings are recorded in these accounts.</p>
          )}
        </>
      )}
    </div>
  )
}
