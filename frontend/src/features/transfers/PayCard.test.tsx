import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

// Q-034 (owner answer, 2026-10-05): a "Pay a card" button on checking and savings, reusing the card-payment path.
const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const bank = (type: 'checking' | 'savings' = 'checking'): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type,
  name: type === 'checking' ? 'Everyday Checking' : 'Emergency Savings',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
})
const card: MockAccount = {
  id: '55555555-5555-4555-8555-555555555555',
  type: 'credit_card',
  name: 'Everyday Credit Card',
  institution: 'Harbor Cards',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '-1000.00',
  balance: { amount: '-1000.00', asOf: '2026-09-01' },
  status: 'active',
}

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const posts = (requests: string[]) => requests.filter((line) => line.startsWith('POST '))

describe('Pay a card from a bank account', () => {
  for (const type of ['checking', 'savings'] as const) {
    it(`Q-034 ${type}: the bank is fixed, a card is chosen, both Balances are reviewed and Cancel saves nothing, then Confirm pays through the card-payment path`, async () => {
      const api = mockApi({ household, members: [maya], accounts: [bank(type), { ...card }] })
      const { user } = renderRoute(`/accounts/${bank(type).id}`)
      const opener = await screen.findByRole('button', { name: 'Pay a card' })
      await user.click(opener)

      const form = await screen.findByRole('region', { name: 'Pay a card' })
      expect(within(form).getByText('Paid from')).toBeInTheDocument()
      expect(within(form).getByText(bank(type).name, { selector: 'p' })).toBeInTheDocument()
      const cards = within(form).getByLabelText('Card to pay')
      expect(
        within(cards).getByRole('option', { name: 'Everyday Credit Card (Credit card)' }),
      ).toBeVisible()
      expect(within(cards).queryByRole('option', { name: /Checking|Savings/ })).toBeNull()

      await user.click(within(form).getByRole('button', { name: 'Review' }))
      expect(await within(form).findByText('Choose the card to pay')).toBeInTheDocument()
      expect(posts(api.requests)).toHaveLength(0)

      await user.selectOptions(cards, 'Everyday Credit Card (Credit card)')
      await user.type(within(form).getByLabelText('Amount'), '500.00')
      fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-09-20' } })
      await user.click(within(form).getByRole('button', { name: 'Review' }))
      const effect = await screen.findByRole('region', { name: 'Effect of this payment' })
      expect(await within(effect).findByText(`${bank(type).name} Balance`)).toBeInTheDocument()
      expect(effect).toHaveTextContent(`${bank(type).name} Balance$4,500.00`)
      expect(effect).toHaveTextContent('Everyday Credit Card Balance$500.00 owed')

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(posts(api.requests)).toHaveLength(0)
      expect(api.accounts[0].balance.amount).toBe('5000.00')
      expect(await screen.findByRole('button', { name: 'Pay a card' })).toHaveFocus()

      await user.click(screen.getByRole('button', { name: 'Pay a card' }))
      await user.selectOptions(
        await screen.findByLabelText('Card to pay'),
        'Everyday Credit Card (Credit card)',
      )
      await user.type(screen.getByLabelText('Amount'), '500.00')
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-20' } })
      await user.click(screen.getByRole('button', { name: 'Review' }))
      await user.click(await screen.findByRole('button', { name: 'Confirm payment' }))
      const paid = await screen.findByRole('link', { name: 'Everyday Credit Card' })
      expect(paid.closest('tr')).toHaveTextContent('Payment to Everyday Credit Card')
      expect(posts(api.requests)).toContain('POST /api/v1/card-payments')
      expect(api.accounts[0].balance.amount).toBe('4500.00')
      expect(api.accounts[1].balance.amount).toBe('-500.00')
    })
  }

  it('Q-034 with no credit card the button is disabled and says why; a card page does not offer it', async () => {
    mockApi({ household, members: [maya], accounts: [bank()] })
    const { user } = renderRoute(`/accounts/${bank().id}`)
    const opener = await screen.findByRole('button', { name: 'Pay a card' })
    expect(opener).toBeDisabled()
    expect(screen.getByText('Add a credit card to pay it from here.')).toBeInTheDocument()
    await user.click(opener)
    expect(screen.queryByRole('region', { name: 'Pay a card' })).toBeNull()
  })

  it('Q-034 a card page keeps Record payment and has no Pay a card', async () => {
    mockApi({ household, members: [maya], accounts: [bank(), { ...card }] })
    renderRoute(`/accounts/${card.id}`)
    expect(await screen.findByRole('button', { name: 'Record payment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay a card' })).toBeNull()
  })
})
