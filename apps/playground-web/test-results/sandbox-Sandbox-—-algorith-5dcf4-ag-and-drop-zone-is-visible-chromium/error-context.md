# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sandbox.spec.ts >> Sandbox — algorithm runner >> drag-and-drop zone is visible
- Location: tests/e2e/sandbox.spec.ts:74:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/drop file to load/i)
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText(/drop file to load/i)
    - waiting for" http://localhost:3000/play" navigation to finish...
    - navigated to "http://localhost:3000/play"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { createOtelCollector } from './utils/otel-collector.js'
  3  | 
  4  | test.describe('Sandbox — algorithm runner', () => {
  5  |   test('loads and redirects to /learn/tutorials/getting-started', async ({ page }) => {
  6  |     await page.goto('/')
  7  |     await expect(page).toHaveURL(/learn\/tutorials\/getting-started/)
  8  |   })
  9  | 
  10 |   test('navigate to /play shows sandbox', async ({ page }) => {
  11 |     await page.goto('/play')
  12 |     // SPA page — wait for Vue to mount and render the algo name in top bar
  13 |     await expect(page.locator('code')).toBeVisible({ timeout: 10000 })
  14 |   })
  15 | 
  16 |   test('WASM loads (ready state) and emits wasm.init OTEL span', async ({ page }) => {
  17 |     const otel = createOtelCollector(page)
  18 |     await page.goto('/play')
  19 |     // Wait for WASM to init — Run ⌘↵ button becomes enabled
  20 |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
  21 |     otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
  22 |   })
  23 | 
  24 |   test('run DFG algorithm on small-example preset and emits wasm.run OTEL span', async ({ page }) => {
  25 |     const otel = createOtelCollector(page)
  26 |     await page.goto('/play?algo=dfg&preset=small-example')
  27 |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
  28 |     await page.getByRole('button', { name: /Run ⌘/i }).click()
  29 |     // JSON output appears — use .first() to handle strict mode (multiple pre elements)
  30 |     await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
  31 |     const text = await page.locator('pre').first().textContent()
  32 |     expect(text).toContain('{') // valid JSON
  33 |     // Verify OTEL spans are well-formed: init + run both emitted
  34 |     otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
  35 |     otel.assertSpan('wasm.run', { service_name: 'playground-web', status: 'ok', algorithm: 'dfg' })
  36 |     otel.assertAllWellFormed()
  37 |   })
  38 | 
  39 |   test('receipt tab appears after successful run', async ({ page }) => {
  40 |     await page.goto('/play?algo=dfg')
  41 |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
  42 |     await page.getByRole('button', { name: /Run ⌘/i }).click()
  43 |     await expect(page.getByRole('tab', { name: /Receipt/i })).toBeVisible({ timeout: 10000 })
  44 |   })
  45 | 
  46 |   test('share URL button copies URL with algo param', async ({ page, context }) => {
  47 |     await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  48 |     await page.goto('/play?algo=heuristic_miner')
  49 |     await page.getByRole('button', { name: /Share/i }).click()
  50 |     await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible()
  51 |   })
  52 | 
  53 |   test('cmd+enter keyboard shortcut triggers run', async ({ page }) => {
  54 |     await page.goto('/play?algo=dfg&preset=small-example')
  55 |     // Wait for WASM ready before triggering shortcut
  56 |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
  57 |     // Click the page body to ensure focus is in the document (not devtools)
  58 |     await page.locator('main').click()
  59 |     await page.keyboard.press('Meta+Enter')
  60 |     await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
  61 |   })
  62 | 
  63 |   test('sample preset buttons load different logs', async ({ page }) => {
  64 |     await page.goto('/play')
  65 |     // Wait for WASM and initial preset to load
  66 |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
  67 |     await page.getByRole('button', { name: /Road Traffic/i }).click()
  68 |     // After clicking, running Road Traffic with dfg should succeed
  69 |     await page.waitForTimeout(1500)
  70 |     // The top bar still shows current algo code element (page renders)
  71 |     await expect(page.locator('code')).toBeVisible()
  72 |   })
  73 | 
  74 |   test('drag-and-drop zone is visible', async ({ page }) => {
  75 |     await page.goto('/play')
  76 |     // The drop-file hint is always visible in the input panel header
> 77 |     await expect(page.getByText(/drop file to load/i)).toBeVisible({ timeout: 10000 })
     |                                                        ^ Error: expect(locator).toBeVisible() failed
  78 |   })
  79 | 
  80 |   test('algorithm sidebar filter narrows list', async ({ page }) => {
  81 |     await page.goto('/play')
  82 |     const searchInput = page.getByPlaceholder(/Filter algorithms/i)
  83 |     await searchInput.fill('inductive')
  84 |     await expect(page.getByRole('button', { name: /Inductive Miner/i })).toBeVisible()
  85 |     await expect(page.getByRole('button', { name: /Alpha Miner/i })).not.toBeVisible()
  86 |   })
  87 | 
  88 |   test('cognition breed selection switches mode', async ({ page }) => {
  89 |     await page.goto('/play')
  90 |     await page.getByRole('button', { name: /MYCIN/i }).click()
  91 |     await expect(page.locator('code')).toContainText('cognition:MYCIN')
  92 |     // The algorithm Run ⌘↵ button disappears in cognition mode (v-if="!isCognitionMode")
  93 |     // CognitionDemo has its own "Run" button — match the ⌘↵ shortcut hint specifically
  94 |     await expect(page.getByText('⌘↵')).not.toBeVisible()
  95 |   })
  96 | })
  97 | 
```