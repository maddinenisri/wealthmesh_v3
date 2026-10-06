import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES, mockApi, type MockAccount, type MockActivity } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = {
  id: '33333333-3333-4333-8333-333333333333',
  householdId: household.id,
  name: 'Sam',
  label: null,
}
const everyday: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-01-01',
  openingAmount: '50000.00',
  balance: { amount: '50000.00', asOf: '2026-01-01' },
  status: 'active',
}

const SPENDING: [string, string][] = [
  ['Rent', '1500.00'],
  ['Utilities', '180.00'],
  ['Insurance', '700.00'],
  ['Groceries', '600.00'],
  ['Dining', '380.00'],
  ['Travel', '300.00'],
]

/** The mock ships fewer seeded categories than the server: add the two the Budget scenarios name. */
function addCategories() {
  CATEGORIES.push(
    {
      id: 'c0000000-0000-4000-8000-0000000000a1',
      name: 'Insurance',
      kind: 'spending',
      defaultClass: 'essential',
    },
    {
      id: 'c0000000-0000-4000-8000-0000000000a2',
      name: 'Travel',
      kind: 'spending',
      defaultClass: 'discretionary',
    },
  )
}

const idOf = (name: string) => CATEGORIES.find((c) => c.name === name)!.id

function september(): MockActivity[] {
  return SPENDING.map(([name, amount], index) => ({
    id: `e${index}`,
    accountId: everyday.id,
    kind: 'expense',
    amount,
    occurredOn: `2026-09-0${index + 2}`,
    description: name,
    categoryId: idOf(name),
    enteredByMemberId: maya.id,
  }))
}

async function openSeptember(user: ReturnType<typeof renderRoute>['user'], month = '2026-09') {
  fireEvent.change(await screen.findByLabelText('Month'), { target: { value: month } })
  return user
}

async function fill(user: ReturnType<typeof renderRoute>['user'], label: string, value: string) {
  const field = await screen.findByLabelText(label)
  await user.clear(field)
  await user.type(field, value)
}

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

describe('Budget on the Spending page', () => {
  it('V2_BUDGET_001 builds a September Budget, reviews it, and compares it with spending', async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.activity.push(...september())
    const { user } = renderRoute('/spending')
    await openSeptember(user)

    expect(await screen.findByText('No Budget for September')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create Budget' }))
    await fill(user, 'Total Budget', '3600')
    for (const [name, target] of [
      ['Rent', '1500'],
      ['Utilities', '180'],
      ['Insurance', '700'],
      ['Groceries', '600'],
      ['Dining', '350'],
      ['Travel', '270'],
    ])
      await fill(user, `${name} target`, target)
    await user.click(screen.getByRole('button', { name: 'Review Budget' }))

    const review = await screen.findByRole('region', { name: 'Review September 2026 Budget' })
    expect(within(review).getByText('Category targets total')).toBeInTheDocument()
    expect(within(review).getAllByText('$3,600.00').length).toBeGreaterThan(1)
    expect(state.budgets).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Confirm saving the Budget' }))
    expect(await screen.findByRole('status')).toHaveTextContent('$60.00 over Budget')
    const table = await screen.findByRole('table', { name: 'Budget by category' })
    expect(
      within(within(table).getByText('Dining').closest('tr')!).getByText('$30.00 over target'),
    ).toBeInTheDocument()
    expect(
      within(within(table).getByText('Travel').closest('tr')!).getByText('$30.00 over target'),
    ).toBeInTheDocument()
    // Opening a category shows the expenses behind its spending.
    await user.click(within(table).getByRole('button', { name: 'Dining' }))
    const behind = await screen.findByRole('table', { name: 'Expenses behind this Budget line' })
    expect(behind).toHaveTextContent('$380.00')
  })

  it('V2_BUDGET_002 explains the gap, labels Travel No target set, and closes the gap with a target', async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.activity.push(...september())
    state.budgets.push({
      id: 'b1',
      month: '2026-09',
      total: '3600.00',
      targets: ['Rent', 'Utilities', 'Insurance', 'Groceries']
        .map((name, i) => ({
          categoryId: idOf(name),
          amount: ['1500.00', '180.00', '700.00', '600.00'][i],
        }))
        .concat([{ categoryId: idOf('Dining'), amount: '350.00' }]),
    })
    const { user } = renderRoute('/spending')
    await openSeptember(user)

    expect(
      await screen.findByText(/\$270\.00 of the total Budget has no category target/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Category targets total \$3,330\.00/)).toBeInTheDocument()
    const travel = within(await screen.findByRole('table', { name: 'Budget by category' }))
      .getByText('Travel')
      .closest('tr')!
    expect(within(travel).getByText('No target set')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Budget' }))
    await fill(user, 'Travel target', '270')
    await user.click(screen.getByRole('button', { name: 'Review Budget' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm saving the Budget' }))
    expect(await screen.findByText(/Category targets total \$3,600\.00/)).toBeInTheDocument()
    expect(
      within(
        within(screen.getByRole('table', { name: 'Budget by category' }))
          .getByText('Travel')
          .closest('tr')!,
      ).getByText('$30.00 over target'),
    ).toBeInTheDocument()
    expect(state.activity.find((a) => a.description === 'Travel')!.amount).toBe('300.00')
  })

  it('V2_BUDGET_003 reviews a target change against the total, and Cancel keeps the saved Budget', async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.activity.push(...september())
    state.budgets.push({
      id: 'b1',
      month: '2026-09',
      total: '3600.00',
      targets: [
        ['Rent', '1500.00'],
        ['Utilities', '180.00'],
        ['Insurance', '700.00'],
        ['Groceries', '600.00'],
        ['Dining', '350.00'],
        ['Travel', '270.00'],
      ].map(([name, amount]) => ({ categoryId: idOf(name), amount })),
    })
    const { user } = renderRoute('/spending')
    await openSeptember(user)

    await user.click(await screen.findByRole('button', { name: 'Edit Budget' }))
    await fill(user, 'Groceries target', '650')
    await user.click(screen.getByRole('button', { name: 'Review Budget' }))
    const review = await screen.findByRole('region', { name: 'Review September 2026 Budget' })
    expect(within(review).getByText('$3,650.00')).toBeInTheDocument()
    expect(within(review).getByText('Difference').nextSibling).toHaveTextContent('$50.00')
    expect(within(review).getByText(/\$50\.00 more than the total Budget/)).toBeInTheDocument()

    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(state.budgets[0].targets.find((t) => t.categoryId === idOf('Groceries'))!.amount).toBe(
      '600.00',
    )
    expect(state.budgets[0].total).toBe('3600.00')

    await user.click(screen.getByRole('button', { name: 'Edit Budget' }))
    await fill(user, 'Groceries target', '650')
    await fill(user, 'Total Budget', '3650')
    await user.click(screen.getByRole('button', { name: 'Review Budget' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm saving the Budget' }))
    expect(
      await screen.findByText(/Category targets and the total Budget agree/),
    ).toBeInTheDocument()
    const groceries = within(screen.getByRole('table', { name: 'Budget by category' }))
      .getByText('Groceries')
      .closest('tr')!
    expect(within(groceries).getByText('$50.00 left to target')).toBeInTheDocument()
    expect(groceries).toHaveTextContent('$600.00')
  })

  it('V2_BUDGET_007 refuses a negative target on the field and keeps the saved target', async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.budgets.push({
      id: 'b1',
      month: '2026-09',
      total: '1000.00',
      targets: [{ categoryId: idOf('Groceries'), amount: '600.00' }],
    })
    const { user } = renderRoute('/spending')
    await openSeptember(user)

    await user.click(await screen.findByRole('button', { name: 'Edit Budget' }))
    await fill(user, 'Groceries target', '-50')
    await user.click(screen.getByRole('button', { name: 'Review Budget' }))
    expect(await screen.findByText('Enter zero or a positive amount')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: /Review September 2026 Budget/ }),
    ).not.toBeInTheDocument()
    expect(state.budgets[0].targets[0].amount).toBe('600.00')

    await fill(user, 'Groceries target', '650')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(state.budgets[0].targets[0].amount).toBe('600.00')
  })

  it('V2_BUDGET_005 shows a zero target without a percentage', async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.activity.push({
      id: 'sub',
      accountId: everyday.id,
      kind: 'expense',
      amount: '50.00',
      occurredOn: '2026-09-04',
      description: 'Streaming',
      categoryId: idOf('Groceries'),
      enteredByMemberId: maya.id,
    })
    state.budgets.push({
      id: 'b1',
      month: '2026-09',
      total: '1000.00',
      targets: [
        { categoryId: idOf('Groceries'), amount: '0.00' },
        { categoryId: idOf('Dining'), amount: '0.00' },
      ],
    })
    const { user } = renderRoute('/spending')
    await openSeptember(user)

    const table = await screen.findByRole('table', { name: 'Budget by category' })
    const groceries = within(table).getByText('Groceries').closest('tr')!
    expect(within(groceries).getByText('$50.00 unplanned spending')).toBeInTheDocument()
    expect(within(groceries).getAllByText(/Not applicable/).length).toBeGreaterThan(0)
    const dining = within(table).getByText('Dining').closest('tr')!
    expect(within(dining).getByText('No spending')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'Dining' }))
    expect(await screen.findByText('No recorded expenses.')).toBeInTheDocument()
  })
})

describe('Budget in the month review', () => {
  it("V2_MONTHLY_003 explains spending over September's Budget without using October's", async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.activity.push(...september())
    state.budgets.push(
      { id: 'b1', month: '2026-09', total: '3600.00', targets: [] },
      { id: 'b2', month: '2026-10', total: '4000.00', targets: [] },
    )
    const { user } = renderRoute('/spending')
    await openSeptember(user)

    const review = await screen.findByRole('region', { name: 'Month review' })
    expect(await within(review).findByText(/September Budget \$3,600\.00/)).toBeInTheDocument()
    expect(review).toHaveTextContent('$60.00 over Budget')
    expect(review).toHaveTextContent('Category details')
    expect(review).not.toHaveTextContent('$4,000.00')
  })
})

describe('Copy a Budget', () => {
  it('V2_BUDGET_004 copies September targets into October without copying expenses', async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.activity.push(...september())
    state.budgets.push({
      id: 'b1',
      month: '2026-09',
      total: '3600.00',
      targets: [
        ['Rent', '1500.00'],
        ['Utilities', '180.00'],
        ['Insurance', '700.00'],
        ['Groceries', '600.00'],
        ['Dining', '350.00'],
        ['Travel', '270.00'],
      ].map(([name, amount]) => ({ categoryId: idOf(name), amount })),
    })
    const { user } = renderRoute('/spending')

    expect(await screen.findByText('No Budget for October')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Copy September Budget' }))
    const review = await screen.findByRole('region', {
      name: 'Review copying a Budget into October',
    })
    expect(await within(review).findByText(/September total of \$3,600\.00/)).toBeInTheDocument()
    expect(review).toHaveTextContent('No expenses are copied')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(state.budgets).toHaveLength(1)

    await user.click(await screen.findByRole('button', { name: 'Copy September Budget' }))
    await user.click(
      await screen.findByRole('button', { name: 'Confirm copying the September Budget' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'October has the $3,600.00 Budget and the same category targets. October spending is $0.00.',
    )
    expect(state.budgets).toHaveLength(2)
    expect(state.budgets[0].total).toBe('3600.00')
    expect(state.activity).toHaveLength(6)
  })
})

describe('Remove and Undo a Budget', () => {
  it('V2_BUDGET_006 removes a Budget with spending untouched, and Undo brings its targets back', async () => {
    const state = mockApi({ household, members: [maya, sam], accounts: [everyday], activity: [] })
    addCategories()
    state.activity.push(...september())
    state.budgets.push({
      id: 'b1',
      month: '2026-09',
      total: '3600.00',
      targets: [{ categoryId: idOf('Dining'), amount: '350.00' }],
    })
    const { user } = renderRoute('/spending')
    await openSeptember(user)

    await user.click(await screen.findByRole('button', { name: 'Remove Budget' }))
    const review = await screen.findByRole('region', {
      name: 'Review removing the September Budget',
    })
    expect(review).toHaveTextContent('no expense and no account Balance changes')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(state.budgets[0].removed).toBeFalsy()
    expect(
      within(screen.getByRole('region', { name: 'Budget' })).getByText(/\$60\.00 over Budget/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Budget' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm removing the Budget' }))
    expect(await screen.findByText('No Budget for September')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Spending stays $3,660.00')
    expect(state.budgets[0].removed).toBe(true)
    expect(state.activity).toHaveLength(6)
    expect(screen.getByText(/Removed by Maya/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo removing the Budget' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm Undo' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The September Budget is back with its category targets: $60.00 over Budget.',
    )
    expect(state.budgets[0].removed).toBe(false)
    const dining = within(await screen.findByRole('table', { name: 'Budget by category' }))
      .getByText('Dining')
      .closest('tr')!
    expect(dining).toHaveTextContent('$350.00')
  })
})
