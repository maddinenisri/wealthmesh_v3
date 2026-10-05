import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}

beforeEach(() => window.localStorage.clear())

describe('the household overview', () => {
  it('V2_HOUSEHOLD_SETUP_003 starts empty, then adds the first checking account and opens it', async () => {
    mockApi({ household, members: [maya] })
    const { user } = renderRoute('/')

    const wealth = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(wealth).findByText('No accounts have been added')).toBeInTheDocument()
    expect(within(wealth).getByText(/Financial assets/)).toHaveTextContent('$0.00')
    expect(within(wealth).getByText(/Debts/)).toHaveTextContent('$0.00')

    await user.click(within(wealth).getByRole('link', { name: 'Add account' }))
    const type = await screen.findByLabelText('Account type')
    expect(type).toHaveDisplayValue('Checking')
    expect(within(type).getByRole('option', { name: /Credit card.*coming soon/ })).toBeDisabled()
    await user.type(screen.getByLabelText('Account name'), 'Everyday Checking')
    await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
    fireEvent.change(screen.getByLabelText('Opened on'), { target: { value: '2026-09-01' } })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    const row = (await screen.findByRole('link', { name: 'Everyday Checking' })).closest('tr')!
    expect(row).toHaveTextContent('$0.00')
    await user.click(within(row).getByRole('link', { name: 'Everyday Checking' }))
    expect(await screen.findByRole('button', { name: 'Add money in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add money out' })).toBeInTheDocument()
  })
})
