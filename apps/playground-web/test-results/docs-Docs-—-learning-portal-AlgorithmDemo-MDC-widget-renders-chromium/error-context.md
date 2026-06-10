# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: docs.spec.ts >> Docs — learning portal >> AlgorithmDemo MDC widget renders
- Location: tests/e2e/docs.spec.ts:15:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.algorithm-demo').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.algorithm-demo').first()

```

```yaml
- banner:
  - link "wasm4pm playground":
    - /url: /
  - navigation:
    - navigation:
      - list:
        - listitem:
          - link "Learn":
            - /url: /learn/tutorials/getting-started
        - listitem:
          - link "Sandbox":
            - /url: /play
        - listitem:
          - link "Petri Net":
            - /url: /play/petri-net
        - listitem:
          - link "Reference":
            - /url: /learn/reference/algorithms
  - link "GitHub repository":
    - /url: https://github.com/chatmangpt-org/wasm4pm
- main:
  - complementary:
    - text: wasm4pm Playground
    - link "Open Sandbox →":
      - /url: /play
    - separator
  - main:
    - text: "404"
    - heading "Page not found" [level=1]
    - paragraph: The documentation page you're looking for doesn't exist or has been moved.
    - link "Getting Started":
      - /url: /learn/tutorials/getting-started
    - link "Open Sandbox":
      - /url: /play
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
  2  | 
  3  | test.describe('Docs — learning portal', () => {
  4  |   test('getting-started page renders content', async ({ page }) => {
  5  |     await page.goto('/learn/tutorials/getting-started')
  6  |     await expect(page.locator('h1')).toBeVisible()
  7  |   })
  8  | 
  9  |   test('sidebar navigation items are present', async ({ page }) => {
  10 |     await page.goto('/learn/tutorials/getting-started')
  11 |     // aside is the sidebar — one unique element (3 nav + 1 aside exist; use aside specifically)
  12 |     await expect(page.locator('aside').first()).toBeVisible()
  13 |   })
  14 | 
  15 |   test('AlgorithmDemo MDC widget renders', async ({ page }) => {
  16 |     await page.goto('/learn/tutorials/getting-started')
> 17 |     await expect(page.locator('.algorithm-demo').first()).toBeVisible({ timeout: 10000 })
     |                                                           ^ Error: expect(locator).toBeVisible() failed
  18 |   })
  19 | 
  20 |   test('Open Sandbox button links to /play', async ({ page }) => {
  21 |     await page.goto('/learn/tutorials/getting-started')
  22 |     const sandboxBtn = page.getByRole('link', { name: /Open Sandbox|Sandbox/i }).first()
  23 |     await expect(sandboxBtn).toBeVisible()
  24 |     const href = await sandboxBtn.getAttribute('href')
  25 |     expect(href).toContain('/play')
  26 |   })
  27 | 
  28 |   test('reference/algorithms page renders AlgorithmTable', async ({ page }) => {
  29 |     await page.goto('/learn/reference/algorithms')
  30 |     await expect(page.locator('.algorithm-table').first()).toBeVisible({ timeout: 10000 })
  31 |   })
  32 | 
  33 |   test('404 shows helpful fallback, not blank page', async ({ page }) => {
  34 |     await page.goto('/learn/tutorials/nonexistent-page')
  35 |     // Either 404 status or error content shown
  36 |     const body = await page.textContent('body')
  37 |     expect(body).toBeTruthy()
  38 |   })
  39 | 
  40 |   test('nav links resolve to correct routes', async ({ page }) => {
  41 |     await page.goto('/learn/tutorials/getting-started')
  42 |     // Sandbox nav link should go to /play
  43 |     await page.getByRole('link', { name: /Sandbox/i }).first().click()
  44 |     await expect(page).toHaveURL(/\/play/)
  45 |   })
  46 | })
  47 | 
```