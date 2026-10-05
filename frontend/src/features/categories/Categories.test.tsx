import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES, mockApi, type MockAccount } from '../../test/mockApi'
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

const seed = () => ({ household, members: [maya, sam], accounts: [{ ...everyday }] })

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function enterAs(user: User, name: string) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), name)
}

async function addCategory(user: User, name: string, kind: 'Spending' | 'Income', cls?: string) {
  await user.click(await screen.findByRole('button', { name: 'Add category' }))
  const panel = await screen.findByRole('region', { name: 'Add category' })
  await user.type(within(panel).getByLabelText('Name'), name)
  await user.selectOptions(within(panel).getByLabelText('Kind'), kind)
  if (cls) await user.selectOptions(within(panel).getByLabelText('Default class'), cls)
  return panel
}

describe('category list and creation', () => {
  it('V2_CATEGORIES_001 creates a spending category with a default class and lists it (D-041: the create half)', async () => {
    const api = mockApi(seed())
    window.localStorage.setItem('wealthmesh.enteringAs', maya.id)
    const { user } = renderRoute('/categories')
    const panel = await addCategory(user, 'Pets', 'Spending', 'Essential')
    await user.click(within(panel).getByRole('button', { name: 'Save category' }))

    const list = await screen.findByRole('list', { name: 'Spending categories' })
    expect(await within(list).findByText('Pets')).toBeInTheDocument()
    expect(within(list).getByText('Pets').parentElement).toHaveTextContent('Default: Essential')
    expect(within(list).getByText('Groceries').parentElement).toHaveTextContent(
      'Default: Essential',
    )
    expect(within(list).getByText('Dining').parentElement).toHaveTextContent(
      'Default: Discretionary',
    )
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual(['POST /api/v1/categories'])
  })

  it('V2_CATEGORIES_007 an income category has no default class choice and appears under income', async () => {
    mockApi(seed())
    window.localStorage.setItem('wealthmesh.enteringAs', maya.id)
    const { user } = renderRoute('/categories')
    const panel = await addCategory(user, 'Side work', 'Income')
    expect(within(panel).queryByLabelText('Default class')).toBeNull()
    await user.click(within(panel).getByRole('button', { name: 'Save category' }))

    const income = await screen.findByRole('list', { name: 'Income categories' })
    expect(await within(income).findByText('Side work')).toBeInTheDocument()
    expect(income).not.toHaveTextContent('Default:')
  })

  it('V2_CATEGORIES_008 a blank name shows "Enter a category name" and creates nothing', async () => {
    const api = mockApi(seed())
    window.localStorage.setItem('wealthmesh.enteringAs', maya.id)
    const { user } = renderRoute('/categories')
    const before = CATEGORIES.length
    await user.click(await screen.findByRole('button', { name: 'Add category' }))
    const panel = await screen.findByRole('region', { name: 'Add category' })
    await user.click(within(panel).getByRole('button', { name: 'Save category' }))

    expect(await within(panel).findByText('Enter a category name')).toBeInTheDocument()
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
    expect(CATEGORIES).toHaveLength(before)
  })

  it('V2_CATEGORIES_008 a second Groceries is refused and the page points to the existing one', async () => {
    mockApi(seed())
    window.localStorage.setItem('wealthmesh.enteringAs', maya.id)
    const { user } = renderRoute('/categories')
    const panel = await addCategory(user, 'groceries', 'Spending', 'Essential')
    await user.click(within(panel).getByRole('button', { name: 'Save category' }))

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      '"Groceries" already exists. Use that category instead.',
    )
    await user.click(within(panel).getByRole('button', { name: 'Go to Groceries' }))
    const list = screen.getByRole('list', { name: 'Spending categories' })
    expect(within(list).getAllByText('Groceries')).toHaveLength(1)
    expect(document.activeElement?.id).toMatch(/^category-/)
    expect(document.activeElement).toHaveTextContent('Groceries')
  })

  it('V2_CATEGORIES_001 Cancel returns focus to Add category and adds nothing', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/categories')
    const opener = await screen.findByRole('button', { name: 'Add category' })
    await user.click(opener)
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(opener).toHaveFocus()
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
  })
})

describe('the class on an expense', () => {
  async function openMoneyOut(user: User) {
    await user.click(await screen.findByRole('button', { name: 'Add money out' }))
  }

  async function fill(user: User, fields: { amount: string; category?: string; cls?: string }) {
    await user.type(await screen.findByLabelText('Amount'), fields.amount)
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-10' } })
    if (fields.category)
      await user.selectOptions(screen.getByLabelText('Category'), fields.category)
    if (fields.cls) await user.selectOptions(screen.getByLabelText('Class'), fields.cls)
  }

  it('V2_CATEGORIES_001 the Class chooser shows the category default, and a chosen class overrides it', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await enterAs(user, 'Maya')
    await openMoneyOut(user)
    await fill(user, { amount: '90.00', category: 'Groceries' })
    expect(screen.getByLabelText('Class')).toHaveDisplayValue('Category default (Essential)')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(
      within(screen.getByRole('region', { name: 'Review money out' })).getByText('Essential'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))
    await screen.findByRole('cell', { name: '2026-09-10' })

    await openMoneyOut(user)
    await fill(user, { amount: '30.00', category: 'Groceries', cls: 'Discretionary' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))
    await screen.findByText('Discretionary', { selector: 'span' })
    expect(api.activity.map((a) => a.classification)).toEqual(['essential', 'discretionary'])
    expect(api.accounts[0].balance.amount).toBe('4880.00')
  })

  it('V2_CATEGORIES_006 an expense with no category is saved, listed as Uncategorized with a flag and no class', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await enterAs(user, 'Sam')
    await openMoneyOut(user)
    await fill(user, { amount: '125.00' })
    expect(screen.getByLabelText('Category')).toHaveDisplayValue('No category (review later)')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('Saved as Uncategorized, to review later')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    const row = (await screen.findByText('Needs a category')).closest('tr')!
    expect(within(row).getByText('Uncategorized')).toBeInTheDocument()
    expect(within(row).getByText('Unclassified')).toBeInTheDocument()
    expect(api.activity[0]).toMatchObject({ categoryId: '', classification: null })
    expect(api.accounts[0].balance.amount).toBe('4875.00')
  })

  it('V2_CATEGORIES_006 Spending shows the entry under Uncategorized with its unclassified amount apart', async () => {
    const api = mockApi({
      ...seed(),
      activity: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          accountId: everyday.id,
          kind: 'expense',
          amount: '125.00',
          occurredOn: '2026-09-08',
          description: 'Mystery',
          categoryId: '',
          classification: null,
          enteredByMemberId: sam.id,
        },
      ],
    })
    api.accounts[0].balance = { amount: '4875.00', asOf: '2026-09-08' }
    const { user } = renderRoute('/spending')
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    const classes = await screen.findByRole('list', { name: 'Spending by class' })
    expect(classes).toHaveTextContent('Unclassified $125.00')
    expect(classes).toHaveTextContent('Essential $0.00')
    await user.click(await screen.findByRole('button', { name: 'Uncategorized' }))
    expect(await screen.findByRole('button', { name: 'Mystery' })).toBeInTheDocument()
    expect(screen.getByText(/Needs a category/)).toBeInTheDocument()
  })

  it('V2_CATEGORIES_006 assigning Groceries with Essential to the entry clears the flag and keeps the Balance', async () => {
    const api = mockApi({
      ...seed(),
      activity: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          accountId: everyday.id,
          kind: 'expense',
          amount: '125.00',
          occurredOn: '2026-09-08',
          description: 'Mystery',
          categoryId: '',
          classification: null,
          enteredByMemberId: sam.id,
        },
      ],
    })
    api.accounts[0].balance = { amount: '4875.00', asOf: '2026-09-08' }
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await enterAs(user, 'Sam')
    await user.click(await screen.findByRole('button', { name: 'Edit Mystery' }))
    await user.selectOptions(await screen.findByLabelText('Category'), 'Groceries')
    await user.selectOptions(screen.getByLabelText('Class'), 'Essential')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = screen.getByRole('region', { name: 'Review change' })
    expect(within(review).getByText('No category changed to Groceries')).toBeInTheDocument()
    expect(within(review).getByText('Unclassified changed to Essential')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    await screen.findByText('Groceries', { selector: 'td' })
    expect(screen.queryByText('Needs a category')).toBeNull()
    expect(api.accounts[0].balance.amount).toBe('4875.00')
    expect(api.activity.filter((a) => !a.removedAt)[0]).toMatchObject({
      categoryId: CATEGORIES[2].id,
      classification: 'essential',
    })
  })

  it('V2_CATEGORIES_001 income has no Class chooser', async () => {
    mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.click(await screen.findByRole('button', { name: 'Add money in' }))
    await screen.findByLabelText('Amount')
    expect(screen.queryByLabelText('Class')).toBeNull()
  })
})
