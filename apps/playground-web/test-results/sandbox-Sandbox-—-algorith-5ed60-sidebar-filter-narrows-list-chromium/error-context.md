# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sandbox.spec.ts >> Sandbox — algorithm runner >> algorithm sidebar filter narrows list
- Location: tests/e2e/sandbox.spec.ts:80:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/Filter algorithms/i)
    - waiting for" http://localhost:3000/play" navigation to finish...
    - navigated to "http://localhost:3000/play"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e4]:
    - generic [ref=e5]:
      - complementary [ref=e6]:
        - generic [ref=e7]:
          - link "Docs" [ref=e8] [cursor=pointer]:
            - /url: /learn/tutorials/getting-started
            - text: Docs
          - textbox "Filter…" [ref=e11]
        - generic [ref=e14]:
          - generic [ref=e15]:
            - paragraph [ref=e16]: Discovery
            - button "DFG" [ref=e17]
            - button "Heuristic Miner" [ref=e18]
            - button "Inductive Miner" [ref=e19]
            - button "Alpha Miner" [ref=e20]
            - button "Alpha++" [ref=e21]
            - button "ILP Miner" [ref=e22]
            - button "Genetic Miner" [ref=e23]
            - button "POWL Miner" [ref=e24]
            - button "Declare Miner" [ref=e25]
          - generic [ref=e26]:
            - paragraph [ref=e27]: Conformance
            - button "Token Replay" [ref=e28]
            - button "Alignment" [ref=e29]
            - button "Footprint" [ref=e30]
          - generic [ref=e31]:
            - paragraph [ref=e32]: Streaming / Drift
            - button "Streaming DFG" [ref=e33]
            - button "Concept Drift" [ref=e34]
          - generic [ref=e35]:
            - paragraph [ref=e36]: ML
            - button "Classify" [ref=e37]
            - button "Cluster" [ref=e38]
            - button "Forecast" [ref=e39]
            - button "Anomaly" [ref=e40]
            - button "Regress" [ref=e41]
            - button "PCA" [ref=e42]
          - generic [ref=e43]:
            - paragraph [ref=e44]: Prediction
            - button "Next Activity" [ref=e45]
            - button "Remaining Time" [ref=e46]
          - generic [ref=e47]:
            - paragraph [ref=e49]: Cognition
            - button "ELIZA" [ref=e50]
            - button "MYCIN" [ref=e51]
            - button "CBR" [ref=e52]
            - button "STRIPS" [ref=e53]
            - button "PROLOG" [ref=e54]
      - generic [ref=e55]:
        - generic [ref=e56]:
          - code [ref=e57]: dfg
          - generic [ref=e58]:
            - button "Small Example" [ref=e59]
            - button "Road Traffic (218KB)" [ref=e60]
            - button "OCEL 2.0 Example" [ref=e61]
          - button "Share" [ref=e62]: Share
          - button "Run ⌘↵" [ref=e64]:
            - text: Run
            - generic [ref=e66]: ⌘↵
        - generic [ref=e67]:
          - generic [ref=e68]:
            - generic [ref=e69]:
              - generic [ref=e70]: Input
              - generic [ref=e71]: XES
              - generic [ref=e72]: drop file
            - code [ref=e76]:
              - generic [ref=e77]:
                - textbox "Editor content"
                - textbox [ref=e78]
                - generic [ref=e80]:
                  - generic [ref=e83]: "1"
                  - generic [ref=e84]:
                    - generic [ref=e85] [cursor=pointer]: 
                    - generic [ref=e86]: "2"
                  - generic [ref=e88]: "3"
                  - generic [ref=e89]:
                    - generic [ref=e90] [cursor=pointer]: 
                    - generic [ref=e91]: "4"
                  - generic [ref=e93]: "5"
                  - generic [ref=e95]: "6"
                  - generic [ref=e96]:
                    - generic [ref=e97] [cursor=pointer]: 
                    - generic [ref=e98]: "7"
                  - generic [ref=e100]: "8"
                  - generic [ref=e102]: "9"
                  - generic [ref=e103]:
                    - generic [ref=e104] [cursor=pointer]: 
                    - generic [ref=e105]: "10"
                  - generic [ref=e107]: "11"
                  - generic [ref=e109]: "12"
                  - generic [ref=e111]: "13"
                  - generic [ref=e112]:
                    - generic [ref=e113] [cursor=pointer]: 
                    - generic [ref=e114]: "14"
                  - generic [ref=e116]: "15"
                  - generic [ref=e118]: "16"
                  - generic [ref=e120]: "17"
                  - generic [ref=e122]: "18"
                  - generic [ref=e124]: "19"
                  - generic [ref=e126]: "20"
                  - generic [ref=e127]:
                    - generic [ref=e128] [cursor=pointer]: 
                    - generic [ref=e129]: "21"
                  - generic [ref=e131]: "22"
                  - generic [ref=e132]:
                    - generic [ref=e133] [cursor=pointer]: 
                    - generic [ref=e134]: "23"
                  - generic [ref=e136]: "24"
                  - generic [ref=e138]: "25"
                  - generic [ref=e140]: "26"
                  - generic [ref=e141]:
                    - generic [ref=e142] [cursor=pointer]: 
                    - generic [ref=e143]: "27"
                  - generic [ref=e145]: "28"
                  - generic [ref=e147]: "29"
                  - generic [ref=e149]: "30"
                  - generic [ref=e150]:
                    - generic [ref=e151] [cursor=pointer]: 
                    - generic [ref=e152]: "31"
                  - generic [ref=e154]: "32"
                  - generic [ref=e156]: "33"
                  - generic [ref=e158]: "34"
                  - generic [ref=e160]: "35"
                  - generic [ref=e162]: "36"
                  - generic [ref=e164]: "37"
                  - generic [ref=e165]:
                    - generic [ref=e166] [cursor=pointer]: 
                    - generic [ref=e167]: "38"
                  - generic [ref=e169]: "39"
                  - generic [ref=e170]:
                    - generic [ref=e171] [cursor=pointer]: 
                    - generic [ref=e172]: "40"
                  - generic [ref=e174]: "41"
                - generic [ref=e292]:
                  - generic [ref=e294]: <?xml version="1.0" encoding="UTF-8" ?>
                  - generic [ref=e296]: <log xes.version="2.0" xes.features ="arbitrary-depth"
                  - generic [ref=e298]: xmlns="http://www.xes-standard.org
                  - generic [ref=e300]: /">
                  - generic [ref=e302]: <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext" />
                  - generic [ref=e304]: <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext" />
                  - generic [ref=e306]: <global scope="trace">
                  - generic [ref=e308]: <string key="concept:name" value="" />
                  - generic [ref=e310]: </global>
                  - generic [ref=e312]: <global scope="event">
                  - generic [ref=e314]: <string key="concept:name" value="" />
                  - generic [ref=e316]: <date key="time:timestamp" value="2024-01-01T00:00:00.000+00:00" />
                  - generic [ref=e318]: <string key="system" value="" />
                  - generic [ref=e320]: <string key="nested-global-string-attr">
                  - generic [ref=e322]: <boolean key="was-correctly-parsed" value="true"/>
                  - generic [ref=e324]: </string>
                  - generic [ref=e326]: </global>
                  - generic [ref=e328]: <classifier name="Activity" keys="concept:name" />
                  - generic [ref=e330]: <classifier name="Another" keys="concept:name system" />
                  - generic [ref=e332]: <float key="log attribute" value="2335.23" />
                  - generic [ref=e334]: <trace>
                  - generic [ref=e336]: <string key="concept:name" value="Trace number one" />
                  - generic [ref=e338]: <event>
                  - generic [ref=e340]: <string key="concept:name" value="Register client" />
                  - generic [ref=e342]: <string key="system" value="alpha" />
                  - generic [ref=e344]: <date key="time:timestamp" value="2009-11-25T14:12:45:000+02:00" />
                  - generic [ref=e346]: <int key="attempt" value="23">
                  - generic [ref=e348]: <boolean key="tried hard" value="false" />
                  - generic [ref=e350]: </int>
                  - generic [ref=e352]: </event>
                  - generic [ref=e354]: <event>
                  - generic [ref=e356]: <string key="concept:name" value="Mail rejection" />
                  - generic [ref=e358]: <string key="system" value="beta" />
                  - generic [ref=e360]: <date key="time:timestamp" value="2009-11-28T11:18:45:000+02:00" />
                  - generic [ref=e362]: </event>
                  - generic [ref=e364]: </trace>
                  - generic [ref=e366]: "<!-- Weird Trace: -->"
                  - generic [ref=e368]: <trace>
                  - generic [ref=e370]: <string key="concept:name" value="Really weird trace" />
                  - generic [ref=e372]: <event>
                  - generic [ref=e374]: <string key="testid" value="Second" />
          - generic [ref=e376]:
            - tablist [ref=e379]:
              - tab "JSON" [ref=e380]:
                - generic [ref=e381]: JSON
            - generic [ref=e383]: select an algorithm → load a log → run (⌘↵)
  - generic:
    - img
  - generic [ref=e384]:
    - button "Toggle Nuxt DevTools" [ref=e385] [cursor=pointer]:
      - img [ref=e386]
    - generic "Page load time" [ref=e389]:
      - generic [ref=e390]: "208"
      - generic [ref=e391]: ms
    - button "Toggle Component Inspector" [ref=e393] [cursor=pointer]:
      - img [ref=e394]
  - region "Notifications (F8)":
    - list
  - generic [ref=e398]:
    - alert
    - alert
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
  77 |     await expect(page.getByText(/drop file to load/i)).toBeVisible({ timeout: 10000 })
  78 |   })
  79 | 
  80 |   test('algorithm sidebar filter narrows list', async ({ page }) => {
  81 |     await page.goto('/play')
  82 |     const searchInput = page.getByPlaceholder(/Filter algorithms/i)
> 83 |     await searchInput.fill('inductive')
     |                       ^ Error: locator.fill: Test timeout of 30000ms exceeded.
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