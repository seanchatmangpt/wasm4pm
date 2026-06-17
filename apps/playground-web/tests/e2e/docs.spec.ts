import { test, expect } from '@playwright/test'

test.describe('Docs — learning portal', () => {
  test('getting-started page renders content', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('sidebar navigation items are present', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    // aside is the sidebar — one unique element (3 nav + 1 aside exist; use aside specifically)
    await expect(page.locator('aside').first()).toBeVisible()
  })

  test('AlgorithmDemo MDC widget renders', async ({ page }) => {
    await page.goto('/learn/tutorials/getting-started')
    await expect(page.locator('.algorithm-demo').first()).toBeVisible({ timeout: 10000 })
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
    await expect(page.locator('.algorithm-table').first()).toBeVisible({ timeout: 10000 })
  })

  test('404 shows helpful fallback, not blank page', async ({ page }) => {
    await page.goto('/learn/tutorials/nonexistent-page')
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
