import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 19-loan-corrections.spec.ts. Mortgages (slice 16b) at 710px and 1280px: setup, a payment, its
// correction, removal and Undo, a lender correction and a future plan. The database is shared, so every width makes
// its own accounts. Today is the stack's fixed 2026-10-03.

async function ownerId(page: Page): Promise<string> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', {
      data: { name: 'Mortgage Household' },
    })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Mortgage Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.find((member) => member.active)!.id
}

async function makeAccount(
  page: Page,
  owner: string,
  type: string,
  name: string,
  amount: string,
): Promise<string> {
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      institution: type === 'mortgage' ? 'Maple Bank' : 'Harbor Bank',
      ownerMemberIds: [owner],
      openedOn: '2026-09-01',
      openingBalance: amount,
    },
  })
  expect(made.ok()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
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

async function balanceOf(page: Page, id: string): Promise<string> {
  const account = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
    balance: { amount: string }
  }
  return account.balance.amount
}

for (const width of [710, 1280] as const) {
  test.describe.serial(`Mortgages at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const bank = `Mortgage Checking ${width}`
    const mortgage = `Home Mortgage ${width}`
    let bankId = ''
    let mortgageId = ''

    test(`V2_MORTGAGE_001 add a mortgage: the review shows the lender and the amount owed, and the list says owed (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      bankId = await makeAccount(page, owner, 'checking', bank, '5000.00')
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption('mortgage')
      await page.getByLabel('Account name').fill(mortgage)
      await page.getByLabel('Lender').fill('Maple Bank')
      await page.getByRole('checkbox').first().check()
      await page.getByLabel('As of').fill('2026-09-01')
      await page.getByLabel('Amount owed').fill('200000.00')
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('heading', { name: 'Review new mortgage' })
      await expect(review).toBeVisible()
      await expect(
        page.getByText(`${mortgage} will start at $200,000.00 owed on 2026-09-01.`),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Confirm' }).click()
      const row = page.getByRole('row').filter({ hasText: mortgage })
      await expect(row).toContainText('$200,000.00 owed')
      await expect(row).toContainText('Mortgage')
      mortgageId = (await row.getByRole('link', { name: mortgage }).getAttribute('href'))!
        .split('/')
        .pop()!
      expect(await balanceOf(page, mortgageId)).toBe('-200000.00')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_MORTGAGE_003 pay the mortgage from checking: the interest counts as Mortgage interest (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${bankId}`)
      await page
        .getByRole('button', { name: /^Pay a (loan or )?mortgage$|^Pay a loan or mortgage$/ })
        .click()
      const form = page.getByRole('region', { name: 'Record payment' })
      await expectFocusInside(form)
      await form.getByLabel(/to pay$/).selectOption({ label: `${mortgage} (Mortgage)` })
      await form.getByLabel('Payment amount').fill('1200.00')
      await form.getByLabel('Principal').fill('800.00')
      await form.getByLabel('Interest').fill('350.00')
      await form.getByLabel('Date').fill('2026-09-15')
      await form.getByRole('button', { name: 'Review' }).click()
      await expect(form.getByText('$50.00 remains unassigned')).toBeVisible()
      await form.getByLabel('Interest').fill('400.00')
      await form.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review payment' })
      await expectFocusInside(review)
      await expect(review).toContainText('Counts as spending: Mortgage interest')
      await page.getByRole('button', { name: 'Confirm payment' }).click()
      await expect(
        page.getByRole('row').filter({ hasText: `Payment to ${mortgage}` }),
      ).toBeVisible()
      expect(await balanceOf(page, bankId)).toBe('3800.00')
      expect(await balanceOf(page, mortgageId)).toBe('-199200.00')
      await page.goto('/spending')
      await page.getByRole('textbox', { name: 'Month' }).fill('2026-09')
      await page.getByLabel('Account').selectOption({ label: `${bank} (Checking)` })
      await expect(
        page.getByRole('listitem').filter({ hasText: 'Mortgage interest' }),
      ).toContainText('$400.00 (1 entry)')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_MORTGAGE_004 correct the portions, then remove and bring the payment back (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${bankId}`)
      await page.getByRole('button', { name: /^Edit payment to/ }).click()
      const form = page.getByRole('region', { name: 'Edit payment' })
      await expectFocusInside(form)
      await form.getByLabel('Principal').fill('850.00')
      await form.getByLabel('Interest').fill('350.00')
      await form.getByLabel('Reason (optional)').fill("Use lender's actual payment breakdown")
      await form.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('region', { name: 'Review change' })).toContainText(
        'Counts as spending: Mortgage interest',
      )
      await page.getByRole('button', { name: 'Confirm change' }).click()
      await expect(
        page.getByRole('row').filter({ hasText: `Payment to ${mortgage}` }),
      ).toBeVisible()
      await expect.poll(() => balanceOf(page, mortgageId)).toBe('-199150.00')
      expect(await balanceOf(page, bankId)).toBe('3800.00')

      await page.getByRole('button', { name: /^Remove payment to/ }).click()
      const removal = page.getByRole('region', { name: 'Review removal' })
      await expectFocusInside(removal)
      await expect(removal).toContainText(`${mortgage} Balance owed after removal$200,000.00 owed`)
      await removal.getByRole('button', { name: 'Confirm removal' }).click()
      await expect(page.getByText('No money activity has been recorded yet.')).toBeVisible()
      expect(await balanceOf(page, bankId)).toBe('5000.00')
      await page.getByRole('button', { name: 'Show history' }).click()
      await page.getByRole('button', { name: /^Undo payment to/ }).click()
      const undo = page.getByRole('region', { name: 'Review Undo' })
      await expectFocusInside(undo)
      await undo.getByRole('button', { name: 'Confirm Undo' }).click()
      await expect(page.getByRole('status')).toContainText('Restored the $1,200.00 payment')
      await expect.poll(() => balanceOf(page, bankId)).toBe('3800.00')
      expect(await balanceOf(page, mortgageId)).toBe('-199150.00')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_MORTGAGE_008 a lender correction is reviewed and cancelled, then saved; and the Household lists the mortgage under Mortgages (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${mortgageId}`)
      await page.getByRole('button', { name: 'Update balance owed' }).click()
      const form = page.getByRole('region', { name: 'Update balance owed' })
      await expectFocusInside(form)
      await form.getByLabel('Balance owed').fill('199050.00')
      await form.getByLabel('Date').fill('2026-09-30')
      await form.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review balance update' })
      await expectFocusInside(review)
      await expect(review).toContainText('Difference$100.00 decrease in debt')
      await review.getByRole('button', { name: 'Cancel' }).click()
      expect(await balanceOf(page, mortgageId)).toBe('-199150.00')
      await page.getByRole('button', { name: 'Update balance owed' }).click()
      await form.getByLabel('Balance owed').fill('199050.00')
      await form.getByLabel('Date').fill('2026-09-30')
      await form.getByRole('button', { name: 'Review' }).click()
      await review.getByLabel('Reason').fill('Lender correction')
      await review.getByRole('button', { name: 'Confirm correction' }).click()
      await expect(page.getByText(/Balance correction: Lender correction/)).toBeVisible()
      expect(await balanceOf(page, mortgageId)).toBe('-199050.00')

      await page.goto('/')
      const group = page.getByRole('region', { name: 'Mortgages' })
      await expect(group).toContainText(mortgage)
      await expect(group).toContainText('$199,050.00 owed')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_DATED_VALUE_001 a date after today on the mortgage is guided to a plan that is listed, removable and never counted (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${mortgageId}`)
      await page.getByRole('button', { name: 'Update balance owed' }).click()
      const form = page.getByRole('region', { name: 'Update balance owed' })
      await form.getByLabel('Balance owed').fill('150000.00')
      await form.getByLabel('Date').fill('2026-12-31')
      await form.getByRole('button', { name: 'Review' }).click()
      const alert = form.getByRole('alert')
      await expect(alert).toContainText(
        'Save it as a future plan, or choose a date on or before today.',
      )
      await alert.getByRole('button', { name: 'Save as a future plan' }).click()
      const plan = page.getByRole('region', { name: 'Plan a future amount owed' })
      await expectFocusInside(plan)
      await plan.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review plan' })
      await expectFocusInside(review)
      await expect(review).toContainText(
        'never counted in the Balance owed, wealth or any past date',
      )
      await review.getByRole('button', { name: 'Confirm plan' }).click()
      await expect(page.getByRole('status')).toContainText(
        'Saved a plan of $150,000.00 owed for 2026-12-31.',
      )
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeFocused()
      const plans = page.getByRole('region', { name: 'Planned amounts owed' })
      await expect(plans).toContainText('$150,000.00 owed')
      expect(await balanceOf(page, mortgageId)).toBe('-199050.00')

      await page.getByRole('button', { name: 'Close account' }).click()
      await expect(page.getByRole('main')).toContainText('Closing needs a zero Balance owed')
      await page.getByRole('button', { name: 'Cancel' }).first().click()

      await plans.getByRole('button', { name: 'Remove plan for 2026-12-31' }).click()
      const removal = page.getByRole('region', { name: 'Review removal' })
      await expectFocusInside(removal)
      await removal.getByRole('button', { name: 'Confirm removal' }).click()
      await expect(page.getByRole('status')).toContainText('Removed the plan $150,000.00 owed')
      await expect(plans).toContainText('Removed')
      expect(await balanceOf(page, mortgageId)).toBe('-199050.00')
      await expectNoSidewaysScroll(page)
    })
  })
}
