/**
 * wpm pipeline run — executes an `OrchestratorPlan` (built the same way
 * `pipeline plan` builds one: from a built-in preset, a custom plan file,
 * or `--auto`) via `engines/orchestrator/execute.ts`. This replaces the
 * previous bridge to the legacy `commands/pipeline.ts` preset executor
 * (which spawned a child `wpm` process per step and had no receipt chain);
 * `run` now shares its plan-building logic 1:1 with `plan` and dispatches
 * every step straight through the live noun/verb registry, in-process.
 *
 * Also absorbs the retired `wpm analyze`/`wpm batch` (both were thin
 * variations over running a preset across one or many logs).
 */
import { defineVerb, NounVerbError, type NounDefinition, type VerbContext } from '@wasm4pm/noun-verb';
import { buildPlan } from '../../engines/orchestrator/plan.js';
import { executePlan } from '../../engines/orchestrator/execute.js';
import type { ExecutionReport, StepDispatcher } from '../../engines/orchestrator/types.js';
import { EXIT_CODES } from '../../exit-codes.js';

/**
 * Synthesize argv-style tokens from a step's plain `args` object.
 *
 * Most verbs read their typed `args` object directly and never look at
 * `ctx.rawArgs` — for those, this is unused. But a large fraction of the
 * current registry (`log validate`, `model explain`, `pipeline suggest`, ...)
 * is a thin bridge over a legacy citty `CommandDef` (`nouns/_bridge.ts`)
 * whose handler ignores its parsed `args` entirely and re-parses
 * `ctx.rawArgs` against the *legacy* command's own arg schema instead. Those
 * verbs would silently see an empty argv (and fail with "input required")
 * if the orchestrator only forwarded the typed `args` object. `input` is
 * emitted as a bare leading positional (every step-driving verb's own
 * schema — native or legacy-bridged — treats its log-path arg as
 * positional #1), everything else as a `--key value` / `--key` flag.
 */
function argsToArgv(args: Readonly<Record<string, unknown>>): string[] {
  const argv: string[] = [];
  if (args.input !== undefined && args.input !== null) {
    argv.push(String(args.input));
  }
  for (const [key, value] of Object.entries(args)) {
    if (key === 'input' || value === undefined || value === null) continue;
    if (value === true) {
      argv.push(`--${key}`);
    } else if (value !== false) {
      argv.push(`--${key}`, String(value));
    }
  }
  return argv;
}

/**
 * Resolve a step's `noun verb` against the live registry and invoke its
 * handler directly (in-process — no argv/citty round-trip for native verbs;
 * a synthesized `ctx.rawArgs` for legacy-bridged ones — see `argsToArgv`).
 *
 * `ALL_NOUNS` is imported dynamically (not at module top level) to avoid a
 * circular import: `cli.ts` builds `ALL_NOUNS` from `pipelineNoun`, which is
 * assembled from this very file. By the time this handler actually runs,
 * the whole module graph (including `cli.ts`) has already finished loading,
 * so the dynamic import resolves the fully-populated registry safely.
 */
function makeRegistryDispatcher(): StepDispatcher {
  return async (nounName, verbName, args) => {
    const { ALL_NOUNS } = (await import('../../cli.js')) as unknown as { ALL_NOUNS: readonly NounDefinition[] };
    const noun = ALL_NOUNS.find((n) => n.name === nounName);
    if (!noun) {
      throw NounVerbError.commandNotFound(
        nounName,
        ALL_NOUNS.map((n) => n.name)
      );
    }
    const verb = noun.verbs.find((v) => v.verb === verbName);
    if (!verb) {
      throw NounVerbError.verbNotFound(
        nounName,
        verbName,
        noun.verbs.map((v) => v.verb)
      );
    }
    const ctx: VerbContext = {
      noun: noun.name,
      verb: verb.verb,
      cwd: process.cwd(),
      env: process.env,
      rawArgs: argsToArgv(args),
    };
    return verb.handler(args as never, ctx);
  };
}

export const runVerb = defineVerb({
  noun: 'pipeline',
  verb: 'run',
  summary:
    'Build and execute a step plan from a preset, a plan file, or --auto, chaining a BLAKE3 receipt ' +
    'per step (was: wpm pipeline run, wpm analyze, wpm batch)',
  args: {
    preset: { type: 'string', description: 'Built-in preset: full | quick | compliance' },
    'plan-file': { type: 'string', description: 'Path to a custom plan JSON file ({steps: [{noun,verb,args,dependsOn}]})' },
    auto: { type: 'boolean', description: 'Auto-build a quick validate -> discover plan for --input' },
    input: { type: 'string', description: 'Input log path (required for --preset/--auto)', alias: 'i' },
  } as const,
  handler: async (args) => {
    const plan = await buildPlan({
      preset: args.preset as string | undefined,
      planFile: args['plan-file'] as string | undefined,
      auto: Boolean(args.auto),
      input: args.input as string | undefined,
    });
    const report = await executePlan(plan, makeRegistryDispatcher());
    // Fail-closed exit code (Absolute Rule / item 2's `resolveResultExitCode`
    // convention): `executePlan()` never throws for a step-level failure (a
    // later step may still depend on an earlier step's output), so without
    // this the CLI would report `$?=0` for a plan that partially or fully
    // failed. `cli.ts`'s `resolveResultExitCode` reads this `exitCode` field.
    const exitCode =
      report.status === 'ok' ? undefined : report.status === 'partial' ? EXIT_CODES.partial_failure : EXIT_CODES.execution_error;
    return exitCode === undefined ? report : ({ ...report, exitCode } satisfies ExecutionReport & { exitCode: number });
  },
});
