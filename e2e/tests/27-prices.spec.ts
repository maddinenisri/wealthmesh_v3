import { expect, test, type Page } from '@playwright/test'

// Runs after 26-holdings.spec.ts. Slice 19b: a price recorded on a holding after setup (V2_HOLDINGS_008: a known $0.00
// price for the five types and an HSA with unknown cost; V2_WEALTH_004: wealth on Sep 30 with an older price, then
// HOME at $130.00). Every step ends with a sentence and the right focus: the form heading after Back, the opener
// after Cancel, the status line after Confirm. The database is shared, so every width makes its own accounts and
// judges deltas. Today is the stack's fixed 2026-10-03.

type Row = { type: string; name: string; heading: string; cost: string | null; gain: string | null }
const rows: Row[] = [
  {
    type: 'brokerage',
    name: 'Redwood Brokerage',
    heading: 'brokerage',
    cost: '200.00',
    gain: '-$200.00',
  },
  { type: '401k', name: 'Harbor 401k', heading: '401(k)', cost: '200.00', gain: '-$200.00' },
  {
    type: 'traditional_ira',
    name: 'Willow Traditional IRA',
    heading: 'Traditional IRA',
    cost: '200.00',
    gain: '-$200.00',
  },
  {
    type: 'roth_ira',
    name: 'Willow Roth IRA',
    heading: 'Roth IRA',
    cost: '200.00',
    gain: '-$200.00',
  },
  { type: 'hsa', name: 'Meadow HSA', heading: 'HSA', cost: '200.00', gain: '-$200.00' },
  { type: 'hsa', name: 'Meadow HSA Unknown Cost', heading: 'HSA', cost: null, gain: null },
]

async function enteringMember(page: Page): Promise<string> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Invest Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Invest Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.find((member) => member.active)!.id
}

test.beforeEach(async ({ page }) => {
  const id = await enteringMember(page)
  await page.addInitScript(
    (member) => window.localStorage.setItem('wealthmesh.enteringAs', member),
    id,
  )
})

async function expectNoSidewaysScroll(page: Page) {
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBeLessThanOrEqual(0)
}

async function financialAssets(page: Page): Promise<string> {
  const wealth = (await (await page.request.get('/api/v1/wealth')).json()) as {
    financialAssets: string
  }
  return wealth.financialAssets
}

async function ownerId(page: Page): Promise<string> {
  return enteringMember(page)
}

/** An investment account with $1,000.00 cash and 10 HOME at $100.00, set up on 2026-09-01 (Balance $2,000.00). */
async function make(page: Page, type: string, name: string, cost: string | null, owner: string) {
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      institution: 'Harbor Benefits',
      ownerMemberIds: [owner],
      openedOn: '2026-09-01',
      enteredByMemberId: owner,
      opening: {
        total: '2000.00',
        cash: '1000.00',
        holdings: [
          {
            symbol: 'HOME',
            quantity: '10',
            price: '100.00',
            valueOn: '2026-09-01',
            ...(cost ? { cost } : {}),
          },
        ],
      },
    },
  })
  expect(made.ok()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
}

for (const width of [710, 1280]) {
  test.describe.serial(`prices at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const row of rows) {
      test(`V2_HOLDINGS_008 ${row.name}: a known $0.00 price is reviewed with the zero highlighted, saved with a sentence and focus, and the Balance equals cash (${width}px)`, async ({
        page,
      }) => {
        const owner = await ownerId(page)
        const name = `${row.name} P19b ${width}`
        const id = await make(page, row.type, name, row.cost, owner)
        const before = Number(await financialAssets(page))
        await page.goto(`/accounts/${id}`)

        const opener = page.getByRole('button', { name: 'Record a price' })
        await opener.click()
        const formHeading = page.getByRole('heading', { name: `Record a price for ${name}` })
        await expect(formHeading).toBeVisible()
        await page.getByLabel('Market price').fill('0')
        await page.getByLabel('Price date').fill('2026-09-30')
        await page.getByRole('button', { name: 'Review price' }).click()

        const review = page.getByRole('heading', { name: /Review the HOME price/ })
        await expect(review).toBeVisible()
        const section = page.locator('section', { has: review })
        await expect(section.getByRole('note')).toContainText('HOME will be worth $0.00')
        await expect(section.getByRole('note')).toContainText('Your 10 shares stay recorded')
        await expect(section).toContainText('$2,000.00')
        await expect(section).toContainText('$1,000.00')
        // Focus is on the review panel (it holds the review's heading), which is in view, with no sideways scroll.
        expect(
          await page.evaluate(
            () =>
              document.activeElement?.id === 'price-review-heading' ||
              !!document.activeElement?.querySelector('#price-review-heading'),
          ),
        ).toBe(true)
        await expect(review).toBeInViewport()
        await expectNoSidewaysScroll(page)
        // Nothing was saved by the review.
        expect(Number(await financialAssets(page))).toBe(before)

        if (row.cost === null) {
          // Back returns to the form's heading with its values; Cancel returns to the opener.
          await page.getByRole('button', { name: 'Back' }).click()
          await expect(formHeading).toBeFocused()
          await expect(page.getByLabel('Market price')).toHaveValue('0')
          await page.getByRole('button', { name: 'Cancel' }).click()
          await expect(opener).toBeFocused()
          expect(Number(await financialAssets(page))).toBe(before)
          await opener.click()
          await page.getByLabel('Market price').fill('0')
          await page.getByLabel('Price date').fill('2026-09-30')
          await page.getByRole('button', { name: 'Review price' }).click()
        }
        await page.getByRole('button', { name: 'Confirm price' }).click()

        const status = page.getByRole('status').filter({
          hasText: `HOME is priced at 0.00 on 2026-09-30. ${name}'s Balance is $1,000.00 as of 2026-09-30.`,
        })
        await expect(status).toBeVisible()
        await expect(status).toBeFocused()
        const card = page.getByRole('region', { name: 'Holdings', exact: true })
        await expect(card).toContainText('$1,000.00 dated 2026-09-30')
        for (const label of await card.getByText('Purchase cost', { exact: true }).all())
          await expect(label.locator('xpath=following-sibling::dd[1]')).toHaveText(
            row.cost ? '$200.00' : 'Not available',
          )
        for (const label of await card.getByText('Gain', { exact: true }).all())
          await expect(label.locator('xpath=following-sibling::dd[1]')).toHaveText(
            row.gain ?? 'Not available',
          )
        await expect(page.getByRole('list', { name: 'Recorded prices' })).toContainText(
          'HOME $0.00 for 2026-09-30',
        )
        await expectNoSidewaysScroll(page)

        // The list, the detail and wealth use the same Balance; financial assets fell by $1,000.00.
        const detail = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
          balance: { amount: string }
        }
        expect(detail.balance.amount).toBe('1000.00')
        expect(Number(await financialAssets(page))).toBe(before - 1000)
        await page.goto('/accounts')
        await expect(
          page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) }),
        ).toContainText('$1,000.00')
      })
    }

    test(`V2_HOLDINGS_008 a refused price field is in view and focused, and Cancel from the review returns focus to its opener (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      const name = `Redwood Errors P19b ${width}`
      const id = await make(page, 'brokerage', name, null, owner)
      await page.goto(`/accounts/${id}`)
      const opener = page.getByRole('button', { name: 'Record a price' })
      await opener.click()
      await page.getByLabel('Market price').fill('-1')
      await page.getByLabel('Price date').fill('2026-09-30')
      await page.getByRole('button', { name: 'Review price' }).click()
      const field = page.getByLabel('Market price')
      await expect(page.getByText('Holding market price must be zero or greater')).toBeInViewport()
      await expect(field).toBeFocused()
      await expectNoSidewaysScroll(page)
      await field.fill('130')
      await page.getByRole('button', { name: 'Review price' }).click()
      await expect(page.getByRole('heading', { name: /Review the HOME price/ })).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(opener).toBeFocused()
      expect((await (await page.request.get(`/api/v1/accounts/${id}`)).json()).balance.amount).toBe(
        '2000.00',
      )
    })

    test(`V2_WEALTH_004 an older price is noticed on Sep 30, recording HOME at $130.00 moves the Balance to $21,500.00 and keeps $20,000.00 in the history (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      const name = `Redwood W4 ${width}`
      const made = await page.request.post('/api/v1/accounts', {
        data: {
          type: 'brokerage',
          name,
          institution: 'Redwood Investments',
          ownerMemberIds: [owner],
          openedOn: '2026-09-01',
          enteredByMemberId: owner,
          opening: {
            total: '20000.00',
            cash: '15000.00',
            holdings: [{ symbol: 'HOME', quantity: '50', price: '100.00', valueOn: '2026-09-01' }],
          },
        },
      })
      expect(made.ok()).toBeTruthy()
      const id = ((await made.json()) as { id: string }).id

      await page.goto('/')
      const card = page.getByRole('region', { name: 'Wealth on a date' })
      await card.getByLabel('Show wealth on').fill('2026-09-30')
      const investments = card.getByRole('region', { name: 'Investment balances on this date' })
      const line = investments.getByRole('listitem').filter({ hasText: name })
      await expect(line).toContainText('$20,000.00')
      await expect(line).toContainText('Prices last updated 2026-09-01')
      await expect(card).toContainText(`${name} still uses prices last updated on 2026-09-01`)
      await expect(card).toContainText('These balances come from different dates')
      await expectNoSidewaysScroll(page)

      // A long price history first, so a new row is not in view just because the list is short.
      for (let day = 2; day <= 13; day += 1) {
        const recorded = await page.request.post(`/api/v1/accounts/${id}/prices`, {
          headers: { 'Idempotency-Key': `w4-long-${width}-${day}` },
          data: {
            symbol: 'HOME',
            price: '100.00',
            valueOn: `2026-09-${String(day).padStart(2, '0')}`,
            enteredByMemberId: owner,
          },
        })
        expect(recorded.ok()).toBeTruthy()
      }
      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: 'Record a price' }).click()
      await page.getByLabel('Market price').fill('130')
      await page.getByLabel('Price date').fill('2026-09-30')
      await page.getByRole('button', { name: 'Review price' }).click()
      const section = page.locator('section', {
        has: page.getByRole('heading', { name: /Review the HOME price/ }),
      })
      await expect(section).toContainText('$20,000.00')
      await expect(section).toContainText('$21,500.00')
      await page.getByRole('button', { name: 'Confirm price' }).click()
      const status = page.getByRole('status').filter({
        hasText: `HOME is priced at 130.00 on 2026-09-30. ${name}'s Balance is $21,500.00 as of 2026-09-30.`,
      })
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport()
      const newest = page
        .getByRole('list', { name: 'Recorded prices' })
        .getByRole('listitem')
        .first()
      await expect(newest).toContainText('HOME $130.00 for 2026-09-30')
      const holdings = page.getByRole('region', { name: 'Holdings', exact: true })
      await expect(holdings).toContainText('$15,000.00')
      await expect(holdings).toContainText('$6,500.00')
      await expect(holdings).toContainText('$21,500.00 dated 2026-09-30')
      // The older Balance stays visible in the history.
      const history = page.getByRole('region', { name: 'Balance history' })
      await expect(history).toContainText('2026-09-01 $20,000.00')
      await expect(history).toContainText('2026-09-30 $21,500.00')

      await page.goto('/')
      await card.getByLabel('Show wealth on').fill('2026-09-30')
      await expect(investments.getByRole('listitem').filter({ hasText: name })).toContainText(
        '$21,500.00',
      )
      await expect(card).not.toContainText(`${name} still uses prices`)
      await card.getByLabel('Show wealth on').fill('2026-09-29')
      await expect(investments.getByRole('listitem').filter({ hasText: name })).toContainText(
        '$20,000.00',
      )
    })
  })
}
