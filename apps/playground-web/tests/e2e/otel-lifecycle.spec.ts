import { test, expect } from '@playwright/test'

test.describe('OTEL + WASM lifecycle', () => {
  test('WASM initializes without console errors on /play', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    await page.goto('/play')
    await expect(page.getByRole('button', { name: /Run/i })).toBeEnabled({ timeout: 20000 })
    // No critical errors (wasm-otel client plugin logs info, not error, on success)
    const wasmErrors = errors.filter(e => e.includes('wasm') && e.includes('FAILED'))
    expect(wasmErrors).toHaveLength(0)
  })

  test('wasm-otel client plugin logs init ok', async ({ page }) => {
    const infos: string[] = []
    page.on('console', msg => { if (msg.type() === 'info') infos.push(msg.text()) })
    await page.goto('/play')
    await expect(page.getByRole('button', { name: /Run/i })).toBeEnabled({ timeout: 20000 })
    const otelInfo = infos.find(m => m.includes('[wasm-otel]') && m.includes('ok'))
    expect(otelInfo).toBeTruthy()
  })

  test('/api/otel-event endpoint accepts POST', async ({ request }) => {
    const res = await request.post('/api/otel-event', {
      data: { event: 'test.event', error: 'none', duration_ms: 0 }
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('Petri net page loads Vue Flow canvas after run', async ({ page }) => {
    await page.goto('/play/petri-net')
    // VueFlow renders only after WASM runs and dfgResult is populated — trigger a run
    await expect(page.getByRole('button', { name: /^Run/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /^Run/i }).click()
    // VueFlow mounts after dfgResult is set — class is injected by @vue-flow/core
    await expect(page.locator('.vue-flow__container, .vue-flow').first()).toBeVisible({ timeout: 10000 })
  })
})
