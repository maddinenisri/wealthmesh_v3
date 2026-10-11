import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: balance,
  balance: { amount: balance, asOf: '2026-09-01' },
  status,
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

// Cowork 19d: on 2026-09-30 the lists must add up to Financial assets and to Debts, each archived account is labeled,
// and every list has its total in the amount column.
const seed = () => {
  n = 0
  return {
    household,
    members: [maya],
    accounts: [
      account('checking', 'Everyday Checking', '5000.00'),
      account('checking', 'Overdrawn Checking', '-100.00'),
      account('savings', 'Emergency Savings', '12000.00'),
      account('brokerage', 'Redwood Brokerage', '21500.00'),
      account('brokerage', 'Retired Brokerage', '1000.00', 'archived'),
      account('defined_benefit', 'Harbor Cash Balance', '40000.00'),
      account('credit_card', 'Travel Card', '50.00'),
      account('credit_card', 'Everyday Credit Card', '-1000.00'),
    ],
    today: '2026-10-03',
  }
}

async function openSep30() {
  renderRoute('/')
  const card = await screen.findByRole('region', { name: 'Wealth on a date' })
  fireEvent.change(within(card).getByLabelText('Show wealth on'), {
    target: { value: '2026-09-30' },
  })
  await within(card).findByText(/Household wealth on 2026-09-30/)
  return card
}

describe('Wealth on a date: the lists add up (Cowork 19d)', () => {
  it('V2_WEALTH_001 an archived account is labeled in the Investments list', async () => {
    mockApi(seed())
    const card = await openSep30()
    const investments = within(card).getByRole('region', {
      name: 'Investment balances on this date',
    })
    expect(within(investments).getByText('Retired Brokerage').closest('li')).toHaveTextContent(
      'Archived',
    )
    expect(within(investments).getByText('Redwood Brokerage').closest('li')).not.toHaveTextContent(
      'Archived',
    )
  })

  it('V2_WEALTH_001 each list has its Total in the amount column, Investments too', async () => {
    mockApi(seed())
    const card = await openSep30()
    const bank = within(card).getByRole('region', {
      name: 'Checking and savings balances on this date',
    })
    const bankTotal = within(bank).getByText('Total').parentElement!
    expect(bankTotal).toHaveClass('justify-between')
    expect(bankTotal).toHaveTextContent('$16,900.00')
    const investments = within(card).getByRole('region', {
      name: 'Investment balances on this date',
    })
    const investmentTotal = within(investments).getByText('Total').parentElement!
    expect(investmentTotal).toHaveClass('justify-between')
    expect(investmentTotal).toHaveTextContent('$22,500.00')
  })

  it('V2_WEALTH_001 V2_WEALTH_011 Bank money says an overdrawn account is counted once, as debt', async () => {
    mockApi(seed())
    const card = await openSep30()
    const bank = within(card).getByRole('region', {
      name: 'Checking and savings balances on this date',
    })
    expect(bank).toHaveTextContent('counted once, as debt')
  })

  it('V2_WEALTH_001 plans and card credit are listed, and the assets add up to Financial assets', async () => {
    mockApi(seed())
    const card = await openSep30()
    const others = within(card).getByRole('region', { name: 'Plans and card credit on this date' })
    expect(within(others).getByText('Harbor Cash Balance').closest('li')).toHaveTextContent(
      '$40,000.00',
    )
    expect(within(others).getByText('Travel Card').closest('li')).toHaveTextContent('$50.00')
    expect(within(others).getByText('Total').parentElement).toHaveTextContent('$40,050.00')
    // 5,000 + 12,000 (bank money without the overdraft) + 22,500 + 40,050 = 79,550.
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$79,550.00')
    expect(within(card).getByText(/The assets add up from/)).toHaveTextContent(
      'The assets add up from Bank money without any overdrawn account, Investments, Property and other assets, and Plans and card credit.',
    )
  })

  it('V2_WEALTH_001 the debts are listed with a Total equal to Debts', async () => {
    mockApi(seed())
    const card = await openSep30()
    const debts = within(card).getByRole('region', { name: 'Debts on this date' })
    expect(within(debts).getByText('Overdrawn Checking').closest('li')).toHaveTextContent('$100.00')
    expect(within(debts).getByText('Everyday Credit Card').closest('li')).toHaveTextContent(
      '$1,000.00',
    )
    expect(within(debts).getByText('Total').parentElement).toHaveTextContent('$1,100.00')
    expect(within(card).getByText(/^Debts/)).toHaveTextContent('$1,100.00')
  })
})

describe('What changed: messages and figures (Cowork 19d)', () => {
  it('V2_WEALTH_009 a From later than To is said with the field names and a full stop', async () => {
    mockApi(seed())
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('From'), { target: { value: '2026-10-03' } })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-09-30' } })
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'From must be on or before To.',
    )
  })

  it('V2_WEALTH_009 the same date twice shows $0.00 for Spending, never -$0.00', async () => {
    mockApi(seed())
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('From'), { target: { value: '2026-09-30' } })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-09-30' } })
    const change = await within(card).findByRole('region', { name: 'Wealth change' })
    await waitFor(() => expect(change).toHaveTextContent('a change of $0.00'))
    expect(within(change).getByText('Spending').closest('li')).toHaveTextContent('$0.00')
    expect(within(change).getByText('Spending').closest('li')).not.toHaveTextContent('-$0.00')
  })
})

describe('Balance on a date on every kind of account page (Cowork 19d)', () => {
  const pageOf = (name: string, rows: MockAccount[]) => rows.find((a) => a.name === name)!.id

  it('V2_CHECKING_018 V2_WEALTH_001 a date before tracking began says when tracking began', async () => {
    const data = seed()
    mockApi(data)
    renderRoute(`/accounts/${pageOf('Everyday Checking', data.accounts)}`)
    const card = await screen.findByRole('region', { name: 'Balance on a date' })
    fireEvent.change(within(card).getByLabelText('View Balance on'), {
      target: { value: '2026-08-01' },
    })
    expect(await within(card).findByRole('status')).toHaveTextContent(
      'Balance on 2026-08-01: not available. Tracking began on 2026-09-01.',
    )
  })

  it.each([
    ['an investment account', 'Redwood Brokerage', 'Balance'],
    ['a defined benefit plan', 'Harbor Cash Balance', 'Value'],
    ['a credit card', 'Everyday Credit Card', 'Balance'],
    ['a loan', 'Car Loan', 'Balance'],
  ])('V2_WEALTH_001 %s has %s on a date', async (_kind, name, noun) => {
    const data = seed()
    data.accounts.push(account('loan', 'Car Loan', '-20000.00'))
    mockApi(data)
    renderRoute(`/accounts/${pageOf(name, data.accounts)}`)
    const card = await screen.findByRole('region', { name: `${noun} on a date` })
    fireEvent.change(within(card).getByLabelText(`View ${noun} on`), {
      target: { value: '2026-09-30' },
    })
    expect(await within(card).findByRole('status')).toHaveTextContent(`${noun} on 2026-09-30:`)
  })
})
