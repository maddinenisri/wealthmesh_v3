import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Category } from '../../api/activity'
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
import { useCategories, useCreateCategory } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useAccountContext } from '../accounts/useAccountContext'
import { classText } from '../activity/classes'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { useReturnFocus } from '../activity/useReturnFocus'

/** The household's spending and income categories, and a form to add one (CATEGORIES_001, 007, 008). */
export function CategoriesPage() {
  const { members } = useAccountContext()
  const [adding, setAdding] = useState(false)
  const remember = useReturnFocus(adding)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description="Names for spending and income, and the class each spending category starts with."
        actions={
          <Button
            onClick={() => {
              remember()
              setAdding(true)
            }}
            disabled={adding || !members}
          >
            Add category
          </Button>
        }
      />
      {adding && members && (
        <Panel>
          <AddCategory members={members} onDone={() => setAdding(false)} />
        </Panel>
      )}
      <CategoryList kind="expense" title="Spending categories" />
      <CategoryList kind="income" title="Income categories" />
    </div>
  )
}

function CategoryList({ kind, title }: { kind: 'expense' | 'income'; title: string }) {
  const categories = useCategories(kind)
  const id = `${kind}-categories-heading`
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
        <ul aria-label={title} className="mt-3 flex flex-col gap-1">
          {categories.data.map((category) => (
            <li
              key={category.id}
              id={`category-${category.id}`}
              tabIndex={-1}
              className="rounded-control outline-none focus:ring-2 focus:ring-primary [overflow-wrap:anywhere]"
            >
              <span className="font-medium">{category.name}</span>
              {kind === 'expense' && (
                <span className="ml-2 text-sm text-ink-muted">
                  Default: {category.defaultClass ? classText(category.defaultClass) : 'none'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
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
