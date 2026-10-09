import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 22-investment-types.spec.ts. A defined benefit (slice 18a) at 710px and 1280px: set up with a plan value
// (V2_DB_001, 002), a statement with pay and interest credits (003), its correction with a review (004), the refused
// dates (005) and archiving with a nonzero value (006). The database is shared, so every width makes its own plans.
// Today is the stack's fixed 2026-10-03.

type Member = { id: string; active: boolean; name: string }

async function members(page: Page): Promise<Member[]> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Plan Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let found = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as Member[]
  if (!found.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Plan Owner' },
    })
    expect(made.ok()).toBeTruthy()
    found = [(await made.json()) as Member]
  }
  return found.filter((member) => member.active)
}

test.beforeEach(async ({ page }) => {
  const [first] = await members(page)
  await page.addInitScript(
    (member) => window.localStorage.setItem('wealthmesh.enteringAs', member),
    first.id,
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

/** Makes a plan through the API (the same rules as the form) and returns its id. */
async function makePlan(page: Page, name: string, amount: string): Promise<string> {
  const [owner] = await members(page)
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type: 'defined_benefit',
      name,
      institution: 'Harbor Benefits',
      ownerMemberIds: [owner.id],
      openedOn: '2026-09-01',
      openingBalance: amount,
      enteredByMemberId: owner.id,
    },
  })
  expect(made.ok()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
}

async function balanceOf(page: Page, id: string): Promise<string> {
  const detail = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
    balance: { amount: string }
  }
  return detail.balance.amount
}

type Change = {
  payCredits: string
  benefitInterest: string
  income: string
  spending: string
  valueChange: string
  other: string
}

async function changeOf(page: Page): Promise<Change> {
  const response = await page.request.get('/api/v1/wealth/change?from=2026-09-01&to=2026-09-30')
  return (await response.json()) as Change
}

const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The household's net worth and Retirement total now: other plans from earlier tests share the database. */
async function totals(page: Page): Promise<{ net: number; retirement: number }> {
  const wealth = (await (await page.request.get('/api/v1/wealth')).json()) as {
    netWorth: string
    retirement: { total: string }
  }
  return { net: Number(wealth.netWorth), retirement: Number(wealth.retirement.total) }
}

async function fillSetup(page: Page, name: string, value: string) {
  await page.goto('/accounts/new')
  await page.getByLabel('Account type').selectOption({ label: 'Defined benefit' })
  await page.getByLabel('Account name').fill(name)
  await page.getByLabel('Institution').fill('Harbor Benefits')
  await page.getByRole('radio').first().check()
  await page.getByLabel('As of').fill('2026-09-01')
  if (value) await page.getByLabel('Plan-reported value').fill(value)
}

for (const width of [710, 1280]) {
  test.describe.serial(`defined benefit at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const name = `Plan ${width}`
    let id = ''

    test(`V2_DB_001 setting up a plan: reviewed, Back keeps the details, Confirm lands on its page with one sentence and focus (${width}px)`, async ({
      page,
    }) => {
      await fillSetup(page, name, '40,000.00')
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review new defined benefit plan' })
      await expectFocusInside(review)
      await expect(review).toContainText(`${name} will start at $40,000.00 on 2026-09-01.`)
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Account name')).toHaveValue(name)
      await expect(page.getByLabel('Account name')).toBeFocused()
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()

      const status = page.getByRole('status')
      await expect(status).toContainText(
        `${name} is set up with a plan-reported value of $40,000.00 as of 2026-09-01.`,
      )
      await expect(status).toBeFocused()
      await expect(page.getByText('Plan-reported benefit value')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Plan statements' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add money in' })).toHaveCount(0)
      await expectNoSidewaysScroll(page)
      id = page.url().split('/').pop()!
    })

    test(`V2_DB_002 a blank starting amount is reviewed as $0.00 and the sentence says the promise is not recorded (${width}px)`, async ({
      page,
    }) => {
      await fillSetup(page, `Blank ${name}`, '')
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review new defined benefit plan' })
      await expectFocusInside(review)
      await expect(review).toContainText('No starting amount was entered')
      await expect(review).toContainText('does not say the pension promise is zero')
      await review.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByRole('status')).toContainText('No starting amount was entered.')
      await expect(page.getByRole('status')).toBeFocused()
    })

    test(`V2_DB_003 a statement with pay and interest credits: review, Back, Confirm with one sentence and focus (${width}px)`, async ({
      page,
    }) => {
      const before = await totals(page)
      const beforeChange = await changeOf(page)
      await page.goto(`/accounts/${id}`)
      const opener = page.getByRole('button', { name: 'Record plan statement' })
      await opener.click()
      await page.getByLabel('Pay credit').fill('1000.00')
      await page.getByLabel('Benefit interest credit').fill('200.00')
      await page.getByLabel('Statement date').fill('2026-09-30')
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review plan statement' })
      await expectFocusInside(review)
      await expect(review).toContainText('$41,200.00')
      await expect(review).toContainText(
        `${dollars(before.net)} now, ${dollars(before.net + 1200)} after`,
      )
      await expect(review).toContainText(
        `${dollars(before.retirement)} now, ${dollars(before.retirement + 1200)} after`,
      )
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Pay credit')).toHaveValue('1000.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm statement' }).click()
      await expect(page.getByRole('status')).toContainText(
        'Saved the statement as a plan value of $41,200.00 dated 2026-09-30 (pay credit $1,000.00, benefit interest $200.00).',
      )
      await expect(page.getByRole('heading', { name: 'Plan statements' })).toBeFocused()
      expect(await balanceOf(page, id)).toBe('41200.00')

      const after = await changeOf(page)
      // Other specs share the database, so the credits are judged by what this statement added.
      expect(Number(after.payCredits) - Number(beforeChange.payCredits)).toBe(1000)
      expect(Number(after.benefitInterest) - Number(beforeChange.benefitInterest)).toBe(200)
      expect(after.income).toBe(beforeChange.income)
      expect(after.spending).toBe(beforeChange.spending)
      expect(after.valueChange).toBe(beforeChange.valueChange)
      expect(after.other).toBe(beforeChange.other)
    })

    test(`V2_DB_004 a correction is reviewed with the reduction and totals, Cancel returns focus, Confirm restates it (${width}px)`, async ({
      page,
    }) => {
      const before = await totals(page)
      await page.goto(`/accounts/${id}`)
      const opener = page.getByRole('button', { name: /^Correct \$41,200\.00 dated 2026-09-30$/ })
      await opener.click()
      await page.getByLabel('Plan-reported value').fill('41100.00')
      await page.getByLabel('Reason').fill('Corrected statement')
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review plan value correction' })
      await expectFocusInside(review)
      await expect(review).toContainText('$100.00 plan value decrease')
      // Cowork 18a #2: the credits on the replaced statement stop counting, and the review says so.
      await expect(review).toContainText(
        'Its pay credit $1,000.00 and benefit interest $200.00 stop counting',
      )
      await expect(review).toContainText(
        `${dollars(before.retirement)} now, ${dollars(before.retirement - 100)} after`,
      )

      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toBeHidden()
      await expect(opener).toBeFocused()
      expect(await balanceOf(page, id)).toBe('41200.00')

      await opener.click()
      await page.getByLabel('Plan-reported value').fill('41100.00')
      await page.getByLabel('Reason').fill('Corrected statement')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm correction' }).click()
      await expect(page.getByRole('status')).toContainText(
        'Corrected the statement to a plan value of $41,100.00 dated 2026-09-30.',
      )
      await expect(page.getByRole('heading', { name: 'Plan statements' })).toBeFocused()
      expect(await balanceOf(page, id)).toBe('41100.00')
      await expect(page.getByText('Replaced')).toBeVisible()
    })

    test(`V2_DB_005 a future date and a date before the start are explained on the form and nothing is saved (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: 'Record plan statement' }).click()
      // Cowork 18a #1: credits dated before the start say so and offer the way to an earlier start.
      await page.getByLabel('Pay credit').fill('10.00')
      await page.getByLabel('Statement date').fill('2026-08-31')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      const early = page.getByRole('alert').filter({ hasText: 'cannot be dated before' })
      await expect(early).toBeInViewport({ ratio: 1 })
      await expect(early).toBeFocused()
      await early.getByRole('button', { name: 'Report a plan value instead' }).click()
      await expect(page.getByLabel('Plan-reported value')).toBeFocused()
      await page.getByLabel('Plan-reported value').fill('40000.00')
      await page.getByLabel('Statement date').fill('2026-10-04')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      const alert = page.getByRole('alert').filter({ hasText: 'Future values are not completed' })
      await expect(alert).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: 'Save as a future plan' })).toHaveCount(0)

      await page.getByLabel('Statement date').fill('2026-08-31')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await expect(
        page.getByRole('alert').filter({ hasText: 'Review the earlier tracking start' }),
      ).toBeInViewport({ ratio: 1 })

      await page.getByLabel('Plan-reported value').fill('-100.00')
      await page.getByLabel('Statement date').fill('2026-09-30')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await expect(page.getByText('Plan value must be zero or greater')).toBeInViewport({
        ratio: 1,
      })
      expect(await balanceOf(page, id)).toBe('41100.00')
    })

    test(`V2_DB_006 archiving a plan with a nonzero value: review names Retirement, it stays in wealth and the Retirement group (${width}px)`, async ({
      page,
    }) => {
      const archived = await makePlan(page, `Archive ${name}`, '25000.00')
      await page.goto(`/accounts/${archived}`)
      const opener = page.getByRole('button', { name: 'Archive account' })
      await opener.click()
      const review = page.getByRole('region', { name: `Review archiving Archive ${name}` })
      await expectFocusInside(review)
      await expect(review).toContainText('Its $25,000.00 will remain in wealth and in Retirement')
      await review.getByRole('button', { name: `Archive Archive ${name}` }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText(
        `Archive ${name} is archived. Its $25,000.00 stays in wealth and in Retirement.`,
      )
      await expect(status).toBeFocused()

      await page.goto('/')
      const retirement = page.getByRole('region', { name: 'Retirement' })
      await expect(retirement).toContainText(`Archive ${name}`)
      await expect(retirement).toContainText('Archived')
      await expect(
        page
          .getByRole('region', { name: 'Property and other assets' })
          .getByText(`Archive ${name}`),
      ).toHaveCount(0)
      await expectNoSidewaysScroll(page)
    })
  })
}

test('V2_DB_003 What changed names the credits inside a plan value range (Cowork 18a #3)', async ({
  page,
}) => {
  const [owner] = await members(page)
  const name = 'Range Plan'
  const id = await makePlan(page, name, '10000.00')
  const post = (data: object) =>
    page.request.post(`/api/v1/accounts/${id}/values`, {
      headers: { 'Idempotency-Key': `range-${Date.now()}-${Math.random()}` },
      data: { enteredByMemberId: owner.id, ...data },
    })
  expect(
    (await post({ valueOn: '2026-09-15', payCredit: '100.00', interestCredit: '50.00' })).ok(),
  ).toBeTruthy()
  expect((await post({ valueOn: '2026-09-20', amount: '10400.00' })).ok()).toBeTruthy()
  await page.goto('/')
  await page.getByLabel('From', { exact: true }).fill('2026-09-02')
  await page.getByLabel('To', { exact: true }).fill('2026-09-30')
  const line = page
    .getByRole('region', { name: 'Wealth change' })
    .getByRole('listitem')
    .filter({
      hasText: `${name} value increase`,
    })
  await expect(line).toContainText('$250.00')
  await expect(line).toContainText('$10,000.00 to $10,400.00')
  await expect(line).toContainText('$150.00 of that range is the credits above')
})

for (const width of [710, 1280]) {
  test.describe(`restore at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_DB_006 restore ends with a sentence and focus, and the next statement drops it (Cowork 18a #4, #5, ${width}px)`, async ({
      page,
    }) => {
      const id = await makePlan(page, `Restore Plan ${width}`, '5000.00')
      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: 'Archive account' }).click()
      await page.getByRole('button', { name: `Archive Restore Plan ${width}` }).click()
      await expect(page.getByRole('status')).toBeFocused()
      await page.getByRole('button', { name: 'Restore account' }).click()
      await page.getByRole('button', { name: `Restore Restore Plan ${width}` }).click()
      const active = page.getByRole('status').filter({ hasText: 'is active again' })
      await expect(active).toBeFocused()

      await page.getByRole('button', { name: 'Record plan statement' }).click()
      await expect(active).toHaveCount(0)
      await page.getByLabel('Pay credit').fill('10.00')
      await page.getByLabel('Benefit interest credit').fill('1.00')
      await page.getByRole('button', { name: 'Review', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm statement' }).click()
      await expect(page.getByRole('status')).toHaveCount(1)
      await expect(page.getByRole('status')).toContainText('Saved the statement')
    })
  })
}

test('V2_DB_006 a second participant is refused by the server and the plan keeps its participant', async ({
  page,
}) => {
  const found = await members(page)
  const id = await makePlan(page, 'One participant', '1000.00')
  const owners = found.slice(0, 2).map((member) => member.id)
  test.skip(owners.length < 2, 'The shared household has one active member')
  // The plain Edit no longer changes the participant (Q-064): it is refused, and the reviewed correction names the rule.
  const edit = await page.request.put(`/api/v1/accounts/${id}`, {
    data: { name: 'One participant', institution: 'Harbor Benefits', ownerMemberIds: owners },
  })
  expect(edit.status()).toBe(400)
  const refused = await page.request.post(`/api/v1/accounts/${id}/owner-correction`, {
    data: { ownerMemberIds: owners, enteredByMemberId: owners[0] },
  })
  expect(refused.status()).toBe(400)
  expect(((await refused.json()) as { message: string }).message).toBe(
    'A defined benefit has one participant. Choose one member.',
  )
})
