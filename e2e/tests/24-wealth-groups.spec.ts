import { expect, test, type Page } from '@playwright/test'

// Runs after 23-defined-benefit.spec.ts. Slice 18b: Investments, Retirement and Health savings overlap on purpose
// (V2_WEALTH_002, 008, V2_RETIREMENT_ACTIVITY_007, V2_HOLDINGS_007), the Household page explains it, an empty
// Investments group offers a draft under Finish setup (V2_HOLDINGS_001), the Retirement list opens the one account
// (V2_HOUSEHOLD_SETUP_005), and a plain Edit account ends with a sentence and focus (V2_OTHER_ASSET_001,
// V2_PROPERTY_001, Q-062). The database is shared, so every width makes its own accounts and judges deltas.
// Today is the stack's fixed 2026-10-03.

type Member = { id: string; active: boolean; name: string }

async function members(page: Page): Promise<Member[]> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Group Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let found = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as Member[]
  if (found.filter((member) => member.active).length < 2) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: `Group Partner ${found.length}` },
    })
    expect(made.ok()).toBeTruthy()
    found = (await (
      await page.request.get(`/api/v1/household-members?householdId=${id}`)
    ).json()) as Member[]
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

async function expectNoSidewaysScroll(page: Page) {
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBeLessThanOrEqual(0)
}

async function makeInvestment(
  page: Page,
  type: string,
  name: string,
  opening: object,
): Promise<string> {
  const [owner] = await members(page)
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      institution: 'Harbor Benefits',
      ownerMemberIds: [owner.id],
      openedOn: '2026-09-01',
      enteredByMemberId: owner.id,
      opening,
    },
  })
  expect(made.ok(), await made.text()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
}

const holdings = (symbol: string, quantity: string, price: string) => [
  { symbol, quantity, price, valueOn: '2026-09-01' },
]

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

type Line = { accountId: string; balance: string; groups: string[] }
type Wealth = {
  netWorth: string
  financialAssets: string
  debtLines: Line[]
} & Record<string, { total: string; accounts: Line[] } | string | Line[]>

const GROUPS = [
  'bankMoney',
  'cards',
  'loans',
  'mortgages',
  'investments',
  'retirement',
  'healthSavings',
  'propertyAndOther',
]

async function wealth(page: Page): Promise<Wealth> {
  return (await (await page.request.get('/api/v1/wealth')).json()) as Wealth
}

/** Every account once across every group: the groups overlap, so they are never summed. */
function countedOnce(found: Wealth): number {
  const byId = new Map<string, number>()
  for (const key of GROUPS) {
    const group = found[key] as { accounts: Line[] }
    for (const line of group.accounts) byId.set(line.accountId, Number(line.balance))
  }
  return [...byId.values()].reduce((sum, value) => sum + value, 0)
}

for (const width of [710, 1280]) {
  test.describe(`wealth groups at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_WEALTH_002 V2_WEALTH_008 V2_RETIREMENT_ACTIVITY_007 V2_HOLDINGS_007 the 401(k) is in Investments and Retirement, the HSA in Investments and Health savings, the plan in Retirement only, and every account counts once (${width}px)`, async ({
      page,
    }) => {
      const stamp = `W${width}`
      const k401 = `Group 401k ${stamp}`
      const hsa = `Group HSA ${stamp}`
      const roth = `Group Roth ${stamp}`
      const brokerage = `Group Brokerage ${stamp}`
      const plan = `Group Plan ${stamp}`
      await makeInvestment(page, '401k', k401, {
        total: '8000.00',
        cash: '6000.00',
        holdings: holdings('HOME', '20', '100.00'),
      })
      await makeInvestment(page, 'hsa', hsa, {
        total: '3050.00',
        cash: '1050.00',
        holdings: holdings('CARE', '20', '100.00'),
      })
      await makeInvestment(page, 'roth_ira', roth, {
        total: '6000.00',
        cash: '1000.00',
        holdings: holdings('HOME', '50', '100.00'),
      })
      await makeInvestment(page, 'brokerage', brokerage, {
        total: '2150.00',
        cash: '1650.00',
        holdings: holdings('HOME', '5', '100.00'),
      })
      await makePlan(page, plan, '40000.00')

      await page.goto('/')
      const card = page.getByRole('region', { name: 'Accounts and wealth' })
      const investments = card.getByRole('region', { name: 'Investments' })
      const retirement = card.getByRole('region', { name: 'Retirement' })
      const health = card.getByRole('region', { name: 'Health savings' })
      for (const name of [k401, roth, brokerage, hsa]) {
        await expect(investments.getByText(name, { exact: true })).toBeVisible()
      }
      await expect(investments.getByText(plan, { exact: true })).toHaveCount(0)
      for (const name of [k401, roth, plan]) {
        await expect(retirement.getByText(name, { exact: true })).toBeVisible()
      }
      await expect(retirement.getByText(hsa, { exact: true })).toHaveCount(0)
      await expect(retirement.getByText(brokerage, { exact: true })).toHaveCount(0)
      await expect(health.getByText(hsa, { exact: true })).toBeVisible()
      await expect(card.getByRole('region', { name: 'Bank money' }).getByText(hsa)).toHaveCount(0)

      await expect(retirement.getByText(k401).locator('xpath=ancestor::li')).toContainText(
        'Also in Investments',
      )
      await expect(health.getByText(hsa).locator('xpath=ancestor::li')).toContainText(
        'Also in Investments',
      )
      await expect(retirement.getByText(plan).locator('xpath=ancestor::li')).not.toContainText(
        'Also in',
      )
      await expect(investments).toContainText(/appears? in both Investments and Retirement/)
      await expect(investments).toContainText(/appears? in both Investments and Health savings/)
      await expect(health).toContainText('not added to Retirement or Bank money')
      await expectNoSidewaysScroll(page)

      const found = await wealth(page)
      expect(countedOnce(found)).toBeCloseTo(Number(found.netWorth), 2)
      // Each group is a view: the figure on the page is the server's total, and none is added to wealth.
      const total = (key: string) => Number((found[key] as { total: string }).total)
      expect(total('investments') + total('retirement') + total('healthSavings')).toBeGreaterThan(
        Number(found.financialAssets) - total('bankMoney') - total('propertyAndOther'),
      )
    })

    test(`V2_HOLDINGS_001 a draft investment account is offered under Finish setup and adds nothing to wealth (${width}px)`, async ({
      page,
    }) => {
      const before = await wealth(page)
      const name = `Group Draft ${width}`
      const draftId = await makeInvestment(page, 'brokerage', name, { total: '20000.00' })
      const after = await wealth(page)
      expect(after.financialAssets).toBe(before.financialAssets)
      expect(after.netWorth).toBe(before.netWorth)

      await page.goto('/')
      const investments = page
        .getByRole('region', { name: 'Accounts and wealth' })
        .getByRole('region', { name: 'Investments' })
      const finish = investments.getByRole('region', { name: 'Finish setup' })
      await expect(finish.getByRole('link', { name })).toBeVisible()
      // Visual review F5: a draft says what kind of account it is and whose.
      const [owner] = await members(page)
      await expect(finish.getByRole('listitem').filter({ hasText: name })).toContainText(
        `Brokerage · ${owner.name}`,
      )
      await expect(investments.getByRole('listitem').filter({ hasText: name })).toHaveCount(1)
      // The draft's amount is shown nowhere (other specs share this database, so only the draft's own block is read).
      await expect(finish).not.toContainText('$')
      await finish.getByRole('link', { name }).click()
      await expect(page).toHaveURL(new RegExp(`/accounts/${draftId}$`))
      await expect(page.getByRole('button', { name: 'Finish setup' })).toBeVisible()
      await expectNoSidewaysScroll(page)
    })

    test(`V2_HOUSEHOLD_SETUP_005 opening a retirement account from the Retirement list is the one account, with its owner and balance (${width}px)`, async ({
      page,
    }) => {
      const name = `Group Find 401k ${width}`
      const id = await makeInvestment(page, '401k', name, {
        total: '8000.00',
        cash: '6000.00',
        holdings: holdings('HOME', '20', '100.00'),
      })
      const count = async () =>
        ((await (await page.request.get('/api/v1/accounts')).json()) as unknown[]).length
      const before = await count()
      await page.goto('/')
      const card = page.getByRole('region', { name: 'Accounts and wealth' })
      const retirement = card.getByRole('region', { name: 'Retirement' })
      const row = retirement.getByRole('listitem').filter({ hasText: name })
      await expect(row).toContainText('$8,000.00')
      const [owner] = await members(page)
      await expect(row).toContainText(owner.name)
      const href = await row.getByRole('link', { name }).getAttribute('href')
      const fromInvestments = card
        .getByRole('region', { name: 'Investments' })
        .getByRole('link', { name })
      await expect(fromInvestments).toHaveAttribute('href', href!)
      await row.getByRole('link', { name }).click()
      await expect(page).toHaveURL(new RegExp(`/accounts/${id}$`))
      const details = page.getByLabel('Account details')
      await expect(details).toContainText(owner.name)
      await expect(details).toContainText('$8,000.00')
      expect(await count()).toBe(before)
      await expectNoSidewaysScroll(page)
    })

    test(`Q-062 Edit account on a loan says its Balance owed, the way the loan page does (${width}px)`, async ({
      page,
    }) => {
      const [owner] = await members(page)
      const name = `Group Loan ${width}`
      const made = await page.request.post('/api/v1/accounts', {
        data: {
          type: 'loan',
          name,
          institution: 'Harbor Bank',
          ownerMemberIds: [owner.id],
          openedOn: '2026-09-01',
          openingBalance: '19900.00',
        },
      })
      expect(made.ok()).toBeTruthy()
      const id = ((await made.json()) as { id: string }).id
      await page.goto(`/accounts/${id}/edit`)
      await page.getByLabel('Account name').fill(`${name} Renamed`)
      await page.getByRole('button', { name: 'Save details' }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText('Its Balance owed of $19,900.00 is unchanged.')
      await expect(status).toBeFocused()
    })

    test(`V2_OTHER_ASSET_001 V2_PROPERTY_001 Q-062 Edit account on a car and a home ends with a sentence on the status line, with focus, and a rename row in the history (${width}px)`, async ({
      page,
    }) => {
      const [first, second] = await members(page)
      for (const [type, name, renamed, amount, word] of [
        ['other_asset', `Group Car ${width}`, `Group Blue Car ${width}`, '30000.00', 'value'],
        ['property', `Group Home ${width}`, `Group Maple Home ${width}`, '300000.00', 'value'],
      ] as const) {
        const made = await page.request.post('/api/v1/accounts', {
          data: {
            type,
            name,
            ownerMemberIds: [first.id],
            openedOn: '2026-09-01',
            openingBalance: amount,
          },
        })
        expect(made.ok()).toBeTruthy()
        const id = ((await made.json()) as { id: string }).id
        const before = await wealth(page)

        await page.goto(`/accounts/${id}/edit`)
        // Visual review F1: the edit page opens with focus on the first field, not on the page body.
        await expect(page.getByLabel('Account name')).toBeFocused()
        await page.getByLabel('Account name').fill(renamed)
        await page.getByRole('checkbox', { name: second.name }).check()
        await page.getByRole('button', { name: 'Save details' }).click()
        const status = page.getByRole('status')
        await expect(status).toContainText(`${renamed} was updated. It was ${name}.`)
        await expect(status).toContainText(
          `Its ${word} of $${Number(amount).toLocaleString('en-US')}.00 is unchanged.`,
        )
        await expect(status).toBeFocused()
        await expect(page.getByRole('status')).toHaveCount(1)
        await expect(page.getByRole('region', { name: 'Status history' })).toContainText(
          `Renamed from ${name}`,
        )
        await expectNoSidewaysScroll(page)

        const detail = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
          name: string
          balance: { amount: string }
          ownerMemberIds: string[]
        }
        expect(detail.name).toBe(renamed)
        expect(detail.balance.amount).toBe(amount)
        expect(detail.ownerMemberIds).toHaveLength(2)
        const after = await wealth(page)
        expect(after.netWorth).toBe(before.netWorth)

        // A reload must not say it again, and must not take focus back (history state is cleared).
        await page.reload()
        await expect(page.getByRole('heading', { name: renamed })).toBeVisible()
        await expect(page.getByText(`${renamed} was updated`)).toHaveCount(0)
        // Opening Archive drops the sentence (a status line is dropped when its state changes).
        await page.getByRole('button', { name: 'Archive account' }).click()
        await expect(page.getByText(`${renamed} was updated`)).toHaveCount(0)
        await page.getByRole('button', { name: 'Cancel' }).first().click()
      }
    })
  })
}
