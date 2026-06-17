/**
 * Shared vitest globalSetup for all wasm4pm packages.
 *
 * Add to any package's vitest.config.ts:
 *   globalSetup: ['../../test/un-test-global-setup.ts']
 *   (adjust relative path: apps/* use '../../../test/...')
 *
 * Activation: set OTEL_TESTCONTAINERS=1
 *   OTEL_TESTCONTAINERS=1 pnpm test
 *
 * On activation, starts Jaeger + postgres via testcontainers and injects:
 *   OTEL_COLLECTOR_URL      — Jaeger HTTP API base URL
 *   WASM4PM_OTEL_ENDPOINT   — OTLP HTTP endpoint for span ingestion
 *   JAEGER_URL              — alias for OTEL_COLLECTOR_URL
 *   DATABASE_URL            — postgres connection string
 */

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const ROOT = resolve(fileURLToPath(import.meta.url), '..')

export async function setup(): Promise<void> {
  if (!process.env.OTEL_TESTCONTAINERS) return

  const { loadConfig, startServices } = await import('@un-test/services')
  const config = await loadConfig(ROOT)
  if (!config || !Object.keys(config.services).length) return

  const names = Object.keys(config.services).join(', ')
  console.info(`[un-test/global-setup] starting: ${names}`)
  await startServices(config.services)
}

export async function teardown(): Promise<void> {
  if (!process.env.OTEL_TESTCONTAINERS) return
  const { stopServices } = await import('@un-test/services')
  await stopServices()
  console.info('[un-test/global-setup] services stopped')
}
