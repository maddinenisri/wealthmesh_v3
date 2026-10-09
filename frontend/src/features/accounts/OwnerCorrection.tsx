import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import type { Account, OwnerReview } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, buttonStyles, FormAlert } from '../../design-system'
import { useCorrectOwners, useReviewOwnerCorrection } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { typeNoun, typeTraits } from './accountTypes'
import { OwnerChoices, type OwnerValues } from './AccountForms'
import { balanceText } from './cardBalance'
import { memberLabel } from './ownerNames'

/** The chosen owner takes focus, else the first choice: the form is back, focus is not left on the body. */
function focusOwner(form: HTMLFormElement | null) {
  const choice =
    form?.querySelector<HTMLInputElement>('input:checked') ??
    form?.querySelector<HTMLInputElement>('input')
  choice?.focus()
}

/** "Maya", "Maya and Sam": names as the review and the history say them. */
const andList = (names: string[]) => names.join(' and ')

/** What stays the same, in the type's own words: an investment account keeps its cash, holdings and Balance. */
function keeps(account: Account, done = false): string {
  const traits = typeTraits(account.type)
  const figure = balanceText(account.type, account.balance.amount)
  return traits.plan
    ? `Its plan value of ${figure} ${done ? 'is unchanged' : 'stays the same'}.`
    : `Its cash, holdings and Balance of ${figure} ${done ? 'are unchanged' : 'stay the same'}.`
}

/**
 * The sentence the account page opens with after the correction (Q-064): who owns it now, who stays in its history and
 * that no money moved. Plain words, the same shape as the plain Edit's sentence.
 */
function ownerSentence(account: Account, review: OwnerReview): string {
  const traits = typeTraits(account.type)
  const label = traits.plan ? 'Participant' : review.to.length > 1 ? 'Owners' : 'Owner'
  const now = andList(review.to.map((owner) => owner.name))
  const before = andList(review.from.map((owner) => owner.name))
  return `${account.name} was updated. ${label} ${label === 'Owners' ? 'are' : 'is'} now ${now}. ${before} ${review.from.length > 1 ? 'stay' : 'stays'} in its history. ${keeps(account, true)}`
}

/**
 * The reviewed owner correction (slice 18c): choose the owner, read the review, Confirm. It changes who owns the
 * account and nothing else. A refusal the server would make at Confirm is made in the review as well.
 */
export function OwnerCorrectionForm({ account, members }: { account: Account; members: Member[] }) {
  const navigate = useNavigate()
  const traits = typeTraits(account.type)
  const review = useReviewOwnerCorrection(account.id)
  const correct = useCorrectOwners(account.id)
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<{ values: string[]; result: OwnerReview } | null>(null)
  const [memberMissing, setMemberMissing] = useState(false)
  const root = useRef<HTMLFormElement>(null)
  // An account that was joint before the one-owner rule starts with nobody chosen: it needs one named member.
  const start =
    traits.singleOwner && account.ownerMemberIds.length > 1 ? [] : account.ownerMemberIds
  const { control, handleSubmit } = useForm<OwnerValues>({
    defaultValues: { ownerMemberIds: start },
  })
  useEffect(() => focusOwner(root.current), [])
  const refusal = review.error?.message ?? correct.error?.message
  // A new choice makes an earlier refusal out of date.
  const chosen = useWatch({ control, name: 'ownerMemberIds' })
  const chosenKey = chosen.join()
  useEffect(() => {
    review.reset()
    // Only a different choice clears it; `review` is a new object each render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey])
  // A refusal takes focus, so it is read where the person is, not left above the fold.
  useEffect(() => {
    if (refusal) document.getElementById('owner-refusal')?.focus({ preventScroll: false })
  }, [refusal])
  const word = traits.plan ? 'participant' : traits.singleOwner ? 'owner' : 'owners'

  const onReview = handleSubmit((values) => {
    if (!member) {
      setMemberMissing(true)
      // The chooser is where the answer is: focus it, not the Review button.
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLElement>('[data-entered-by] select, [data-entered-by] button')
          ?.focus(),
      )
      return
    }
    setMemberMissing(false)
    review.mutate(
      { ownerMemberIds: values.ownerMemberIds, enteredByMemberId: member.id },
      { onSuccess: (result) => setReviewing({ values: values.ownerMemberIds, result }) },
    )
  })

  if (reviewing) {
    const { result } = reviewing
    const from = andList(result.from.map((owner) => owner.name))
    const to = andList(result.to.map((owner) => owner.name))
    return (
      <Panel>
        <section aria-labelledby="owner-review-heading" className="flex max-w-md flex-col gap-3">
          <h2 id="owner-review-heading" className="text-lg font-semibold">
            Review {word} change
          </h2>
          <div id="owner-refusal" tabIndex={-1} className="outline-none">
            <FormAlert message={correct.error?.message} />
          </div>
          <p>
            {account.name} {traits.plan ? 'participant' : 'owner'} changes from {from} to {to}.
          </p>
          <p className="text-sm text-ink-muted">
            {keeps(account)} No income or spending is recorded, and the history keeps {from} as the
            previous {traits.plan ? 'participant' : 'owner'}
            {result.from.length > 1 ? 's' : ''}. Everyone in the household can still see the
            account.
            {member && ` Entered by: ${memberLabel(member)}.`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={correct.isPending || !member}
              onClick={() =>
                correct.mutate(
                  { ownerMemberIds: reviewing.values, enteredByMemberId: member?.id },
                  {
                    onSuccess: () =>
                      navigate(`/accounts/${account.id}`, {
                        state: { updated: ownerSentence(account, result) },
                      }),
                  },
                )
              }
            >
              {correct.isPending ? 'Saving' : 'Confirm'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setReviewing(null)
                correct.reset()
                // The form is back; its first choice takes focus, not the body.
                requestAnimationFrame(() => focusOwner(root.current))
              }}
            >
              Back
            </Button>
            <Link
              to={`/accounts/${account.id}`}
              state={{ returned: true }}
              className={buttonStyles({ variant: 'ghost' })}
            >
              Cancel
            </Link>
          </div>
        </section>
      </Panel>
    )
  }

  return (
    <form ref={root} onSubmit={onReview} noValidate className="flex max-w-md flex-col gap-4">
      <div id="owner-refusal" tabIndex={-1} className="outline-none">
        <FormAlert message={refusal} />
      </div>
      <OwnerChoices
        members={members}
        control={control}
        type={account.type}
        current={account.ownerMemberIds}
      />
      <div data-entered-by>
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        {memberMissing && !member && (
          <p role="alert" className="mt-1 text-sm text-negative">
            Choose who is changing the {typeNoun(account.type)}&apos;s {word}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={review.isPending}>
          {review.isPending ? 'Checking' : 'Review'}
        </Button>
        <Link
          to={`/accounts/${account.id}`}
          state={{ returned: true }}
          className={buttonStyles({ variant: 'ghost' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
