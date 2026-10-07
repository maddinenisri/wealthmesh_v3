import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 16-valued-assets.spec.ts. Loans (slice 16a) at 710px and 1280px. The database is shared, so every width
// makes its own accounts and names. Today is the stack's fixed 2026-10-03.

async function memberIds(page: Page): Promise<string[]> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Loan Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Loan Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.filter((member) => member.active).map((member) => member.id)
}

test.beforeEach(async ({ page }) => {
  const [id] = await memberIds(page)
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

for (const [width, name, owed, shown] of [
  [710, 'Car Loan 710', '20,000.00', '$20,000.00'],
  [1280, 'Personal Loan 1280', '', '$0.00'],
] as const) {
  test.describe.serial(`Loan setup at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`${owed ? 'V2_LOAN_001' : 'V2_LOAN_002'} setting up a loan: reviewed, Back keeps the details, Confirm saves one loan owed (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: 'Loan' })
      await expect(page.getByLabel('Lender')).toBeVisible()
      await expect(page.getByLabel('Bank')).toHaveCount(0)
      await page.getByLabel('Account name').fill(name)
      await page.getByLabel('Lender').fill('Maple Credit')
      await page.getByRole('checkbox').first().check()
      await page.getByLabel('As of').fill('2026-09-01')
      if (owed) await page.getByLabel('Amount owed').fill(owed)
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review new loan' })
      await expectFocusInside(review)
      await expect(review).toContainText(`${name} will start at ${shown} owed on 2026-09-01.`)
      await expect(review).toContainText('Lender: Maple Credit.')
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Account name')).toHaveValue(name)
      await expect(page.getByLabel('Account name')).toBeFocused()
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()

      const row = page.getByRole('row', { name: new RegExp(name) })
      await expect(row).toContainText(`${shown} owed`)
      await expect(row).toContainText('Loan')
      await row.getByRole('link', { name }).click()
      const details = page.getByLabel('Account details')
      await expect(details).toContainText('Balance owed')
      await expect(details).toContainText('Lender')
      await expect(details).toContainText(`Balance owed${shown}`)
      await expect(details).not.toContainText('-$')
      await expect(page.getByRole('button', { name: 'Add money in' })).toHaveCount(0)
      await expectNoSidewaysScroll(page)
    })

    test(`V2_LOAN_001 editing the name keeps lender and owed amount, and the Household card lists it under Loans (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts')
      await page.getByRole('link', { name }).click()
      await page.getByRole('link', { name: 'Edit account' }).click()
      await expect(page.getByLabel('Lender')).toHaveValue('Maple Credit')
      await page.getByLabel('Account name').fill(`Blue ${name}`)
      await page.getByRole('button', { name: 'Save details' }).click()
      await expect(page.getByRole('heading', { name: `Blue ${name}` })).toBeVisible()
      await expect(page.getByLabel('Account details')).toContainText(`Balance owed${shown}`)

      await page.goto('/')
      const loans = page.getByRole('region', { name: 'Loans' })
      await expect(loans).toContainText(`Blue ${name}`)
      await expect(loans.locator('li', { hasText: `Blue ${name}` })).toContainText(`${shown} owed`)
      await expect(
        page.getByRole('region', { name: 'Bank money' }).filter({ hasText: name }),
      ).toHaveCount(0)
      await expectNoSidewaysScroll(page)
    })

    test(`V2_LOAN_005 a negative or invalid amount owed shows its message and creates nothing (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: 'Loan' })
      await page.getByLabel('Account name').fill(`Refused ${name}`)
      await page.getByRole('checkbox').first().check()
      await page.getByLabel('Amount owed').fill('-1.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByText('Enter zero or a positive amount owed')).toBeVisible()
      await page.getByLabel('Amount owed').fill('abc')
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByText('Enter a valid amount')).toBeVisible()
      await page.goto('/accounts')
      await expect(page.getByRole('link', { name: `Refused ${name}` })).toHaveCount(0)
    })
  })
}
