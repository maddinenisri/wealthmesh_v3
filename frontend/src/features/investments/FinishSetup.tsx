import { useEffect, useState } from 'react'
import { useForm, type Control, type UseFormSetFocus } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { OpeningPreview, OpeningView } from '../../api/investments'
import { Button, FormAlert } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useFinishSetup, usePreviewOpening } from '../../hooks/useInvestments'
import type { Member } from '../../api/household'
import { formatMoney } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { OpeningFields } from './OpeningFields'
import { OpeningReview } from './OpeningReview'
import { toOpening, type OpeningValues } from './openingForm'

/** What a draft kept, as form values: a cash never answered stays blank. */
function valuesOf(opening: OpeningView): OpeningValues {
  return {
    total: opening.total ?? '',
    cash: opening.cash ?? '',
    holdings: opening.holdings.map((line) => ({
      symbol: line.symbol,
      quantity: line.quantity,
      price: line.price,
      valueOn: line.valueOn,
    })),
  }
}

/**
 * Finish setup of a draft (V2_BROKERAGE_003, T8): the components again, reviewed by the server, then saved. The
 * account becomes active when cash is answered and any typed total matches; until then it stays a draft. Cancel and
 * Back save nothing; each exit says what changed (the caller shows the sentence and moves focus).
 */
export function FinishSetup({
  account,
  opening,
  members,
  today,
  onDone,
}: {
  account: Account
  opening: OpeningView
  members: Member[]
  today: string
  /** `message` is the sentence to show; it is absent when nothing changed (Cancel). */
  onDone: (message?: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const preview = usePreviewOpening()
  const finish = useFinishSetup(account.id, member?.id ?? '')
  const [review, setReview] = useState<{ values: OpeningValues; result: OpeningPreview } | null>(
    null,
  )
  // A refusal from the server has no field: bring it into view where the person is looking.
  const refusal = preview.error?.message
  useEffect(() => {
    if (refusal) document.querySelector('[role="alert"]')?.scrollIntoView?.({ block: 'center' })
  }, [refusal])
  const { control, handleSubmit, setFocus } = useForm<OpeningValues>({
    defaultValues: valuesOf(opening),
  })

  const request = (values: OpeningValues) => ({
    type: account.type,
    name: account.name,
    institution: account.institution ?? '',
    ownerMemberIds: account.ownerMemberIds,
    openedOn: account.openedOn,
    openingBalance: null,
    opening: toOpening(values, account.openedOn),
  })
  const onSubmit = handleSubmit(async (values) => {
    preview.reset()
    finish.reset()
    const result = await preview
      .mutateAsync({ account: request(values), accountId: account.id })
      .catch(() => null)
    if (result) setReview({ values, result })
  })
  const confirm = async (values: OpeningValues) => {
    if (!member) return
    const saved = await finish.mutateAsync(request(values).opening).catch(() => null)
    if (!saved) return
    onDone(
      saved.status === 'active'
        ? `${saved.name} is set up with a Balance of ${formatMoney(Number(saved.balance.amount))} as of ${saved.balance.asOf}. It now counts in household wealth.`
        : `${saved.name} is still a draft: the opening cash is needed to finish. It adds nothing to household wealth.`,
    )
  }

  if (review) {
    const { values, result } = review
    const stillDraft = result.state === 'draft'
    return (
      <Panel key="review">
        <OpeningReview
          heading={`Review finishing ${account.name}`}
          name={account.name}
          openedOn={account.openedOn}
          preview={result}
          blank={false}
          details={
            <>
              {stillDraft &&
                'The opening cash is not answered, so saving keeps the draft and adds nothing to household wealth. '}
              Owners and institution stay as they are.
            </>
          }
          error={finish.error?.message}
          pending={finish.isPending}
          confirmLabel={stillDraft ? 'Save draft' : 'Confirm'}
          onConfirm={() => void confirm(values)}
          onBack={() => {
            finish.reset()
            setReview(null)
            requestAnimationFrame(() => setFocus('total'))
          }}
          cancel={
            <Button type="button" variant="ghost" onClick={() => onDone()}>
              Cancel
            </Button>
          }
        />
        <div className="mt-3 max-w-xl">
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        </div>
      </Panel>
    )
  }

  return (
    <Panel key="form">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="finish-setup-heading"
        className="flex max-w-md flex-col gap-4"
      >
        <h2 id="finish-setup-heading" tabIndex={-1} className="text-lg font-semibold outline-none">
          Finish setup of {account.name}
        </h2>
        <FormAlert message={preview.error?.message} />
        <p className="text-sm text-ink-muted">
          Setup date {account.openedOn}. Answer the opening cash to complete the account.
        </p>
        <OpeningFields
          control={control as Control<OpeningValues>}
          setFocus={setFocus as UseFormSetFocus<OpeningValues>}
          setupOn={() => account.openedOn}
          today={today}
          finishing
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={preview.isPending}>
            {preview.isPending ? 'Checking' : 'Review'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  )
}
