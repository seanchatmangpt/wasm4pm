import { defineCommand, type CommandDef, type SubCommandsDef } from 'citty';
import { NounVerbError, resolveExitCode, type ErrorCodeMap } from './errors.js';
import { buildToolSchema, tryHandleRegistryIntrospect } from './introspect.js';
import { defaultHumanFormat, writeExperimentalBanner, writeHumanToStderr, writeJson } from './output.js';
import type { NounDefinition, TypedArgSpec, VerbContext, VerbDefinition } from './types.js';

/** Info passed to `onResult` after a verb handler resolves successfully. */
export interface VerbResultInfo {
  readonly noun: string;
  readonly verb: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly result: unknown;
  readonly durationMs: number;
}

/** Info passed to `onError` after a verb handler throws or rejects. */
export interface VerbErrorInfo {
  readonly noun: string;
  readonly verb: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly error: NounVerbError;
  readonly durationMs: number;
}

export interface BuildCliOptions {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /**
   * Host CLI override for the default `ErrorCode` -> exit code mapping
   * (see errors.ts `DEFAULT_ERROR_EXIT_CODES`). Lets a host like wpm
   * plug its own EXIT_CODES contract in without this package knowing
   * about it.
   */
  readonly errorCodeMap?: ErrorCodeMap;
  /** Lifecycle hook fired after a successful verb invocation (e.g. to save a receipt / emit an OTEL span). */
  readonly onResult?: (info: VerbResultInfo) => void | Promise<void>;
  /** Lifecycle hook fired after a failed verb invocation. */
  readonly onError?: (info: VerbErrorInfo) => void | Promise<void>;
  /**
   * Fail-closed exit-code override for the success (non-throwing) path.
   * A verb can resolve normally while still representing a failed
   * *outcome* (e.g. `model check` returning a REJECTED/INDETERMINATE
   * verdict with its own `exitCode: 2|6` field) — citty has no way to
   * see that, so without this hook the process always exits 0 whenever
   * the handler didn't throw. When supplied and it returns a number for
   * a given result, that number is used as `process.exitCode` instead of
   * the hardcoded `0`; returning `undefined` keeps the default.
   */
  readonly resolveResultExitCode?: (result: unknown) => number | undefined;
}

/**
 * Fold a noun/verb registry into a nested citty command tree.
 *
 * The registry (`nouns`) is the single source of truth: this is the
 * only place citty registration is derived from, so `--help`,
 * generated docs, and (later) introspection/completions can never
 * drift from what actually dispatches.
 */
export function buildCli(nouns: readonly NounDefinition[], options: BuildCliOptions): CommandDef {
  const seenNouns = new Set<string>();
  for (const noun of nouns) {
    if (seenNouns.has(noun.name)) {
      throw new Error(`Duplicate noun '${noun.name}' passed to buildCli().`);
    }
    seenNouns.add(noun.name);
  }

  const subCommands: SubCommandsDef = {};
  for (const noun of nouns) {
    subCommands[noun.name] = buildNounCommand(noun, options);
  }

  return defineCommand({
    meta: {
      name: options.name,
      version: options.version,
      description: options.description,
    },
    subCommands,
    // citty calls a command's `run()` after subcommand dispatch too (not
    // instead of it), so this only ever does something when no noun token
    // was present in argv — i.e. a bare `wpm --introspect`. Any other
    // invocation is a no-op here; the matching noun/verb command already
    // handled (or is handling) everything.
    run({ rawArgs }) {
      tryHandleRegistryIntrospect(rawArgs, nouns);
    },
  });
}

function buildNounCommand(noun: NounDefinition, options: BuildCliOptions): CommandDef {
  const subCommands: SubCommandsDef = {};
  for (const verb of noun.verbs) {
    subCommands[verb.verb] = buildVerbCommand(noun, verb, options);
  }

  return defineCommand({
    meta: {
      name: noun.name,
      description: noun.description ?? `${noun.name} commands`,
    },
    subCommands,
  });
}

/**
 * citty's own `parseArgs()` throws (before `run()` ever gets control) for
 * a missing required positional/string arg. That would make
 * `wpm <noun> <verb> --introspect` fail on any verb with required args —
 * exactly backwards, since introspection exists so a caller can discover
 * those args without already knowing them. So requiredness is enforced
 * by the framework's own validation inside handlers (see the specimen's
 * `parseOperand`), not by citty — this strips `required` from the
 * *citty-registered* copy only. `buildToolSchema()` still reads
 * requiredness from `verb.args` (the pristine, unmodified spec), so
 * `--introspect`'s reported schema is unaffected.
 */
function relaxRequired(args: TypedArgSpec): TypedArgSpec {
  const relaxed: Record<string, TypedArgSpec[string]> = {};
  for (const [name, argDef] of Object.entries(args)) {
    relaxed[name] = { ...argDef, required: false };
  }
  return relaxed;
}

function buildVerbCommand(
  noun: NounDefinition,
  verb: VerbDefinition<any, any>,
  options: BuildCliOptions
): CommandDef {
  // Typed explicitly as `TypedArgSpec` (rather than left to inference) so
  // `defineCommand()` below resolves its generic to the plain `ArgsDef`
  // shape — spreading `relaxRequired()`'s `Record`-typed return into an
  // object literal would otherwise make TS infer only the two named
  // (`human`/`introspect`) keys, dropping the verb's own arg keys from
  // the inferred type entirely.
  const args: TypedArgSpec = {
    ...relaxRequired(verb.args ?? {}),
    human: {
      type: 'boolean',
      description: 'Additionally render a human-readable view to stderr (stdout stays JSON).',
      default: false,
    },
    introspect: {
      type: 'boolean',
      description: 'Print this verb\'s Anthropic/OpenAI tool-schema JSON instead of running it.',
      default: false,
    },
  };

  return defineCommand({
    meta: {
      name: verb.verb,
      description:
        verb.stability === 'experimental' ? `[experimental] ${verb.summary}` : verb.summary,
    },
    args,
    async run({ args, rawArgs }) {
      const { human, introspect, ...verbArgs } = args as Record<string, unknown> & {
        human?: boolean;
        introspect?: boolean;
      };

      if (introspect) {
        writeJson(buildToolSchema(noun.name, verb));
        process.exitCode = 0;
        return;
      }

      const ctx: VerbContext = {
        noun: noun.name,
        verb: verb.verb,
        cwd: process.cwd(),
        env: process.env,
        rawArgs,
      };

      if (verb.stability === 'experimental') {
        writeExperimentalBanner(ctx);
      }

      const start = performance.now();
      try {
        const result = await verb.handler(verbArgs as never, ctx);
        const durationMs = performance.now() - start;

        await options.onResult?.({ noun: noun.name, verb: verb.verb, args: verbArgs, result, durationMs });

        writeJson(result);
        if (human) {
          const rendered = verb.human ? verb.human(result, ctx) : defaultHumanFormat(result);
          writeHumanToStderr(rendered);
        }
        const resolvedExitCode = options.resolveResultExitCode?.(result);
        process.exitCode = typeof resolvedExitCode === 'number' ? resolvedExitCode : 0;
      } catch (thrown) {
        const durationMs = performance.now() - start;
        const error = NounVerbError.from(thrown);

        await options.onError?.({ noun: noun.name, verb: verb.verb, args: verbArgs, error, durationMs });

        writeJson(error.toEnvelope());
        if (human) {
          writeHumanToStderr(`Error [${error.code}]: ${error.message}`);
        }
        process.exitCode = resolveExitCode(error.code, options.errorCodeMap);
      }
    },
  });
}
