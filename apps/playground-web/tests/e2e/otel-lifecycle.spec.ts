import { test, expect } from '@playwright/test'
import { createOtelCollector } from './utils/otel-collector.js'

test.describe('OTEL + WASM lifecycle', () => {
  test('wasm.init span has service_name, status=ok, duration_ms', async ({ page }) => {
    const otel = createOtelCollector(page)
    await page.goto('/play')
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 20000 })

    const span = otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
    expect(typeof span.duration_ms).toBe('number')
    expect(span.duration_ms).toBeGreaterThan(0)
  })

  test('wasm.run span emitted after algorithm run with algorithm and status', async ({ page }) => {
    const otel = createOtelCollector(page)
    await page.goto('/play?algo=dfg&preset=small-example')
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /Run ⌘/i }).click()
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })

    const span = otel.assertSpan('wasm.run', { service_name: 'playground-web', status: 'ok', algorithm: 'dfg' })
    expect(typeof span.duration_ms).toBe('number')
    expect(span.duration_ms).toBeGreaterThanOrEqual(0)
    otel.assertAllWellFormed()
  })

  test('all spans in a full session are well-formed', async ({ page }) => {
    const otel = createOtelCollector(page)
    await page.goto('/play?algo=dfg&preset=small-example')
    await expect(page.getByRole('button', { name: /Run ⌘/i })).toBeEnabled({ timeout: 20000 })
    await page.getByRole('button', { name: /Run ⌘/i }).click()
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
    // Run a second algorithm to accumulate more spans
    await page.getByRole('button', { name: /Alpha Miner/i }).click()
    await page.getByRole('button', { name: /Run ⌘/i }).click()
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })

    // All spans — init + both runs — must have service_name, event, status, duration_ms
    otel.assertAllWellFormed()
    otel.assertAllHaveServiceName('playground-web')
  })

  test('/api/otel-event endpoint accepts span and returns ok', async ({ request }) => {
    const res = await request.post('/api/otel-event', {
      data: {
        service_name: 'playground-web',
        event: 'wasm.init',
        status: 'ok',
        duration_ms: 42,
      },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('Petri net page loads Vue Flow canvas after run', async ({ page }) => {
    const otel = createOtelCollector(page)
    await page.goto('/play/petri-net')
    await expect(page.getByRole('button', { name: /^Run/i })).toBeEnabled({ timeout: 15000 })
    await page.getByRole('button', { name: /^Run/i }).click()
    await expect(page.locator('.vue-flow__container, .vue-flow').first()).toBeVisible({ timeout: 10000 })
    // Petri net page must also emit OTEL spans
    otel.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
  })
})
