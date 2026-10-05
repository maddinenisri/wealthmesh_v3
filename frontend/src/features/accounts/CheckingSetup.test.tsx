import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
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
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
}

const seed = { household, members: [maya, sam] }

async function fillSetup(
  user: ReturnType<typeof renderRoute>['user'],
  { name = 'Everyday Checking', balance = '' }: { name?: string; balance?: string } = {},
) {
  const nameField = await screen.findByLabelText('Account name')
  if (name) await user.type(nameField, name)
  await user.type(screen.getByLabelText('Bank'), 'Harbor Bank')
  await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
  fireEvent.change(screen.getByLabelText('Opened on'), { target: { value: '2026-09-01' } })
  if (balance) await user.type(screen.getByLabelText('Balance'), balance)
}

const save = () => screen.getByRole('button', { name: 'Save account' })

async function listRow(name: string) {
  const row = (await screen.findByRole('link', { name })).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return row
}

describe('adding a checking account', () => {
  it('V2_CHECKING_001 creates checking with a known initial Balance and finds it again', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillSetup(user, { balance: '$5,000.00' })
    await user.click(save())

    const row = await listRow('Everyday Checking')
    expect(row).toHaveTextContent('Maya')
    expect(row).toHaveTextContent('Harbor Bank')
    expect(row).toHaveTextContent('$5,000.00')
    expect(row).toHaveTextContent('2026-09-01')
    expect(api.accounts[0]).toMatchObject({ openingAmount: '5000.00', ownerMemberIds: [maya.id] })

    await user.click(within(row).getByRole('link', { name: 'Everyday Checking' }))
    expect(await screen.findByRole('heading', { name: 'Everyday Checking' })).toBeInTheDocument()
    const detail = screen.getByRole('main')
    expect(detail).toHaveTextContent('Maya')
    expect(detail).toHaveTextContent('Harbor Bank')
    expect(detail).toHaveTextContent('Initial Balance$5,000.00 on 2026-09-01')
    expect(detail).toHaveTextContent('No money activity has been recorded yet.')
    for (const action of ['Add money in', 'Add money out', 'Add transfer']) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument()
    }
  })

  it.each([
    ['left blank', ''],
    ['entered as $0.00', '$0.00'],
  ])('starts at zero on the setup date when Balance is %s', async (_label, balance) => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillSetup(user, { balance })
    await user.click(save())

    const row = await listRow('Everyday Checking')
    expect(row).toHaveTextContent('$0.00')
    expect(row).toHaveTextContent('2026-09-01')
    await user.click(within(row).getByRole('link', { name: 'Everyday Checking' }))
    expect(await screen.findByRole('main')).toHaveTextContent('Initial Balance$0.00 on 2026-09-01')
    expect(screen.getByRole('main')).toHaveTextContent('No money activity has been recorded yet.')
  })

  it('V2_CHECKING_005 explains an incomplete setup, keeps what was typed and allows cancelling', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillSetup(user, { name: '', balance: '$5,000.00' })
    await user.click(save())

    expect(await screen.findByText('Enter an account name')).toBeInTheDocument()
    expect(screen.getByLabelText('Bank')).toHaveValue('Harbor Bank')
    expect(screen.getByLabelText('Balance')).toHaveValue('$5,000.00')
    expect(screen.getByLabelText('Opened on')).toHaveValue('2026-09-01')
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    await user.type(screen.getByLabelText('Account name'), 'Everyday Checking')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(api.accounts).toHaveLength(0)
  })

  it('V2_CHECKING_017 keeps an invalid initial Balance as an unsaved form', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillSetup(user, { balance: 'five thousand' })
    await user.click(save())

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(screen.getByLabelText('Account name')).toHaveValue('Everyday Checking')
    expect(screen.getByLabelText('Bank')).toHaveValue('Harbor Bank')
    expect(screen.getByLabelText('Opened on')).toHaveValue('2026-09-01')
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    const balance = screen.getByLabelText('Balance')
    await user.clear(balance)
    await user.type(balance, '$5,000.00')
    await user.click(save())

    const row = await listRow('Everyday Checking')
    expect(row).toHaveTextContent('$5,000.00')
    expect(row).toHaveTextContent('2026-09-01')
    await user.click(within(row).getByRole('link', { name: 'Everyday Checking' }))
    const detail = await screen.findByRole('main')
    expect(detail).toHaveTextContent('Initial Balance$5,000.00 on 2026-09-01')
    expect(detail).toHaveTextContent('Harbor Bank')
  })

  it('defaults the opening date to the server date', async () => {
    mockApi({ ...seed, today: '2026-10-03' })
    renderRoute('/accounts/new')

    await screen.findByLabelText('Account name')
    expect(screen.getByLabelText('Opened on')).toHaveValue('2026-10-03')
  })

  it('asks for a household and a member first when there is nobody to own the account', async () => {
    mockApi()
    renderRoute('/accounts/new')
    expect(await screen.findByText('Create your household first')).toBeInTheDocument()
  })
})

describe('editing a checking account', () => {
  it('V2_CHECKING_003 edits details without changing money and keeps Update balance separate', async () => {
    const api = mockApi({ ...seed, accounts: [{ ...everyday }] })
    const { user } = renderRoute(`/accounts/${everyday.id}`)

    expect(await screen.findByRole('heading', { name: 'Everyday Checking' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Edit account' }))

    expect(screen.queryByLabelText('Balance')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opened on')).not.toBeInTheDocument()
    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Household Checking')
    await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
    const bank = screen.getByLabelText('Bank')
    await user.clear(bank)
    await user.type(bank, 'Harbor Credit Union')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByRole('heading', { name: 'Household Checking' })).toBeInTheDocument()
    const detail = screen.getByRole('main')
    expect(detail).toHaveTextContent('Maya')
    expect(detail).toHaveTextContent('Harbor Credit Union')
    expect(detail).toHaveTextContent('Initial Balance$5,000.00 on 2026-09-01')
    expect(api.accounts[0]).toMatchObject({ openingAmount: '5000.00', openedOn: '2026-09-01' })

    await user.click(screen.getByRole('button', { name: 'Update balance' }))
    // Update balance is its own form with a review step (slice 03), not part of Edit account.
    expect(screen.getByLabelText('Balance')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled()

    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    const row = await listRow('Household Checking')
    expect(row).toHaveTextContent('Maya')
    expect(row).toHaveTextContent('Harbor Credit Union')
  })

  it('V2_CHECKING_004 leaves everything as it was when account-detail changes are cancelled', async () => {
    const maya_owned = { ...everyday, ownerMemberIds: [maya.id] }
    const api = mockApi({ ...seed, accounts: [maya_owned] })
    const { user } = renderRoute(`/accounts/${everyday.id}/edit`)

    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Household Checking')
    await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(await screen.findByRole('heading', { name: 'Everyday Checking' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Maya')
    expect(api.requests.some((r) => r.startsWith('PUT'))).toBe(false)

    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    const row = await listRow('Everyday Checking')
    expect(row).toHaveTextContent('Maya')
    expect(row).toHaveTextContent('Harbor Bank')
    expect(row).toHaveTextContent('$5,000.00')
    expect(row).toHaveTextContent('2026-09-01')
  })

  it('asks for an account name when the edited name is blank', async () => {
    mockApi({ ...seed, accounts: [{ ...everyday }] })
    const { user } = renderRoute(`/accounts/${everyday.id}/edit`)

    await user.click(await screen.findByRole('checkbox', { name: 'Maya' }))
    await user.clear(screen.getByLabelText('Account name'))
    await user.type(screen.getByLabelText('Account name'), '   ')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByText('Enter an account name')).toBeInTheDocument()
  })
})

describe('the account list', () => {
  it('says there are no accounts yet and offers to add one', async () => {
    mockApi(seed)
    renderRoute('/accounts')

    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add account' })).toHaveAttribute(
      'href',
      '/accounts/new',
    )
  })
})
