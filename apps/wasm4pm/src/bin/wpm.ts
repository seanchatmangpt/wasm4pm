#!/usr/bin/env node

import { runMain } from 'citty';
import { main } from '../cli.js';
import { initOtel } from '../otel/init.js';
import { shutdownOtel } from '../otel/exit.js';

// Drain stdio before any synchronous `process.exit(code)`. citty's runMain
// calls `process.exit(0)` immediately after writing --help to stdout (and a
// few other internal paths). Under `child_process.execFile` pipe capture
// (vitest's `runCli`), the child terminates before the parent finishes
// reading, and the test sees empty stdout. Wrapping process.exit to wait
// for both streams to flush their callback queues fixes those tests
// without affecting normal terminal use.
const origExit = process.exit.bind(process);
process.exit = ((code?: number): never => {
  const code0 = code ?? 0;
  let pending = 2;
  let exited = false;
  const done = (): void => {
    if (--pending === 0 && !exited) {
      exited = true;
      origExit(code0);
    }
  };
  try { process.stdout.write('', done); } catch { done(); }
  try { process.stderr.write('', done); } catch { done(); }
  // Safety net in case a stream callback never fires.
  setTimeout(() => { if (!exited) { exited = true; origExit(code0); } }, 50).unref();
  // Returning here lets the sync caller of process.exit unwind (e.g.
  // citty's runMain returns, our bootstrap's finally runs shutdownOtel,
  // and the event loop ticks to flush the write callbacks → real exit).
  // We have to lie to TypeScript: the contract is `never`, but in practice
  // the process *is* about to die — just via the queued origExit.
  return undefined as never;
}) as typeof process.exit;

/**
 * wasm4pm (wpm) CLI entry point
 * Parses command-line arguments and routes to appropriate command handler.
 * Bootstraps OTEL once at process start; flushes on exit.
 *
 * Note: command handlers commonly call `exitWithFlush(code)` (from
 * `../otel/exit.js`), which performs the same bounded flush before exiting,
 * so spans are not lost when handlers bypass this `finally`.
 */
async function bootstrap(): Promise<void> {
  await initOtel();
  try {
    await runMain(main);
  } finally {
    await shutdownOtel();
  }
}

bootstrap().catch(async (error) => {
  console.error('Fatal error:', error);
  await shutdownOtel();
  process.exit(5);
});
