//! Exit-with-flush helper for the wpm CLI.
//!
//! Many command handlers call `process.exit(code)` directly to surface a
//! specific exit code. Without coordination, that bypasses the OTEL flush
//! installed in `bin/wpm.ts`'s `finally` block — spans queued during the
//! command never reach the exporter.
//!
//! This module owns the process-global OTEL handle and exposes
//! `exitWithFlush(code)`, which awaits a bounded shutdown before exiting.

import type { OtelHandle } from './init.js';

let currentHandle: OtelHandle | undefined;

export function setOtelHandle(h: OtelHandle): void {
  currentHandle = h;
}

export function clearOtelHandle(): void {
  currentHandle = undefined;
}

export async function shutdownOtel(): Promise<void> {
  if (!currentHandle) return;
  const h = currentHandle;
  currentHandle = undefined; // idempotent
  try {
    await Promise.race([
      h.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {
    /* never block exit on telemetry */
  }
}

export async function exitWithFlush(code: number): Promise<never> {
  await shutdownOtel();
  process.exit(code);
  // unreachable
  throw new Error('unreachable: process.exit returned');
}
