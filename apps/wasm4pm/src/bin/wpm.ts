#!/usr/bin/env node

import { runMain } from 'citty';
import { main } from '../cli.js';
import { initOtel } from '../otel/init.js';
import { shutdownOtel } from '../otel/exit.js';

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
  // Support --no-color flag by setting NO_COLOR env var (honored by consola and most CLI tools)
  // Check raw argv to avoid depending on CLI parser
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
