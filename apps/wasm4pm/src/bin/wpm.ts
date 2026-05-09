#!/usr/bin/env node

import { runMain } from 'citty';
import { main } from '../cli.js';
import { initOtel } from '../otel/init.js';

/**
 * wasm4pm (wpm) CLI entry point
 * Parses command-line arguments and routes to appropriate command handler.
 * Bootstraps OTEL once at process start; flushes on exit.
 */
async function bootstrap(): Promise<void> {
  const otel = await initOtel();
  try {
    await runMain(main);
  } finally {
    await otel.shutdown();
  }
}

bootstrap().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(5);
});
