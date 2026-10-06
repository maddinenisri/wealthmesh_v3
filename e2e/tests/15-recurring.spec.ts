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

async function makeBills(page: Page, account: string, description: string): Promise<string> {
  const owner = await ownerId(page)
  const id = await makeAccount(page, account)
  for (const [index, date] of ['2026-07-05', '2026-08-05', '2026-09-05'].entries()) {
    const saved = await page.request.post(`/api/v1/accounts/${id}/expenses`, {
      headers: { 'Idempotency-Key': `e2e-rec-${account}-${index}` },
      data: {
        description,
        amount: '180.00',
        occurredOn: date,
        category: 'Utilities',
        enteredByMemberId: owner,
      },
    })
    expect(saved.ok()).toBeTruthy()
  }
  return id
}

for (const [width, account, description] of [
  [710, 'Recurring Suggest 710', 'Electricity 710'],
  [1280, 'Recurring Suggest 1280', 'Electricity 1280'],
] as const) {
  test.describe.serial(`Recurring suggestions at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_RECURRING_001 a monthly suggestion shows its estimate, its next bill and its three bills (${width}px)`, async ({
      page,
    }) => {
      const id = await makeBills(page, account, description)
      await page.goto('/recurring')
      const item = page.getByRole('listitem').filter({ hasText: description })
      await expect(item).toContainText('Expected $180.00, Monthly')
      await expect(item).toContainText('Last recorded bill 2026-09-05')
      await expect(item).toContainText('Next expected bill 2026-10-05')
      await expect(item).toContainText('Estimate, not a recorded expense')
      await item.getByText('Supporting bills (3)').click()
      await expect(item.getByRole('link')).toHaveCount(3)
      await expectNoSidewaysScroll(page)
      const entries = (await (
        await page.request.get(`/api/v1/accounts/${id}/activity`)
      ).json()) as unknown[]
      expect(entries).toHaveLength(3)
    })

    if (width === 710) {
      test(`V2_RECURRING_002 confirming a suggestion saves the schedule without paying its next bill (${width}px)`, async ({
        page,
      }) => {
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: description })
        const opener = item.getByRole('button', { name: 'Review and confirm' })
        await opener.click()
        await expect(page.getByLabel('Expected amount')).toHaveValue('180.00')
        await expect(page.getByLabel('First due date')).toHaveValue('2026-10-05')
        await page.getByRole('button', { name: 'Review', exact: true }).click()
        const review = page.getByRole('region', { name: new RegExp(`Review: ${description}`) })
        await expectFocusInside(review)
        await review.getByRole('button', { name: 'Cancel' }).click()
        await expect(opener).toBeFocused()

        await opener.click()
        await page.getByRole('button', { name: 'Review', exact: true }).click()
        await page.getByRole('button', { name: 'Confirm saving the schedule' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText('next due 2026-10-05')
        await expect(status).toBeFocused()
        await expect(status).toBeInViewport({ ratio: 1 })
        const schedule = page
          .getByRole('region', { name: 'Schedules' })
          .getByRole('listitem')
          .filter({ hasText: description })
        await expect(schedule).toContainText('Next due 2026-10-05')
        await expect(schedule.getByText('Supporting bills (3)')).toBeVisible()
        await expect(
          page.getByRole('listitem').filter({ hasText: 'Review and confirm' }),
        ).toHaveCount(0)
        const accounts = (await (await page.request.get('/api/v1/accounts')).json()) as {
          name: string
          balance: { amount: string }
        }[]
        // 5000.00 opening minus three 180.00 bills: the schedule paid nothing.
        expect(accounts.find((a) => a.name === account)!.balance.amount).toBe('4460.00')
      })
    } else {
      test(`V2_RECURRING_009 dismissing a suggestion needs a review, Cancel keeps it, Confirm removes it and keeps every bill (${width}px)`, async ({
        page,
      }) => {
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: description })
        const opener = item.getByRole('button', { name: /Dismiss the .* suggestion/ })
        await opener.click()
        const review = page.getByRole('region', { name: /Review dismissing/ })
        await expectFocusInside(review)
        await review.getByRole('button', { name: 'Cancel' }).click()
        await expect(opener).toBeFocused()
        await expect(item).toBeVisible()

        await opener.click()
        await page.getByRole('button', { name: 'Confirm dismissing the suggestion' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText('All 3 recorded bills are unchanged')
        await expect(status).toBeFocused()
        await expect(page.getByRole('listitem').filter({ hasText: description })).toHaveCount(0)
        await expectNoSidewaysScroll(page)
      })
    }
  })
}

async function makeSchedule(page: Page, account: string, description: string) {
  const owner = await ownerId(page)
  const id = await makeBills(page, account, description)
  const saved = await page.request.post('/api/v1/recurring', {
    headers: { 'Idempotency-Key': `e2e-rec-sched-${account}` },
    data: {
      description,
      amount: '180.00',
      frequency: 'monthly',
      nextDueOn: '2026-10-05',
      accountId: id,
      category: 'Utilities',
      enteredByMemberId: owner,
    },
  })
  expect(saved.ok()).toBeTruthy()
  return { id, owner }
}

for (const [width, account, description] of [
  [710, 'Recurring Change 710', 'Power 710'],
  [1280, 'Recurring Change 1280', 'Power 1280'],
] as const) {
  test.describe.serial(`Recurring schedule changes at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    if (width === 710) {
      test(`V2_RECURRING_007 changing an estimate is reviewed, Cancel keeps it, Confirm changes the future and not the paid bill (${width}px)`, async ({
        page,
      }) => {
        const { id } = await makeSchedule(page, account, description)
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: description })
        const opener = item.getByRole('button', { name: 'Change' })
        await opener.click()
        await page.getByLabel('Expected amount').fill('200')
        await page.getByLabel('Frequency').selectOption({ label: 'Weekly' })
        await page.getByLabel('Next due date').fill('2026-10-09')
        await page.getByRole('button', { name: 'Review', exact: true }).click()
        const review = page.getByRole('region', { name: new RegExp(`Review: ${description}`) })
        await expectFocusInside(review)
        await expect(review).toContainText('Was $180.00 Monthly')
        await expect(review).toContainText('2026-10-16')
        await expectNoSidewaysScroll(page)
        await review.getByRole('button', { name: 'Cancel' }).click()
        await expect(opener).toBeFocused()
        await expect(item).toContainText('Expected $180.00, Monthly')

        await opener.click()
        await page.getByLabel('Expected amount').fill('200')
        await page.getByLabel('Frequency').selectOption({ label: 'Weekly' })
        await page.getByLabel('Next due date').fill('2026-10-09')
        await page.getByRole('button', { name: 'Review', exact: true }).click()
        await page.getByRole('button', { name: 'Confirm the change' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText(
          'now expected $200.00 weekly, next due 2026-10-09, then 2026-10-16',
        )
        await expect(status).toBeFocused()
        await expect(item).toContainText('Expected $200.00, Weekly')
        const bills = (await (
          await page.request.get(`/api/v1/accounts/${id}/activity`)
        ).json()) as {
          amount: string
          occurredOn: string
        }[]
        expect(bills).toHaveLength(3)
        expect(bills.map((b) => b.amount)).toEqual(['180.00', '180.00', '180.00'])
      })

      test(`V2_RECURRING_008 pause, then resume with an explicit date, invents no payment (${width}px)`, async ({
        page,
      }) => {
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: description })
        const pause = item.getByRole('button', { name: 'Pause' })
        await pause.click()
        const review = page.getByRole('region', { name: /Review pausing/ })
        await expectFocusInside(review)
        await review.getByRole('button', { name: 'Cancel' }).click()
        await expect(pause).toBeFocused()
        await pause.click()
        await page.getByRole('button', { name: 'Confirm pausing' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText('is paused')
        await expect(status).toBeFocused()
        await expect(item).toContainText('Paused')
        await expect(item).not.toContainText('Overdue by')

        await item.getByRole('button', { name: 'Resume' }).click()
        const resume = page.getByRole('region', { name: /Review resuming/ })
        await expectFocusInside(resume)
        await expect(resume.getByRole('button', { name: 'Confirm resuming' })).toBeDisabled()
        await resume.getByLabel('Next due date').fill('2026-11-05')
        await resume.getByRole('button', { name: 'Confirm resuming' }).click()
        await expect(page.getByRole('status')).toContainText('next due 2026-11-05')
        await expect(item).toContainText('Next due 2026-11-05')
        await expectNoSidewaysScroll(page)
      })
    } else {
      test(`V2_RECURRING_009 deleting an estimate is reviewed and keeps the paid bills (${width}px)`, async ({
        page,
      }) => {
        const { id } = await makeSchedule(page, account, description)
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: description })
        const opener = item.getByRole('button', { name: 'Delete' })
        await opener.click()
        const review = page.getByRole('region', { name: /Review deleting/ })
        await expectFocusInside(review)
        await review.getByRole('button', { name: 'Cancel' }).click()
        await expect(opener).toBeFocused()
        await expect(item).toBeVisible()
        await opener.click()
        await page.getByRole('button', { name: 'Confirm deleting the estimate' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText('is deleted')
        await expect(status).toContainText('3 recorded bills stay')
        await expect(status).toBeFocused()
        await expect(page.getByRole('listitem').filter({ hasText: description })).toHaveCount(0)
        const bills = (await (
          await page.request.get(`/api/v1/accounts/${id}/activity`)
        ).json()) as unknown[]
        expect(bills).toHaveLength(3)
      })

      test(`V2_RECURRING_008 a schedule on an archived account stays listed and offers only Pause and Delete (${width}px)`, async ({
        page,
      }) => {
        const { id, owner } = await makeSchedule(
          page,
          `${account} archived`,
          `${description} archived`,
        )
        const archived = await page.request.post(`/api/v1/accounts/${id}/archive`, {
          data: { enteredByMemberId: owner },
        })
        expect(archived.ok()).toBeTruthy()
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: `${description} archived` })
        await expect(item).toContainText('archived account')
        await expect(item.getByRole('button', { name: 'Change' })).toHaveCount(0)
        await expect(item.getByRole('button', { name: 'Pause' })).toBeVisible()
        await expect(item.getByRole('button', { name: 'Delete' })).toBeVisible()
        await expectNoSidewaysScroll(page)
      })
    }
  })
}

async function makeOneBill(page: Page, account: string, description: string, dueOn: string) {
  const owner = await ownerId(page)
  const id = await makeAccount(page, account)
  const saved = await page.request.post(`/api/v1/accounts/${id}/expenses`, {
    headers: { 'Idempotency-Key': `e2e-rec-one-${account}` },
    data: {
      description,
      amount: '180.00',
      occurredOn: '2026-09-05',
      category: 'Utilities',
      enteredByMemberId: owner,
    },
  })
  expect(saved.ok()).toBeTruthy()
  const schedule = await page.request.post('/api/v1/recurring', {
    headers: { 'Idempotency-Key': `e2e-rec-one-sched-${account}` },
    data: {
      description,
      amount: '180.00',
      frequency: 'monthly',
      nextDueOn: dueOn,
      accountId: id,
      category: 'Utilities',
      enteredByMemberId: owner,
    },
  })
  expect(schedule.ok()).toBeTruthy()
  return id
}

async function balanceOf(page: Page, id: string) {
  const detail = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
    balance: { amount: string }
  }
  return detail.balance.amount
}

for (const [width, account, description, dueOn, paidOn] of [
  [710, 'Recurring Record 710', 'Heat 710', '2026-10-05', '2026-09-30'],
  [1280, 'Recurring Record 1280', 'Heat 1280', '2026-10-05', '2026-10-03'],
] as const) {
  test.describe.serial(`Recurring actual expense at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_RECURRING_004 and 003 an early payment is reviewed, Cancel and Back save nothing, Confirm records it on its own date (${width}px)`, async ({
      page,
    }) => {
      const id = await makeOneBill(page, account, description, dueOn)
      await page.goto('/recurring')
      const item = page.getByRole('listitem').filter({ hasText: description })
      const opener = item.getByRole('button', { name: 'Record actual expense' })
      await opener.click()
      const form = page.getByRole('region', { name: `Record actual expense for ${description}` })
      await expectFocusInside(form)
      await expect(page.getByLabel('Actual amount')).toHaveValue('180.00')
      await page.getByLabel('Payment date').fill(paidOn)
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      const review = page.getByRole('region', { name: `Review recording ${description}` })
      await expectFocusInside(review)
      await expect(review).toContainText('Utilities')
      await expect(review).toContainText('Early payment date' + paidOn)
      await expect(review).toContainText('Next scheduled occurrence2026-11-05')
      await expect(review).toContainText('Nothing changes until you confirm')
      await expectNoSidewaysScroll(page)
      expect(await balanceOf(page, id)).toBe('4820.00')

      await review.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Payment date')).toHaveValue(paidOn)
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(opener).toBeFocused()
      await expect(item).toContainText('Next due 2026-10-05')
      expect(await balanceOf(page, id)).toBe('4820.00')

      await opener.click()
      await page.getByLabel('Payment date').fill(paidOn)
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm saving the expense' }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText(`paid early on ${paidOn}`)
      await expect(status).toContainText('The next occurrence is 2026-11-05')
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport({ ratio: 1 })
      await expect(item).toContainText(`2026-10-05 occurrence: paid early on ${paidOn}`)
      await expect(item).toContainText('Next due 2026-11-05')
      expect(await balanceOf(page, id)).toBe('4640.00')
      const entries = (await (
        await page.request.get(`/api/v1/accounts/${id}/activity`)
      ).json()) as {
        occurredOn: string
      }[]
      expect(entries.map((entry) => entry.occurredOn).sort()).toEqual(['2026-09-05', paidOn])
      await expectNoSidewaysScroll(page)
    })
  })
}

async function makeOverdue(page: Page, account: string, description: string) {
  const owner = await ownerId(page)
  const id = await makeAccount(page, account)
  const schedule = await page.request.post('/api/v1/recurring', {
    headers: { 'Idempotency-Key': `e2e-rec-over-${account}` },
    data: {
      description,
      amount: '180.00',
      frequency: 'monthly',
      nextDueOn: '2026-10-01',
      accountId: id,
      category: 'Utilities',
      enteredByMemberId: owner,
    },
  })
  expect(schedule.ok()).toBeTruthy()
  return id
}

for (const [width, account, description] of [
  [710, 'Recurring Overdue 710', 'Water 710'],
  [1280, 'Recurring Overdue 1280', 'Water 1280'],
] as const) {
  test.describe.serial(`Recurring overdue at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_RECURRING_010 an unpaid occurrence says Overdue by 2 days and offers Record, Reschedule and Dismiss; nothing is posted (${width}px)`, async ({
      page,
    }) => {
      const id = await makeOverdue(page, account, description)
      await page.goto('/recurring')
      const item = page.getByRole('listitem').filter({ hasText: description })
      await expect(item).toContainText('Overdue by 2 days')
      await expect(item.getByRole('button', { name: 'Record actual expense' })).toBeVisible()
      // Cowork fault: the label of a small primary button was dark on dark (tailwind-merge dropped text-on-primary).
      await expect(item.getByRole('button', { name: 'Record actual expense' })).toHaveCSS(
        'color',
        'rgb(255, 255, 255)',
      )
      await expect(item.getByRole('button', { name: 'Reschedule' })).toBeVisible()
      await expect(item.getByRole('button', { name: 'Dismiss this occurrence' })).toBeVisible()
      expect(await balanceOf(page, id)).toBe('5000.00')
      const entries = (await (
        await page.request.get(`/api/v1/accounts/${id}/activity`)
      ).json()) as unknown[]
      expect(entries).toHaveLength(0)
      await expectNoSidewaysScroll(page)
    })

    if (width === 710) {
      test(`V2_RECURRING_010 dismissing just this occurrence posts no expense and the next one is 2026-11-01 (${width}px)`, async ({
        page,
      }) => {
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: description })
        const opener = item.getByRole('button', { name: 'Dismiss this occurrence' })
        await opener.click()
        const review = page.getByRole('region', { name: /Review dismissing the 2026-10-01/ })
        await expectFocusInside(review)
        await review.getByRole('button', { name: 'Cancel' }).click()
        await expect(opener).toBeFocused()
        await expect(item).toContainText('Overdue by 2 days')

        await opener.click()
        await page.getByRole('button', { name: 'Confirm dismissing this occurrence' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText('The next occurrence is 2026-11-01')
        await expect(status).toBeFocused()
        await expect(status).toBeInViewport({ ratio: 1 })
        await expect(item).toContainText('Next due 2026-11-01')
        await expect(item).toContainText('2026-10-01 occurrence: dismissed, no expense recorded')
        await expect(item).not.toContainText('Overdue by')
        await expectNoSidewaysScroll(page)
      })
    } else {
      test(`V2_RECURRING_010 rescheduling an overdue occurrence is reviewed and posts nothing (${width}px)`, async ({
        page,
      }) => {
        await page.goto('/recurring')
        const item = page.getByRole('listitem').filter({ hasText: description })
        const opener = item.getByRole('button', { name: 'Reschedule' })
        await opener.click()
        const review = page.getByRole('region', { name: /Review rescheduling/ })
        await expectFocusInside(review)
        await review.getByLabel('New due date').fill('2026-10-12')
        await review.getByRole('button', { name: 'Cancel' }).click()
        await expect(opener).toBeFocused()
        await expect(item).toContainText('Overdue by 2 days')

        await opener.click()
        await page.getByLabel('New due date').fill('2026-10-12')
        await page.getByRole('button', { name: 'Confirm rescheduling' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText('rescheduled from 2026-10-01 to 2026-10-12')
        await expect(status).toBeFocused()
        await expect(item).toContainText('Next due 2026-10-12')
        await expect(item).not.toContainText('Overdue by')
        await expectNoSidewaysScroll(page)
      })
    }
  })
}

for (const [width, account] of [
  [710, 'Recurring Long 710'],
  [1280, 'Recurring Long 1280'],
] as const) {
  test.describe.serial(`Recurring long list and long names at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_RECURRING_006 a long list, a long name and Back from the review keep focus, scroll and layout (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      const id = await makeAccount(page, account)
      const longName =
        `Width ${width} quarterly property maintenance and building insurance contribution for the whole household ${'and more words '.repeat(5)}`.slice(
          0,
          190,
        )
      for (let index = 0; index < 12; index++) {
        const saved = await page.request.post('/api/v1/recurring', {
          headers: { 'Idempotency-Key': `e2e-rec-long-${width}-${index}` },
          data: {
            description: index === 0 ? longName : `Long list bill ${width} ${index}`,
            amount: '25.00',
            frequency: 'weekly',
            nextDueOn: '2026-10-09',
            accountId: id,
            category: 'Utilities',
            enteredByMemberId: owner,
          },
        })
        expect(saved.ok()).toBeTruthy()
      }
      await page.goto('/recurring')
      await expect(
        page.getByRole('listitem').filter({ hasText: longName.slice(0, 40) }),
      ).toBeVisible()
      await expectNoSidewaysScroll(page)

      // Open the form from the bottom of a long list: it is brought into view with focus inside it.
      const opener = page.getByRole('button', { name: 'Add recurring bill' })
      await opener.scrollIntoViewIfNeeded()
      await opener.click()
      const form = page.getByRole('region', { name: 'New recurring bill' })
      await expectFocusInside(form)
      await page.getByLabel('Name', { exact: true }).fill(`New long ${width}`)
      await page.getByLabel('Expected amount').fill('30')
      await page.getByLabel(/due date/).fill('2026-10-09')
      await page.getByLabel('Paid from').selectOption({ label: account })
      await page.getByLabel('Category').selectOption({ label: 'Utilities' })
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      const review = page.getByRole('region', { name: new RegExp(`Review: New long ${width}`) })
      await expectFocusInside(review)
      await review.getByRole('button', { name: 'Back' }).click()
      await expectFocusInside(page.getByRole('region', { name: 'New recurring bill' }))
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue(`New long ${width}`)
      await expect(page.getByLabel('Expected amount')).toHaveValue('30')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm saving the schedule' }).click()

      // After Confirm the status line is in view and focused, though the list is long.
      const status = page.getByRole('status')
      await expect(status).toContainText(`Saved New long ${width}`)
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport({ ratio: 1 })
      await expect(
        page.getByRole('listitem').filter({ hasText: `New long ${width}` }),
      ).toBeVisible()
      await expectNoSidewaysScroll(page)

      // A long name wraps inside its row instead of widening the page.
      const row = page.getByRole('listitem').filter({ hasText: longName.slice(0, 40) })
      const box = await row.boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    })
  })
}

for (const width of [710, 1280] as const) {
  test.describe(`Recurring page details at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_RECURRING_006 the main menu stays on one line and Record opens with today as the payment date (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/recurring')
      const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link')
      const tops = await links.evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().top)),
      )
      expect(new Set(tops).size).toBe(1)
      const record = page.getByRole('button', { name: /^Record actual expense for / }).first()
      if ((await record.count()) > 0) {
        await record.click()
        await expect(page.getByLabel('Payment date')).toHaveValue('2026-10-03')
      }
    })
  })
}
