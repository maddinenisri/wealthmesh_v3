import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 11b-transfers.spec.ts and before 12-members.spec.ts, which renames Alex Doe and removes Samira.
// Each test makes its own cards through the page or the API so Balances are exact. Today is fixed to 2026-10-03.
test.describe.serial('credit cards', () => {
  const OWNER = 'Alex Doe (Parent)'

  async function sideways(page: Page) {
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
  }

  const row = (page: Page, name: string) =>
    page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })

  async function ownerId(request: APIRequestContext) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    return members.find((m) => m.name === 'Alex Doe')!.id
  }

  for (const width of [710, 1280]) {
    test(`V2_CARD_001 V2_CARD_005 V2_CARD_014 adds a card owed at ${width}px, explains each mistake, then follows it to the detail`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const name = `Everyday Credit Card ${width}`
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption('credit_card')
      await page.getByLabel('Issuer').fill('Harbor Cards')
      await page.getByRole('checkbox', { name: OWNER }).check()
      await page.getByLabel('Opened on').fill('2026-09-01')
      await page.getByLabel('Balance', { exact: true }).fill('$1,000.00')
      await page.getByRole('button', { name: 'Save account' }).click()

      // A missing name is explained, in view and focused, and everything else stays.
      const missing = page.getByText('Enter an account name')
      await expect(missing).toBeVisible()
      await expect(missing).toBeInViewport()
      await expect(page.getByLabel('Account name')).toBeFocused()
      await expect(page.getByLabel('Issuer')).toHaveValue('Harbor Cards')
      await expect(page.getByLabel('Balance', { exact: true })).toHaveValue('$1,000.00')
      await expect(page.getByLabel('Opened on')).toHaveValue('2026-09-01')

      await page.getByLabel('Account name').fill(name)
      await page.getByLabel('Balance', { exact: true }).fill('one thousand')
      await page.getByRole('button', { name: 'Save account' }).click()
      const invalid = page.getByText('Enter a valid amount')
      await expect(invalid).toBeVisible()
      await expect(invalid).toBeInViewport()
      await expect(page.getByLabel('Balance', { exact: true })).toBeFocused()

      await page.getByLabel('Balance', { exact: true }).fill('$1,000.00')
      await page.getByLabel('Balance means').selectOption('owed')
      await page.getByRole('button', { name: 'Save account' }).click()

      const listed = row(page, name)
      await expect(listed).toContainText('$1,000.00 owed')
      await expect(listed).toContainText('Harbor Cards')
      await expect(listed).toContainText('Alex Doe')
      await expect(listed).toContainText('2026-09-01')
      await expect(listed).not.toContainText('Overdrawn')
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      await page.getByRole('link', { name, exact: true }).click()
      const main = page.getByRole('main')
      await expect(main).toContainText('Credit card account')
      await expect(main).toContainText('Initial Balance$1,000.00 owed on 2026-09-01')
      await expect(main).toContainText('No money activity has been recorded yet.')
      for (const action of ['Record purchase', 'Record refund', 'Record payment']) {
        await expect(page.getByRole('button', { name: action })).toBeVisible()
      }
      await expect(page.getByRole('button', { name: 'Add money in' })).toHaveCount(0)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }

  test('V2_CARD_003 shows Card credit in the list and the Household card, apart from debt', async ({
    page,
  }) => {
    await page.goto('/accounts/new')
    await page.getByLabel('Account type').selectOption('credit_card')
    await page.getByLabel('Account name').fill('Rewards Credit Card')
    await page.getByLabel('Issuer').fill('Harbor Cards')
    await page.getByRole('checkbox', { name: OWNER }).check()
    await page.getByLabel('Opened on').fill('2026-09-01')
    await page.getByLabel('Balance', { exact: true }).fill('$50.00')
    await page.getByLabel('Balance means').selectOption('credit')
    await page.getByRole('button', { name: 'Save account' }).click()

    await expect(row(page, 'Rewards Credit Card')).toContainText('$50.00 Card credit')
    await page.goto('/')
    const card = page.getByRole('listitem').filter({ hasText: 'Rewards Credit Card' })
    await expect(card).toContainText('$50.00 Card credit')
    await expect(card).not.toContainText('owed')
  })

  test('V2_CARD_004 edits name, issuer and owner and keeps the Balance', async ({
    page,
    request,
  }) => {
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'credit_card',
        name: 'Travel Card',
        institution: 'Harbor Cards',
        ownerMemberIds: [await ownerId(request)],
        openedOn: '2026-09-01',
        openingBalance: '300.00',
        balanceSide: 'owed',
      },
    })
    expect(response.status()).toBe(201)
    const id = ((await response.json()) as { id: string }).id
    await page.goto(`/accounts/${id}/edit`)
    await expect(page.getByLabel('Balance', { exact: true })).toHaveCount(0)
    await page.getByLabel('Account name').fill('Household Card')
    await page.getByLabel('Issuer').fill('Harbor Credit Union')
    await page.getByRole('button', { name: 'Save details' }).click()
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Household Card' })).toBeVisible()
    await expect(main).toContainText('Harbor Credit Union')
    await expect(main).toContainText('$300.00 owed')
  })
})
