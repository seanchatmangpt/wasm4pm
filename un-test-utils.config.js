/**
 * un-test-utils service configuration for the wasm4pm monorepo.
 *
 * Consumed by packages/test/un-test-global-setup.ts via @un-test/services loadConfig().
 * Active only when OTEL_TESTCONTAINERS=1 is set — zero cost in normal CI.
 *
 * Services:
 *   jaeger   — OTLP collector + UI; injects OTEL_COLLECTOR_URL + WASM4PM_OTEL_ENDPOINT
 *   postgres — test database for @wasm4pm/supabase; injects DATABASE_URL
 */

export default {
  services: {
    jaeger: {
      type: 'jaeger',
    },
    postgres: {
      type: 'postgres',
      environment: {
        POSTGRES_DB: 'wasm4pm_test',
      },
    },
  },
}
