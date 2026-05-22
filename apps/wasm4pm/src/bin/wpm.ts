#!/usr/bin/env node

import { runMain } from 'citty';
import { main } from '../cli.js';
import { initOtel } from '../otel/init.js';
import { shutdownOtel, exitWithFlush } from '../otel/exit.js';
import { Wasm4pmError } from '../errors.js';
import { EXIT_CODES } from '../exit-codes.js';

// Drain stdio before any synchronous `process.exit(code)`.
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
  setTimeout(() => { if (!exited) { exited = true; origExit(code0); } }, 50);
  return undefined as never;
}) as typeof process.exit;

async function bootstrap(): Promise<void> {
  if (process.argv.includes('--no-color')) {
    process.env.NO_COLOR = '1';
  }

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
