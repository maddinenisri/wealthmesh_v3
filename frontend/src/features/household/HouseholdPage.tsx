import { useState, type ReactNode } from 'react'
import type { Household } from '../../api/household'
import { Link, useSearchParams } from 'react-router'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  Select,
  buttonStyles,
} from '../../design-system'
import type { Account } from '../../api/accounts'
import type { WealthLine } from '../../api/wealth'
import { useAccounts } from '../../hooks/useAccounts'
import { useWealth } from '../../hooks/useWealth'
import { accountTypeLabel, isDebt, typeTraits } from '../accounts/accountTypes'
import { BalanceFigure } from '../accounts/BalanceFigure'
import { cardSide, isCard } from '../accounts/cardBalance'
import { STATUS_LABEL } from '../accounts/statusLabel'
import { OlderPricesNote } from './OlderPricesNote'
import { memberLabel, ownerNames } from '../accounts/ownerNames'
import { useAccountContext } from '../accounts/useAccountContext'
import { CreateHouseholdForm, RenameHouseholdForm } from './HouseholdForms'
import { MembersCard } from './MembersCard'
import { accountsIn, alsoIn, overlapText, viewAccounts, viewSentence } from './wealthGroups'
import { WealthOverTime } from './WealthOverTime'
import { useHousehold } from '../../hooks/useHousehold'
import { useMembers } from '../../hooks/useMembers'

export function HouseholdPage() {
  const household = useHousehold()
  const members = useMembers(household.data?.id)
  // The person whose accounts are shown is in the address (`?view=`), so a reload and Back keep it (MEMBERS_002).
  const [search, setSearch] = useSearchParams()
  const viewId = search.get('view') ?? ''
  const viewed = members.data?.find((member) => member.id === viewId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Household"
        description="The people in your household and the name it goes by."
      />
      {household.isPending && <p className="text-ink-muted">Loading household</p>}
      {household.isMissing && (
        <Card>
          <CardTitle>Create your household</CardTitle>
          <p className="mb-4 mt-1 max-w-prose text-sm text-ink-muted">
            Give it a name. You can add the people in it next.
          </p>
          <CreateHouseholdForm />
        </Card>
      )}
      {household.isError && !household.isMissing && (
        <EmptyState
          title="Could not load the household"
          description={household.error.message}
          action={<Button onClick={() => void household.refetch()}>Try again</Button>}
        />
      )}
      {household.data && (
        <>
          <HouseholdDetails household={household.data} />
          <AccountsAndWealth
            viewId={viewed ? viewId : ''}
            onView={(memberId) =>
              setSearch(memberId ? { view: memberId } : {}, {
                replace: true,
                preventScrollReset: true,
              })
            }
          />
          <WealthOverTime person={viewed?.name} />
          {members.isError ? (
            <EmptyState
              title="Could not load members"
              description={members.error.message}
              action={<Button onClick={() => void members.refetch()}>Try again</Button>}
            />
          ) : (
            <MembersCard householdId={household.data.id} members={members.data} />
          )}
        </>
      )}
    </div>
  )
}

function HouseholdDetails({ household }: { household: Household }) {
  const [renaming, setRenaming] = useState(false)

  return (
    <Card aria-label="Household details">
      {renaming ? (
        <RenameHouseholdForm household={household} onDone={() => setRenaming(false)} />
      ) : (
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{household.name}</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>
            Rename household
          </Button>
        </div>
      )}
    </Card>
  )
}

/** Household-level money: financial assets and debts, with the accounts behind them. */
function AccountsAndWealth({
  viewId,
  onView,
}: {
  viewId: string
  onView: (memberId: string) => void
}) {
  const accounts = useAccounts()
  const { members } = useAccountContext()
  const wealth = useWealth(undefined, true, viewId || undefined)
  const person = members?.find((member) => member.id === viewId)
  // A draft investment account counts nothing; it is offered under Finish setup (HOLDINGS_001). In a person's view
  // only the drafts that person owns are offered.
  const investmentDrafts = (accounts.data ?? []).filter(
    (account) =>
      account.status === 'draft' &&
      typeTraits(account.type).kind === 'investment' &&
      (!viewId || account.ownerMemberIds.includes(viewId)),
  )
  // The people who can be chosen: everyone who owns an account (an inactive owner stays, labeled).
  const choices = (members ?? []).filter(
    (member) =>
      member.active || (accounts.data ?? []).some((a) => a.ownerMemberIds.includes(member.id)),
  )
  const lines = wealth.data ? viewAccounts(wealth.data) : []
  const jointNames = lines
    .filter(
      (line) =>
        ((accounts.data ?? []).find((a) => a.id === line.accountId)?.ownerMemberIds.length ?? 0) >
        1,
    )
    .map((line) => line.name)

  return (
    <Card aria-labelledby="wealth-heading">
      <div className="flex items-center justify-between gap-4">
        <CardTitle id="wealth-heading">Accounts and wealth</CardTitle>
        <Link to="/accounts/new" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
          Add account
        </Link>
      </div>
      {wealth.isError && (
        <p role="alert" className="mt-3">
          {wealth.error.message}
        </p>
      )}
      {choices.length > 1 && (
        <div className="mt-3 max-w-xs">
          <Select label="View" value={viewId} onChange={(event) => onView(event.target.value)}>
            <option value="">Whole household</option>
            {choices.map((member) => (
              <option key={member.id} value={member.id}>
                {memberLabel(member)}
              </option>
            ))}
          </Select>
        </div>
      )}
      {wealth.data && (
        <p role="status" className="mt-2 max-w-prose text-sm text-ink-muted">
          {viewSentence(person ? memberLabel(person) : null, lines, jointNames)}
        </p>
      )}
      {wealth.data && (
        <div className="mt-3 flex flex-col gap-1">
          <p>
            Financial assets <Amount value={Number(wealth.data.financialAssets)} />
          </p>
          <p>
            Debts <Amount value={Number(wealth.data.debts)} />
          </p>
          <p>
            Net worth <Amount value={Number(wealth.data.netWorth)} />
          </p>
          <OlderPricesNote wealth={wealth.data} />
        </div>
      )}
      {accounts.data?.length === 0 && (
        <p className="mt-3 text-ink-muted">No accounts have been added</p>
      )}
      {wealth.data && accounts.data && lines.length > 0 && (
        <section aria-labelledby="view-accounts-heading" className="mt-4">
          <h3 id="view-accounts-heading" className="font-medium">
            Accounts in this view
          </h3>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {lines.map((line) => (
              <li key={line.accountId} className="flex items-baseline justify-between gap-4 py-2">
                <span>
                  <Link to={`/accounts/${line.accountId}`} className="underline">
                    {line.name}
                  </Link>{' '}
                  {line.status !== 'active' && (
                    <>
                      <Badge>{STATUS_LABEL[line.status] ?? line.status}</Badge>{' '}
                    </>
                  )}
                  <span className="text-sm text-ink-muted">
                    {accountTypeLabel(line.type)} ·{' '}
                    {ownerNames(
                      accounts.data.find((a) => a.id === line.accountId)?.ownerMemberIds ?? [],
                      members,
                    )}
                  </span>
                </span>
                <span className="text-right whitespace-nowrap">
                  <BalanceFigure type={line.type} amount={line.balance} overdraft={false} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {wealth.data && lines.length === 0 && accounts.data && accounts.data.length > 0 && (
        <p className="mt-3 text-ink-muted">
          {person ? `${memberLabel(person)} has no accounts yet` : 'No accounts are counted yet'}
        </p>
      )}
      {accounts.data && accounts.data.length > 0 && (
        <>
          <AccountGroup
            id="bank-money-heading"
            title="Bank money"
            total={wealth.data?.bankMoney.total}
            accounts={accountsIn(accounts.data, wealth.data?.bankMoney)}
            members={members}
            note={
              wealth.data?.debtLines.some((line) => !isCard(line.type) && !isDebt(line.type))
                ? 'An overdrawn account shows its negative amount here and is counted once, as debt.'
                : undefined
            }
          />
          <AccountGroup
            id="cards-heading"
            title="Cards"
            card
            total={wealth.data?.cards.total}
            accounts={accountsIn(accounts.data, wealth.data?.cards)}
            members={members}
          />
          <AccountGroup
            id="loans-heading"
            title="Loans"
            card
            owed
            total={wealth.data?.loans.total}
            accounts={accountsIn(accounts.data, wealth.data?.loans)}
            members={members}
          />
          <AccountGroup
            id="mortgages-heading"
            title="Mortgages"
            card
            owed
            total={wealth.data?.mortgages.total}
            accounts={accountsIn(accounts.data, wealth.data?.mortgages)}
            members={members}
          />
          <AccountGroup
            id="investments-heading"
            title="Investments"
            groupKey="investments"
            total={wealth.data?.investments.total}
            accounts={accountsIn(accounts.data, wealth.data?.investments)}
            members={members}
            lines={wealth.data?.investments.accounts}
            showEmpty={investmentDrafts.length > 0}
            emptyText="No completed investment accounts"
            note={overlapText(wealth.data?.investments, 'investments', [
              'retirement',
              'healthSavings',
            ])}
            footer={
              <>
                {(wealth.data?.investments.accounts.length ?? 0) > 0 && (
                  <p className="mt-2 text-sm">
                    <Link to="/investments" className="underline underline-offset-2">
                      See investment holdings by security
                    </Link>
                  </p>
                )}
                <FinishSetup drafts={investmentDrafts} members={members} />
              </>
            }
          />
          <AccountGroup
            id="retirement-heading"
            title="Retirement"
            groupKey="retirement"
            total={wealth.data?.retirement.total}
            accounts={accountsIn(accounts.data, wealth.data?.retirement)}
            members={members}
            lines={wealth.data?.retirement.accounts}
            note={[
              wealth.data?.retirement.accounts.some((line) => line.type === 'defined_benefit')
                ? 'A plan-reported benefit value is counted here once. It is not personal investment cash or holdings, and it is not added to wealth again.'
                : undefined,
              overlapText(wealth.data?.retirement, 'retirement', ['investments']),
            ]
              .filter(Boolean)
              .join(' ')}
          />
          <AccountGroup
            id="health-savings-heading"
            title="Health savings"
            groupKey="healthSavings"
            total={wealth.data?.healthSavings.total}
            accounts={accountsIn(accounts.data, wealth.data?.healthSavings)}
            members={members}
            lines={wealth.data?.healthSavings.accounts}
            note="A health savings account is shown here and in Investments. It is not added to Retirement or Bank money, and this total is not added again to wealth."
          />
          <AccountGroup
            id="property-heading"
            title="Property and other assets"
            total={wealth.data?.propertyAndOther.total}
            accounts={accountsIn(accounts.data, wealth.data?.propertyAndOther)}
            members={members}
            lines={wealth.data?.propertyAndOther.accounts}
          />
          {wealth.data && wealth.data.debtLines.length > 0 && (
            <section aria-labelledby="debt-heading" className="mt-4">
              <h3 id="debt-heading" className="font-medium">
                What makes up debts
              </h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {wealth.data.debtLines.map((line) => (
                  <li
                    key={line.accountId}
                    className="flex items-baseline justify-between gap-4 py-2"
                  >
                    <span>
                      {line.name}{' '}
                      {line.status !== 'active' && (
                        <Badge>{STATUS_LABEL[line.status] ?? line.status}</Badge>
                      )}
                    </span>
                    <span className="text-right whitespace-nowrap">
                      <Amount value={Math.abs(Number(line.balance))} />{' '}
                      <span className="text-sm text-ink-muted">
                        {isCard(line.type) || isDebt(line.type) ? 'owed' : 'overdrawn'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Card>
  )
}

/** One group of accounts (Bank money, Cards) with its total; archived and closed accounts stay, labeled. */
function AccountGroup({
  id,
  title,
  total,
  accounts,
  members,
  note,
  lines,
  groupKey,
  showEmpty = false,
  emptyText,
  footer,
  card = false,
  owed = false,
}: {
  id: string
  title: string
  /** The server's name for the group: another group that lists an account is shown as "Also in …". */
  groupKey?: string
  /** Show the group with an empty sentence when it has no accounts (an Investments group with only drafts). */
  showEmpty?: boolean
  emptyText?: string
  footer?: ReactNode
  total: string | undefined
  accounts: Account[]
  members: Parameters<typeof ownerNames>[1]
  note?: string
  /** What the wealth read says about each account: the date of a valued account's value and whether it is old. */
  lines?: WealthLine[]
  /** A card group reads "owed" or "Card credit", never a minus sign. */
  card?: boolean
  /** A loan group is always owed: its total never reads as Card credit. */
  owed?: boolean
}) {
  if (accounts.length === 0 && !showEmpty) return null
  return (
    <section aria-labelledby={id} className="mt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id={id} className="font-medium">
          {title}
        </h3>
        {total !== undefined &&
          accounts.length > 0 &&
          (card ? (
            <span className="whitespace-nowrap">
              <Amount value={Math.abs(Number(total))} />{' '}
              <span className="text-sm text-ink-muted">{owed ? 'owed' : cardSide(total)}</span>
            </span>
          ) : (
            <Amount value={Number(total)} />
          ))}
      </div>
      {note && <p className="text-sm text-ink-muted">{note}</p>}
      {accounts.length === 0 && emptyText && <p className="mt-2 text-ink-muted">{emptyText}</p>}
      {accounts.length > 0 && (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-baseline justify-between gap-4 py-3">
              <span>
                <Link
                  to={`/accounts/${account.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {account.name}
                </Link>{' '}
                <span className="text-sm text-ink-muted">{accountTypeLabel(account.type)}</span>{' '}
                {account.status !== 'active' && (
                  <Badge>{STATUS_LABEL[account.status] ?? account.status}</Badge>
                )}{' '}
                <span aria-hidden className="text-sm text-ink-muted">
                  ·
                </span>{' '}
                <span className="text-sm text-ink-muted">
                  {ownerNames(account.ownerMemberIds, members)}
                </span>
                {groupKey &&
                  alsoIn(
                    lines?.find((line) => line.accountId === account.id),
                    groupKey,
                  ).length > 0 && (
                    <span className="block text-sm text-ink-muted">
                      Also in{' '}
                      {alsoIn(
                        lines?.find((line) => line.accountId === account.id),
                        groupKey,
                      ).join(' and ')}
                    </span>
                  )}
              </span>
              <span className="text-right">
                <BalanceFigure type={account.type} amount={account.balance.amount} />
                {typeTraits(account.type).kind === 'investment' && (
                  // One date phrase per account: the date its prices were last updated, or the Balance date while
                  // it has no holdings (slice 19b; the generic "Value dated" below is for manually valued accounts).
                  <span className="block text-sm text-ink-muted">
                    {lines?.find((line) => line.accountId === account.id)?.valueDate
                      ? 'Prices last updated'
                      : 'Balance dated'}{' '}
                    <span className="whitespace-nowrap">
                      {lines?.find((line) => line.accountId === account.id)?.valueDate ??
                        account.balance.asOf}
                    </span>
                  </span>
                )}
                {typeTraits(account.type).kind !== 'investment' &&
                  lines?.find((line) => line.accountId === account.id)?.valueDate && (
                    <span className="block text-sm text-ink-muted">
                      {account.type === 'defined_benefit' ? 'As of' : 'Value dated'}{' '}
                      <span className="whitespace-nowrap">
                        {lines.find((line) => line.accountId === account.id)?.valueDate}
                      </span>{' '}
                      {lines.find((line) => line.accountId === account.id)?.stale && (
                        <Badge>Older value</Badge>
                      )}
                    </span>
                  )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </section>
  )
}

/** Drafts of investment accounts: counted nowhere, and finished from their own page (HOLDINGS_001). */
function FinishSetup({
  drafts,
  members,
}: {
  drafts: Account[]
  members: Parameters<typeof ownerNames>[1]
}) {
  if (drafts.length === 0) return null
  return (
    <section aria-label="Finish setup" className="mt-3">
      <h4 className="text-sm font-medium">Finish setup</h4>
      <p className="text-sm text-ink-muted">
        A draft is not counted in wealth until it is finished.
      </p>
      <ul className="mt-1 text-sm">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <Link to={`/accounts/${draft.id}`} className="underline underline-offset-2">
              {draft.name}
            </Link>{' '}
            <span className="text-ink-muted">
              {accountTypeLabel(draft.type)} · {ownerNames(draft.ownerMemberIds, members)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
