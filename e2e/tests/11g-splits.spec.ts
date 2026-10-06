import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 11f-pay-card.spec.ts and before 12-members.spec.ts, which renames Alex Doe and removes Samira.
// Each test makes its own checking account through the API so Balances are exact. Today is fixed to 2026-10-03.
test.describe.serial('split expenses', () => {
  const OWNER = 'Alex Doe (Parent)'

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

  async function account(request: APIRequestContext, name: string) {
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
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

  /** A long activity list first, so a row left out of view shows up (a short table hides it). */
  async function seedLongList(request: APIRequestContext, id: string) {
    const member = await ownerId(request)
    for (let day = 2; day < 14; day++) {
      const response = await request.post(`/api/v1/accounts/${id}/expenses`, {
        headers: { 'Idempotency-Key': `${id}-seed-${day}` },
        data: {
          description: `Seed ${day}`,
          amount: '1.00',
          occurredOn: `2026-09-${String(day).padStart(2, '0')}`,
          category: 'Groceries',
          enteredByMemberId: member,
        },
      })
      expect(response.status()).toBe(201)
    }
  }

  async function ensureGifts(request: APIRequestContext) {
    const existing = (await (await request.get('/api/v1/categories?kind=spending')).json()) as {
      name: string
    }[]
    if (existing.some((c) => c.name === 'Gifts')) return
    const response = await request.post('/api/v1/categories', {
      data: { name: 'Gifts', kind: 'spending', enteredByMemberId: await ownerId(request) },
    })
    expect(response.status()).toBe(201)
  }

  async function fillSplit(page: Page, second: string) {
    await page.getByLabel('Description', { exact: true }).fill('Mixed shop')
    await page.getByLabel('Amount', { exact: true }).fill('120.00')
    await page.getByLabel('Date', { exact: true }).fill('2026-10-02')
    await page.getByLabel('Category 1', { exact: true }).selectOption({ label: 'Groceries' })
    await page.getByLabel('Portion amount 1', { exact: true }).fill('90.00')
    await page.getByLabel('Class 2', { exact: true }).selectOption({ label: 'Discretionary' })
    await page.getByLabel('Category 2', { exact: true }).selectOption({ label: 'Gifts' })
    await page.getByLabel('Portion amount 2', { exact: true }).fill(second)
  }

  for (const width of [710, 1280]) {
    test(`V2_SPLITS_003 and V2_SPLITS_001 reject $115.00 of $120.00, then save the split at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await ensureGifts(request)
      const id = await account(request, `Split Checking ${width}`)
      await seedLongList(request, id)
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      const opener = page.getByRole('button', { name: 'Split an expense' })
      await opener.click()
      const form = page.getByRole('region', { name: 'Split an expense' })
      await expect(form).toBeInViewport()
      await expect(form.locator('xpath=..')).toBeFocused()
      await fillSplit(page, '25.00')
      await expect(form.getByRole('status')).toContainText(
        '$115.00 is assigned and $5.00 is still to assign.',
      )
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await page.getByRole('button', { name: 'Review' }).click()

      const review = page.getByRole('region', { name: 'Review split expense' })
      await expect(review).toBeInViewport()
      await expect(page.getByRole('heading', { name: 'Review split expense' })).toBeFocused()
      await expect(review.getByRole('alert')).toContainText(
        '$115.00 is assigned and $5.00 is still to assign.',
      )
      await expect(review.getByRole('button', { name: 'Confirm saving' })).toBeDisabled()
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      // Nothing is saved while the portions do not add up.
      expect(await (await request.get(`/api/v1/accounts/${id}/activity`)).json()).toHaveLength(12)

      await review.getByRole('button', { name: 'Back' }).click()
      await page.getByLabel('Portion amount 2', { exact: true }).fill('30.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(review).toContainText('All $120.00 is assigned.')
      await review.getByRole('button', { name: 'Confirm saving' }).click()
      await expect(page.getByRole('region', { name: 'Review split expense' })).toHaveCount(0)

      const row = page.getByRole('row').filter({ hasText: 'Mixed shop' })
      await expect(row).toBeInViewport()
      await expect(row).toContainText('Split')
      await expect(row).toContainText('Groceries $90.00')
      await expect(row).toContainText('Gifts $30.00')
      await expect(page.getByRole('main')).toContainText('$4,868.00')
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      await page.getByRole('link', { name: 'Spending' }).click()
      await page.getByLabel('Month', { exact: true }).fill('2026-10')
      await page
        .getByLabel('Account', { exact: true })
        .selectOption({ label: `Split Checking ${width} (Checking)` })
      const month = page.getByRole('region', { name: /October 2026/ })
      await expect(month).toContainText('$120.00')
      await expect(month.getByRole('list', { name: 'Spending by category' })).toContainText(
        'Groceries $90.00',
      )
      await expect(month.getByRole('list', { name: 'Spending by category' })).toContainText(
        'Gifts $30.00',
      )
    })
  }
})
