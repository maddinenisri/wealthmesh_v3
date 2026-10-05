import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 11d-categories.spec.ts and before 12-members.spec.ts, which renames Alex Doe and removes Samira.
// Each test makes its own account through the API so Balances are exact. Today is fixed to 2026-10-03.
test.describe.serial('batch entry', () => {
  const OWNER = 'Alex Doe (Parent)'
  const DATES = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']

  async function sideways(page: Page) {
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
  }

  async function ownerId(request: APIRequestContext) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    return members.find((m) => m.name === 'Alex Doe')!.id
  }

  async function account(
    request: APIRequestContext,
    name: string,
    type: 'credit_card' | 'checking',
  ) {
    const response = await request.post('/api/v1/accounts', {
      data:
        type === 'credit_card'
          ? {
              type,
              name,
              institution: 'Harbor Cards',
              ownerMemberIds: [await ownerId(request)],
              openedOn: '2026-09-01',
              openingBalance: '0.00',
              balanceSide: 'owed',
            }
          : {
              type,
              name,
              institution: 'Harbor Bank',
              ownerMemberIds: [await ownerId(request)],
              openedOn: '2026-09-01',
              openingBalance: '5000.00',
            },
    })
    expect(response.status()).toBe(201)
    return ((await response.json()) as { id: string }).id
  }

  async function fillRow(
    page: Page,
    n: number,
    fields: { date: string; amount: string; category: string },
  ) {
    await page.getByLabel(`Date ${n}`, { exact: true }).fill(fields.date)
    await page.getByLabel(`Amount ${n}`, { exact: true }).fill(fields.amount)
    await page.getByLabel(`Category ${n}`, { exact: true }).selectOption({ label: fields.category })
  }

  for (const width of [710, 1280]) {
    test(`V2_EXPENSE_003 reviews and saves four weekly purchases together at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const name = `Batch Card ${width}`
      const id = await account(request, name, 'credit_card')
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      await page.getByRole('button', { name: 'Add several purchases' }).click()
      const panel = page.getByRole('region', { name: 'Add several purchases' })
      await expect(panel).toBeInViewport()
      await expect(panel.locator('xpath=..')).toBeFocused()
      await page.getByRole('button', { name: 'Add another purchase' }).click()
      await page.getByRole('button', { name: 'Add another purchase' }).click()
      for (const [index, date] of DATES.entries())
        await fillRow(page, index + 1, { date, amount: '150.00', category: 'Groceries' })
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await page.getByRole('button', { name: 'Review' }).click()

      const review = page.getByRole('region', { name: 'Review purchases' })
      await expect(review).toBeInViewport()
      await expect(page.getByRole('heading', { name: 'Review purchases' })).toBeFocused()
      await expect(review).toContainText(`Charged to ${name}`)
      for (const date of DATES) await expect(review).toContainText(date)
      await expect(review).toContainText('Total$600.00')
      await expect(review).toContainText('$600.00 owed')
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      // Nothing is saved yet.
      const before = await request.get(`/api/v1/accounts/${id}/activity`)
      expect(await before.json()).toHaveLength(0)

      await review.getByRole('button', { name: 'Confirm saving all' }).click()
      await expect(page.getByRole('region', { name: 'Review purchases' })).toHaveCount(0)
      await expect(page.getByRole('main')).toContainText('$600.00 owed')
      await expect(page.getByRole('row').filter({ hasText: '2026-09-27' })).toBeInViewport()
      for (const date of DATES)
        await expect(page.getByRole('row').filter({ hasText: date })).toBeVisible()
      const after = (await (
        await request.get(`/api/v1/accounts/${id}/activity`)
      ).json()) as unknown[]
      expect(after).toHaveLength(4)

      await page.getByRole('link', { name: 'Spending' }).click()
      await page.getByLabel('Month', { exact: true }).fill('2026-09')
      await page
        .getByLabel('Account', { exact: true })
        .selectOption({ label: `${name} (Credit card)` })
      await expect(
        page
          .getByRole('region', { name: /September 2026/ })
          .getByRole('list', { name: 'Spending by category' }),
      ).toContainText('Groceries $600.00 (4 entries)')
    })

    test(`V2_EXPENSE_005 one invalid amount saves none at ${width}px and keeps every entered value`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const id = await account(request, `Invalid Card ${width}`, 'credit_card')
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      await page.getByRole('button', { name: 'Add several purchases' }).click()
      await fillRow(page, 1, { date: '2026-09-06', amount: '150.00', category: 'Groceries' })
      await fillRow(page, 2, { date: '2026-09-13', amount: '-$100.00', category: 'Groceries' })
      await page.getByRole('button', { name: 'Review' }).click()

      const message = page.getByText('Enter an amount greater than zero')
      await expect(message).toBeVisible()
      await expect(message).toBeInViewport()
      await expect(page.getByLabel('Amount 2', { exact: true })).toBeFocused()
      await expect(page.getByLabel('Amount 1', { exact: true })).toHaveValue('150.00')
      await expect(page.getByLabel('Date 1', { exact: true })).toHaveValue('2026-09-06')
      await expect(page.getByLabel('Date 2', { exact: true })).toHaveValue('2026-09-13')
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      expect(await (await request.get(`/api/v1/accounts/${id}/activity`)).json()).toHaveLength(0)
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('main')).toContainText('$0.00 owed')
    })

    test(`V2_EXPENSE_004 cancelling the review of two prepared expenses saves nothing at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const id = await account(request, `Cancel Checking ${width}`, 'checking')
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      const opener = page.getByRole('button', { name: 'Add several expenses' })
      await opener.click()
      await fillRow(page, 1, { date: '2026-09-05', amount: '180.00', category: 'Utilities' })
      await fillRow(page, 2, { date: '2026-09-08', amount: '700.00', category: 'Rent' })
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review expenses' })
      await expect(review).toContainText('Total$880.00')
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toHaveCount(0)
      await expect(opener).toBeFocused()
      await expect(page.getByRole('main')).toContainText('$5,000.00')
      expect(await (await request.get(`/api/v1/accounts/${id}/activity`)).json()).toHaveLength(0)
    })

    test(`V2_EXPENSE_002 saves a purchase and adds another with the card and category kept at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const name = `Another Card ${width}`
      const id = await account(request, name, 'credit_card')
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      await page.getByRole('button', { name: 'Record purchase' }).click()
      await page.getByLabel('Amount', { exact: true }).fill('150.00')
      await page.getByLabel('Date', { exact: true }).fill('2026-09-06')
      await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Groceries' })
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Save and add another' }).click()

      const form = page.getByRole('region', { name: 'Record purchase' })
      await expect(form.getByRole('status')).toContainText('Saved $150.00 on 2026-09-06')
      await expect(page.getByRole('heading', { name: 'Record purchase' })).toBeFocused()
      await expect(form).toBeInViewport()
      await expect(form).toContainText(name)
      await expect(form.getByLabel('Category', { exact: true })).toHaveText(/Groceries/)
      await expect(form.getByLabel('Date', { exact: true })).toHaveValue('')
      await expect(form.getByLabel('Amount', { exact: true })).toHaveValue('')

      await form.getByLabel('Amount', { exact: true }).fill('150.00')
      await form.getByLabel('Date', { exact: true }).fill('2026-09-13')
      await form.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm saving' }).click()
      await expect(page.getByRole('main')).toContainText('$300.00 owed')
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await page.getByRole('link', { name: 'Spending' }).click()
      await page.getByLabel('Month', { exact: true }).fill('2026-09')
      await page
        .getByLabel('Account', { exact: true })
        .selectOption({ label: `${name} (Credit card)` })
      await expect(
        page
          .getByRole('region', { name: /September 2026/ })
          .getByRole('list', { name: 'Spending by category' }),
      ).toContainText('Groceries $300.00 (2 entries)')
    })
  }
})
