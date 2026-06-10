/**
 * un-test-utils service configuration for playground-web.
 *
 * When running Playwright with testcontainers integration, this config
 * auto-starts Jaeger so spans forwarded by otel-event.post.ts can be
 * verified via the Jaeger HTTP API.
 *
 * Usage:
 *   OTEL_TESTCONTAINERS=1 pnpm playwright test
 *
 * The orchestrator will:
 *   1. Pull jaegertracing/all-in-one:1.57
 *   2. Start the container, wait for /api/services to return 200
 *   3. Inject OTEL_COLLECTOR_URL and WASM4PM_OTEL_ENDPOINT into process.env
 *   4. Stop the container after tests finish
 */

export default {
  services: {
    jaeger: {
      type: 'jaeger',
    },
  },
}
