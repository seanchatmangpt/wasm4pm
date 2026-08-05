#!/usr/bin/env node

import { runMain } from 'citty';
import {
  NounVerbError,
  needsStdin,
  runCli,
  writeJson,
} from '@wasm4pm/noun-verb';
import {
  ALL_NOUNS,
  admitCliInvocation,
  cliOptions,
  hasActiveCliInvocation,
  main,
  recordCliFatal,
} from '../cli.js';
import { initOtel } from '../otel/init.js';
import { shutdownOtel } from '../otel/exit.js';
import { checkRemoved } from '../nouns/_removed.js';

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
  setTimeout(() => {
    if (!exited) {
      exited = true;
      origExit(code0);
    }
  }, 50);
  return undefined as never;
}) as typeof process.exit;

function writeFatalEnvelope(error: NounVerbError): void {
  try {
    writeJson(error.toEnvelope());
  } catch {
    process.stdout.write(
      '{"error":{"code":"INTERNAL_ERROR","message":"CLI_FATAL_OUTPUT_BLOCKED"}}\n'
    );
  }
}

function isReadOnlyInvocation(argv: readonly string[]): boolean {
  if (argv.length === 0) return true;
  return argv.includes('--help') ||
    argv.includes('-h') ||
    argv.includes('--version') ||
    argv.includes('--introspect');
}

async function dispatch(argv: readonly string[]): Promise<void> {
  if (argv.includes('++') || needsStdin(argv)) {
    await runCli(ALL_NOUNS, cliOptions, argv);
  } else {
    await runMain(main);
  }
}

async function bootstrap(): Promise<void> {
  if (process.argv.includes('--no-color')) {
    process.env.NO_COLOR = '1';
  }

  // Retired invocations are refused before WASM, OTEL, or command actuation.
  const removedExitCode = checkRemoved(process.argv.slice(2));
  if (removedExitCode !== undefined) {
    process.exit(removedExitCode);
    return;
  }

  const argv = process.argv.slice(2);

  // Help, version, and introspection are observation-only. They do not enter
  // BRCE and do not initialize exporters.
  if (isReadOnlyInvocation(argv)) {
    await dispatch(argv);
    return;
  }

  // BRCE admission precedes every potentially actuating boundary, including
  // telemetry initialization. Failure here refuses dispatch.
  admitCliInvocation(argv);

  await initOtel();
  try {
    await dispatch(argv);
  } finally {
    await shutdownOtel();
  }
}

bootstrap().catch(async (thrown) => {
  let fatal = NounVerbError.internalError(
    `CLI_FATAL: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    thrown
  );

  if (hasActiveCliInvocation()) {
    try {
      recordCliFatal(fatal);
    } catch (receiptError) {
      fatal = NounVerbError.internalError(
        `RECEIPT_FATAL_OUTCOME_BLOCKED: ${receiptError instanceof Error ? receiptError.message : String(receiptError)}`,
        receiptError
      );
    }
  }

  try { await shutdownOtel(); } catch { /* fatal path remains system_error */ }
  writeFatalEnvelope(fatal);
  process.exit(5);
});
