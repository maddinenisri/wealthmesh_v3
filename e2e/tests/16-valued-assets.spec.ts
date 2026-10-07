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

    test(`${type === 'Property' ? 'V2_PROPERTY_002' : 'V2_OTHER_ASSET_002'} setting up a ${label}: reviewed, Back keeps the details, Confirm saves one account (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: type })
      await page.getByLabel('Account name').fill(name)
      await page.getByRole('checkbox').first().check()
      await page.getByLabel('Value date').fill('2026-09-01')
      if (balance) await page.getByLabel('Value', { exact: true }).fill(balance)
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

    test(`V2_PROPERTY_004 a negative amount shows its message on the Value field (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: type })
      await page.getByLabel('Account name').fill(`Refused ${name}`)
      await page.getByRole('checkbox').first().check()
      await page.getByLabel('Value', { exact: true }).fill('-1.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(
        page.getByText(
          type === 'Property'
            ? 'Enter zero or a positive property value'
            : 'Enter zero or a positive asset value',
        ),
      ).toBeInViewport({ ratio: 1 })
      await expect(page.getByLabel('Value', { exact: true })).toBeFocused()
      await page.goto('/accounts')
      await expect(page.getByRole('main')).not.toContainText(`Refused ${name}`)
    })
  })
}

async function makeAsset(
  page: Page,
  type: 'property' | 'other_asset',
  name: string,
  amount: string,
): Promise<string> {
  const owner = await ownerId(page)
  const account = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      ownerMemberIds: [owner],
      openedOn: '2026-09-01',
      openingBalance: amount,
    },
  })
  expect(account.ok()).toBeTruthy()
  return ((await account.json()) as { id: string }).id
}

async function balanceOf(page: Page, id: string): Promise<string> {
  const detail = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
    balance: { amount: string }
  }
  return detail.balance.amount
}

async function enter(page: Page, value: string, date: string, reason?: string) {
  await page.getByRole('button', { name: 'Record new value' }).click()
  await page.getByLabel('Value', { exact: true }).fill(value)
  await page.getByLabel('Date', { exact: true }).fill(date)
  if (reason) await page.getByLabel('Reason (optional)').fill(reason)
  await page.getByRole('button', { name: 'Review', exact: true }).click()
}

for (const [width, name, first, second] of [
  [710, 'Value Home 710', '320,000.00', '315,000.00'],
  [1280, 'Value Home 1280', '330,000.00', '325,000.00'],
] as const) {
  test.describe.serial(`Dated values at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    let id = ''

    test(`V2_PROPERTY_003 record a value: Cancel keeps nothing, Confirm shows the status and takes focus (${width}px)`, async ({
      page,
    }) => {
      id = await makeAsset(page, 'property', name, '300000.00')
      await page.goto(`/accounts/${id}`)
      await enter(page, first, '2026-09-30', 'September estimate')
      const review = page.getByRole('region', { name: 'Review value' })
      await expectFocusInside(review)
      await expect(review).toContainText('asset value increase')
      await expectNoSidewaysScroll(page)

      // Back returns to the form with what was typed, and focus goes into it.
      await review.getByRole('button', { name: 'Back' }).click()
      const form = page.getByRole('region', { name: 'Record new value' })
      await expectFocusInside(form)
      await expect(page.getByLabel('Value', { exact: true })).toHaveValue(first)
      await page.getByRole('button', { name: 'Review', exact: true }).click()

      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toBeHidden()
      await expect(page.getByRole('button', { name: 'Record new value' })).toBeFocused()
      expect(await balanceOf(page, id)).toBe('300000.00')

      await enter(page, first, '2026-09-30', 'September estimate')
      await page.getByRole('button', { name: 'Confirm value' }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText('value is $')
      await expect(page.getByRole('heading', { name: 'Value history' })).toBeFocused()
      await expect(page.getByRole('heading', { name: 'Value history' })).toBeInViewport({
        ratio: 1,
      })
      await expectNoSidewaysScroll(page)
      expect(await balanceOf(page, id)).toBe(first.replace(',', ''))
    })

    test(`V2_PROPERTY_003 correct the estimate with a reason; the original stays in history (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${id}`)
      await page
        .getByRole('button', { name: /^Correct \$/ })
        .first()
        .click()
      await page.getByLabel('Value', { exact: true }).fill(second)
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await expect(page.getByText('Enter a reason')).toBeInViewport({ ratio: 1 })
      await expect(page.getByLabel('Reason', { exact: true })).toBeFocused()
      await page.getByLabel('Reason', { exact: true }).fill('Copied the wrong estimate')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      const review = page.getByRole('region', { name: 'Review value correction' })
      await expectFocusInside(review)
      await review.getByRole('button', { name: 'Confirm correction' }).click()
      await expect(page.getByRole('status')).toContainText('Corrected to')
      await expect(page.getByRole('table')).toContainText('Replaced')
      await expect(page.getByRole('table')).toContainText('$300,000.00')
      await expectNoSidewaysScroll(page)
      expect(await balanceOf(page, id)).toBe(second.replace(',', ''))
    })

    test(`V2_PROPERTY_006 a future date is guided to a plan that never counts (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${id}`)
      const before = await balanceOf(page, id)
      await enter(page, '340,000.00', '2026-12-31')
      const alert = page.getByRole('alert').filter({ hasText: 'Future values are not completed' })
      await expect(alert).toBeInViewport({ ratio: 1 })
      await alert.getByRole('button', { name: 'Save as a future plan' }).click()
      const review = page.getByRole('region', { name: 'Review plan' })
      await expectFocusInside(review)
      await review.getByRole('button', { name: 'Confirm plan' }).click()
      await expect(page.getByRole('status')).toContainText('not counted in the value or wealth')
      await expect(page.getByRole('table')).toContainText('Plan')
      expect(await balanceOf(page, id)).toBe(before)
    })

    test(`V2_PROPERTY_005 remove the estimate, see the older date, Undo brings it back (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: new RegExp(`^Remove \\$${second}`) }).click()
      const review = page.getByRole('region', { name: 'Review removal' })
      await expectFocusInside(review)
      await expect(review).toContainText('will return to $')
      await review.getByRole('button', { name: 'Confirm removal' }).click()
      await expect(page.getByRole('status')).toContainText('Removed')
      await expect(page.getByRole('heading', { name: 'Value history' })).toBeFocused()
      await expectNoSidewaysScroll(page)

      await page.getByRole('button', { name: /^Undo removal of/ }).click()
      await page.getByRole('button', { name: 'Confirm Undo' }).click()
      await expect(page.getByRole('status')).toContainText('Restored')
      expect(await balanceOf(page, id)).toBe(second.replace(',', ''))
    })
  })
}

for (const [width, name] of [
  [710, 'Start Car 710'],
  [1280, 'Start Car 1280'],
] as const) {
  test.describe.serial(`Earlier start at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    let id = ''

    test(`V2_DATED_VALUE_002 an earlier date is reviewed as a new start; Cancel keeps the start, Confirm needs a reason and takes focus (${width}px)`, async ({
      page,
    }) => {
      id = await makeAsset(page, 'other_asset', name, '30000.00')
      const saved = await page.request.post(`/api/v1/accounts/${id}/values`, {
        headers: { 'Idempotency-Key': `start-${width}` },
        data: {
          amount: '28000.00',
          valueOn: '2026-09-30',
          reason: 'Updated resale estimate',
          enteredByMemberId: await ownerId(page),
        },
      })
      expect(saved.ok()).toBeTruthy()
      await page.goto(`/accounts/${id}`)
      await enter(page, '31,000.00', '2026-08-01')
      const review = page.getByRole('region', { name: 'Review earlier start' })
      await expectFocusInside(review)
      await expect(review).toContainText('2026-08-01: opening $31,000.00')
      await expect(review).toContainText('2026-09-01: value $30,000.00')
      await expect(review).toContainText('2026-09-30: value $28,000.00')
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toBeHidden()
      await expect(page.getByRole('button', { name: 'Record new value' })).toBeFocused()
      const kept = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
        openedOn: string
      }
      expect(kept.openedOn).toBe('2026-09-01')

      await enter(page, '31,000.00', '2026-08-01')
      await page.getByRole('button', { name: 'Confirm earlier start' }).click()
      await expect(page.getByText('Enter a reason')).toBeInViewport({ ratio: 1 })
      await page.getByLabel('Reason', { exact: true }).fill('Add an earlier car estimate')
      await page.getByRole('button', { name: 'Confirm earlier start' }).click()
      await expect(page.getByRole('status')).toContainText('now starts at $31,000.00 on 2026-08-01')
      await expect(page.getByRole('heading', { name: 'Value history' })).toBeFocused()
      await expect(page.getByRole('table')).toContainText('$31,000.00')
      await expect(page.getByRole('table')).toContainText('$30,000.00')
      await expectNoSidewaysScroll(page)
      const moved = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
        openedOn: string
        balance: { amount: string }
      }
      expect(moved.openedOn).toBe('2026-08-01')
      expect(moved.balance.amount).toBe('28000.00')
    })
  })
}

for (const [width, name] of [
  [710, 'Wealth Home 710'],
  [1280, 'Wealth Home 1280'],
] as const) {
  test.describe.serial(`Wealth on a date at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    let id = ''
    let estimate = ''

    test(`V2_PROPERTY_003 wealth on an earlier date uses the value in force then, and the change is a value change (${width}px)`, async ({
      page,
    }) => {
      id = await makeAsset(page, 'property', name, '300000.00')
      const owner = await ownerId(page)
      const saved = await page.request.post(`/api/v1/accounts/${id}/values`, {
        headers: { 'Idempotency-Key': `wealth-${width}` },
        data: {
          amount: '320000.00',
          valueOn: '2026-09-30',
          reason: 'September estimate',
          enteredByMemberId: owner,
        },
      })
      expect(saved.ok()).toBeTruthy()
      estimate = ((await saved.json()) as { value: { id: string } }).value.id

      await page.goto('/')
      const card = page.getByRole('region', { name: 'Wealth on a date' })
      await card.scrollIntoViewIfNeeded()
      await card.getByLabel('Show wealth on').fill('2026-09-15')
      const group = card.getByRole('region', { name: 'Property and other assets on this date' })
      const line = group.getByRole('listitem').filter({ hasText: name })
      await expect(line).toContainText('$300,000.00')
      await expect(line).toContainText('Value dated 2026-09-01')
      await expect(card).toContainText('Household wealth on 2026-09-15')
      await expectNoSidewaysScroll(page)

      await card.getByLabel('From').fill('2026-09-01')
      await card.getByLabel('To').fill('2026-09-30')
      const change = card.getByRole('region', { name: 'Wealth change' })
      await expect(change).toBeVisible()
      await expect(change.getByRole('list', { name: 'Value changes' })).toContainText(
        `${name} value increase of $20,000.00`,
      )
      await expect(change).toContainText('Transfers and card payments cancel out')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_PROPERTY_005 removing the estimate flags the older value date on the household card (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      const removed = await page.request.post(`/api/v1/accounts/${id}/values/${estimate}/removal`, {
        data: { enteredByMemberId: owner },
      })
      expect(removed.ok()).toBeTruthy()
      await page.goto('/')
      const accounts = page.getByRole('region', { name: 'Accounts and wealth' })
      const group = accounts.getByRole('region', { name: 'Property and other assets' })
      const line = group.getByRole('listitem').filter({ hasText: name })
      await expect(line).toContainText('$300,000.00')
      await expect(line).toContainText('Value dated 2026-09-01')
      await expect(line).toContainText('Older value')
      await expectNoSidewaysScroll(page)
    })
  })
}

// Owner's Cowork pass on slice 15 (9 faults): each assertion below was run alone against the unfixed code first.
for (const [width, name] of [
  [710, 'Cowork Home 710'],
  [1280, 'Cowork Home 1280'],
] as const) {
  test.describe.serial(`Cowork findings at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    let id = ''

    test(`V2_PROPERTY_002 Add account for a property says value, has no Bank, and Back focuses the form (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: 'Property' })
      await expect(page.getByLabel('Value date')).toBeVisible()
      await expect(page.getByLabel('Value', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Bank')).toHaveCount(0)
      await expect(page.getByLabel('Balance')).toHaveCount(0)
      await expect(page.getByText(/joint account/)).toHaveCount(0)
      await page.getByLabel('Account name').fill(`Back ${name}`)
      await page.getByRole('checkbox').first().check()
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Account name')).toBeFocused()
    })

    test(`V2_PROPERTY_003 value history keeps a date on one line and says when a row was saved (${width}px)`, async ({
      page,
    }) => {
      id = await makeAsset(page, 'property', name, '50000.00')
      const owner = await ownerId(page)
      const saved = await page.request.post(`/api/v1/accounts/${id}/values`, {
        headers: { 'Idempotency-Key': `cowork-${width}` },
        data: { amount: '60000.00', valueOn: '2026-09-30', enteredByMemberId: owner },
      })
      expect(saved.ok()).toBeTruthy()
      await page.goto(`/accounts/${id}`)
      const row = page.getByRole('row').filter({ hasText: '$60,000.00' })
      await expect(row.getByRole('cell').first()).toHaveCSS('white-space', 'nowrap')
      await expect(row).toContainText(/Entered by .+ on \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
      await expect(page.getByRole('main')).not.toContainText('Bank')
      await expect(page.getByRole('main')).toContainText('Initial value')
    })

    test(`V2_DATED_VALUE_002 an earlier start keeps its reason and Undo leaves a trace in the list of changes (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: 'Record new value' }).click()
      await page.getByLabel('Value', { exact: true }).fill('40,000.00')
      await page.getByLabel('Date', { exact: true }).fill('2026-08-01')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await page.getByLabel('Reason', { exact: true }).fill('Bought in June')
      await page.getByRole('button', { name: 'Confirm earlier start' }).click()
      await expect(page.getByRole('status')).toContainText('now starts at')
      await page.getByRole('button', { name: /^Remove \$60,000.00/ }).click()
      await page.getByRole('button', { name: 'Confirm removal' }).click()
      await page.getByRole('button', { name: /^Undo removal of \$60,000.00/ }).click()
      await page.getByRole('button', { name: 'Confirm Undo' }).click()
      const changes = page.getByRole('list', { name: 'Changes' })
      await expect(changes).toContainText(
        'Start moved from 2026-09-01 to 2026-08-01: Bought in June',
      )
      await expect(changes).toContainText('Removed $60,000.00 dated 2026-09-30')
      await expect(changes).toContainText('Restored $60,000.00 dated 2026-09-30')
    })

    test(`V2_PROPERTY_005 Close names a plan before Confirm and says to record a $0.00 value, focus stays in the review (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: 'Close account' }).click()
      const review = page.getByRole('region', { name: new RegExp(`Review closing ${name}`) })
      await expect(review).toContainText('record a $0.00 value')
      await expect(review).not.toContainText('transfer')
      await review.getByRole('button', { name: 'Cancel' }).click()

      const owner = await ownerId(page)
      const zero = await page.request.post(`/api/v1/accounts/${id}/values`, {
        headers: { 'Idempotency-Key': `cowork-zero-${width}` },
        data: { amount: '0.00', valueOn: '2026-10-01', reason: 'Sold', enteredByMemberId: owner },
      })
      expect(zero.ok()).toBeTruthy()
      const plan = await page.request.post(`/api/v1/accounts/${id}/values`, {
        headers: { 'Idempotency-Key': `cowork-plan-${width}` },
        data: { amount: '1.00', valueOn: '2026-12-01', plan: true, enteredByMemberId: owner },
      })
      expect(plan.ok()).toBeTruthy()
      await page.reload()
      await page.getByRole('button', { name: 'Close account' }).click()
      const again = page.getByRole('region', { name: new RegExp(`Review closing ${name}`) })
      await expect(again).toContainText('has 1 planned value. Remove it first')
      await expect(again.getByRole('button', { name: `Close ${name}` })).toBeDisabled()
    })

    test(`V2_PROPERTY_003 a wealth date after today is explained, not replaced by today (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/')
      const card = page.getByRole('region', { name: 'Wealth on a date' })
      await card.scrollIntoViewIfNeeded()
      await card.getByLabel('Show wealth on').fill('2027-01-05')
      await expect(card.getByText('The date cannot be in the future')).toBeVisible()
      await expect(card).not.toContainText('Household wealth on')
    })
  })
}

// Faults the screenshot step (visual-reviewer) found on slice 15 after the owner's pass.
for (const [width, name] of [
  [710, 'Visual Home 710'],
  [1280, 'Visual Home 1280'],
] as const) {
  test.describe.serial(`Screenshot findings at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_PROPERTY_002 a property says value everywhere on its pages and keeps dates whole (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption({ label: 'Property' })
      await expect(page.getByRole('main')).not.toContainText('Balance')

      const id = await makeAsset(page, 'property', name, '50000.00')
      const owner = await ownerId(page)
      const saved = await page.request.post(`/api/v1/accounts/${id}/values`, {
        headers: { 'Idempotency-Key': `visual-${width}` },
        data: { amount: '60000.00', valueOn: '2026-09-30', enteredByMemberId: owner },
      })
      expect(saved.ok()).toBeTruthy()
      await page.goto(`/accounts/${id}`)
      const row = page.getByRole('row').filter({ hasText: '$60,000.00' })
      const stamp = row.locator('.whitespace-nowrap', { hasText: /\d{2}:\d{2}$/ })
      await expect(stamp).toBeVisible()
      const box = await stamp.boundingBox()
      expect(box!.height).toBeLessThan(30)
      await expect(page.getByLabel('Account details')).not.toContainText('Balance')

      await page.getByRole('button', { name: 'Archive account' }).click()
      const review = page.getByRole('region', { name: /Review archiving/ })
      await expect(review).not.toContainText('transfers')
      await review.getByRole('button', { name: 'Cancel' }).click()

      await page.goto(`/accounts/${id}/edit`)
      await expect(page.getByRole('main')).not.toContainText(/bank|Update balance/i)
    })
  })
}
