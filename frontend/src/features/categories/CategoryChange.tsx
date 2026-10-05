import { useEffect, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { getCategoryUsage, type Category } from '../../api/activity'
import type { Member } from '../../api/household'
import {
  Button,
  Card,
  CardTitle,
  FormAlert,
  Select,
  SelectField,
  TextField,
} from '../../design-system'
import {
  useCategories,
  useCategoryUsage,
  useChangeCategory,
  useMergeCategories,
  useUndoMerge,
} from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney } from '../../lib/money'
import { CLASS_LABEL } from '../activity/classes'
import { EnteredBy } from '../activity/EnteredBy'

/** The review replaces the form inside the same panel: bring its heading into view and focus it. */
function useRevealReview(reviewing: boolean, headingId: string) {
  useEffect(() => {
    if (!reviewing) return
    const heading = document.getElementById(headingId)
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [reviewing, headingId])
}

const entriesText = (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`

/** Confirm, Back and Cancel under a review, with who is making the change (D-025). */
function ReviewActions({
  members,
  pending,
  onConfirm,
  onBack,
  onCancel,
  confirmLabel,
}: {
  members: Member[]
  pending: boolean
  onConfirm: (memberId: string) => void
  onBack?: () => void
  onCancel: () => void
  confirmLabel: string
}) {
  const { member, setMemberId } = useEnteringAs(members)
  return (
    <>
      <EnteredBy members={members} member={member} setMemberId={setMemberId} />
      <div className="mt-4 flex gap-2">
        <Button onClick={() => member && onConfirm(member.id)} disabled={pending || !member}>
          {pending ? 'Saving' : confirmLabel}
        </Button>
        {onBack && (
          <Button variant="secondary" onClick={onBack} disabled={pending}>
            Back
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </>
  )
}

/** What a category holds today, as a phrase for a review: "3 entries totalling $210.00" or "no entries yet". */
function Holds({ id }: { id: string }) {
  const usage = useCategoryUsage(id)
  if (!usage.data) return <>its entries</>
  if (usage.data.entries === 0) return <>no entries yet</>
  return (
    <>
      {entriesText(usage.data.entries)} totalling {formatMoney(Number(usage.data.total))}
    </>
  )
}

/** Rename and change of default: a field, then a review, then Confirm. */
export function EditCategory({
  mode,
  category,
  members,
  onDone,
}: {
  mode: 'rename' | 'default-class'
  category: Category
  members: Member[]
  onDone: (changed?: { id: string }) => void
}) {
  const rename = mode === 'rename'
  const change = useChangeCategory(category.id, mode)
  const [reviewing, setReviewing] = useState<{ name: string; defaultClass: string } | null>(null)
  const { control, handleSubmit } = useForm<{ name: string; defaultClass: string }>({
    defaultValues: { name: category.name, defaultClass: category.defaultClass ?? '' },
  })
  const heading = rename ? `Rename ${category.name}` : `Change default of ${category.name}`
  useRevealReview(reviewing !== null, 'change-category-heading')

  return (
    <Card aria-labelledby="change-category-heading">
      <CardTitle
        id="change-category-heading"
        tabIndex={-1}
        className="scroll-mt-10 text-lg outline-none"
      >
        {reviewing
          ? `Review: ${rename ? 'rename' : 'change default of'} ${category.name}`
          : heading}
      </CardTitle>
      {reviewing ? (
        <div className="mt-3 max-w-md">
          <FormAlert message={change.error?.message} />
          {rename ? (
            <p>
              Rename <strong>{category.name}</strong> to <strong>{reviewing.name}</strong>. It holds{' '}
              <Holds id={category.id} />; any entries follow the new name. Account balances and
              total spending do not change, and the earlier name stays in the category&apos;s
              history.
            </p>
          ) : (
            <p>
              New expenses in <strong>{category.name}</strong> will start as{' '}
              <strong>
                {reviewing.defaultClass ? CLASS_LABEL[reviewing.defaultClass] : 'no class'}
              </strong>
              . Saved entries keep the class they were saved with, and account balances do not
              change.
            </p>
          )}
          <ReviewActions
            members={members}
            pending={change.isPending}
            confirmLabel="Confirm change"
            onBack={() => setReviewing(null)}
            onCancel={() => onDone()}
            onConfirm={(memberId) =>
              change.mutate(
                rename
                  ? { name: reviewing.name, enteredByMemberId: memberId }
                  : { defaultClass: reviewing.defaultClass, enteredByMemberId: memberId },
                { onSuccess: (changed) => onDone(changed) },
              )
            }
          />
        </div>
      ) : (
        <form
          noValidate
          className="mt-3 flex max-w-md flex-col gap-4"
          onSubmit={handleSubmit((values) =>
            setReviewing({ name: values.name.trim(), defaultClass: values.defaultClass }),
          )}
        >
          {rename ? (
            <TextField
              control={control}
              name="name"
              label="New name"
              rules={{ validate: (value) => value.trim() !== '' || 'Enter a category name' }}
            />
          ) : (
            <SelectField control={control} name="defaultClass" label="Default class">
              <option value="">No default</option>
              <option value="essential">Essential</option>
              <option value="discretionary">Discretionary</option>
            </SelectField>
          )}
          <div className="flex gap-2">
            <Button type="submit">Review</Button>
            <Button variant="ghost" onClick={() => onDone()}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

/** Archive or restore: a review, then Confirm. */
export function ArchiveCategory({
  mode,
  category,
  members,
  onDone,
}: {
  mode: 'archive' | 'restore'
  category: Category
  members: Member[]
  onDone: (changed?: { id: string }) => void
}) {
  const change = useChangeCategory(category.id, mode)
  return (
    <Card aria-labelledby="change-category-heading">
      <CardTitle id="change-category-heading" className="text-lg">
        {mode === 'archive'
          ? `Review: archive ${category.name}`
          : `Review: restore ${category.name}`}
      </CardTitle>
      <div className="mt-3 max-w-md">
        <FormAlert message={change.error?.message} />
        {mode === 'archive' ? (
          <p>
            <strong>{category.name}</strong> will no longer be offered for new entries. It holds{' '}
            <Holds id={category.id} />; they stay in place, labelled archived. Spending and account
            balances do not change.
          </p>
        ) : (
          <p>
            <strong>{category.name}</strong> will be offered for new entries again. Old spending and
            account balances do not change.
          </p>
        )}
        <ReviewActions
          members={members}
          pending={change.isPending}
          confirmLabel={mode === 'archive' ? 'Confirm archive' : 'Confirm restore'}
          onCancel={() => onDone()}
          onConfirm={(memberId) =>
            change.mutate(
              { enteredByMemberId: memberId },
              { onSuccess: (changed) => onDone(changed) },
            )
          }
        />
      </div>
    </Card>
  )
}

type MergeValues = { target: string; newName: string }

/** Choose categories and where they go, review the entries that move, then Confirm. */
export function MergeCategories({
  members,
  onDone,
}: {
  members: Member[]
  onDone: (changed?: { id: string }) => void
}) {
  const merge = useMergeCategories()
  const spending = useCategories('expense')
  const income = useCategories('income')
  const [sources, setSources] = useState<string[]>([])
  const [reviewing, setReviewing] = useState<MergeValues | null>(null)
  const [kind, setKind] = useState<'spending' | 'income'>('spending')
  const { control, handleSubmit, setValue } = useForm<MergeValues>({
    defaultValues: { target: '', newName: '' },
  })
  const target = useWatch({ control, name: 'target' })
  const choices = (kind === 'spending' ? spending.data : income.data) ?? []
  const all = [...(spending.data ?? []), ...(income.data ?? [])]
  const named = (ids: string[]) => ids.map((id) => all.find((c) => c.id === id)?.name ?? '')
  const usages = useQueries({
    queries: sources.map((id) => ({
      queryKey: ['categories', 'usage', id],
      queryFn: () => getCategoryUsage(id),
      enabled: reviewing !== null,
      staleTime: 0,
    })),
  })
  const [problem, setProblem] = useState<string | null>(null)
  useRevealReview(reviewing !== null, 'merge-heading')

  const entries = usages.reduce((sum, u) => sum + (u.data?.entries ?? 0), 0)
  const total = usages.reduce((sum, u) => sum + Number(u.data?.total ?? 0), 0)
  const targetName = reviewing?.target
    ? (all.find((c) => c.id === reviewing.target)?.name ?? '')
    : (reviewing?.newName.trim() ?? '')

  return (
    <Card aria-labelledby="merge-heading">
      <CardTitle id="merge-heading" tabIndex={-1} className="scroll-mt-10 text-lg outline-none">
        {reviewing ? 'Review merge' : 'Merge categories'}
      </CardTitle>
      {reviewing ? (
        <div className="mt-3 max-w-md">
          <FormAlert message={merge.error?.message} />
          <p>
            Merge {named(sources).join(' and ')} into <strong>{targetName}</strong>. Together they
            hold{' '}
            {entries === 0
              ? 'no entries yet'
              : `${entriesText(entries)} totalling ${formatMoney(total)}`}
            . {targetName} will show them and open the same entries; their classes and account
            balances do not change. You can undo the merge.
          </p>
          <ReviewActions
            members={members}
            pending={merge.isPending}
            confirmLabel="Confirm merge"
            onBack={() => setReviewing(null)}
            onCancel={() => onDone()}
            onConfirm={(memberId) =>
              merge.mutate(
                {
                  sourceIds: sources,
                  enteredByMemberId: memberId,
                  ...(reviewing.target
                    ? { targetId: reviewing.target }
                    : { newName: reviewing.newName.trim() }),
                },
                { onSuccess: (result) => onDone(result.target) },
              )
            }
          />
        </div>
      ) : (
        <form
          noValidate
          className="mt-3 flex max-w-md flex-col gap-4"
          onSubmit={handleSubmit((values) => {
            if (sources.length === 0) return setProblem('Choose the categories to merge')
            if (!values.target && values.newName.trim() === '')
              return setProblem('Choose a category to merge into, or name a new one')
            setProblem(null)
            setReviewing(values)
          })}
        >
          <Select
            label="Kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as 'spending' | 'income')
              setSources([])
              setValue('target', '')
            }}
          >
            <option value="spending">Spending</option>
            <option value="income">Income</option>
          </Select>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">Categories to merge</legend>
            {choices.map((category) => (
              <label key={category.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sources.includes(category.id)}
                  onChange={(event) =>
                    setSources((now) =>
                      event.target.checked
                        ? [...now, category.id]
                        : now.filter((id) => id !== category.id),
                    )
                  }
                />
                {category.name}
              </label>
            ))}
          </fieldset>
          <SelectField control={control} name="target" label="Merge into">
            <option value="">A new category</option>
            {choices
              .filter((category) => !sources.includes(category.id))
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </SelectField>
          {!target && <TextField control={control} name="newName" label="New category name" />}
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit">Review</Button>
            <Button variant="ghost" onClick={() => onDone()}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

/** Undo one merge: the sources come back with their own entries. */
export function UndoMerge({
  mergeId,
  names,
  targetName,
  targetId,
  members,
  onDone,
}: {
  mergeId: string
  names: string[]
  targetName: string
  /** The category the sources were merged into: it is focused after the Undo. */
  targetId: string
  members: Member[]
  onDone: (changed?: { id: string }) => void
}) {
  const undo = useUndoMerge(mergeId)
  return (
    <Card aria-labelledby="change-category-heading">
      <CardTitle id="change-category-heading" className="text-lg">
        Review: undo merge into {targetName}
      </CardTitle>
      <div className="mt-3 max-w-md">
        <FormAlert message={undo.error?.message} />
        <p>
          {names.join(' and ')} will come back with their own entries, classes and amounts. Entries
          saved into <strong>{targetName}</strong> since the merge stay there. Spending stays the
          same and nothing is counted twice.
        </p>
        <ReviewActions
          members={members}
          pending={undo.isPending}
          confirmLabel="Confirm undo"
          onCancel={() => onDone()}
          onConfirm={(memberId) =>
            undo.mutate(memberId, { onSuccess: () => onDone({ id: targetId }) })
          }
        />
      </div>
    </Card>
  )
}
