import { screen, waitFor, within } from '@testing-library/react'
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
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const CAR_ID = '44444444-4444-4444-8444-444444444441'
const HOME_ID = '44444444-4444-4444-8444-444444444442'
const CHECKING_ID = '44444444-4444-4444-8444-444444444443'

const make = (id: string, type: string, name: string, amount: string): MockAccount => ({
  id,
  type,
  name,
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: amount,
  balance: { amount, asOf: '2026-09-01' },
  status: 'active',
})
const seed = () => ({
  household,
  members: [maya, sam],
  accounts: [
    make(CAR_ID, 'other_asset', 'Family Car', '30000.00'),
    make(HOME_ID, 'property', 'Family Home', '300000.00'),
    {
      ...make(CHECKING_ID, 'checking', 'Everyday Checking', '5000.00'),
      institution: 'Harbor Bank',
    },
  ],
  today: '2026-10-03',
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

describe('Edit account ends with a sentence and focus (Q-062)', () => {
  it('V2_OTHER_ASSET_001 renaming the car and making it joint ends with one sentence on the status line, with focus, and a history row', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${CAR_ID}/edit`)
    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Blue Car')
    await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Blue Car was updated. It was Family Car. Owners are now Maya and Sam. Its value of $30,000.00 is unchanged.',
    )
    expect(status).toHaveFocus()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(api.accounts.find((a) => a.id === CAR_ID)).toMatchObject({
      name: 'Blue Car',
      ownerMemberIds: [maya.id, sam.id],
      balance: { amount: '30000.00' },
    })
    const history = await screen.findByRole('region', { name: 'Status history' })
    expect(history).toHaveTextContent('Renamed from Family Car by Maya')
  })

  it('V2_PROPERTY_001 renaming the home keeps its value and says so', async () => {
    mockApi(seed())
    const { user } = renderRoute(`/accounts/${HOME_ID}/edit`)
    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Maple Street Home')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Maple Street Home was updated. It was Family Home. Its value of $300,000.00 is unchanged.',
    )
    expect(status).toHaveFocus()
  })

  it('Q-062 a bank account says the same in its own words, and a save with nothing changed says so and adds no history row', async () => {
    mockApi(seed())
    const { user } = renderRoute(`/accounts/${CHECKING_ID}/edit`)
    await screen.findByLabelText('Account name')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Everyday Checking was saved with no changes. Its Balance of $5,000.00 is unchanged.',
    )
    expect(status).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'Status history' })).not.toBeInTheDocument()
  })

  it('Q-062 the sentence goes when another change starts: opening Archive drops it', async () => {
    mockApi(seed())
    const { user } = renderRoute(`/accounts/${CAR_ID}/edit`)
    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Blue Car')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Blue Car was updated')
    await user.click(screen.getByRole('button', { name: 'Archive account' }))
    expect(within(screen.getByLabelText('Account status')).queryByText(/was updated/)).toBeNull()
  })

  it('Q-062 an archived account keeps its explanation beside the sentence', async () => {
    const accounts = seed()
    accounts.accounts[0].status = 'archived'
    mockApi(accounts)
    const { user } = renderRoute(`/accounts/${CAR_ID}/edit`)
    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Blue Car')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Blue Car was updated')
    expect(screen.getByLabelText('Account status')).toHaveTextContent(
      'Archived: hidden from the active list and from new values.',
    )
  })

  it('V2_DB_006 a plan keeps its participant outside the form, and a loan says its amount is unchanged', async () => {
    mockApi({
      ...seed(),
      accounts: [
        {
          ...make(CAR_ID, 'defined_benefit', 'Harbor Cash Balance', '40000.00'),
          institution: 'Harbor Benefits',
          ownerMemberIds: [maya.id],
        },
        {
          ...make(HOME_ID, 'loan', 'Car Loan', '-2000.00'),
          institution: 'Harbor Bank',
        },
      ],
    })
    const { user } = renderRoute(`/accounts/${CAR_ID}/edit`)
    const planName = await screen.findByLabelText('Account name')
    // The participant is shown, not edited: a change is the reviewed Change participant (slice 18c).
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change participant' })).toBeVisible()
    await user.clear(planName)
    await user.type(planName, 'Harbor Cash Balance Main')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Harbor Cash Balance Main was updated. It was Harbor Cash Balance. Its plan value of $40,000.00 is unchanged.',
    )
    const second = renderRoute(`/accounts/${HOME_ID}/edit`)
    const loanName = await second.findAllByLabelText('Account name')
    await second.user.clear(loanName.at(-1)!)
    await second.user.type(loanName.at(-1)!, 'Truck Loan')
    await second.user.click(screen.getAllByRole('button', { name: 'Save details' }).at(-1)!)
    await waitFor(() =>
      expect(screen.getAllByRole('status').at(-1)).toHaveTextContent(
        'Truck Loan was updated. It was Car Loan. Its Balance owed of $2,000.00 is unchanged.',
      ),
    )
  })

  it('Visual review F1 the edit page opens with focus on the first field', async () => {
    mockApi(seed())
    renderRoute(`/accounts/${CAR_ID}/edit`)
    expect(await screen.findByLabelText('Account name')).toHaveFocus()
  })

  it('Q-063 a closed account says what it takes and that its details can still be edited', async () => {
    const accounts = seed()
    accounts.accounts[0].status = 'closed'
    mockApi(accounts)
    renderRoute(`/accounts/${CAR_ID}`)
    const card = await screen.findByLabelText('Account status')
    expect(card).toHaveTextContent('Closed: it takes no new values until you reopen it.')
    expect(card).toHaveTextContent('Its name and owners can still be edited.')
    expect(card).not.toHaveTextContent('no changes')
  })
})
