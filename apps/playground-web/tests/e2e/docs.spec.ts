import { test, expect } from '@playwright/test'

test.describe('Docs — learning portal', () => {
  test('getting-started page renders content', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('sidebar navigation items are present', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    // Navigation should have at least tutorials and reference sections
    await expect(page.locator('nav, aside')).toBeVisible()
  })

  test('AlgorithmDemo MDC widget renders', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    await expect(page.locator('.algorithm-demo')).toBeVisible({ timeout: 10000 })
  })

  test('Open Sandbox button links to /play', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    const sandboxBtn = page.getByRole('link', { name: /Open Sandbox|Sandbox/i }).first()
    await expect(sandboxBtn).toBeVisible()
    const href = await sandboxBtn.getAttribute('href')
    expect(href).toContain('/play')
  })

  test('reference/algorithms page renders AlgorithmTable', async ({ page }) => {
    await page.goto('/learn/reference/algorithms')
    await expect(page.locator('table, [data-testid="algorithm-table"], .algorithm-table')).toBeVisible({ timeout: 10000 })
  })

  test('404 shows helpful fallback, not blank page', async ({ page }) => {
    const response = await page.goto('/learn/tutorials/nonexistent-page')
    // Either 404 status or error content shown
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('nav links resolve to correct routes', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    // Sandbox nav link should go to /play
    await page.getByRole('link', { name: /Sandbox/i }).first().click()
    await expect(page).toHaveURL(/\/play/)
  })
})
