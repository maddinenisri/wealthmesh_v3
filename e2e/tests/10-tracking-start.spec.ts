import { expect, test, type Page } from '@playwright/test'

// Runs after 09-starting-balance.spec.ts. Today is fixed to 2026-10-03 in this stack. The account is made through
// the API; the expense dated before tracking began is reviewed and saved on screen.
test.describe.serial('tracking start journey', () => {
  let accountId = ''

  async function open(page: Page) {
    await page.goto(`/accounts/${accountId}`)
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
  }

  async function enterRent(page: Page) {
    await page.getByRole('button', { name: 'Add money out' }).click()
    const form = page.getByRole('region', { name: 'Add money out' })
    await form.getByLabel('Amount').fill('1500.00')
    await form.getByLabel('Date').fill('2026-09-03')
    await form.getByLabel('Category').selectOption({ label: 'Rent' })
    await form.getByRole('button', { name: 'Review' }).click()
    return page.getByRole('region', { name: 'Review historical setup' })
  }

  test('set up checking with 5000.00 starting 2026-09-10', async ({ request }) => {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name: 'Late Start Checking',
        ownerMemberIds: [members.find((m) => m.name === 'Alex Doe')!.id],
        openedOn: '2026-09-10',
        openingBalance: '5000.00',
      },
    })
    expect(response.status()).toBe(201)
    accountId = ((await response.json()) as { id: string }).id
  })

  test('V2_CHECKING_016 cancelling the historical review saves nothing', async ({
    page,
    request,
  }) => {
    await open(page)
    const setup = await enterRent(page)
    await expect(setup).toContainText('already represented in the 2026-09-10 amount')
    await setup.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('region', { name: 'Account details' })).toContainText('$5,000.00')
    const activity = await request.get(`/api/v1/accounts/${accountId}/activity`)
    expect(await activity.json()).toEqual([])
  })

  test('V2_CHECKING_016 moves the start and saves the expense together, once', async ({
    page,
    request,
  }) => {
    await open(page)
    const setup = await enterRent(page)
    await setup.getByLabel('New tracking start').fill('2026-09-01')
    await setup.getByLabel('Initial Balance at that date').fill('6500.00')
    await setup.getByLabel('Reason').fill('Rent was already in the amount')
    await setup.getByRole('button', { name: 'Review' }).click()

    const review = page.getByRole('region', { name: 'Review setup and expense' })
    await expect(review).toContainText('$6,500.00 on 2026-09-01')
    await expect(review).toContainText('Previous start: $5,000.00 on 2026-09-10')
    await expect(review).toContainText('$5,000.00')
    await expect(review).toContainText('September spending will become')
    await review.getByRole('button', { name: 'Confirm setup and expense' }).click()

    const details = page.getByRole('region', { name: 'Account details' })
    await expect(details).toContainText('$5,000.00')
    await expect(details).toContainText('2026-09-01')
    const activity = (await (
      await request.get(`/api/v1/accounts/${accountId}/activity`)
    ).json()) as {
      kind: string
      amount: string
    }[]
    expect(activity).toHaveLength(1)
    expect(activity[0]).toMatchObject({ kind: 'expense', amount: '1500.00' })

    await page.getByRole('button', { name: 'Show history' }).click()
    const history = page.getByRole('table', { name: 'History' })
    await expect(history).toContainText('Initial Balance')
    await expect(history).toContainText('Tracking start moved')
    await expect(history).toContainText('Rent was already in the amount')
  })
})
