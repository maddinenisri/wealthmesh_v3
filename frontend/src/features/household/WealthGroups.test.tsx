import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
let n = 0
const account = (type: string, name: string, balance: string, status = 'active'): MockAccount => ({
  id: `44444444-4444-4444-8444-44444444444${++n}`,
  type,
  name,
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: balance,
  balance: { amount: balance, asOf: '2026-09-01' },
  status,
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

describe('Household card: wealth groups', () => {
  it('V2_WEALTH_011 an overdraft is a negative figure in Bank money, debt once, and net worth counts it once', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [
        account('checking', 'Everyday Checking', '-100.00'),
        account('savings', 'Emergency Savings', '5000.00'),
        account('credit_card', 'Everyday Credit Card', '-1000.00'),
      ],
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(card).findByText(/Net worth/)).toHaveTextContent('$3,900.00')
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$5,000.00')
    expect(within(card).getByText(/^Debts/)).toHaveTextContent('$1,100.00')
    const bank = within(card).getByRole('region', { name: 'Bank money' })
    expect(bank).toHaveTextContent('$4,900.00')
    expect(within(bank).getByText('Everyday Checking').closest('li')).toHaveTextContent('-$100.00')
    expect(bank).toHaveTextContent('counted once, as debt')
    const debts = within(card).getByRole('region', { name: 'What makes up debts' })
    expect(within(debts).getAllByRole('listitem')).toHaveLength(2)
    expect(debts).toHaveTextContent('overdrawn')
    expect(debts).toHaveTextContent('owed')
  })

  it('V2_WEALTH_003 the card group shows what is owed and a separate Card credit', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [
        account('checking', 'Everyday Checking', '5000.00'),
        account('savings', 'Emergency Savings', '10000.00'),
        account('credit_card', 'Everyday Credit Card', '-1000.00'),
        account('credit_card', 'Travel Card', '50.00'),
      ],
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(card).findByText(/Net worth/)).toHaveTextContent('$14,050.00')
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$15,050.00')
    const cards = within(card).getByRole('region', { name: 'Cards' })
    expect(within(cards).getByText('Everyday Credit Card').closest('li')).toHaveTextContent('owed')
    expect(within(cards).getByText('Travel Card').closest('li')).toHaveTextContent('Card credit')
    expect(within(card).getByRole('region', { name: 'Bank money' })).toHaveTextContent('$15,000.00')
  })

  it('V2_ACCOUNT_LIFECYCLE_001 an archived account stays in Bank money with an Archived label', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [
        account('checking', 'Everyday Checking', '5000.00'),
        account('savings', 'Emergency Savings', '10000.00', 'archived'),
      ],
    })
    renderRoute('/')
    const bank = await screen.findByRole('region', { name: 'Bank money' })
    expect(within(bank).getByText('Emergency Savings').closest('li')).toHaveTextContent('Archived')
    expect(bank).toHaveTextContent('$15,000.00')
  })

  it('V2_ACCOUNT_LIFECYCLE_002 an archived card stays in debts with its label', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [
        account('checking', 'Everyday Checking', '5000.00'),
        account('credit_card', 'Everyday Credit Card', '-1000.00', 'archived'),
      ],
    })
    renderRoute('/')
    const debts = await screen.findByRole('region', { name: 'What makes up debts' })
    expect(debts).toHaveTextContent('Everyday Credit Card')
    expect(debts).toHaveTextContent('Archived')
    expect(await screen.findByText(/Net worth/)).toHaveTextContent('$4,000.00')
  })
})

const sam = { ...maya, id: '22222222-2222-4222-8222-222222222223', name: 'Sam' }
const owned = (
  type: string,
  name: string,
  balance: string,
  owner = maya,
  status = 'active',
): MockAccount => ({ ...account(type, name, balance, status), ownerMemberIds: [owner.id] })

describe('Household card: Investments, Retirement and Health savings overlap (slice 18b, D-067)', () => {
  const overlapSeed = () => ({
    household,
    members: [maya, sam],
    accounts: [
      owned('checking', 'Everyday Checking', '5120.00'),
      owned('savings', 'Emergency Savings', '12000.00'),
      owned('credit_card', 'Everyday Credit Card', '-1780.00'),
      owned('brokerage', 'Redwood Brokerage', '21500.00'),
      owned('401k', 'Harbor 401k', '80000.00', sam),
      owned('traditional_ira', 'Willow Traditional IRA', '30000.00'),
      owned('defined_benefit', 'Harbor Cash Balance', '40000.00', sam),
    ],
  })

  it('V2_WEALTH_002 V2_HOLDINGS_007 Retirement $150,000 and Investments $131,500 overlap, the plan is in Retirement only, and neither group is added again', async () => {
    mockApi(overlapSeed())
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(card).findByText(/Net worth/)).toHaveTextContent('$186,840.00')
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$188,620.00')
    const retirement = within(card).getByRole('region', { name: 'Retirement' })
    expect(retirement).toHaveTextContent('$150,000.00')
    expect(within(retirement).getAllByRole('listitem')).toHaveLength(3)
    const investments = within(card).getByRole('region', { name: 'Investments' })
    expect(investments).toHaveTextContent('$131,500.00')
    expect(within(investments).getAllByRole('listitem')).toHaveLength(3)
    expect(within(investments).queryByText('Harbor Cash Balance')).not.toBeInTheDocument()
    expect(investments).toHaveTextContent(
      'Harbor 401k and Willow Traditional IRA appear in both Investments and Retirement',
    )
    expect(retirement).toHaveTextContent(
      'Harbor 401k and Willow Traditional IRA appear in both Investments and Retirement',
    )
    expect(retirement).toHaveTextContent('not added again')
    expect(within(retirement).getByText('Harbor 401k').closest('li')).toHaveTextContent(
      'Also in Investments',
    )
    expect(within(investments).getByText('Harbor 401k').closest('li')).toHaveTextContent(
      'Also in Retirement',
    )
    expect(within(retirement).getByText('Harbor Cash Balance').closest('li')).not.toHaveTextContent(
      'Also in',
    )
    expect(within(card).queryByRole('region', { name: 'Health savings' })).not.toBeInTheDocument()
  })

  it('V2_WEALTH_008 V2_RETIREMENT_ACTIVITY_007 the Roth IRA is in Investments and Retirement, the HSA in Investments and Health savings and not in Retirement or Bank money', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [
        owned('roth_ira', 'Willow Roth IRA', '6000.00'),
        owned('hsa', 'Meadow HSA', '3050.00'),
      ],
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(card).findByText(/Net worth/)).toHaveTextContent('$9,050.00')
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$9,050.00')
    const investments = within(card).getByRole('region', { name: 'Investments' })
    expect(investments).toHaveTextContent('$9,050.00')
    const retirement = within(card).getByRole('region', { name: 'Retirement' })
    expect(retirement).toHaveTextContent('$6,000.00')
    expect(within(retirement).queryByText('Meadow HSA')).not.toBeInTheDocument()
    const health = within(card).getByRole('region', { name: 'Health savings' })
    expect(health).toHaveTextContent('$3,050.00')
    expect(within(health).getByText('Meadow HSA').closest('li')).toHaveTextContent(
      'Also in Investments',
    )
    expect(health).toHaveTextContent('not added to Retirement or Bank money')
    expect(health).toHaveTextContent('not added again')
    expect(within(card).queryByRole('region', { name: 'Bank money' })).not.toBeInTheDocument()
  })

  it('V2_HOLDINGS_001 an empty completed Investments group says so, offers the draft under Finish setup, and counts none of its amount', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [
        owned('checking', 'Everyday Checking', '5000.00'),
        owned('brokerage', 'Redwood Brokerage', '20000.00', maya, 'draft'),
      ],
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(card).findByText(/Net worth/)).toHaveTextContent('$5,000.00')
    const investments = within(card).getByRole('region', { name: 'Investments' })
    expect(investments).toHaveTextContent('No completed investment accounts')
    const finish = within(investments).getByRole('region', { name: 'Finish setup' })
    expect(within(finish).getByRole('link', { name: 'Redwood Brokerage' })).toBeVisible()
    expect(investments).not.toHaveTextContent('$20,000.00')
    expect(investments).not.toHaveTextContent(/shares|cost|return/i)
  })

  it('Q-061 a household without an investment account shows no Investments section', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [owned('checking', 'Everyday Checking', '5000.00')],
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    await within(card).findByRole('region', { name: 'Bank money' })
    expect(within(card).queryByRole('region', { name: 'Investments' })).not.toBeInTheDocument()
  })

  it('V2_HOUSEHOLD_SETUP_005 the Retirement list shows both accounts with owners and $110,000, and opening Sam’s 401k is the one account from either list', async () => {
    mockApi({
      household,
      members: [maya, sam],
      accounts: [
        owned('traditional_ira', 'Willow Traditional IRA', '30000.00'),
        owned('401k', 'Harbor 401k', '80000.00', sam),
      ],
    })
    const { user } = renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    const retirement = await within(card).findByRole('region', { name: 'Retirement' })
    expect(retirement).toHaveTextContent('$110,000.00')
    expect(within(retirement).getByText('Willow Traditional IRA').closest('li')).toHaveTextContent(
      'Maya',
    )
    expect(within(retirement).getByText('Harbor 401k').closest('li')).toHaveTextContent('Sam')
    const investments = within(card).getByRole('region', { name: 'Investments' })
    const fromRetirement = within(retirement).getByRole('link', { name: 'Harbor 401k' })
    const fromInvestments = within(investments).getByRole('link', { name: 'Harbor 401k' })
    expect(fromRetirement.getAttribute('href')).toBe(fromInvestments.getAttribute('href'))
    await user.click(fromRetirement)
    expect(await screen.findByRole('heading', { name: 'Harbor 401k' })).toBeVisible()
    const details = screen.getByLabelText('Account details')
    expect(details).toHaveTextContent('Sam')
    expect(details).toHaveTextContent('$80,000.00')
  })

  it('Visual review F4 a long list of shared accounts is capped at three names and a count', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: ['A', 'B', 'C', 'D', 'E', 'F'].map((letter) =>
        owned('401k', `${letter} 401k`, '1000.00'),
      ),
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    const investments = await within(card).findByRole('region', { name: 'Investments' })
    expect(investments).toHaveTextContent(
      'A 401k, B 401k, C 401k and 3 more appear in both Investments and Retirement',
    )
  })

  it('Visual review F5 a draft under Finish setup says its type and its owner', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [owned('hsa', 'Meadow HSA', '1000.00', maya, 'draft')],
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    const finish = await within(card).findByRole('region', { name: 'Finish setup' })
    expect(within(finish).getByText('Meadow HSA').closest('li')).toHaveTextContent(
      'Health savings account (HSA) · Maya',
    )
  })
})
