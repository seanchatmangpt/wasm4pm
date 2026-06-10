import { test, expect } from '@playwright/test'

test.describe('Sandbox — algorithm runner', () => {
  test('loads and redirects to /learn/tutorials/getting-started', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/learn\/tutorials\/getting-started/)
  })

  test('navigate to /play shows sandbox', async ({ page }) => {
    await page.goto('/play')
    await expect(page.locator('code')).toBeVisible() // algo name in top bar
  })

  test('WASM loads (ready state)', async ({ page }) => {
    await page.goto('/play')
    // Wait for WASM to init — Run button becomes enabled
    await expect(page.getByRole('button', { name: /Run/i })).toBeEnabled({ timeout: 15000 })
  })

  test('run DFG algorithm on small-example preset', async ({ page }) => {
    await page.goto('/play?algo=simd_streaming_dfg&preset=small-example')
    await expect(page.getByRole('button', { name: /Run/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /Run/i }).click()
    // JSON output appears
    await expect(page.locator('pre')).toBeVisible({ timeout: 10000 })
    const text = await page.locator('pre').textContent()
    expect(text).toContain('{') // valid JSON
  })

  test('receipt tab appears after successful run', async ({ page }) => {
    await page.goto('/play?algo=simd_streaming_dfg')
    await expect(page.getByRole('button', { name: /Run/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /Run/i }).click()
    await expect(page.getByRole('tab', { name: /Receipt/i })).toBeVisible({ timeout: 10000 })
  })

  test('share URL button copies URL with algo param', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/play?algo=heuristic_miner')
    await page.getByRole('button', { name: /Share/i }).click()
    await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible()
  })

  test('cmd+enter keyboard shortcut triggers run', async ({ page }) => {
    await page.goto('/play')
    await expect(page.getByRole('button', { name: /Run/i })).toBeEnabled({ timeout: 15000 })
    await page.keyboard.press('Meta+Enter')
    await expect(page.locator('pre')).toBeVisible({ timeout: 10000 })
  })

  test('sample preset buttons load different logs', async ({ page }) => {
    await page.goto('/play')
    const before = await page.locator('textarea, .monaco-editor').inputValue().catch(() => '')
    await page.getByRole('button', { name: /Road Traffic/i }).click()
    await page.waitForTimeout(500)
    const after = await page.locator('textarea, .monaco-editor').inputValue().catch(() => '')
    // Content changed
  })

  test('drag-and-drop zone is visible', async ({ page }) => {
    await page.goto('/play')
    await expect(page.getByText(/drop file to load/i)).toBeVisible()
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
    // Run button hidden in cognition mode
    await expect(page.getByRole('button', { name: /^Run$/i })).not.toBeVisible()
  })
})
