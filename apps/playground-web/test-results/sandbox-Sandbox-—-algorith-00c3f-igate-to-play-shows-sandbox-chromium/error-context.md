# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sandbox.spec.ts >> Sandbox — algorithm runner >> navigate to /play shows sandbox
- Location: tests/e2e/sandbox.spec.ts:10:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('code')
Expected: visible
Error: strict mode violation: locator('code') resolved to 3 elements:
    1) <code part="config-option-name">server.hmr.overlay</code> aka getByText('server.hmr.overlay')
    2) <code part="config-option-value">false</code> aka getByText('false')
    3) <code part="config-file-name">vite.config.js</code> aka getByText('vite.config.js')

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('code')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:import-analysis] Failed to resolve import \"#app-manifest\" from \"../../node_modules/.pnpm/nuxt@4.4.8_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typ_c2e2f03774191f704622373ca5b10526/node_modules/nuxt/dist/app/composables/manifest.js?v=3a976863\". Does the file exist?"
  - generic [ref=e5]: /Users/sac/wasm4pm/node_modules/.pnpm/nuxt@4.4.8_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typ_c2e2f03774191f704622373ca5b10526/node_modules/nuxt/dist/app/composables/manifest.js:16:6
  - generic [ref=e6]: "14 | /* webpackIgnore: true */ 15 | /* @vite-ignore */ 16 | \"#app-manifest\" | ^ 17 | ); 18 | } else {"
  - generic [ref=e7]: at TransformPluginContext._formatLog (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:29079:43) at TransformPluginContext.error (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:29076:14) at normalizeUrl (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:27199:18) at async file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:27257:32 at async Promise.all (index 4) at async TransformPluginContext.transform (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:27225:4) at async file:///Users/sac/wasm4pm/node_modules/.pnpm/vite-plugin-inspect@11.4.1_@nuxt+kit@4.4.8_magicast@0.5.3__vite@7.3.5_@types+node@25.9._0c2b2dd0d895ed54c510a86ec0a58158/node_modules/vite-plugin-inspect/dist/shared/vite-plugin-inspect.Fv_Ybe1U.mjs:403:17 at async EnvironmentPluginContainer.transform (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:28877:14) at async loadAndTransform (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:22746:26) at async viteTransformMiddleware (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:24622:20)
  - generic [ref=e8]:
    - text: Click outside, press Esc key, or fix the code to dismiss.
    - text: You can also disable this overlay by setting
    - code [ref=e9]: server.hmr.overlay
    - text: to
    - code [ref=e10]: "false"
    - text: in
    - code [ref=e11]: vite.config.js
    - text: .
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
> 13 |     await expect(page.locator('code')).toBeVisible({ timeout: 10000 })
     |                                        ^ Error: expect(locator).toBeVisible() failed
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
  77 |     await expect(page.getByText(/drop file to load/i)).toBeVisible({ timeout: 10000 })
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