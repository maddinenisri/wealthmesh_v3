import { expect, test, type Page } from '@playwright/test'

// Runs after 10-tracking-start.spec.ts. Each new panel of slice 04 opens in view and nothing scrolls sideways at the
// two widths the owner checks.
test.describe.serial('slice 04 panels fit the page', () => {
  let accountId = ''

  async function open(page: Page) {
    await page.goto(`/accounts/${accountId}`)
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
  }

  async function expectInView(page: Page, name: string) {
    const panel = page.getByRole('region', { name })
    await expect(panel).toBeVisible()
    await expect(panel).toBeInViewport()
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)
  }

  test('set up an account', async ({ request }) => {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name: 'Layout Checking',
        ownerMemberIds: [members.find((m) => m.name === 'Alex Doe')!.id],
        openedOn: '2026-09-10',
        openingBalance: '5000.00',
      },
    })
    expect(response.status()).toBe(201)
    accountId = ((await response.json()) as { id: string }).id
  })

  for (const width of [710, 1280]) {
    test(`panels open in view at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page)

      await page.getByRole('button', { name: 'Attach statement' }).click()
      await expectInView(page, 'Attach statement')
      await page.getByRole('button', { name: 'Cancel' }).click()

      await page.getByRole('button', { name: 'Update balance' }).click()
      await page.getByLabel('Correct the starting balance').check()
      await expectInView(page, 'Correct the starting balance')
      await page
        .getByRole('region', { name: 'Correct the starting balance' })
        .getByLabel('Starting balance')
        .fill('5100.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await expectInView(page, 'Review starting balance correction')
      await page.getByRole('button', { name: 'Cancel' }).click()

      await page.getByRole('button', { name: 'Add money out' }).click()
      const form = page.getByRole('region', { name: 'Add money out' })
      await form.getByLabel('Amount').fill('20.00')
      await form.getByLabel('Date').fill('2026-09-03')
      await form.getByLabel('Category').selectOption({ label: 'Groceries' })
      await form.getByRole('button', { name: 'Review' }).click()
      await expectInView(page, 'Review historical setup')
      await page.getByLabel('Initial Balance at that date').fill('5020.00')
      await page.getByLabel('Reason').fill('Layout check')
      await page.getByRole('button', { name: 'Review' }).click()
      await expectInView(page, 'Review setup and expense')
      await page.getByRole('button', { name: 'Cancel' }).click()
    })
  }
})
