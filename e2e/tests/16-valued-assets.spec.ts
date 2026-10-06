import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 15-recurring.spec.ts. Property and other assets (slice 15) at 710px and 1280px. The database is shared, so
// every width makes its own accounts and names. Today is the stack's fixed 2026-10-03.

async function ownerId(page: Page): Promise<string> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Valued Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Valued Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.find((member) => member.active)!.id
}

test.beforeEach(async ({ page }) => {
  const id = await ownerId(page)
  await page.addInitScript(
    (member) => window.localStorage.setItem('wealthmesh.enteringAs', member),
    id,
  )
})

async function expectFocusInside(review: Locator) {
  await expect(review).toBeVisible()
  await expect(review.getByRole('heading').first()).toBeInViewport({ ratio: 1 })
  await expect
    .poll(() =>
      review.evaluate(
        (el) =>
          !!el.parentElement?.contains(document.activeElement) ||
          el.contains(document.activeElement),
      ),
    )
    .toBe(true)
}

async function expectNoSidewaysScroll(page: Page) {
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBeLessThanOrEqual(0)
}

for (const [width, type, label, name, balance, shown] of [
  [710, 'Property', 'property', 'Land 710', '', '$0.00'],
  [1280, 'Other asset', 'other asset', 'Collectibles 1280', '28,000.00', '$28,000.00'],
] as const) {
  test.describe.serial(`Valued asset setup at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_PROPERTY_002 setting up a ${label}: reviewed, Back keeps the details, Confirm saves one account (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: type })
      await page.getByLabel('Account name').fill(name)
      await page.getByRole('checkbox').first().check()
      await page.getByLabel('Opened on').fill('2026-09-01')
      if (balance) await page.getByLabel('Balance').fill(balance)
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: new RegExp(`Review new ${label}`) })
      await expectFocusInside(review)
      await expect(review).toContainText(`${name} will start at ${shown} on 2026-09-01.`)
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Account name')).toHaveValue(name)
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()

      const row = page.getByRole('row', { name: new RegExp(name) })
      await expect(row).toContainText(shown)
      await row.getByRole('link', { name }).click()
      await expect(page.getByRole('heading', { name: 'Value history' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add money in' })).toHaveCount(0)
      await expectNoSidewaysScroll(page)
    })

    test(`V2_PROPERTY_004 a negative amount shows its message on the Balance field (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: type })
      await page.getByLabel('Account name').fill(`Refused ${name}`)
      await page.getByRole('checkbox').first().check()
      await page.getByLabel('Balance').fill('-1.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(
        page.getByText(
          type === 'Property'
            ? 'Enter zero or a positive property value'
            : 'Enter zero or a positive asset value',
        ),
      ).toBeInViewport({ ratio: 1 })
      await expect(page.getByLabel('Balance')).toBeFocused()
      await page.goto('/accounts')
      await expect(page.getByRole('main')).not.toContainText(`Refused ${name}`)
    })
  })
}
