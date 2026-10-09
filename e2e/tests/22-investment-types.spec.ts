import { expect, test, type Page } from '@playwright/test'

// Runs after 21-investments.spec.ts. The four retirement and health types (slice 17b) are thin additions over the
// brokerage, so one spec runs the scenarios over the four wires, each with its own name, institution, owner and
// figures from its feature file. At 710px: empty setup (002), a draft with the Cancel question (003), the early value
// date row of 005 and the mismatch review with Back (006). At 1280px: the empty setup. The other five rows of 005 are
// in the API and per-type Vitest tests. Every width makes its own accounts. Today is the stack's fixed 2026-10-03.

const types = [
  {
    ids: 'V2_401K_002 V2_401K_003 V2_401K_005 V2_401K_006',
    wire: '401k',
    name: 'Harbor 401k',
    heading: '401(k)',
    institution: 'Harbor Benefits',
    owner: 'Sam',
    total: '80000',
    shares: '200',
  },
  {
    ids: 'V2_HSA_002 V2_HSA_003 V2_HSA_005 V2_HSA_006',
    wire: 'hsa',
    name: 'Meadow HSA',
    heading: 'HSA',
    institution: 'Meadow Health Savings',
    owner: 'Maya',
    total: '3050',
    shares: '20',
  },
  {
    ids: 'V2_ROTH_IRA_002 V2_ROTH_IRA_003 V2_ROTH_IRA_005 V2_ROTH_IRA_006',
    wire: 'roth_ira',
    name: 'Willow Roth IRA',
    heading: 'Roth IRA',
    institution: 'Willow Investments',
    owner: 'Maya',
    total: '6000',
    shares: '50',
  },
  {
    ids: 'V2_TRAD_IRA_002 V2_TRAD_IRA_003 V2_TRAD_IRA_005 V2_TRAD_IRA_006',
    wire: 'traditional_ira',
    name: 'Willow Traditional IRA',
    heading: 'Traditional IRA',
    institution: 'Willow Investments',
    owner: 'Maya',
    total: '30000',
    shares: '100',
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
  for (const [index, [symbol, quantity, price, on]] of (fields.holdings ?? []).entries()) {
    const n = index + 1
    await page.getByRole('button', { name: 'Add a holding' }).click()
    await page.getByLabel(`Holding ${n} name or symbol`).fill(symbol)
    await page.getByLabel(`Holding ${n} quantity`).fill(quantity)
    await page.getByLabel(`Holding ${n} market price`).fill(price)
    if (on) await page.getByLabel(`Holding ${n} value date`).fill(on)
  }
}

for (const type of types) {
  test.describe.serial(`${type.name} at 710px`, () => {
    test.use({ viewport: { width: 710, height: 900 } })

    test(`${type.ids} an empty setup is reviewed at $0.00, saved by Confirm, says so and takes focus`, async ({
      page,
    }) => {
      const name = `${type.name} 710 empty`
      await fillSetup(page, type, name)
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('heading', { name: `Review new ${type.heading}` })).toBeVisible()
      await expect(page.getByText(`${name} will start at $0.00 on 2026-09-01.`)).toBeVisible()
      await expectNoSidewaysScroll(page)
      await page.getByRole('button', { name: 'Confirm' }).click()
      const status = page
        .getByRole('status')
        .filter({ hasText: `${name} is set up with a Balance of $0.00 as of 2026-09-01.` })
      await expect(status).toBeVisible()
      await expect(status).toBeFocused()
      await expect(page.getByText(/No starting amount was entered/)).toBeVisible()
      await expect(page.getByText(/^Set up by .+ · /)).toBeVisible()
      await expect(page.getByText(`${type.heading} account`)).toBeVisible()
      await expectNoSidewaysScroll(page)
    })

    test(`${type.ids} an incomplete setup is kept as a draft; Cancel asks once, then leaves no account`, async ({
      page,
    }) => {
      const name = `${type.name} 710 draft`
      const before = await financialAssets(page)
      await fillSetup(page, type, name, {
        total: type.total,
        holdings: [['HOME', type.shares, '100', '']],
      })
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByText(`${name} will be saved as a draft.`)).toBeVisible()
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: `${name} is saved as a draft.` }),
      ).toBeFocused()
      expect(await financialAssets(page)).toBe(before)
      await page.getByRole('button', { name: 'Cancel draft' }).click()
      const ask = page.getByRole('region', { name: 'Cancel this draft?' })
      await expect(ask).toBeVisible()
      await ask.getByRole('button', { name: 'Keep draft' }).click()
      await expect(page.getByRole('button', { name: 'Cancel draft' })).toBeFocused()
      await page.getByRole('button', { name: 'Cancel draft' }).click()
      await page.getByRole('button', { name: 'Discard draft' }).click()
      const gone = page.getByRole('status').filter({ hasText: `${name} draft is cancelled` })
      await expect(gone).toBeFocused()
      await expect(page.getByRole('link', { name })).toHaveCount(0)
      expect(await financialAssets(page)).toBe(before)
    })

    test(`${type.ids} an early value date names the setup date at its field, in view and focused`, async ({
      page,
    }) => {
      await fillSetup(page, type, `${type.name} 710 early`, {
        cash: '1',
        holdings: [['HOME', '1', '100', '2026-08-31']],
      })
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(
        page.getByText(
          'Review the earlier tracking start before saving. The Setup date is 2026-09-01.',
        ),
      ).toBeVisible()
      await expect(page.getByLabel('Holding 1 value date')).toBeFocused()
      await expectNoSidewaysScroll(page)
    })

    test(`${type.ids} a mismatch is shown, cannot be confirmed, and Back returns to the Opening total`, async ({
      page,
    }) => {
      const before = await financialAssets(page)
      await fillSetup(page, type, `${type.name} 710 mismatch`, {
        total: type.total,
        cash: '100',
        holdings: [['HOME', '1', '100', '']],
      })
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('alert')).toContainText(
        'does not match cash plus holdings $200.00',
      )
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeDisabled()
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Opening total')).toBeFocused()
      expect(await financialAssets(page)).toBe(before)
    })
  })

  test.describe(`${type.name} at 1280px`, () => {
    test.use({ viewport: { width: 1280, height: 900 } })

    test(`${type.ids} an empty setup is saved by Confirm and says so`, async ({ page }) => {
      const name = `${type.name} 1280 empty`
      await fillSetup(page, type, name)
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      const status = page
        .getByRole('status')
        .filter({ hasText: `${name} is set up with a Balance of $0.00 as of 2026-09-01.` })
      await expect(status).toBeFocused()
      await expectNoSidewaysScroll(page)
    })
  })
}
