import { expect, test } from '@playwright/test'

// One continuous journey against an empty database: later steps depend on earlier ones.
test.describe.serial('household journey', () => {
  test('starts empty and asks for a household name', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Household | WealthMesh')
    await expect(page.getByRole('heading', { name: 'Create your household' })).toBeVisible()

    await page.getByRole('button', { name: 'Create household' }).click()
    await expect(page.getByText('Enter a household name.')).toBeVisible()
  })

  test('creates the household', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Household name').fill('Doe Family')
    await page.getByRole('button', { name: 'Create household' }).click()

    await expect(page.getByRole('heading', { name: 'Doe Family' })).toBeVisible()
    await expect(page.getByText('No members yet. Add the first person below.')).toBeVisible()
  })

  test('adds members and clears the form', async ({ page }) => {
    await page.goto('/')
    const members = page.getByRole('list')

    await page.getByLabel('Member name').fill('Alex Doe')
    await page.getByLabel('Label (optional)').fill('Parent')
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(members.getByText('Alex Doe')).toBeVisible()
    await expect(members.getByText('Parent')).toBeVisible()
    await expect(page.getByLabel('Member name')).toHaveValue('')

    await page.getByLabel('Member name').fill('Sam Rivera')
    await page.getByLabel('Label (optional)').fill('Child')
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(members.getByText('Sam Rivera')).toBeVisible()
  })

  test('rejects a blank name and a duplicate member', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByText('Enter a member name.')).toBeVisible()

    await page.getByLabel('Member name').fill('alex doe')
    await page.getByLabel('Label (optional)').fill('parent')
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'A member with this name and label already exists',
    )
    await expect(page.getByLabel('Member name')).toHaveValue('alex doe')
  })

  test('edits a member', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Edit member Sam Rivera Child' }).click()

    const row = page.getByRole('listitem').filter({ has: page.getByLabel('Member name') })
    await row.getByLabel('Member name').fill('Samira Rivera')
    await row.getByRole('button', { name: 'Save member' }).click()

    await expect(page.getByRole('main').getByText('Samira Rivera')).toBeVisible()
    await expect(page.getByRole('main').getByText('Sam Rivera', { exact: true })).toHaveCount(0)
  })

  test('renames the household', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Rename household' }).click()
    await page.getByLabel('Household name').fill('Doe-Rivera Family')
    await page.getByRole('button', { name: 'Save household name' }).click()

    await expect(page.getByRole('heading', { name: 'Doe-Rivera Family' })).toBeVisible()
  })

  test('keeps everything after a reload', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Doe-Rivera Family' })).toBeVisible()
    await expect(page.getByRole('main').getByText('Alex Doe')).toBeVisible()
    await expect(page.getByRole('main').getByText('Samira Rivera')).toBeVisible()
  })
})
