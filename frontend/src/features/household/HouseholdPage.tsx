import { useState } from 'react'
import type { Household } from '../../api/household'
import { Link } from 'react-router'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  buttonStyles,
} from '../../design-system'
import type { Account } from '../../api/accounts'
import type { WealthLine } from '../../api/wealth'
import { useAccounts } from '../../hooks/useAccounts'
import { useWealth } from '../../hooks/useWealth'
import { accountTypeLabel, isDebt, isValued } from '../accounts/accountTypes'
import { BalanceFigure } from '../accounts/BalanceFigure'
import { cardSide, isCard } from '../accounts/cardBalance'
import { STATUS_LABEL } from '../accounts/statusLabel'
import { ownerNames } from '../accounts/ownerNames'
import { useAccountContext } from '../accounts/useAccountContext'
import { CreateHouseholdForm, RenameHouseholdForm } from './HouseholdForms'
import { MembersCard } from './MembersCard'
import { WealthOverTime } from './WealthOverTime'
import { useHousehold } from '../../hooks/useHousehold'
import { useMembers } from '../../hooks/useMembers'

export function HouseholdPage() {
  const household = useHousehold()
  const members = useMembers(household.data?.id)

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
          <AccountsAndWealth />
          <WealthOverTime />
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
function AccountsAndWealth() {
  const accounts = useAccounts()
  const wealth = useWealth()
  const { members } = useAccountContext()

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
        </div>
      )}
      {accounts.data?.length === 0 && (
        <p className="mt-3 text-ink-muted">No accounts have been added</p>
      )}
      {accounts.data && accounts.data.length > 0 && (
        <>
          <AccountGroup
            id="bank-money-heading"
            title="Bank money"
            total={wealth.data?.bankMoney.total}
            accounts={accounts.data.filter(
              (account) =>
                !isCard(account.type) && !isValued(account.type) && !isDebt(account.type),
            )}
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
            accounts={accounts.data.filter((account) => isCard(account.type))}
            members={members}
          />
          <AccountGroup
            id="loans-heading"
            title="Loans"
            card
            owed
            total={wealth.data?.loans.total}
            accounts={accounts.data.filter((account) => isDebt(account.type))}
            members={members}
          />
          <AccountGroup
            id="property-heading"
            title="Property and other assets"
            total={wealth.data?.propertyAndOther.total}
            accounts={accounts.data.filter((account) => isValued(account.type))}
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
  card = false,
  owed = false,
}: {
  id: string
  title: string
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
  if (accounts.length === 0) return null
  return (
    <section aria-labelledby={id} className="mt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id={id} className="font-medium">
          {title}
        </h3>
        {total !== undefined &&
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
            </span>
            <span className="text-right">
              <BalanceFigure type={account.type} amount={account.balance.amount} />
              {lines?.find((line) => line.accountId === account.id)?.valueDate && (
                <span className="block text-sm text-ink-muted">
                  Value dated {lines.find((line) => line.accountId === account.id)?.valueDate}{' '}
                  {lines.find((line) => line.accountId === account.id)?.stale && (
                    <Badge>Older value</Badge>
                  )}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
