import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES, mockApi, type MockActivity, type MockAccount } from '../../test/mockApi'
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
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
}
const [, , groceries, , dining] = CATEGORIES

const expense = (
  id: string,
  amount: string,
  categoryId: string,
  classification: string,
): MockActivity => ({
  id,
  accountId: everyday.id,
  kind: 'expense',
  amount,
  occurredOn: '2026-09-10',
  description: `Expense ${id.slice(-1)}`,
  categoryId,
  classification,
  enteredByMemberId: maya.id,
})

const seed = (activity: MockActivity[] = []) => ({
  household,
  members: [maya, sam],
  accounts: [{ ...everyday }],
  activity,
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

type User = ReturnType<typeof renderRoute>['user']

const row = (name: string) =>
  within(screen.getByRole('list', { name: 'Spending categories' }))
    .getByText(name, { selector: 'span.font-medium' })
    .closest('li')!

async function loaded(user: User) {
  await screen.findByRole('list', { name: 'Spending categories' })
  await within(screen.getByRole('list', { name: 'Spending categories' })).findByText('Rent')
  return user
}

const posts = (api: ReturnType<typeof mockApi>) => api.requests.filter((r) => r.startsWith('POST'))

describe('change a category default', () => {
  it('V2_CATEGORIES_002 Cancel changes nothing; confirming Essential keeps the saved Discretionary expense', async () => {
    const api = mockApi(
      seed([expense('55555555-5555-4555-8555-555555555551', '50.00', dining.id, 'discretionary')]),
    )
    const { user } = renderRoute('/categories')
    await loaded(user)

    await user.click(screen.getByRole('button', { name: 'Change default of Dining' }))
    await user.selectOptions(await screen.findByLabelText('Default class'), 'Essential')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = screen.getByRole('region', { name: /Review: change default of dining/i })
    expect(review).toHaveTextContent('New expenses in Dining will start as Essential')
    expect(review).toHaveTextContent('Saved entries keep the class they were saved with')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(posts(api)).toEqual([])
    expect(row('Dining')).toHaveTextContent('Default: Discretionary')

    await user.click(screen.getByRole('button', { name: 'Change default of Dining' }))
    await user.selectOptions(await screen.findByLabelText('Default class'), 'Essential')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: 'Confirm change' }))
    await within(row('Dining')).findByText('Default: Essential')
    expect(api.activity[0]).toMatchObject({ classification: 'discretionary', amount: '50.00' })
  })
})

describe('rename a category', () => {
  it('V2_CATEGORIES_003 reviews the rename, keeps the entries and records the earlier name in history (D-041)', async () => {
    mockApi(
      seed([
        expense('55555555-5555-4555-8555-555555555551', '75.00', groceries.id, 'essential'),
        expense('55555555-5555-4555-8555-555555555552', '50.00', groceries.id, 'essential'),
      ]),
    )
    const { user } = renderRoute('/categories')
    await loaded(user)
    await user.click(screen.getByRole('button', { name: 'Rename Groceries' }))
    const field = await screen.findByLabelText('New name')
    await user.clear(field)
    await user.type(field, 'Food shopping')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = screen.getByRole('region', { name: /Review: rename groceries/i })
    expect(review).toHaveTextContent('Rename Groceries to Food shopping')
    await within(review).findByText(/2 entries totalling \$125\.00/)
    expect(review).toHaveTextContent('Account balances and total spending do not change')
    await user.click(screen.getByRole('button', { name: 'Confirm change' }))

    await within(screen.getByRole('list', { name: 'Spending categories' })).findByText(
      'Food shopping',
    )
    await waitFor(() => expect(row('Food shopping')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'History of Food shopping' }))
    const history = await screen.findByRole('list', { name: 'History of Food shopping' })
    expect(
      await within(history).findByText(/Renamed from Groceries to Food shopping by Maya/),
    ).toBeInTheDocument()
  })
})

describe('merge categories', () => {
  it('V2_CATEGORIES_004 reviews two expenses totalling $125.00, merges, and Undo brings both back', async () => {
    const api = mockApi(
      seed([
        expense('55555555-5555-4555-8555-555555555551', '50.00', dining.id, 'discretionary'),
        expense(
          '55555555-5555-4555-8555-555555555552',
          '75.00',
          'c0000000-0000-4000-8000-0000000000aa',
          'discretionary',
        ),
      ]),
    )
    CATEGORIES.push({
      id: 'c0000000-0000-4000-8000-0000000000aa',
      name: 'Restaurants',
      kind: 'spending',
      defaultClass: 'discretionary',
    })
    const { user } = renderRoute('/categories')
    await loaded(user)

    await user.click(screen.getByRole('button', { name: 'Merge categories' }))
    const panel = await screen.findByRole('region', { name: 'Merge categories' })
    await user.click(within(panel).getByRole('checkbox', { name: 'Dining' }))
    await user.click(within(panel).getByRole('checkbox', { name: 'Restaurants' }))
    await user.type(within(panel).getByLabelText('New category name'), 'Eating out')
    await user.click(within(panel).getByRole('button', { name: 'Review' }))
    const review = screen.getByRole('region', { name: 'Review merge' })
    await within(review).findByText(/2 entries totalling \$125\.00/)
    expect(review).toHaveTextContent('Merge Dining and Restaurants into Eating out')
    await user.click(within(review).getByRole('button', { name: 'Confirm merge' }))

    const list = screen.getByRole('list', { name: 'Spending categories' })
    await within(list)
      .findByText('Merged into Eating out', {}, { timeout: 3000 })
      .catch(() => undefined)
    expect(await screen.findAllByText(/Merged into Eating out/)).toHaveLength(2)
    expect(api.activity).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Undo merge of Dining and Restaurants' }))
    const undo = screen.getByRole('region', { name: /Review: undo merge into Eating out/i })
    expect(undo).toHaveTextContent('Dining and Restaurants will come back with their own entries')
    await user.click(within(undo).getByRole('button', { name: 'Confirm undo' }))
    await within(list).findByRole('button', { name: 'Archive Dining' })
    expect(screen.queryByText(/Merged into Eating out/)).toBeNull()
    expect(posts(api)).toHaveLength(2)
  })

  it('V2_CATEGORIES_004 Cancel in the merge review saves nothing', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/categories')
    await loaded(user)
    await user.click(screen.getByRole('button', { name: 'Merge categories' }))
    const panel = await screen.findByRole('region', { name: 'Merge categories' })
    await user.click(within(panel).getByRole('button', { name: 'Review' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Choose the categories to merge',
    )
    await user.click(within(panel).getByRole('checkbox', { name: 'Dining' }))
    await user.type(within(panel).getByLabelText('New category name'), 'Eating out')
    await user.click(within(panel).getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(posts(api)).toEqual([])
  })
})

describe('archive and restore a category', () => {
  it('V2_CATEGORIES_005 archives Travel with $300.00 kept, offers Restore, and the money-out chooser leaves it out', async () => {
    CATEGORIES.length = 0
    const api = mockApi(seed())
    CATEGORIES.push({
      id: 'c0000000-0000-4000-8000-0000000000bb',
      name: 'Travel',
      kind: 'spending',
      defaultClass: 'discretionary',
    })
    api.activity.push(
      expense(
        '55555555-5555-4555-8555-555555555551',
        '300.00',
        'c0000000-0000-4000-8000-0000000000bb',
        'discretionary',
      ),
    )
    const { user } = renderRoute('/categories')
    await screen.findByText('Travel')
    await user.click(screen.getByRole('button', { name: 'Archive Travel' }))
    const review = await screen.findByRole('region', { name: /Review: archive travel/i })
    await within(review).findByText(/1 entry totalling \$300\.00/)
    expect(review).toHaveTextContent('no longer be offered for new entries')
    await user.click(within(review).getByRole('button', { name: 'Confirm archive' }))

    expect(await screen.findByText('Archived')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore Travel' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm restore' }))
    await screen.findByRole('button', { name: 'Archive Travel' })
    expect(screen.queryByText('Archived')).toBeNull()
    expect(
      api.requests.filter((r) => r.includes('/archive') || r.includes('/restore')),
    ).toHaveLength(2)
  })
})
