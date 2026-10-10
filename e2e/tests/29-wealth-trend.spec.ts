import { expect, test, type Page } from '@playwright/test'

// Runs after 28-groups.spec.ts. Slice 19d: the September 30 snapshot (V2_WEALTH_001) and the trend with its increase
// (V2_WEALTH_009) on the packaged stack. The database is shared with every earlier spec, so household totals are
// judged by delta against the server's own figures, and each width holds its own accounts (T19D710, T19D1280). The
// exact scenario figures ($188,620.00, $17,120.00, $186,840.00, $190,960.00, $4,120.00) are pinned by
// WealthAsOfTrendApiTests in a fresh context. Today is the stack's fixed 2026-10-03, so the trend runs Sep 30 to Oct 3.

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

type Wealth = {
  netWorth: string
  bankMoney: { total: string; accounts: { accountId: string; name: string; balance: string }[] }
}
type Change = { startWealth: string; endWealth: string; change: string; priceChange: string }

const wealthOn = async (page: Page, on: string) =>
  (await (await page.request.get(`/api/v1/wealth?asOf=${on}`)).json()) as Wealth
const changeOver = async (page: Page, from: string, to: string) =>
  (await (await page.request.get(`/api/v1/wealth/change?from=${from}&to=${to}`)).json()) as Change
const money = (value: number) =>
  `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function openAccount(page: Page, owner: string, type: string, name: string, amount: string) {
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      ownerMemberIds: [owner],
      openedOn: '2026-09-01',
      openingBalance: amount,
    },
  })
  expect(made.ok()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
}

for (const width of [710, 1280]) {
  test.describe.serial(`wealth snapshot and trend at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const tag = `T19D${width}`
    let checking = ''
    let sepNet = 0
    let octNet = 0
    let bankBefore = 0
    let changeBefore = 0
    let priceBefore = 0
    let flatBefore = 0

    test(`V2_WEALTH_001 Bank money lists both accounts with their amounts and total, an account opens to its September 30 Balance and history (${width}px)`, async ({
      page,
    }) => {
      const owner = await enteringMember(page)
      bankBefore = Number((await wealthOn(page, '2026-09-30')).bankMoney.total)
      const before = await changeOver(page, '2026-09-30', '2026-10-03')
      changeBefore = Number(before.change)
      priceBefore = Number(before.priceChange)
      flatBefore = Number((await changeOver(page, '2026-09-30', '2026-10-01')).change)
      checking = await openAccount(page, owner, 'checking', `${tag} Checking`, '5120.00')
      await openAccount(page, owner, 'savings', `${tag} Savings`, '12000.00')

      await page.goto('/')
      const bank = page.getByRole('region', { name: 'Bank money', exact: true })
      await expect(bank.getByRole('listitem').filter({ hasText: `${tag} Checking` })).toContainText(
        '$5,120.00',
      )
      await expect(bank.getByRole('listitem').filter({ hasText: `${tag} Savings` })).toContainText(
        '$12,000.00',
      )
      // The group total moved by the two accounts: $17,120.00 on Sep 30, whatever else the shared database holds.
      const after = Number((await wealthOn(page, '2026-09-30')).bankMoney.total)
      expect(after - bankBefore).toBeCloseTo(17120, 2)
      // The dated card lists the same two accounts on September 30, with their total moved by 17,120.
      const dated = page.getByRole('region', { name: 'Wealth on a date' })
      await dated.getByLabel('Show wealth on').fill('2026-09-30')
      const onDate = dated.getByRole('region', {
        name: 'Checking and savings balances on this date',
      })
      await expect(
        onDate.getByRole('listitem').filter({ hasText: `${tag} Checking` }),
      ).toContainText('$5,120.00')
      await expect(
        onDate.getByRole('listitem').filter({ hasText: `${tag} Savings` }),
      ).toContainText('$12,000.00')
      await expect(onDate).toContainText(`Total ${money(after)}`)
      await expectNoSidewaysScroll(page)

      await bank.getByRole('link', { name: new RegExp(`${tag} Checking`) }).click()
      await expect(page.getByRole('heading', { name: `${tag} Checking` })).toBeVisible()
      await page.getByLabel('View Balance on').fill('2026-09-30')
      await expect(
        page.getByRole('status').filter({ hasText: 'Balance on 2026-09-30' }),
      ).toContainText('$5,120.00')
      await expect(page.getByRole('region', { name: /activity|history/i }).first()).toBeVisible()
      await expectNoSidewaysScroll(page)
    })

    test(`V2_WEALTH_009 later income and a later price change October 3 only: Sep 30 stays, the trend shows both dates and the increase (${width}px)`, async ({
      page,
    }) => {
      const owner = await enteringMember(page)
      sepNet = Number((await wealthOn(page, '2026-09-30')).netWorth)
      // Savings-free later activity: $2,500.00 income on Oct 1 (checking) and HOME $110.00 to $130.00 on Oct 2 on a
      // brokerage of 50 shares ($1,000.00).
      const income = await page.request.post(`/api/v1/accounts/${checking}/income`, {
        headers: { 'Idempotency-Key': `t19d-income-${width}` },
        data: {
          description: 'October salary',
          amount: '2500.00',
          occurredOn: '2026-10-01',
          category: 'Salary',
          enteredByMemberId: owner,
        },
      })
      expect(income.status()).toBe(201)
      const symbol = tag
      const made = await page.request.post('/api/v1/accounts', {
        data: {
          type: 'brokerage',
          name: `${tag} Brokerage`,
          ownerMemberIds: [owner],
          openedOn: '2026-09-01',
          enteredByMemberId: owner,
          opening: {
            cash: '16000.00',
            holdings: [{ symbol, quantity: '50', price: '110.00', valueOn: '2026-09-01' }],
          },
        },
      })
      expect(made.ok()).toBeTruthy()
      const brokerage = ((await made.json()) as { id: string }).id
      const sepAfterBrokerage = Number((await wealthOn(page, '2026-09-30')).netWorth)
      expect(sepAfterBrokerage - sepNet).toBeCloseTo(21500, 2)
      sepNet = sepAfterBrokerage
      const priced = await page.request.post(`/api/v1/accounts/${brokerage}/prices`, {
        headers: { 'Idempotency-Key': `t19d-price-${width}` },
        data: { symbol, price: '130.00', valueOn: '2026-10-02', enteredByMemberId: owner },
      })
      expect(priced.status()).toBe(201)

      // September 30 did not move, October 3 carries both.
      expect(Number((await wealthOn(page, '2026-09-30')).netWorth)).toBeCloseTo(sepNet, 2)
      octNet = Number((await wealthOn(page, '2026-10-03')).netWorth)
      const change = await changeOver(page, '2026-09-30', '2026-10-03')
      // The change since the setup of this width's accounts grew by income + price, whatever else is in the database.
      expect(Number(change.change) - changeBefore).toBeCloseTo(2500 + 1000, 2)
      expect(Number(change.priceChange) - priceBefore).toBeCloseTo(1000, 2)
      expect(Number(change.endWealth) - Number(change.startWealth)).toBeCloseTo(
        Number(change.change),
        2,
      )

      await page.goto('/')
      const card = page.getByRole('region', { name: 'Wealth on a date' })
      await card.getByLabel('Show wealth on').fill('2026-09-30')
      await expect(card.getByText(/^Household wealth on 2026-09-30/)).toContainText(money(sepNet))
      await card.getByLabel('From', { exact: true }).fill('2026-09-30')
      await card.getByLabel('To', { exact: true }).fill('2026-10-03')
      const shown = card.getByRole('region', { name: 'Wealth change' })
      await expect(shown).toContainText(
        `Wealth went from ${money(Number(change.startWealth))} on 2026-09-30 to ${money(Number(change.endWealth))} on 2026-10-03: a change of ${money(Number(change.change))}.`,
      )
      await expect(
        shown.getByText('Investment price changes').locator('xpath=ancestor::li'),
      ).toContainText(money(Number(change.priceChange)))
      await expect(
        shown.getByText('Income', { exact: true }).locator('xpath=ancestor::li'),
      ).toContainText('$')
      // The same start, an end date before the income and the price: a different answer (two dates).
      await card.getByLabel('To', { exact: true }).fill('2026-10-01')
      const flat = await changeOver(page, '2026-09-30', '2026-10-01')
      await expect(shown).toContainText(
        `Wealth went from ${money(Number(flat.startWealth))} on 2026-09-30 to ${money(Number(flat.endWealth))} on 2026-10-01: a change of ${money(Number(flat.change))}.`,
      )
      // Judged by delta (other specs have entries on Oct 2 and 3): since the setup of this width, Oct 3 gained the
      // income and the price and Oct 1 only the income, so they differ by exactly the $1,000.00 price.
      expect(Number(flat.priceChange)).toBeCloseTo(0, 2)
      expect(Number(flat.change) - flatBefore).toBeCloseTo(2500, 2)
      expect(Number(change.change) - changeBefore - (Number(flat.change) - flatBefore)).toBeCloseTo(
        1000,
        2,
      )
      expect(octNet - sepNet).toBeCloseTo(Number(change.change), 2)
      await expectNoSidewaysScroll(page)
    })
  })
}
