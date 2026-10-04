import { useState } from 'react'
import type { Household, Member } from '../../api/household'
import { Link } from 'react-router'
import {
  Amount,
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  buttonStyles,
} from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { useWealth } from '../../hooks/useWealth'
import { OverdrawnLabel } from '../accounts/Overdrawn'
import { ownerNames } from '../accounts/ownerNames'
import { useAccountContext } from '../accounts/useAccountContext'
import { CreateHouseholdForm, MemberForm, RenameHouseholdForm } from './HouseholdForms'
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
          {members.isError ? (
            <EmptyState
              title="Could not load members"
              description={members.error.message}
              action={<Button onClick={() => void members.refetch()}>Try again</Button>}
            />
          ) : (
            <Members householdId={household.data.id} members={members.data} />
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

/** `members` is undefined while the list is still loading. */
function Members({ householdId, members }: { householdId: string; members: Member[] | undefined }) {
  const [editingId, setEditingId] = useState<string>()

  return (
    <Card aria-labelledby="members-heading">
      <CardTitle id="members-heading">Members</CardTitle>
      <p className="mb-4 mt-1 max-w-prose text-sm text-ink-muted">
        Members are names you attach to account ownership. They do not sign in.
      </p>

      {members === undefined ? (
        <p className="mb-6 text-sm text-ink-muted">Loading members</p>
      ) : members.length === 0 ? (
        <p className="mb-6 text-sm text-ink-muted">No members yet. Add the first person below.</p>
      ) : (
        <ul className="mb-6 divide-y divide-line border-y border-line">
          {members.map((member) => (
            <li key={member.id} className="py-3">
              {editingId === member.id ? (
                <MemberForm
                  householdId={householdId}
                  member={member}
                  onDone={() => setEditingId(undefined)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} />
                  <span className="flex-1">{member.name}</span>
                  {member.label && <Badge>{member.label}</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(member.id)}
                    aria-label={`Edit member ${member.name}${member.label ? ` ${member.label}` : ''}`}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-3 font-medium">Add member</h3>
      <MemberForm householdId={householdId} />
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
            Financial assets <Amount value={Number(wealth.data.financialAssets)} size="lg" />
          </p>
          <p>
            Debts <Amount value={Number(wealth.data.debts)} size="lg" />
          </p>
        </div>
      )}
      {accounts.data?.length === 0 && (
        <p className="mt-3 text-ink-muted">No accounts have been added</p>
      )}
      {accounts.data && accounts.data.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {accounts.data.map((account) => (
            <li key={account.id} className="flex items-baseline justify-between gap-4 py-3">
              <span>
                <Link
                  to={`/accounts/${account.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {account.name}
                </Link>{' '}
                <span className="text-sm text-ink-muted">
                  {ownerNames(account.ownerMemberIds, members)}
                </span>
              </span>
              <span className="text-right">
                <Amount value={Number(account.balance.amount)} />
                <OverdrawnLabel balance={account.balance.amount} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
