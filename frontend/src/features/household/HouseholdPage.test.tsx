import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockApi } from '../../test/mockApi'
import { renderWithProviders } from '../../test/render'
import { server } from '../../test/server'
import { HouseholdPage } from './HouseholdPage'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Doe Family' }
const alex = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Alex Doe',
  label: 'Parent',
}

describe('before a household exists', () => {
  it('offers to create one and then shows it', async () => {
    const api = mockApi()
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.type(await screen.findByLabelText('Household name'), 'Doe Family')
    await user.click(screen.getByRole('button', { name: 'Create household' }))

    expect(await screen.findByRole('heading', { name: 'Doe Family' })).toBeInTheDocument()
    expect(api.household?.name).toBe('Doe Family')
    expect(screen.getByText('No members yet. Add the first person below.')).toBeInTheDocument()
  })

  it('asks for a name without calling the server', async () => {
    const api = mockApi()
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.click(await screen.findByRole('button', { name: 'Create household' }))

    expect(await screen.findByText('Enter a household name.')).toBeInTheDocument()
    expect(api.requests).toEqual(['GET /api/v1/household'])
  })

  it('shows the server message when creating fails', async () => {
    mockApi()
    server.use(
      http.post('*/api/v1/household', () =>
        HttpResponse.json({ message: 'A household already exists' }, { status: 409 }),
      ),
    )
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.type(await screen.findByLabelText('Household name'), 'Doe Family')
    await user.click(screen.getByRole('button', { name: 'Create household' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A household already exists')
  })
})

describe('with a household', () => {
  it('lists members with their labels', async () => {
    mockApi({ household, members: [alex] })
    renderWithProviders(<HouseholdPage />)

    expect(await screen.findByText('Alex Doe')).toBeInTheDocument()
    expect(screen.getByText('Parent')).toBeInTheDocument()
  })

  it('says members are loading instead of claiming there are none', async () => {
    mockApi({ household, members: [alex] })
    server.use(
      http.get('*/api/v1/household-members', async () => {
        await delay(150)
        return HttpResponse.json([alex])
      }),
    )
    renderWithProviders(<HouseholdPage />)

    expect(await screen.findByRole('heading', { name: 'Doe Family' })).toBeInTheDocument()
    expect(screen.getByText('Loading members')).toBeInTheDocument()
    expect(
      screen.queryByText('No members yet. Add the first person below.'),
    ).not.toBeInTheDocument()

    expect(await screen.findByText('Alex Doe')).toBeInTheDocument()
    expect(screen.queryByText('Loading members')).not.toBeInTheDocument()
  })

  it('renames the household', async () => {
    const api = mockApi({ household })
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.click(await screen.findByRole('button', { name: 'Rename household' }))
    const input = screen.getByLabelText('Household name')
    await user.clear(input)
    await user.type(input, 'Doe-Rivera Family')
    await user.click(screen.getByRole('button', { name: 'Save household name' }))

    expect(await screen.findByRole('heading', { name: 'Doe-Rivera Family' })).toBeInTheDocument()
    expect(api.household?.name).toBe('Doe-Rivera Family')
  })

  it('adds a member and clears the form', async () => {
    const api = mockApi({ household })
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.type(await screen.findByLabelText('Member name'), 'Sam Rivera')
    await user.type(screen.getByLabelText('Label (optional)'), 'Child')
    await user.click(screen.getByRole('button', { name: 'Add member' }))

    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument()
    expect(api.members).toMatchObject([
      { name: 'Sam Rivera', label: 'Child', householdId: household.id },
    ])
    expect(screen.getByLabelText('Member name')).toHaveValue('')
    expect(screen.getByLabelText('Label (optional)')).toHaveValue('')
  })

  it('asks for a member name without calling the server', async () => {
    const api = mockApi({ household })
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.click(await screen.findByRole('button', { name: 'Add member' }))

    expect(await screen.findByText('Enter a member name.')).toBeInTheDocument()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('keeps what was typed and shows the message when a member already exists', async () => {
    mockApi({ household, members: [alex] })
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.type(await screen.findByLabelText('Member name'), 'alex doe')
    await user.type(screen.getByLabelText('Label (optional)'), 'parent')
    await user.click(screen.getByRole('button', { name: 'Add member' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A member with this name and label already exists',
    )
    expect(screen.getByLabelText('Member name')).toHaveValue('alex doe')
  })

  it('edits a member in place', async () => {
    const api = mockApi({ household, members: [alex] })
    const { user } = renderWithProviders(<HouseholdPage />)

    await user.click(await screen.findByRole('button', { name: 'Edit member Alex Doe Parent' }))
    const row = screen.getByRole('listitem')
    const name = within(row).getByLabelText('Member name')
    await user.clear(name)
    await user.type(name, 'Alexandra Doe')
    await user.click(within(row).getByRole('button', { name: 'Review rename' }))
    await user.click(screen.getByRole('button', { name: 'Confirm rename' }))

    expect(await screen.findByText('Alexandra Doe')).toBeInTheDocument()
    expect(api.members[0]).toMatchObject({ name: 'Alexandra Doe', label: 'Parent' })
    expect(screen.queryByRole('button', { name: 'Confirm rename' })).not.toBeInTheDocument()
  })
})

describe('when the server is unavailable', () => {
  it('explains the failure and recovers on retry', async () => {
    server.use(http.get('*/api/v1/household', () => HttpResponse.error()))
    const { user } = renderWithProviders(<HouseholdPage />)

    expect(await screen.findByText('Could not load the household')).toBeInTheDocument()
    expect(
      screen.getByText('Cannot reach the server. Check that the backend is running.'),
    ).toBeInTheDocument()

    mockApi({ household })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Doe Family' })).toBeInTheDocument()
  })
})
