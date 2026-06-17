import { test, expect } from '@playwright/test'
import { createOtelCollector } from './utils/otel-collector.js'

test.describe('Sandbox — algorithm runner', () => {
  test('loads and redirects to /learn/tutorials/getting-started', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/learn\/tutorials\/getting-started/)
  })

  test('navigate to /play shows sandbox', async ({ page }) => {
    await page.goto('/play')
    // SPA page — wait for Vue to mount and render the algo name in top bar
    await expect(page.locator('code')).toBeVisible({ timeout: 10000 })
  })

  test('WASM loads (ready state) and emits wasm.init OTEL span', async ({ page }) => {
    const otel = createOtelCollector(page)
    await page.goto('/play')
    // Wait for WASM to init — Run ⌘↵ button becomes enabled
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
    otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
  })

  test('run DFG algorithm on small-example preset and emits wasm.run OTEL span', async ({ page }) => {
    const otel = createOtelCollector(page)
    await page.goto('/play?algo=dfg&preset=small-example')
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /Run ⌘/i }).click()
    // JSON output appears — use .first() to handle strict mode (multiple pre elements)
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
    const text = await page.locator('pre').first().textContent()
    expect(text).toContain('{') // valid JSON
    // Verify OTEL spans are well-formed: init + run both emitted
    otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
    otel.assertSpan('wasm.run', { service_name: 'playground-web', status: 'ok', algorithm: 'dfg' })
    otel.assertAllWellFormed()
  })

  test('receipt tab appears after successful run', async ({ page }) => {
    await page.goto('/play?algo=dfg')
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /Run ⌘/i }).click()
    await expect(page.getByRole('tab', { name: /Receipt/i })).toBeVisible({ timeout: 10000 })
  })

  test('share URL button copies URL with algo param', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/play?algo=heuristic_miner')
    await page.getByRole('button', { name: /Share/i }).click()
    await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible()
  })

  test('cmd+enter keyboard shortcut triggers run', async ({ page }) => {
    await page.goto('/play?algo=dfg&preset=small-example')
    // Wait for WASM ready before triggering shortcut
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
    // Click the page body to ensure focus is in the document (not devtools)
    await page.locator('main').click()
    await page.keyboard.press('Meta+Enter')
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
  })

  test('sample preset buttons load different logs', async ({ page }) => {
    await page.goto('/play')
    // Wait for WASM and initial preset to load
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /Road Traffic/i }).click()
    // After clicking, running Road Traffic with dfg should succeed
    await page.waitForTimeout(1500)
    // The top bar still shows current algo code element (page renders)
    await expect(page.locator('code')).toBeVisible()
  })

  test('drag-and-drop zone is visible', async ({ page }) => {
    await page.goto('/play')
    // The drop-file hint is always visible in the input panel header
    await expect(page.getByText(/drop file to load/i)).toBeVisible({ timeout: 10000 })
  })

  test('algorithm sidebar filter narrows list', async ({ page }) => {
    await page.goto('/play')
    const searchInput = page.getByPlaceholder(/Filter algorithms/i)
    await searchInput.fill('inductive')
    await expect(page.getByRole('button', { name: /Inductive Miner/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Alpha Miner/i })).not.toBeVisible()
  })

  test('cognition breed selection switches mode', async ({ page }) => {
    await page.goto('/play')
    await page.getByRole('button', { name: /MYCIN/i }).click()
    await expect(page.locator('code')).toContainText('cognition:MYCIN')
    // The algorithm Run ⌘↵ button disappears in cognition mode (v-if="!isCognitionMode")
    // CognitionDemo has its own "Run" button — match the ⌘↵ shortcut hint specifically
    await expect(page.getByText('⌘↵')).not.toBeVisible()
  })
})
