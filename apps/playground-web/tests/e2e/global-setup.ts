/**
 * Playwright globalSetup — starts testcontainer services from un-test-utils.config.js
 * when OTEL_TESTCONTAINERS=1 is set.
 *
 * The globalSetup file is invoked once before all tests; globalTeardown after.
 * Services inject env vars (OTEL_COLLECTOR_URL, WASM4PM_OTEL_ENDPOINT) into process.env
 * so otel-event.post.ts forwards spans to the real Jaeger collector.
 */

let _teardown: (() => Promise<void>) | null = null

export default async function globalSetup() {
  if (!process.env.OTEL_TESTCONTAINERS) return

  const { loadConfig, startServices, stopServices } = await import(
    // @ts-ignore — file: dep resolved at install time
    '@un-test/services'
  )

  const config = await loadConfig(new URL('../..', import.meta.url).pathname)
  if (!config || !Object.keys(config.services).length) return

  const names = Object.keys(config.services).join(', ')
  console.info(`[global-setup] starting services: ${names}`)
  await startServices(config.services)

  _teardown = stopServices
}

export async function globalTeardown() {
  if (_teardown) await _teardown()
}
