/**
 * `runCli()` — the single recommended entry point for a host CLI (e.g.
 * wpm's bin). It layers the argv-level features that citty's own
 * `runCommand`/`runMain` cannot express on top of `buildCli()`'s command
 * tree:
 *
 *   1. Whole-registry `--introspect` (`wpm --introspect`, no noun given).
 *   2. `@-`/`@-::path` stdin extraction — resolved once, before anything
 *      else parses argv, so it applies uniformly whether or not `++`
 *      chaining is also in play.
 *   3. `++` chaining, which bypasses the citty tree entirely (there is no
 *      single argv shape left for citty to dispatch once it's been split
 *      into independent steps).
 *   4. Otherwise, normal single-verb dispatch through the citty tree
 *      built by `buildCli()` (which itself still handles per-verb
 *      `--introspect` and `--human`).
 *
 * A host that only needs plain dispatch (no chaining/stdin/whole-registry
 * introspect) can skip this and drive `buildCli()`'s `CommandDef` through
 * citty's `runMain`/`runCommand` directly.
 */

import { runCommand } from 'citty';
import { buildCli, type BuildCliOptions } from './cli.js';
import { runChain } from './chain.js';
import { NounVerbError, resolveExitCode } from './errors.js';
import { tryHandleRegistryIntrospect } from './introspect.js';
import { writeJson } from './output.js';
import { readProcessStdin, resolveStdinRefs } from './stdin.js';
import type { NounDefinition } from './types.js';

/** Injectable I/O for `runCli()`. Real usage needs none of this — it exists for tests. */
export interface RunCliIo {
  /** Overrides the stdin reader used for `@-`/`@-::path` resolution. Defaults to reading real `process.stdin`. */
  readonly readStdin?: () => Promise<string>;
}

export async function runCli(
  nouns: readonly NounDefinition[],
  options: BuildCliOptions,
  rawArgs: readonly string[] = process.argv.slice(2),
  io: RunCliIo = {}
): Promise<void> {
  if (tryHandleRegistryIntrospect(rawArgs, nouns)) {
    return;
  }

  let resolvedArgs: string[];
  try {
    resolvedArgs = await resolveStdinRefs(rawArgs, io.readStdin ?? readProcessStdin);
  } catch (thrown) {
    const error = NounVerbError.from(thrown);
    writeJson(error.toEnvelope());
    process.exitCode = resolveExitCode(error.code, options.errorCodeMap);
    return;
  }

  if (resolvedArgs.includes('++')) {
    await runChain(nouns, options, resolvedArgs);
    return;
  }

  const cli = buildCli(nouns, options);
  await runCommand(cli, { rawArgs: resolvedArgs });
}
