import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 13-lifecycle.spec.ts. Budgets (slice 13) at 710px and 1280px. The database is shared and September already
// holds spending from earlier specs, so each width uses a month no earlier spec writes to (2026-02 and 2026-03) and
// builds its own spending there with the scenario's figures.

async function ownerId(page: Page): Promise<string> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Budget Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Budget Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.find((member) => member.active)!.id
}

async function spend(page: Page, month: string, width: number) {
  const owner = await ownerId(page)
  const account = await page.request.post('/api/v1/accounts', {
    data: {
      type: 'checking',
      name: `Budget Checking ${width}`,
      institution: 'Harbor Bank',
      ownerMemberIds: [owner],
      openedOn: '2026-01-01',
      openingBalance: '50000.00',
    },
  })
  expect(account.ok()).toBeTruthy()
  const { id } = (await account.json()) as { id: string }
  const rows: [string, string][] = [
    ['Rent', '1500.00'],
    ['Utilities', '180.00'],
    ['Insurance', '700.00'],
    ['Groceries', '600.00'],
    ['Dining', '380.00'],
    ['Travel', '300.00'],
  ]
  for (const [index, [category, amount]] of rows.entries()) {
    const saved = await page.request.post(`/api/v1/accounts/${id}/expenses`, {
      headers: { 'Idempotency-Key': `e2e-budget-${month}-${index}` },
      data: {
        description: category,
        amount,
        occurredOn: `${month}-0${index + 2}`,
        category,
        enteredByMemberId: owner,
      },
    })
    expect(saved.ok()).toBeTruthy()
  }
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
  // The review is taller than a short window: its top (the heading) must be in view, not all of it.
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

const targets: [string, string][] = [
  ['Rent', '1500'],
  ['Utilities', '180'],
  ['Insurance', '700'],
  ['Groceries', '600'],
  ['Dining', '350'],
  ['Travel', '270'],
]

for (const [width, month, name] of [
  [710, '2026-02', 'February'],
  [1280, '2026-03', 'March'],
] as const) {
  test.describe.serial(`Budget at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_BUDGET_001 build, review, Cancel keeps nothing, Confirm shows the status and takes focus (${width}px)`, async ({
      page,
    }) => {
      await spend(page, month, width)
      await page.goto('/spending')
      await page.getByRole('textbox', { name: 'Month' }).fill(month)
      await expect(page.getByText(`No Budget for ${name}`)).toBeVisible()
      const opener = page.getByRole('button', { name: 'Create Budget' })
      await opener.click()
      await page.getByLabel('Total Budget').fill('3600')
      for (const [category, amount] of targets)
        await page.getByLabel(`${category} target`, { exact: true }).fill(amount)
      await page.getByRole('button', { name: 'Review Budget' }).click()
      const review = page.getByRole('region', { name: `Review ${name} 2026 Budget` })
      await expectFocusInside(review)
      await expect(review).toContainText('Category targets total')
      await expect(review).toContainText('$3,600.00')
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toBeHidden()
      await expect(opener).toBeFocused()
      await expect(page.getByText(`No Budget for ${name}`)).toBeVisible()

      await opener.click()
      await page.getByLabel('Total Budget').fill('3600')
      for (const [category, amount] of targets)
        await page.getByLabel(`${category} target`, { exact: true }).fill(amount)
      await page.getByRole('button', { name: 'Review Budget' }).click()
      await page.getByRole('button', { name: 'Confirm saving the Budget' }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText('$60.00 over Budget')
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport({ ratio: 1 })
      const table = page.getByRole('table', { name: 'Budget by category' })
      await expect(table.getByRole('row', { name: /Dining/ })).toContainText('$30.00 over target')
      await expect(table.getByRole('row', { name: /Travel/ })).toContainText('$30.00 over target')
      await table.getByRole('button', { name: 'Dining' }).click()
      await expect(
        page.getByRole('table', { name: 'Expenses behind this Budget line' }),
      ).toContainText('$380.00')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_BUDGET_003 a target change is reviewed against the total; Cancel keeps the saved Budget (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/spending')
      await page.getByRole('textbox', { name: 'Month' }).fill(month)
      const opener = page.getByRole('button', { name: 'Edit Budget' })
      await opener.click()
      await page.getByLabel('Groceries target', { exact: true }).fill('650')
      await page.getByRole('button', { name: 'Review Budget' }).click()
      const review = page.getByRole('region', { name: `Review ${name} 2026 Budget` })
      await expectFocusInside(review)
      await expect(review).toContainText('$3,650.00')
      await expect(review).toContainText('$50.00 more than the total Budget')
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(opener).toBeFocused()
      await expect(page.getByRole('table', { name: 'Budget by category' })).toContainText('$600.00')
      await expect(page.getByText(/Category targets total \$3,600\.00/)).toBeVisible()
    })

    test(`V2_MONTHLY_003 the month review shows the month's Budget and how far spending is over it (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/spending')
      await page.getByRole('textbox', { name: 'Month' }).fill(month)
      const review = page.getByRole('region', { name: 'Month review' })
      await expect(review).toContainText(`${name} Budget $3,600.00`)
      await expect(review).toContainText('$60.00 over Budget')
      await expect(review).toContainText('Category details')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_BUDGET_007 a negative target is refused on the field (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/spending')
      await page.getByRole('textbox', { name: 'Month' }).fill(month)
      await page.getByRole('button', { name: 'Edit Budget' }).click()
      await page.getByLabel('Groceries target', { exact: true }).fill('-50')
      await page.getByRole('button', { name: 'Review Budget' }).click()
      await expect(page.getByText('Enter zero or a positive amount')).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('table', { name: 'Budget by category' })).toContainText('$600.00')
    })
  })
}
