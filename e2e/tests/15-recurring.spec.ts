import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 14-budgets.spec.ts. Recurring bills (slice 14) at 710px and 1280px. The database is shared and earlier
// specs left repeated expenses, so every width makes its own checking account and its own bill names, and every
// assertion is about that account only. Today is the stack's fixed 2026-10-03, so dates are stated against it.

async function ownerId(page: Page): Promise<string> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', {
      data: { name: 'Recurring Household' },
    })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Recurring Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.find((member) => member.active)!.id
}

async function makeAccount(page: Page, name: string): Promise<string> {
  const owner = await ownerId(page)
  const account = await page.request.post('/api/v1/accounts', {
    data: {
      type: 'checking',
      name,
      institution: 'Harbor Bank',
      ownerMemberIds: [owner],
      openedOn: '2026-01-01',
      openingBalance: '5000.00',
    },
  })
  expect(account.ok()).toBeTruthy()
  return ((await account.json()) as { id: string }).id
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

async function fillSchedule(
  page: Page,
  fields: { name: string; amount: string; frequency: string; due: string; account: string },
) {
  await page.getByLabel('Name', { exact: true }).fill(fields.name)
  await page.getByLabel('Expected amount').fill(fields.amount)
  await page.getByLabel('Frequency').selectOption({ label: fields.frequency })
  await page.getByLabel(/due date/).fill(fields.due)
  await page.getByLabel('Paid from').selectOption({ label: fields.account })
  await page.getByLabel('Category').selectOption({ label: 'Utilities' })
}

for (const [width, account, name, frequency, amount, due, following] of [
  [710, 'Recurring Checking 710', 'Gym 710', 'Monthly', '180', '2026-10-05', '2026-11-05'],
  [1280, 'Recurring Checking 1280', 'Gym 1280', 'Weekly', '45', '2026-10-09', '2026-10-16'],
] as const) {
  test.describe.serial(`Recurring bills at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_RECURRING_006 create a ${frequency} schedule, review, Cancel keeps nothing, Confirm shows the status and takes focus (${width}px)`, async ({
      page,
    }) => {
      const id = await makeAccount(page, account)
      await page.goto('/recurring')
      const opener = page.getByRole('button', { name: 'Add recurring bill' })
      await opener.click()
      await fillSchedule(page, { name, amount, frequency, due, account })
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      const review = page.getByRole('region', { name: new RegExp(`Review: ${name}`) })
      await expectFocusInside(review)
      await expect(review).toContainText(due)
      await expect(review).toContainText(following)
      await expect(review).toContainText('Estimate, not a recorded expense')
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toBeHidden()
      await expect(opener).toBeFocused()
      await expect(page.getByRole('region', { name: 'Schedules' })).not.toContainText(name)

      await opener.click()
      await fillSchedule(page, { name, amount, frequency, due, account })
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm saving the schedule' }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText(`next due ${due}, then ${following}`)
      await expect(status).toContainText('Balance and spending are unchanged')
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('region', { name: 'Schedules' })).toContainText(
        `Next due ${due}. Following ${following}.`,
      )
      await expectNoSidewaysScroll(page)

      // The schedule moved no money: the account Balance and its entries are as they were.
      const detail = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
        balance: { amount: string }
      }
      expect(detail.balance.amount).toBe('5000.00')
      const entries = (await (
        await page.request.get(`/api/v1/accounts/${id}/activity`)
      ).json()) as unknown[]
      expect(entries).toHaveLength(0)
    })

    test(`V2_RECURRING_005 a negative estimate shows the message on the amount field, focused and in view (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/recurring')
      await page.getByRole('button', { name: 'Add recurring bill' }).click()
      await fillSchedule(page, {
        name: `Electricity ${width}`,
        amount: '-180',
        frequency: 'Monthly',
        due: '2026-10-05',
        account,
      })
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await expect(page.getByText('Enter an amount greater than zero')).toBeVisible()
      await expect(page.getByLabel('Expected amount')).toBeFocused()
      await expect(page.getByLabel('Expected amount')).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('region', { name: 'Schedules' })).not.toContainText(
        `Electricity ${width}`,
      )
    })
  })
}
