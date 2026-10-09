import { Link, useParams } from 'react-router'
import { Card, EmptyState, PageHeader, buttonStyles } from '../../design-system'
import { useAccount, useToday } from '../../hooks/useAccounts'
import { isDebt, isValued, typeTraits } from './accountTypes'
import { AccountEditForm, AccountSetupForm } from './AccountForms'
import { OwnerCorrectionForm } from './OwnerCorrection'
import { useAccountContext } from './useAccountContext'

function GoToHousehold() {
  return (
    <Link to="/" className={buttonStyles({})}>
      Go to household
    </Link>
  )
}

export function NewAccountPage() {
  const context = useAccountContext()
  const today = useToday()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add account"
        description="The starting amount is optional. Leave it blank to start at $0.00 on the date you choose below."
      />
      {(context.isPending || today.isPending) && !context.error && !today.error && (
        <p className="text-ink-muted">Loading</p>
      )}
      {(context.error ?? today.error) && (
        <EmptyState
          title="Could not load the form"
          description={(context.error ?? today.error)!.message}
        />
      )}
      {context.isMissing && (
        <EmptyState
          title="Create your household first"
          description="An account belongs to a household member. Create the household and add its members, then come back."
          action={<GoToHousehold />}
        />
      )}
      {context.members && !context.members.some((member) => member.active) && (
        <EmptyState
          title="Add a household member first"
          description="An account needs an active owner. Add the people in your household or restore a removed member, then come back."
          action={<GoToHousehold />}
        />
      )}
      {context.members?.some((member) => member.active) && today.data && (
        <Card>
          <AccountSetupForm members={context.members} today={today.data} />
        </Card>
      )}
    </div>
  )
}

export function EditAccountPage() {
  const { id = '' } = useParams()
  const account = useAccount(id)
  const context = useAccountContext()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Edit account"
        description={
          !account.data
            ? 'Change the name or owner.'
            : isValued(account.data.type)
              ? typeTraits(account.data.type).plan
                ? 'Change the name, institution or participant. The plan value is changed by a plan statement on the account, not here.'
                : 'Change the name or owner. Values are not changed here; record a new value on the account.'
              : isDebt(account.data.type)
                ? 'Change the name, lender or owner. The amount owed is changed by payments and reviewed corrections, not here.'
                : typeTraits(account.data.type).kind === 'investment'
                  ? 'Change the name or institution. The opening cash and holdings are not changed here, and a new owner is chosen with Change owner, which is reviewed first.'
                  : 'Change the name, owner or bank. Money is not changed here; use Update balance on the account.'
        }
      />
      {(account.isPending || context.isPending) && <p className="text-ink-muted">Loading</p>}
      {account.isError && (
        <EmptyState title="Could not load the account" description={account.error.message} />
      )}
      {account.data && context.members && (
        <Card>
          <AccountEditForm key={account.data.id} account={account.data} members={context.members} />
        </Card>
      )}
    </div>
  )
}

/** Change who owns an account that records its history (slice 18c): a reviewed correction, not a plain edit. */
export function OwnerCorrectionPage() {
  const { id = '' } = useParams()
  const account = useAccount(id)
  const context = useAccountContext()
  const traits = account.data ? typeTraits(account.data.type) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={traits?.plan ? 'Change participant' : 'Change owner'}
        description={
          traits?.plan
            ? 'Choose the one member who participates in this plan. The plan value does not change, and the history keeps the previous participant.'
            : 'Choose who owns this account. Cash, holdings and the Balance do not change, and the history keeps the previous owner.'
        }
      />
      {(account.isPending || context.isPending) && <p className="text-ink-muted">Loading</p>}
      {account.isError && (
        <EmptyState title="Could not load the account" description={account.error.message} />
      )}
      {account.data && traits && !traits.recordsCreator && (
        <EmptyState
          title="Owners are changed in Edit account"
          description="This account type changes who owns it in Edit account."
          action={
            <Link to={`/accounts/${account.data.id}/edit`} className={buttonStyles({})}>
              Edit account
            </Link>
          }
        />
      )}
      {account.data && traits?.recordsCreator && context.members && (
        <Card>
          <OwnerCorrectionForm
            key={account.data.id}
            account={account.data}
            members={context.members}
          />
        </Card>
      )}
    </div>
  )
}
