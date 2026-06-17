/**
 * otel-cli-spans.test.ts
 *
 * Verifies that the CLI emits spans that reach a real Jaeger collector.
 * Skipped unless OTEL_TESTCONTAINERS=1.
 *
 * Prerequisites:
 *   - A Jaeger all-in-one instance accepting OTLP/HTTP on localhost:4318
 *   - OTEL_TESTCONTAINERS=1 in the environment
 *   - Optional: WASM4PM_OTEL_ENDPOINT to override the default collector URL
 */

import { describe, test } from 'vitest';
import { runCli } from '@wasm4pm/testing';

describe('CLI OTEL spans (OTEL_TESTCONTAINERS)', () => {
  test.skipIf(!process.env.OTEL_TESTCONTAINERS)(
    'wpm algorithms emits spans to Jaeger',
    async () => {
      // @ts-ignore
      const { createJaegerClient, wrapJaegerExpect } = await import('@un-test/otel');
      // Preserve original env so we can restore after the test
      const origEnv = { ...process.env };

      process.env.WASM4PM_OTEL_ENABLED = 'true';
      process.env.WASM4PM_OTEL_ENDPOINT =
        process.env.WASM4PM_OTEL_ENDPOINT ?? 'http://localhost:4318';

      try {
        // Run a simple, fast CLI command that is guaranteed to emit spans
        await runCli(['algorithms', 'list', '--format', 'json']);

        // Allow time for the OTLP exporter inside the CLI subprocess to flush
        await new Promise((r) => setTimeout(r, 1000));

        const jaeger = createJaegerClient();
        const traces = await jaeger.getTraces('wasm4pm', { lookbackMs: 15_000 });

        wrapJaegerExpect(traces).expectMinSpanCount(1).expectAllWellFormed();
      } finally {
        // Restore original environment variables
        Object.assign(process.env, origEnv);
        // Clean up any keys we added that were not present originally
        for (const key of ['WASM4PM_OTEL_ENABLED', 'WASM4PM_OTEL_ENDPOINT']) {
          if (!(key in origEnv)) {
            delete process.env[key];
          }
        }
      }
    },
    30_000,
  );
});
