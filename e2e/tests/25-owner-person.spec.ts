import { expect, test, type Page } from '@playwright/test'

// Runs after 24-wealth-groups.spec.ts. Slice 18c: the 401(k), IRAs and HSA have one owner and a reviewed owner
// correction changes who owns them (V2_401K_007, V2_HSA_007, V2_ROTH_IRA_007, V2_TRAD_IRA_007), and the Household page
// shows one person's accounts or the whole household with each account once (V2_MEMBERS_002). The database is shared
// with every earlier spec, so each test makes its own accounts and judges deltas, never absolute totals.
// Today is the stack's fixed 2026-10-03.

type Member = { id: string; active: boolean; name: string; label: string | null }
const label = (member: Member) => (member.label ? `${member.name} (${member.label})` : member.name)

async function members(page: Page): Promise<Member[]> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Owner Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let found = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as Member[]
  if (found.filter((member) => member.active).length < 2) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: `Owner Partner ${found.length}` },
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

async function make(
  page: Page,
  type: string,
  name: string,
  owners: string[],
  extra: object,
): Promise<string> {
  const [first] = await members(page)
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      institution: 'Harbor Benefits',
      ownerMemberIds: owners,
      openedOn: '2026-09-01',
      // Only an investment account or a defined benefit records who set it up.
      ...(type === 'checking' ? {} : { enteredByMemberId: first.id }),
      ...extra,
    },
  })
  expect(made.ok(), await made.text()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
}

const investment = (cash: string, shares: string) => ({
  opening: {
    cash,
    holdings: [{ symbol: 'HOME', quantity: shares, price: '100.00', valueOn: '2026-09-01' }],
  },
})

type Line = { accountId: string; balance: string }
type Wealth = { netWorth: string; financialAssets: string } & Record<string, unknown>

async function wealth(page: Page, memberId?: string): Promise<Wealth> {
  const response = await page.request.get(
    memberId ? `/api/v1/wealth?memberId=${memberId}` : '/api/v1/wealth',
  )
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as Wealth
}

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

/** Every account once across every group: the groups overlap, so they are never summed. */
function distinct(found: Wealth): Map<string, number> {
  const byId = new Map<string, number>()
  for (const key of GROUPS) {
    for (const line of (found[key] as { accounts: Line[] }).accounts)
      byId.set(line.accountId, Number(line.balance))
  }
  return byId
}

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

test('V2_401K_007 V2_HSA_007 V2_ROTH_IRA_007 V2_TRAD_IRA_007 a second owner is refused for each of the four types, by the raw API, with a message that names the type', async ({
  page,
}) => {
  const [first, second] = await members(page)
  const messages: Record<string, string> = {
    '401k': 'A 401(k) has one owner. Choose one member.',
    traditional_ira: 'A Traditional IRA has one owner. Choose one member.',
    roth_ira: 'A Roth IRA has one owner. Choose one member.',
    hsa: 'An HSA has one owner. Choose one member.',
  }
  for (const [type, message] of Object.entries(messages)) {
    const refused = await page.request.post('/api/v1/accounts', {
      data: {
        type,
        name: `Joint ${type}`,
        institution: 'Harbor Benefits',
        ownerMemberIds: [first.id, second.id],
        openedOn: '2026-09-01',
        enteredByMemberId: first.id,
        ...investment('100.00', '1'),
      },
    })
    expect(refused.status()).toBe(400)
    expect(((await refused.json()) as { message: string }).message).toBe(message)
    const id = await make(
      page,
      type,
      `Owner Refusal ${type}`,
      [first.id],
      investment('100.00', '1'),
    )
    const edit = await page.request.put(`/api/v1/accounts/${id}`, {
      data: { name: `Owner Refusal ${type}`, ownerMemberIds: [first.id, second.id] },
    })
    expect(edit.status()).toBe(400)
    const correction = await page.request.post(`/api/v1/accounts/${id}/owner-correction`, {
      data: { ownerMemberIds: [first.id, second.id], enteredByMemberId: first.id },
    })
    expect(correction.status()).toBe(400)
    expect(((await correction.json()) as { message: string }).message).toBe(message)
    const same = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
      ownerMemberIds: string[]
    }
    expect(same.ownerMemberIds).toEqual([first.id])
  }
})

for (const width of [710, 1280]) {
  test.describe(`owner correction and the person view at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_401K_007 V2_HSA_007 the owner choices are one named member each, the reviewed correction keeps cash, holdings and Balance, and the history keeps the previous owner (${width}px)`, async ({
      page,
    }) => {
      const [first, second] = await members(page)
      for (const [type, noun] of [
        ['401k', '401(k)'],
        ['hsa', 'HSA'],
      ] as const) {
        const name = `Owner ${noun} ${width}`
        const id = await make(page, type, name, [first.id], investment('6000.00', '20'))
        const before = await wealth(page)

        // Edit shows the owner and offers Change owner; it does not edit the owner.
        await page.goto(`/accounts/${id}/edit`)
        await expect(page.getByRole('radio')).toHaveCount(0)
        await expect(page.getByRole('checkbox')).toHaveCount(0)
        await expect(page.locator('strong', { hasText: label(first) })).toBeVisible()
        await page.getByRole('link', { name: 'Change owner' }).click()

        // Each choice is one named member; no "Maya and Sam" choice; the hint says everyone can still see it.
        const owner = page.getByRole('group', { name: 'Owner', exact: true })
        await expect(owner.getByRole('radio')).toHaveCount((await members(page)).length)
        await expect(owner.getByRole('radio', { name: label(first), exact: true })).toBeChecked()
        await expect(
          owner.getByRole('radio', { name: `${label(first)} and ${label(second)}` }),
        ).toHaveCount(0)
        await expect(page.getByText(`Choose the one member who owns this ${noun}.`)).toBeVisible()
        await expect(page.getByText(/joint account/i)).toHaveCount(0)
        await expectNoSidewaysScroll(page)

        await owner.getByRole('radio', { name: label(second), exact: true }).check()
        await page.getByRole('button', { name: 'Review' }).click()
        const review = page.getByRole('region', { name: 'Review owner change' })
        await expect(review).toContainText(
          `owner changes from ${label(first)} to ${label(second)}.`,
        )
        await expect(review).toContainText(
          'Its cash, holdings and Balance of $8,000.00 stay the same.',
        )
        await expect(review).toContainText(
          `the history keeps ${label(first)} as the previous owner`,
        )
        await expectNoSidewaysScroll(page)
        // A review writes nothing.
        expect(
          (
            (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
              ownerMemberIds: string[]
            }
          ).ownerMemberIds,
        ).toEqual([first.id])

        // Back returns to the choices with the chosen owner focused.
        await page.getByRole('button', { name: 'Back' }).click()
        await expect(owner.getByRole('radio', { name: label(second), exact: true })).toBeFocused()
        await page.getByRole('button', { name: 'Review' }).click()
        await page.getByRole('button', { name: 'Confirm' }).click()

        const status = page.getByRole('status')
        await expect(status).toContainText(
          `${name} was updated. Owner is now ${label(second)}. ${label(first)} stays in its history. Its cash, holdings and Balance of $8,000.00 are unchanged.`,
        )
        await expect(status).toBeFocused()
        await expect(page.getByRole('region', { name: 'Status history' })).toContainText(
          `Owner changed: ${label(first)} → ${label(second)} by ${label(first)}`,
        )
        const detail = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
          ownerMemberIds: string[]
          balance: { amount: string }
        }
        expect(detail.ownerMemberIds).toEqual([second.id])
        expect(detail.balance.amount).toBe('8000.00')
        const after = await wealth(page)
        expect(after.netWorth).toBe(before.netWorth)
        expect(after.financialAssets).toBe(before.financialAssets)
        await expectNoSidewaysScroll(page)

        // A reload does not say it again.
        await page.reload()
        await expect(page.getByRole('heading', { name })).toBeVisible()
        await expect(page.getByText(`${name} was updated`)).toHaveCount(0)

        // Cancel on the owner page and on the Edit page returns with the account's name focused.
        await page.goto(`/accounts/${id}/owner`)
        await page.getByRole('link', { name: 'Cancel' }).click()
        await expect(page.getByRole('heading', { name, level: 1 })).toBeFocused()
        await page.goto(`/accounts/${id}/edit`)
        await page.getByRole('link', { name: 'Cancel' }).click()
        await expect(page.getByRole('heading', { name, level: 1 })).toBeFocused()
      }
    })

    test(`V2_ROTH_IRA_007 V2_TRAD_IRA_007 the refusals of the Confirm are made in the review, and a refusal leaves the owner as it was (${width}px)`, async ({
      page,
    }) => {
      const [first] = await members(page)
      const name = `Owner Roth ${width}`
      const id = await make(page, 'roth_ira', name, [first.id], investment('1000.00', '10'))
      await page.goto(`/accounts/${id}/owner`)
      // Naming the owner it already has is no change; the review says so and shows no review.
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('alert')).toContainText('Choose a different owner')
      await expect(page.getByRole('region', { name: 'Review owner change' })).toHaveCount(0)
      expect(
        (
          (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
            ownerMemberIds: string[]
          }
        ).ownerMemberIds,
      ).toEqual([first.id])
    })

    test(`V2_MEMBERS_002 each person sees the joint checking and their own accounts once, the whole household sees every account once, and the totals are not added (${width}px)`, async ({
      page,
    }) => {
      const [first, second] = await members(page)
      const tag = `PV${width}`
      const checking = `Joint Checking ${tag}`
      const k401 = `Sam 401k ${tag}`
      const ira = `Maya IRA ${tag}`
      const firstBefore = Number((await wealth(page, first.id)).financialAssets)
      const secondBefore = Number((await wealth(page, second.id)).financialAssets)
      const householdBefore = Number((await wealth(page)).financialAssets)
      await make(page, 'checking', checking, [first.id, second.id], { openingBalance: '5000.00' })
      await make(page, '401k', k401, [first.id], investment('60000.00', '200'))
      await make(page, 'traditional_ira', ira, [second.id], investment('20000.00', '100'))

      // The server: +85,000 and +35,000 for the people, +115,000 for the household, the overlap counted once.
      const firstView = await wealth(page, first.id)
      const secondView = await wealth(page, second.id)
      const householdView = await wealth(page)
      expect(Number(firstView.financialAssets) - firstBefore).toBeCloseTo(85000, 2)
      expect(Number(secondView.financialAssets) - secondBefore).toBeCloseTo(35000, 2)
      expect(Number(householdView.financialAssets) - householdBefore).toBeCloseTo(115000, 2)
      const ids = (found: Wealth) => [...distinct(found).keys()]
      expect(ids(firstView).length).toBe(new Set(ids(firstView)).size)
      const sumOfPeople = Number(firstView.financialAssets) + Number(secondView.financialAssets)
      expect(sumOfPeople).toBeGreaterThan(Number(householdView.financialAssets))

      await page.goto('/')
      const card = page.getByRole('region', { name: 'Accounts and wealth' })
      const view = card.getByLabel('View', { exact: true })
      const list = card.getByRole('region', { name: 'Accounts in this view' })
      const assets = card.getByText(/Financial assets/)

      // Playwright's selectOption does not move focus, so focus the chooser as a person would, then choose.
      await view.focus()
      await view.selectOption({ label: label(first) })
      await expect(assets).toContainText(money(Number(firstView.financialAssets)))
      await expect(list.getByText(checking, { exact: true })).toHaveCount(1)
      await expect(list.getByText(k401, { exact: true })).toHaveCount(1)
      await expect(list.getByText(ira, { exact: true })).toHaveCount(0)
      await expect(view).toBeFocused()
      await expect(card.getByRole('status')).toContainText(
        `Showing the accounts of ${label(first)}`,
      )
      await expect(card.getByRole('status')).toContainText(
        /appears? in each person's view and (is|are) counted once for the household/,
      )
      await expect(page).toHaveURL(new RegExp(`view=${first.id}`))
      await expect(page.getByRole('region', { name: 'Wealth on a date' })).toContainText(
        'This is for the whole household',
      )
      await expectNoSidewaysScroll(page)

      await view.selectOption({ label: label(second) })
      await expect(assets).toContainText(money(Number(secondView.financialAssets)))
      await expect(list.getByText(checking, { exact: true })).toHaveCount(1)
      await expect(list.getByText(ira, { exact: true })).toHaveCount(1)
      await expect(list.getByText(k401, { exact: true })).toHaveCount(0)

      // A reload keeps the person.
      await page.reload()
      await expect(card.getByLabel('View', { exact: true })).toHaveValue(second.id)
      await expect(card.getByText(/Financial assets/)).toContainText(
        money(Number(secondView.financialAssets)),
      )

      await card.getByLabel('View', { exact: true }).selectOption({ label: 'Whole household' })
      await expect(card.getByText(/Financial assets/)).toContainText(
        money(Number(householdView.financialAssets)),
      )
      for (const name of [checking, k401, ira])
        await expect(list.getByText(name, { exact: true })).toHaveCount(1)
      await expect(card.getByRole('status')).toContainText('Showing the whole household')
      await expect(card.getByRole('status')).toContainText('each counted once')
      await expect(card.getByRole('status')).toContainText(
        /appears? in each person's view and (is|are) counted once for the household/,
      )
      await expect(page).not.toHaveURL(/view=/)
      await expectNoSidewaysScroll(page)
    })
  })
}
