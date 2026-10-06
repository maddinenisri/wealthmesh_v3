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
