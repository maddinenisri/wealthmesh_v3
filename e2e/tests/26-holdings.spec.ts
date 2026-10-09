import { expect, test, type Page } from '@playwright/test'

// Runs after 25-owner-person.spec.ts. Slice 19a: the holdings of an investment account are shown with the one Balance
// of the list, the detail and the Household page, and an unknown purchase cost says "Not available", never $0.00
// (V2_BROKERAGE_001, V2_401K_001, V2_HSA_001, V2_ROTH_IRA_001, V2_TRAD_IRA_001). A cost known for 2 of 14 shares shows
// only the known part (V2_HOLDINGS_004). The database is shared, so every width makes its own accounts and judges
// deltas. Today is the stack's fixed 2026-10-03.

const types = [
  {
    ids: 'V2_BROKERAGE_001',
    wire: 'brokerage',
    name: 'Redwood Brokerage',
    heading: 'brokerage',
    institution: 'Redwood Investments',
    owner: 'Maya',
    total: '20000',
    cash: '15000',
    shares: '50',
    money: '$20,000.00',
  },
  {
    ids: 'V2_401K_001',
    wire: '401k',
    name: 'Harbor 401k',
    heading: '401(k)',
    institution: 'Harbor Benefits',
    owner: 'Sam',
    total: '80000',
    cash: '60000',
    shares: '200',
    money: '$80,000.00',
  },
  {
    ids: 'V2_HSA_001',
    wire: 'hsa',
    name: 'Meadow HSA',
    heading: 'HSA',
    institution: 'Meadow Health Savings',
    owner: 'Maya',
    total: '3050',
    cash: '1050',
    shares: '20',
    money: '$3,050.00',
  },
  {
    ids: 'V2_ROTH_IRA_001',
    wire: 'roth_ira',
    name: 'Willow Roth IRA',
    heading: 'Roth IRA',
    institution: 'Willow Investments',
    owner: 'Maya',
    total: '6000',
    cash: '1000',
    shares: '50',
    money: '$6,000.00',
  },
  {
    ids: 'V2_TRAD_IRA_001',
    wire: 'traditional_ira',
    name: 'Willow Traditional IRA',
    heading: 'Traditional IRA',
    institution: 'Willow Investments',
    owner: 'Maya',
    total: '30000',
    cash: '20000',
    shares: '100',
    money: '$30,000.00',
  },
] as const

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

/** Fills the setup form for one type; the owner is the first one the household has when the named one is absent. */
async function fillSetup(
  page: Page,
  type: (typeof types)[number],
  name: string,
  fields: { total?: string; cash?: string; holdings?: string[][] } = {},
) {
  await page.goto('/accounts/new')
  await page.getByLabel('Account type').selectOption(type.wire)
  await page.getByLabel('Account name').fill(name)
  await page.getByLabel('Institution').fill(type.institution)
  // A brokerage can be joint (checkboxes under Owners); the other four have one owner (radios under Owner, 18c).
  const owners = page.getByRole('group', {
    name: (type.wire as string) === 'brokerage' ? 'Owners' : 'Owner',
    exact: true,
  })
  const choice = (type.wire as string) === 'brokerage' ? 'checkbox' : 'radio'
  const named = owners.getByRole(choice, { name: type.owner })
  if ((await named.count()) > 0) await named.check()
  else await owners.getByRole(choice).first().check()
  await page.getByLabel('Setup date').fill('2026-09-01')
  if (fields.total) await page.getByLabel('Opening total').fill(fields.total)
  if (fields.cash) await page.getByLabel('Cash').fill(fields.cash)
  for (const [index, [symbol, quantity, price, on, cost]] of (fields.holdings ?? []).entries()) {
    const n = index + 1
    await page.getByRole('button', { name: 'Add a holding' }).click()
    await page.getByLabel(`Holding ${n} name or symbol`).fill(symbol)
    await page.getByLabel(`Holding ${n} quantity`).fill(quantity)
    await page.getByLabel(`Holding ${n} market price`).fill(price)
    if (on) await page.getByLabel(`Holding ${n} value date`).fill(on)
    if (cost) await page.getByLabel(`Holding ${n} purchase cost`).fill(cost)
  }
}

for (const width of [710, 1280]) {
  test.describe.serial(`holdings at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const type of types) {
      test(`${type.ids} ${type.name}: cost and gain say Not available; the detail, the list and the Household page show one Balance; an edit keeps it (${width}px)`, async ({
        page,
      }) => {
        const name = `${type.name} H19 ${width}`
        const before = await financialAssets(page)
        await fillSetup(page, type, name, {
          total: type.total,
          cash: type.cash,
          holdings: [['HOME', type.shares, '100', '']],
        })
        await page.getByRole('button', { name: 'Review' }).click()
        await expect(
          page.getByRole('heading', { name: `Review new ${type.heading}` }),
        ).toBeVisible()
        const row = page.getByRole('row').filter({ hasText: 'HOME' })
        await expect(row).toContainText('Not available')
        await expect(row).not.toContainText('$0.00')
        // "Not available" stays on one line in the Purchase cost and Gain cells (visual review, slice 19a).
        for (const cell of await row.getByRole('cell', { name: 'Not available' }).all()) {
          expect((await cell.boundingBox())!.height).toBeLessThan(40)
        }
        await page.getByRole('button', { name: 'Confirm' }).click()
        const status = page.getByRole('status').filter({
          hasText: `${name} is set up with a Balance of ${type.money} as of 2026-09-01.`,
        })
        await expect(status).toBeFocused()

        const card = page.getByRole('region', { name: 'Holdings', exact: true })
        await expect(card).toBeVisible()
        await expect(card.getByText('Balance', { exact: true })).toBeVisible()
        await expect(card).toContainText(`${type.money} dated 2026-09-01`)
        for (const label of await card.getByText('Purchase cost', { exact: true }).all())
          await expect(label.locator('xpath=following-sibling::dd[1]')).toHaveText('Not available')
        for (const label of await card.getByText('Gain', { exact: true }).all())
          await expect(label.locator('xpath=following-sibling::dd[1]')).toHaveText('Not available')
        await expect(card).not.toContainText('$0.00')
        await expectNoSidewaysScroll(page)
        const id = page.url().split('/').pop()!

        await page.goto('/accounts')
        const listed = page
          .getByRole('row')
          .filter({ has: page.getByRole('link', { name, exact: true }) })
        await expect(listed).toContainText(type.money)
        await expect(listed).toContainText('as of 2026-09-01')
        await page.goto('/')
        const group = page.getByRole('region', { name: 'Investments', exact: true })
        const item = group.getByRole('listitem').filter({ hasText: name })
        await expect(item).toContainText(type.money)
        // One date phrase (19b): the date the prices were last updated, never a second "Value dated".
        await expect(item).toContainText('Prices last updated 2026-09-01')
        await expect(item).not.toContainText('Value dated')
        const after = await financialAssets(page)
        expect(Number(after) - Number(before)).toBe(Number(type.total))

        await page.goto(`/accounts/${id}/edit`)
        await page.getByLabel('Account name').fill(`${name} Main`)
        await page.getByLabel('Institution').fill(`${type.institution} Services`)
        await page.getByRole('button', { name: 'Save details' }).click()
        const edited = page.getByRole('status')
        await expect(edited).toContainText(`${name} Main was updated. It was ${name}.`)
        await expect(edited).toContainText(`Its Balance of ${type.money} is unchanged.`)
        await expect(edited).toBeFocused()
        await expect(page.getByRole('region', { name: 'Holdings', exact: true })).toContainText(
          `${type.money} dated 2026-09-01`,
        )
        expect(await financialAssets(page)).toBe(after)
      })
    }

    test(`V2_HOLDINGS_004 a cost known for 2 of 14 CARE shares shows only the known part (${width}px)`, async ({
      page,
    }) => {
      const hsa = types[2]
      const name = `Meadow HSA Care ${width}`
      await fillSetup(page, hsa, name, {
        total: '4000',
        cash: '500',
        holdings: [
          ['CARE', '2', '250', '2026-09-30', '400'],
          ['CARE', '12', '250', '2026-09-30'],
        ],
      })
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('heading', { name: 'Review new HSA' })).toBeVisible()
      const rows = page.getByRole('row')
      await expect(rows.filter({ hasText: '$400.00' })).toContainText('$100.00')
      await expect(rows.filter({ hasText: '12' }).filter({ hasText: 'Not available' })).toHaveCount(
        1,
      )
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByRole('status').filter({ hasText: `${name} is set up` })).toBeFocused()
      const care = page.getByRole('region', { name: 'CARE', exact: true })
      await expect(care).toContainText('$3,500.00')
      await expect(care).toContainText(
        'The cost is known for 2 of 14 shares (14.29% of the shares)',
      )
      await expect(care).toContainText('worth $500.00, cost $400.00 and show a gain of $100.00')
      // Cowork 19a: the full cost is labelled as the full cost, beside the known part's sentence.
      await expect(care.getByText('Purchase cost', { exact: true })).toHaveCount(0)
      await expect(
        care
          .getByText('Full purchase cost', { exact: true })
          .locator('xpath=following-sibling::dd[1]'),
      ).toHaveText('Not available')
      await expect(
        care.getByText('Full gain', { exact: true }).locator('xpath=following-sibling::dd[1]'),
      ).toHaveText('Not available')
      await expect(page.getByRole('region', { name: 'Holdings', exact: true })).toContainText(
        '$4,000.00 dated 2026-09-01',
      )
      await expectNoSidewaysScroll(page)
    })
  })
}
