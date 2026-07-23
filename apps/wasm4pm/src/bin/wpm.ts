#!/usr/bin/env node

import { runMain } from 'citty';
import { needsStdin, runCli } from '@wasm4pm/noun-verb';
import { ALL_NOUNS, cliOptions, main } from '../cli.js';
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
  setTimeout(() => { if (!exited) { exited = true; origExit(code0); } }, 50);
  return undefined as never;
}) as typeof process.exit;

async function bootstrap(): Promise<void> {
  if (process.argv.includes('--no-color')) {
    process.env.NO_COLOR = '1';
  }

  // Hard break: retired wpm v1 invocations exit 1 with a replacement hint
  // BEFORE any WASM/OTEL/dispatch machinery spins up — see nouns/_removed.ts.
  // Never shown in --help or generated docs.
  const removedExitCode = checkRemoved(process.argv.slice(2));
  if (removedExitCode !== undefined) {
    process.exit(removedExitCode);
    return;
  }

  const argv = process.argv.slice(2);

  await initOtel();
  try {
    // `++` chaining and `@-`/`@-::path` stdin extraction are argv-level
    // features citty's own dispatch (runMain/runCommand) has no way to
    // express — see @wasm4pm/noun-verb's entry.ts. Route ONLY invocations
    // that actually need them through runCli(); every other invocation
    // (the overwhelming majority) keeps citty's own runMain(), so --help,
    // --version, and CLIError-to-usage formatting are completely
    // unaffected by this change. Both paths share the same ALL_NOUNS
    // registry and cliOptions (receipt/OTEL middleware, errorCodeMap,
    // resolveResultExitCode) from cli.ts, so neither can drift from the
    // other.
    if (argv.includes('++') || needsStdin(argv)) {
      await runCli(ALL_NOUNS, cliOptions, argv);
    } else {
      await runMain(main);
    }
  } finally {
    await shutdownOtel();
  }
}

bootstrap().catch(async (error) => {
  console.error('Fatal error:', error);
  await shutdownOtel();
  process.exit(5);
});
