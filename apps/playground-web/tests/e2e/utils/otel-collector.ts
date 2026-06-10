/**
 * OTEL span collector for Playwright e2e tests.
 *
 * Intercepts all POST requests to /api/otel-event and accumulates span bodies.
 * Every span must have service_name, event, status, and duration_ms.
 *
 * Usage:
 *   const collector = createOtelCollector(page)
 *   await page.goto('/play')
 *   ...
 *   collector.assertSpan('wasm.init', { service_name: 'playground-web', status: 'ok' })
 *   collector.assertAllHaveServiceName('playground-web')
 */

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface OtelSpan {
  service_name: string
  event: string
  status: 'ok' | 'error'
  duration_ms: number
  algorithm?: string
  error?: string
  [key: string]: unknown
}

export function createOtelCollector(page: Page) {
  const spans: OtelSpan[] = []

  // Register route interception immediately — must be called before page.goto()
  page.route('**/api/otel-event', async (route) => {
    try {
      const body = route.request().postDataJSON() as OtelSpan
      spans.push(body)
    } catch {
      // ignore parse errors
    }
    await route.continue()
  })

  return {
    /** All collected spans so far. */
    get all() { return spans },

    /** Assert that at least one span matches event name and optional field subset. */
    assertSpan(eventName: string, fields: Partial<OtelSpan> = {}) {
      const match = spans.find(s => s.event === eventName)
      expect(match, `Expected span with event="${eventName}" — got: ${JSON.stringify(spans.map(s => s.event))}`).toBeTruthy()
      for (const [key, val] of Object.entries(fields)) {
        expect(match![key], `span.${key}`).toBe(val)
      }
      return match!
    },

    /** Assert that every collected span has the required OTEL fields. */
    assertAllWellFormed() {
      expect(spans.length, 'At least one span must be emitted').toBeGreaterThan(0)
      for (const span of spans) {
        expect(span.service_name, 'span.service_name required').toBeTruthy()
        expect(span.event, 'span.event required').toBeTruthy()
        expect(['ok', 'error'], 'span.status must be ok|error').toContain(span.status)
        expect(typeof span.duration_ms, 'span.duration_ms must be a number').toBe('number')
      }
    },

    /** Assert that every span has a specific service_name. */
    assertAllHaveServiceName(name: string) {
      for (const span of spans) {
        expect(span.service_name, `All spans must have service_name="${name}"`).toBe(name)
      }
    }
  }
}
