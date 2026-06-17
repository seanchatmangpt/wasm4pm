# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: otel-lifecycle.spec.ts >> OTEL + WASM lifecycle >> all spans in a full session are well-formed
- Location: tests/e2e/otel-lifecycle.spec.ts:28:3

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator: getByRole('button', { name: /Run ⌘/i })
Expected: enabled
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeEnabled" with timeout 20000ms
  - waiting for getByRole('button', { name: /Run ⌘/i })

```

```yaml
- text: "[plugin:vite:import-analysis] Failed to resolve import \"#app-manifest\" from \"../../node_modules/.pnpm/nuxt@4.4.8_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typ_c2e2f03774191f704622373ca5b10526/node_modules/nuxt/dist/app/composables/manifest.js?v=3a976863\". Does the file exist? /Users/sac/wasm4pm/node_modules/.pnpm/nuxt@4.4.8_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typ_c2e2f03774191f704622373ca5b10526/node_modules/nuxt/dist/app/composables/manifest.js:16:6 14 | /* webpackIgnore: true */ 15 | /* @vite-ignore */ 16 | \"#app-manifest\" | ^ 17 | ); 18 | } else { at TransformPluginContext._formatLog (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:29079:43) at TransformPluginContext.error (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:29076:14) at normalizeUrl (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:27199:18) at async file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:27257:32 at async Promise.all (index 4) at async TransformPluginContext.transform (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:27225:4) at async file:///Users/sac/wasm4pm/node_modules/.pnpm/vite-plugin-inspect@11.4.1_@nuxt+kit@4.4.8_magicast@0.5.3__vite@7.3.5_@types+node@25.9._0c2b2dd0d895ed54c510a86ec0a58158/node_modules/vite-plugin-inspect/dist/shared/vite-plugin-inspect.Fv_Ybe1U.mjs:403:17 at async EnvironmentPluginContainer.transform (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:28877:14) at async loadAndTransform (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:22746:26) at async viteTransformMiddleware (file:///Users/sac/wasm4pm/node_modules/.pnpm/vite@7.3.5_@types+node@25.9.2_jiti@2.7.0_lightningcss@1.32.0_terser@5.48.0_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/config.js:24622:20) Click outside, press Esc key, or fix the code to dismiss. You can also disable this overlay by setting"
- code: server.hmr.overlay
- text: to
- code: "false"
- text: in
- code: vite.config.js
- text: .
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { createOtelCollector } from './utils/otel-collector.js'
  3  | 
  4  | test.describe('OTEL + WASM lifecycle', () => {
  5  |   test('wasm.init span has service_name, status=ok, duration_ms', async ({ page }) => {
  6  |     const otel = createOtelCollector(page)
  7  |     await page.goto('/play')
  8  |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 20000 })
  9  | 
  10 |     const span = otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
  11 |     expect(typeof span.duration_ms).toBe('number')
  12 |     expect(span.duration_ms).toBeGreaterThan(0)
  13 |   })
  14 | 
  15 |   test('wasm.run span emitted after algorithm run with algorithm and status', async ({ page }) => {
  16 |     const otel = createOtelCollector(page)
  17 |     await page.goto('/play?algo=dfg&preset=small-example')
  18 |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
  19 |     await page.getByRole('button', { name: /Run ⌘/i }).click()
  20 |     await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
  21 | 
  22 |     const span = otel.assertSpan('wasm.run', { service_name: 'playground-web', status: 'ok', algorithm: 'dfg' })
  23 |     expect(typeof span.duration_ms).toBe('number')
  24 |     expect(span.duration_ms).toBeGreaterThanOrEqual(0)
  25 |     otel.assertAllWellFormed()
  26 |   })
  27 | 
  28 |   test('all spans in a full session are well-formed', async ({ page }) => {
  29 |     const otel = createOtelCollector(page)
  30 |     await page.goto('/play?algo=dfg&preset=small-example')
> 31 |     await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 20000 })
     |                                                                ^ Error: expect(locator).toBeEnabled() failed
  32 |     await page.getByRole('button', { name: /Run ⌘/i }).click()
  33 |     await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
  34 |     // Run a second algorithm to accumulate more spans
  35 |     await page.getByRole('button', { name: /Alpha Miner/i }).click()
  36 |     await page.getByRole('button', { name: /Run ⌘/i }).click()
  37 |     await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
  38 | 
  39 |     // All spans — init + both runs — must have service_name, event, status, duration_ms
  40 |     otel.assertAllWellFormed()
  41 |     otel.assertAllHaveServiceName('playground-web')
  42 |   })
  43 | 
  44 |   test('/api/otel-event endpoint accepts span and returns ok', async ({ request }) => {
  45 |     const res = await request.post('/api/otel-event', {
  46 |       data: {
  47 |         service_name: 'playground-web',
  48 |         event: 'wasm.init',
  49 |         status: 'ok',
  50 |         duration_ms: 42
  51 |       }
  52 |     })
  53 |     expect(res.ok()).toBe(true)
  54 |     const body = await res.json()
  55 |     expect(body.ok).toBe(true)
  56 |   })
  57 | 
  58 |   test('Petri net page loads Vue Flow canvas after run', async ({ page }) => {
  59 |     const otel = createOtelCollector(page)
  60 |     await page.goto('/play/petri-net')
  61 |     await expect(page.getByRole('button', { name: /^Run/i })).toBeEnabled({ timeout: 15000 })
  62 |     await page.getByRole('button', { name: /^Run/i }).click()
  63 |     await expect(page.locator('.vue-flow__container, .vue-flow').first()).toBeVisible({ timeout: 10000 })
  64 |     // Petri net page must also emit OTEL spans
  65 |     otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
  66 |   })
  67 | })
  68 | 
```