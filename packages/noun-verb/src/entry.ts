/**
 * `runCli()` — the single recommended entry point for a host CLI.
 *
 * Machine mode intentionally manufactures ordinary argv and then dispatches
 * through the same command tree. It is transport, not an alternate execution
 * authority.
 */

import { runCommand } from 'citty';
import { buildCli, type BuildCliOptions } from './cli.js';
import { runChain } from './chain.js';
import { NounVerbError, resolveExitCode } from './errors.js';
import { tryHandleRegistryIntrospect } from './introspect.js';
import { machineInvocationToArgv } from './machine.js';
import { writeJson } from './output.js';
import { readProcessStdin, resolveStdinRefs } from './stdin.js';
import type { NounDefinition } from './types.js';

export interface RunCliIo {
  /** Overrides stdin for `@-`, `@-::path`, and `--machine`. */
  readonly readStdin?: () => Promise<string>;
}

function writeFrameworkError(error: NounVerbError, options: BuildCliOptions): void {
  writeJson(error.toEnvelope());
  process.exitCode = resolveExitCode(error.code, options.errorCodeMap);
}

export async function runCli(
  nouns: readonly NounDefinition[],
  options: BuildCliOptions,
  rawArgs: readonly string[] = process.argv.slice(2),
  io: RunCliIo = {}
): Promise<void> {
  if (tryHandleRegistryIntrospect(rawArgs, nouns)) return;

  const readStdin = io.readStdin ?? readProcessStdin;
  let resolvedArgs: string[];
  try {
    if (rawArgs.includes('--machine')) {
      if (rawArgs.length !== 1 || rawArgs[0] !== '--machine') {
        throw NounVerbError.invalidInput(
          "MACHINE_INVOCATION_REFUSED: '--machine' must be the only argv token"
        );
      }
      const envelope = await readStdin();
      resolvedArgs = machineInvocationToArgv(envelope, nouns);
    } else {
      resolvedArgs = await resolveStdinRefs(rawArgs, readStdin);
    }
  } catch (thrown) {
    writeFrameworkError(NounVerbError.from(thrown), options);
    return;
  }

  if (resolvedArgs.includes('++')) {
    await runChain(nouns, options, resolvedArgs);
    return;
  }

  const cli = buildCli(nouns, options);
  await runCommand(cli, { rawArgs: resolvedArgs });
}
