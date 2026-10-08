import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert } from '../../design-system'
import { useToday } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useDiscardDraft, useOpening } from '../../hooks/useInvestments'
import { formatMoney } from '../../lib/money'
import { useStateChangeFocus } from '../accounts/useStateChangeFocus'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { StatementsCard } from '../statements/StatementsCard'
import { FinishSetup } from './FinishSetup'
import { HoldingTable } from './OpeningReview'

const dollars = (text: string) => formatMoney(Number(text))

/** What the account was opened with: cash, holdings, the typed total and the statement its review used. */
function OpeningCard({ account }: { account: Account }) {
  const opening = useOpening(account.id)
  return (
    <Card aria-labelledby="opening-heading">
      <CardTitle id="opening-heading" tabIndex={-1} className="text-lg outline-none">
        Opening
      </CardTitle>
      {opening.isPending && <p className="mt-2 text-sm text-ink-muted">Loading the opening</p>}
      {opening.isError && <FormAlert message={opening.error.message} />}
      {opening.data && (
        <div className="mt-3 flex flex-col gap-3">
          {opening.data.noStartingAmount ? (
            <p className="text-sm">
              No starting amount was entered, so cash started at $0.00 on {account.openedOn} with no
              holdings. Nothing was recorded as a contribution, expense, price or purchase cost.
            </p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-ink-muted">Cash</dt>
              <dd className="normal-nums">
                {opening.data.cash === null ? 'Not answered yet' : dollars(opening.data.cash)}
              </dd>
              <dt className="text-ink-muted">Holdings</dt>
              <dd className="normal-nums">
                {opening.data.holdings.length === 0
                  ? 'None recorded'
                  : `${dollars(opening.data.holdingsValue)} in ${opening.data.holdings.length} ${
                      opening.data.holdings.length === 1 ? 'holding' : 'holdings'
                    }`}
              </dd>
              {opening.data.total !== null && (
                <>
                  <dt className="text-ink-muted">Opening total</dt>
                  <dd className="normal-nums">{dollars(opening.data.total)}</dd>
                </>
              )}
            </dl>
          )}
          <HoldingTable lines={opening.data.holdings} />
        </div>
      )}
    </Card>
  )
}

/**
 * The page of an investment account (slice 17): a draft says what it needs and offers Finish setup and Cancel
 * (a quick discard); a completed account shows what it was opened with and its supporting statements. There is no
 * activity yet (purchases, funding and prices come in later slices).
 */
export function InvestmentAccount({
  account,
  members,
  reviewsOpened = 0,
}: {
  account: Account
  members: Member[] | undefined
  /** Counts the reviews opened on the status card; the sentence the page arrived with goes when one opens. */
  reviewsOpened?: number
}) {
  const navigate = useNavigate()
  const arrived = (useLocation().state as { notice?: string } | null)?.notice
  const [finishing, setFinishing] = useState(false)
  const [asking, setAsking] = useState(false)
  const { message, statusRef, begin, changed, clear } = useStateChangeFocus(
    finishing || asking,
    arrived,
  )
  useEffect(() => {
    if (reviewsOpened > 0) clear()
    // `clear` is a fresh function each render; only a new review should run this.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsOpened])
  const today = useToday()
  const { member, setMemberId } = useEnteringAs(members)
  const discard = useDiscardDraft(account.id, member?.id ?? '')
  const opening = useOpening(account.id)
  const draft = account.status === 'draft'

  return (
    <>
      {finishing && opening.data && members && today.data && (
        <FinishSetup
          account={account}
          opening={opening.data}
          members={members}
          today={today.data}
          onDone={(sentence) => {
            setFinishing(false)
            if (sentence) changed(sentence)
          }}
        />
      )}
      {message && (
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="max-w-xl rounded-control border border-line p-3 text-sm outline-none"
        >
          {message}
        </p>
      )}
      {asking && (
        <Panel>
          <Card aria-labelledby="discard-heading">
            <CardTitle id="discard-heading" tabIndex={-1} className="text-lg outline-none">
              Cancel this draft?
            </CardTitle>
            <p className="mt-2 max-w-prose text-sm">
              {account.name} is removed from the list at once and cannot be brought back. Nothing
              was counted in household wealth, so wealth does not change.
            </p>
            <FormAlert message={discard.error?.message} />
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                disabled={discard.isPending || !member}
                onClick={() =>
                  discard.mutate(undefined, {
                    onSuccess: () =>
                      navigate('/accounts', { state: { discarded: { name: account.name } } }),
                  })
                }
              >
                {discard.isPending ? 'Discarding' : 'Discard draft'}
              </Button>
              <Button
                variant="ghost"
                disabled={discard.isPending}
                onClick={() => {
                  discard.reset()
                  setAsking(false)
                }}
              >
                Keep draft
              </Button>
            </div>
          </Card>
        </Panel>
      )}
      {draft && (
        <Card aria-labelledby="draft-heading">
          <CardTitle id="draft-heading" className="text-lg">
            Draft setup
          </CardTitle>
          <p className="mt-2 max-w-prose text-sm">
            {account.name} is a draft. Finish setup answers the opening cash and completes it;
            Cancel draft throws it away.
          </p>
          <FormAlert message={discard.error?.message} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={finishing || !opening.data || !today.data || !members}
              onClick={() => {
                begin()
                setFinishing(true)
              }}
            >
              Finish setup
            </Button>
            <Button
              variant="secondary"
              disabled={finishing || asking || !member}
              aria-describedby={member ? undefined : 'cancel-needs-member'}
              onClick={() => {
                begin()
                setAsking(true)
              }}
            >
              Cancel draft
            </Button>
          </div>
          {members && !member && (
            <>
              <p id="cancel-needs-member" className="mt-2 text-sm text-ink-muted">
                Choose who is entering to cancel this draft.
              </p>
              <EnteredBy members={members} member={member} setMemberId={setMemberId} />
            </>
          )}
        </Card>
      )}
      <OpeningCard account={account} />
      {!draft && (
        <StatementsCard
          accountId={account.id}
          accountType={account.type}
          balance={account.balance.amount}
          members={members}
          today={today.data}
          opening={opening.data}
        />
      )}
    </>
  )
}
