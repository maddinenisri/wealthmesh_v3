import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Category, CategoryEvent } from '../../api/activity'
import { ApiError } from '../../api/client'
import type { Member } from '../../api/household'
import {
  Button,
  Card,
  CardTitle,
  FormAlert,
  PageHeader,
  SelectField,
  TextField,
} from '../../design-system'
import { useCategories, useCategoryHistory, useCreateCategory } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useAccountContext } from '../accounts/useAccountContext'
import { classText } from '../activity/classes'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { useReturnFocus } from '../activity/useReturnFocus'
import { ArchiveCategory, EditCategory, MergeCategories, UndoMerge } from './CategoryChange'

/** The panel that is open above the lists: add, a change to one category, a merge or an Undo of one. */
type PanelState =
  | { kind: 'add' }
  | { kind: 'rename' | 'default-class' | 'archive' | 'restore'; category: Category }
  | { kind: 'merge' }
  | { kind: 'undo'; mergeId: string; names: string[]; targetName: string }

/** The household's categories: add, change a default, rename, merge with Undo, archive and restore. */
export function CategoriesPage() {
  const { members } = useAccountContext()
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const remember = useReturnFocus(panel !== null)
  const open = (next: PanelState, id?: string) => {
    remember()
    setFocusId(id ?? null)
    setPanel(next)
  }
  // The button that opened a panel can be replaced by the change (Archive becomes Restore): fall back to the row.
  const close = () => {
    setPanel(null)
    if (focusId) {
      requestAnimationFrame(() => {
        if (document.activeElement === document.body || !document.activeElement?.isConnected)
          document.getElementById(`category-${focusId}`)?.focus()
      })
    }
  }
  const key = panel ? JSON.stringify(panel) : 'none'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description="Names for spending and income, and the class each spending category starts with."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => open({ kind: 'add' })} disabled={panel !== null || !members}>
              Add category
            </Button>
            <Button
              variant="secondary"
              onClick={() => open({ kind: 'merge' })}
              disabled={panel !== null || !members}
            >
              Merge categories
            </Button>
          </div>
        }
      />
      {panel && members && (
        <Panel key={key}>
          {panel.kind === 'add' && <AddCategory members={members} onDone={close} />}
          {panel.kind === 'merge' && <MergeCategories members={members} onDone={close} />}
          {(panel.kind === 'rename' || panel.kind === 'default-class') && (
            <EditCategory
              mode={panel.kind}
              category={panel.category}
              members={members}
              onDone={close}
            />
          )}
          {(panel.kind === 'archive' || panel.kind === 'restore') && (
            <ArchiveCategory
              mode={panel.kind}
              category={panel.category}
              members={members}
              onDone={close}
            />
          )}
          {panel.kind === 'undo' && (
            <UndoMerge
              mergeId={panel.mergeId}
              names={panel.names}
              targetName={panel.targetName}
              members={members}
              onDone={close}
            />
          )}
        </Panel>
      )}
      <CategoryList kind="expense" title="Spending categories" open={open} busy={panel !== null} />
      <CategoryList kind="income" title="Income categories" open={open} busy={panel !== null} />
    </div>
  )
}

function CategoryList({
  kind,
  title,
  open,
  busy,
}: {
  kind: 'expense' | 'income'
  title: string
  open: (panel: PanelState, id?: string) => void
  busy: boolean
}) {
  const categories = useCategories(kind, true)
  const id = `${kind}-categories-heading`
  const all = categories.data ?? []
  // Sources of each live merge, listed under the category they were merged into so each can be Undone.
  const mergesInto = (targetId: string) => {
    const sources = all.filter((c) => c.mergedIntoId === targetId)
    const groups = new Map<string, Category[]>()
    sources.forEach((c) => groups.set(c.mergeId!, [...(groups.get(c.mergeId!) ?? []), c]))
    return [...groups]
  }
  return (
    <Card aria-labelledby={id}>
      <CardTitle id={id} className="text-lg">
        {title}
      </CardTitle>
      {categories.isPending && <p className="mt-3 text-sm text-ink-muted">Loading</p>}
      {categories.isError && (
        <p role="alert" className="mt-3">
          {categories.error.message}
        </p>
      )}
      {categories.data && (
        <ul aria-label={title} className="mt-3 flex flex-col gap-3">
          {categories.data.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              kind={kind}
              target={all.find((c) => c.id === category.mergedIntoId)}
              merges={mergesInto(category.id)}
              open={open}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function CategoryRow({
  category,
  kind,
  target,
  merges,
  open,
  busy,
}: {
  category: Category
  kind: 'expense' | 'income'
  target: Category | undefined
  merges: [string, Category[]][]
  open: (panel: PanelState, id?: string) => void
  busy: boolean
}) {
  const [showHistory, setShowHistory] = useState(false)
  const history = useCategoryHistory(showHistory ? category.id : null)
  const merged = category.mergedIntoId !== null
  return (
    <li
      id={`category-${category.id}`}
      tabIndex={-1}
      className="rounded-control outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="[overflow-wrap:anywhere]">
        <span className="font-medium">{category.name}</span>
        {kind === 'expense' && !category.archived && (
          <span className="ml-2 text-sm text-ink-muted">
            Default: {category.defaultClass ? classText(category.defaultClass) : 'none'}
          </span>
        )}
        {merged && (
          <span className="ml-2 text-sm text-ink-muted">
            Merged into {target?.name ?? 'another category'}
          </span>
        )}
        {category.archived && !merged && (
          <span className="ml-2 text-sm text-ink-muted">Archived</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {!merged && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Rename ${category.name}`}
            disabled={busy}
            onClick={() => open({ kind: 'rename', category }, category.id)}
          >
            Rename
          </Button>
        )}
        {kind === 'expense' && !category.archived && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Change default of ${category.name}`}
            disabled={busy}
            onClick={() => open({ kind: 'default-class', category }, category.id)}
          >
            Change default
          </Button>
        )}
        {!category.archived && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Archive ${category.name}`}
            disabled={busy}
            onClick={() => open({ kind: 'archive', category }, category.id)}
          >
            Archive
          </Button>
        )}
        {category.archived && !merged && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Restore ${category.name}`}
            disabled={busy}
            onClick={() => open({ kind: 'restore', category }, category.id)}
          >
            Restore
          </Button>
        )}
        {merges.map(([mergeId, sources]) => (
          <Button
            key={mergeId}
            variant="ghost"
            size="sm"
            aria-label={`Undo merge of ${sources.map((c) => c.name).join(' and ')}`}
            disabled={busy}
            onClick={() =>
              open(
                {
                  kind: 'undo',
                  mergeId,
                  names: sources.map((c) => c.name),
                  targetName: category.name,
                },
                category.id,
              )
            }
          >
            Undo merge of {sources.map((c) => c.name).join(' and ')}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`History of ${category.name}`}
          aria-expanded={showHistory}
          onClick={() => setShowHistory((now) => !now)}
        >
          {showHistory ? 'Hide history' : 'History'}
        </Button>
      </div>
      {showHistory && (
        <ul aria-label={`History of ${category.name}`} className="mt-1 text-sm text-ink-muted">
          {history.isPending && <li>Loading</li>}
          {history.data?.length === 0 && <li>No changes yet.</li>}
          {history.data?.map((event, index) => (
            <li key={index} className="[overflow-wrap:anywhere]">
              {eventText(event)} by {event.byName}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

const EVENT_WORDS: Record<string, string> = {
  created: 'Created',
  archived: 'Archived',
  restored: 'Restored',
  merge_undone: 'Merge undone',
}

function eventText(event: CategoryEvent): string {
  if (event.action === 'renamed') return `Renamed from ${event.oldName} to ${event.newName}`
  if (event.action === 'default_changed') return `Default changed: ${event.detail}`
  if (event.action === 'merged') return event.detail ?? 'Merged'
  return EVENT_WORDS[event.action] ?? event.action
}

type Values = { name: string; kind: 'spending' | 'income'; defaultClass: string }

function AddCategory({ members, onDone }: { members: Member[]; onDone: () => void }) {
  const create = useCreateCategory()
  const spending = useCategories('expense')
  const income = useCategories('income')
  const { member, setMemberId } = useEnteringAs(members)
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: { name: '', kind: 'spending', defaultClass: '' },
  })
  const kind = useWatch({ control, name: 'kind' })
  const name = useWatch({ control, name: 'name' })
  // A duplicate answers 409: point at the category that already has the name instead of leaving a dead end.
  const existing =
    create.error instanceof ApiError && create.error.status === 409
      ? [...(spending.data ?? []), ...(income.data ?? [])].find(
          (category: Category) =>
            category.kind === kind && category.name.toLowerCase() === name.trim().toLowerCase(),
        )
      : undefined

  return (
    <Card aria-labelledby="add-category-heading">
      <CardTitle id="add-category-heading" className="text-lg">
        Add category
      </CardTitle>
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) => {
          if (!member) return
          create.mutate(
            {
              name: values.name.trim(),
              kind: values.kind,
              ...(values.kind === 'spending' && values.defaultClass
                ? { defaultClass: values.defaultClass as 'essential' | 'discretionary' }
                : {}),
              enteredByMemberId: member.id,
            },
            { onSuccess: onDone },
          )
        })}
      >
        <FormAlert message={create.error?.message} />
        {existing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const row = document.getElementById(`category-${existing.id}`)
              row?.scrollIntoView?.({ block: 'center' })
              row?.focus()
            }}
          >
            Go to {existing.name}
          </Button>
        )}
        <TextField
          control={control}
          name="name"
          label="Name"
          rules={{ validate: (value) => value.trim() !== '' || 'Enter a category name' }}
        />
        <SelectField control={control} name="kind" label="Kind">
          <option value="spending">Spending</option>
          <option value="income">Income</option>
        </SelectField>
        {kind === 'spending' && (
          <SelectField control={control} name="defaultClass" label="Default class">
            <option value="">No default</option>
            <option value="essential">Essential</option>
            <option value="discretionary">Discretionary</option>
          </SelectField>
        )}
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending || !member}>
            {create.isPending ? 'Saving' : 'Save category'}
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={create.isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
