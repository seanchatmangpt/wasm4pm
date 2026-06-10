/**
 * Example: Observability and OTEL Spans
 * 
 * Demonstrates how to track WASM execution with OpenTelemetry-compatible spans.
 */
import assert from 'node:assert/strict';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runObservabilityExample(): Promise<void> {
  logger.header('📡', 'Observability and OTEL', 'Distributed tracing for process mining cycles');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Starting Instrumented Span');
  // @ts-ignore - simulate OTEL instrumentation
  const sink = (span: any) => {
    logger.data('Captured OTEL Span', span, 15);
  };

  const startedAt = Date.now() * 1_000_000;
  
  logger.step(2, 2, 'Executing Log Load via Instrumented Path');
  // Simulate an instrumented call
  const logXes = '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>';
  const logHandle = core.load_eventlog_from_xes(logXes);
  assert.ok(logHandle, 'Log load failed');

  const endedAt = Date.now() * 1_000_000;
  
  sink({
    name: 'core.load_eventlog_from_xes',
    kind: 'INTERNAL',
    start_time: startedAt,
    end_time: endedAt,
    status: { code: 'OK' },
    attributes: {
      'service.name': 'wasm4pm',
      'core.handle': logHandle,
      'xes.length': logXes.length
    }
  });

  logger.success('Observability data captured successfully.');
}

runObservabilityExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
