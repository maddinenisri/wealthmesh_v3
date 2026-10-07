// Screenshots of screens at 710px and 1280px for the visual review step (docs/process/workflow.md, step 4).
//
//   node e2e/screens/shoot.mjs --base http://localhost:5180 --out <dir> --screens <screens.json>
//
// `screens.json` is a list of { "name", "path", "steps": [...], "clip": "heading text" }. A step is one of
//   { "click": "button or link text", "exact": true }   (substring match unless "exact")
//   { "fill": ["label", "text"] }   { "select": ["label", "option"] }   { "check": "checkbox label" }
//   { "wait": "text that must appear" }   { "press": "Escape" }   { "focus": "label" }
// A step that clicks a button whose name starts with "Confirm" is refused: stop before every Confirm (leave
// "Entered by" unchosen, so a Confirm would stay disabled anyway).
// Each state gives three files: the full page, the viewport as the person first sees it (`-view`), and, with
// "clip", just the card that holds that heading (`-clip`). `index.tsv` in the output folder lists every picture with
// how far the page scrolls sideways (it must be 0), what has focus, and whether the clip heading is in the viewport.
// The app is shot as it is: use a dev database you do not mind, and steps that change nothing.
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, arg, i, all) =>
        arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs,
      [],
    ),
)
const { base = 'http://localhost:5180', out = 'screens-out', screens } = args
if (!screens) {
  console.error(
    'usage: node e2e/screens/shoot.mjs --base <url> --out <dir> --screens <screens.json>',
  )
  process.exit(2)
}
mkdirSync(out, { recursive: true })
const list = JSON.parse(readFileSync(screens, 'utf8'))

// A backend started before the last commit shows old behaviour: warn, so a stale server is not mistaken for a fault.
try {
  const commit = Number(execSync('git log -1 --format=%ct', { encoding: 'utf8' })) * 1000
  const apps = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8' }))
  const backend = apps.find((app) => app.name === 'wm-backend')
  if (backend && backend.pm2_env.pm_uptime < commit)
    console.warn(
      'WARNING: wm-backend started before the last commit; run `pm2 restart wm-backend` and shoot again.',
    )
} catch {
  // pm2 or git not available: no warning.
}

const browser = await chromium.launch()
const index = ['screen\twidth\tsideways\tfocus\tclip heading in view\tfile']

async function run(page, step) {
  if (step.click) {
    if (/^confirm/i.test(step.click))
      throw new Error(`refusing to press "${step.click}": stop before Confirm`)
    const name = step.exact
      ? new RegExp(`^${step.click.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      : step.click
    await page.getByRole('button', { name }).or(page.getByRole('link', { name })).first().click()
  } else if (step.fill) await page.getByLabel(step.fill[0], { exact: true }).fill(step.fill[1])
  else if (step.select)
    await page.getByLabel(step.select[0], { exact: true }).selectOption({ label: step.select[1] })
  else if (step.check) await page.getByRole('checkbox', { name: step.check }).check()
  else if (step.wait) await page.getByText(step.wait).first().waitFor()
  else if (step.press) await page.keyboard.press(step.press)
  else if (step.focus) await page.getByLabel(step.focus, { exact: true }).focus()
  else throw new Error(`unknown step ${JSON.stringify(step)}`)
}

for (const width of [710, 1280]) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  for (const screen of list) {
    await page.goto(new URL(screen.path, base).toString())
    await page.waitForLoadState('networkidle')
    for (const step of screen.steps ?? []) await run(page, step)
    await page.waitForTimeout(300)
    const file = join(out, `${screen.name}-${width}.png`)
    // The viewport first: where the page is scrolled to and what has focus are what a person sees after a click.
    await page.screenshot({ path: join(out, `${screen.name}-${width}-view.png`) })
    await page.screenshot({ path: file, fullPage: true })
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    const focus = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return 'the page body'
      const name =
        el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.id || ''
      return `${el.tagName.toLowerCase()} ${name}`.trim()
    })
    let inView = ''
    if (screen.clip) {
      const heading = page.getByRole('heading', { name: screen.clip }).first()
      const box = await heading.boundingBox()
      inView = box && box.y >= 0 && box.y + box.height <= 900 ? 'yes' : 'no'
      const card = heading.locator(
        'xpath=ancestor::*[self::section or self::div][@role="region" or @aria-labelledby][1]',
      )
      const target = (await card.count()) > 0 ? card.first() : heading
      await target.screenshot({ path: join(out, `${screen.name}-${width}-clip.png`) })
    }
    index.push([screen.name, width, sideways, focus, inView, file].join('\t'))
    console.log(
      `${file}\tsideways=${sideways}\tfocus=${focus}${screen.clip ? `\theading in view=${inView}` : ''}`,
    )
  }
  await context.close()
}
writeFileSync(join(out, 'index.tsv'), `${index.join('\n')}\n`)
await browser.close()
