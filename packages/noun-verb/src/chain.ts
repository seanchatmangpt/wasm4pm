/**
 * `++` chaining — an argv splitter that runs multiple verb invocations
 * sequentially, in-process, threading each step's JSON result forward
 * into later steps via `@{n.path}` references.
 *
 * `wpm calc square 4 ++ calc add @{1.result} 10` runs `calc square 4`
 * first, then substitutes `@{1.result}` with `.result` from step 1's
 * JSON result before parsing and running `calc add`.
 *
 * Chain steps bypass citty's own command tree/dispatch (there is no
 * single "argv" a normal citty `run()` could sensibly represent once
 * `++` has split it into independent invocations); instead each step's
 * noun/verb is resolved directly against the registry and its args are
 * parsed with citty's own `parseArgs()`, so behavior matches normal
 * dispatch exactly. Steps still go through the same `onResult`/`onError`
 * middleware hooks as a single verb invocation.
 */

import { parseArgs } from 'citty';
import type { BuildCliOptions } from './cli.js';
import { NounVerbError, resolveExitCode } from './errors.js';
import { writeJson } from './output.js';
import { getByPath, stringifyExtractedValue } from './path.js';
import type { NounDefinition, VerbContext } from './types.js';

/**
 * Fail-closed wrapper around `writeJson({ steps, ... })` for the chain
 * report. `steps` accumulates every chained step's full JSON result, so
 * `JSON.stringify` inside `writeJson` can throw (e.g. `RangeError:
 * Invalid string length`) once the combined output is large enough.
 * That throw must never happen outside a try/catch on this path: if it
 * did, it would surface as an unhandled rejection and the process would
 * exit with whatever `process.exitCode` already held — 0 on the success
 * path — silently reporting success for a chain that actually crashed.
 *
 * On a `writeJson` failure this writes a compact fallback envelope
 * (with each step's oversized `result` omitted, never re-serialized)
 * directly via `process.stdout.write`, and sets a nonzero exit code via
 * `resolveExitCode`. If even that fallback write throws, it falls back
 * further to a hardcoded literal JSON string and exit code 5 (the
 * project's `system_error` convention).
 */
function writeChainReportSafely(
  steps: readonly ChainStepResult[],
  extra: Record<string, unknown>,
  options: BuildCliOptions
): void {
  try {
    writeJson({ steps, ...extra });
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    try {
      process.stdout.write(
        `${JSON.stringify({
          error: {
            code: 'output_serialization_failed',
            message,
            action_template: 'Reduce chained step output size or split the chain into fewer steps',
          },
          steps: steps.map((step) => ({ noun: step.noun, verb: step.verb, resultOmitted: true })),
        })}\n`
      );
      process.exitCode = resolveExitCode('INTERNAL_ERROR', options.errorCodeMap);
    } catch {
      process.stdout.write(
        '{"error":{"code":"output_serialization_failed","message":"failed to serialize chain output","action_template":"Reduce chained step output size or split the chain into fewer steps"}}\n'
      );
      process.exitCode = 5;
    }
  }
}

const CHAIN_SEPARATOR = '++';
const CHAIN_REF_PATTERN = /^@\{(\d+)\.(.+)\}$/;

/** Split a flat argv array into per-step argv segments on the literal `++` token. */
export function splitChainSegments(rawArgs: readonly string[]): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];
  for (const token of rawArgs) {
    if (token === CHAIN_SEPARATOR) {
      segments.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  segments.push(current);
  return segments;
}

/**
 * Resolve a single `@{n.path}` token against prior steps' results.
 * Non-matching tokens pass through unchanged. `n` is 1-based and must
 * refer to a step strictly before the current one.
 */
export function resolveChainRef(token: string, priorResults: readonly unknown[]): string {
  const match = CHAIN_REF_PATTERN.exec(token);
  if (!match) {
    return token;
  }
  const stepNumber = Number(match[1]);
  const path = match[2] as string;

  if (stepNumber < 1 || stepNumber > priorResults.length) {
    throw NounVerbError.invalidInput(
      `Chain reference '${token}' points to step ${stepNumber}, but only ${priorResults.length} prior step(s) have run.`
    );
  }

  const value = getByPath(priorResults[stepNumber - 1], path);
  if (value === undefined) {
    throw NounVerbError.invalidInput(`Chain reference '${token}' — path '${path}' not found in step ${stepNumber}'s result.`);
  }
  return stringifyExtractedValue(value);
}

/** One step's outcome in the final `{ steps: [...] }` chain report. */
export interface ChainStepResult {
  readonly noun: string;
  readonly verb: string;
  readonly result: unknown;
}

/**
 * Run every `++`-separated segment of `rawArgs` sequentially against the
 * registry, substituting `@{n.path}` references, and write the combined
 * `{ steps: [...] }` report to stdout exactly once — the chain-level
 * analog of the single-verb JSON-on-stdout contract. Stops at the first
 * failing step; `process.exitCode` reflects that step's error.
 */
export async function runChain(
  nouns: readonly NounDefinition[],
  options: BuildCliOptions,
  rawArgs: readonly string[]
): Promise<void> {
  const segments = splitChainSegments(rawArgs);
  const stepResults: unknown[] = [];
  const steps: ChainStepResult[] = [];

  for (const segment of segments) {
    const [nounName, verbName, ...rest] = segment;

    const noun = nouns.find((candidate) => candidate.name === nounName);
    if (!noun) {
      const error = NounVerbError.commandNotFound(
        nounName ?? '',
        nouns.map((candidate) => candidate.name)
      );
      finishChain(steps, error, options);
      return;
    }

    const verb = noun.verbs.find((candidate) => candidate.verb === verbName);
    if (!verb) {
      const error = NounVerbError.verbNotFound(
        nounName,
        verbName ?? '',
        noun.verbs.map((candidate) => candidate.verb)
      );
      finishChain(steps, error, options);
      return;
    }

    let substituted: string[];
    try {
      substituted = rest.map((token) => resolveChainRef(token, stepResults));
    } catch (thrown) {
      finishChain(steps, NounVerbError.from(thrown), options);
      return;
    }

    const parsedArgs = parseArgs(substituted, verb.args ?? {});
    const ctx: VerbContext = {
      noun: noun.name,
      verb: verb.verb,
      cwd: process.cwd(),
      env: process.env,
      rawArgs: substituted,
    };

    const start = performance.now();
    try {
      const result = await verb.handler(parsedArgs as never, ctx);
      const durationMs = performance.now() - start;
      await options.onResult?.({
        noun: noun.name,
        verb: verb.verb,
        args: parsedArgs as Record<string, unknown>,
        result,
        durationMs,
      });
      stepResults.push(result);
      steps.push({ noun: noun.name, verb: verb.verb, result });

      // A step can resolve normally while still representing a failed
      // *outcome* (e.g. a REJECTED conformance verdict) — same fail-closed
      // concern as the single-verb success path in cli.ts. Abort the chain
      // here too, exactly as a thrown error would, so no subsequent `++`
      // step runs after one that resolved to a nonzero exit code.
      const resolvedExitCode = options.resolveResultExitCode?.(result);
      if (typeof resolvedExitCode === 'number' && resolvedExitCode !== 0) {
        writeChainReportSafely(steps, {}, options);
        // Fail-closed: only overwrite the exit code with the resolved
        // outcome code if the safe write itself didn't already set a
        // nonzero code for a serialization failure.
        if (process.exitCode === 0 || process.exitCode === undefined) {
          process.exitCode = resolvedExitCode;
        }
        return;
      }
    } catch (thrown) {
      const durationMs = performance.now() - start;
      const error = NounVerbError.from(thrown);
      await options.onError?.({
        noun: noun.name,
        verb: verb.verb,
        args: parsedArgs as Record<string, unknown>,
        error,
        durationMs,
      });
      steps.push({ noun: noun.name, verb: verb.verb, result: error.toEnvelope() });
      finishChain(steps, error, options);
      return;
    }
  }

  writeChainReportSafely(steps, {}, options);
  // Fail-closed: don't clobber a nonzero exit code the safe write already
  // set for a serialization failure.
  if (process.exitCode === 0 || process.exitCode === undefined) {
    process.exitCode = 0;
  }
}

function finishChain(steps: readonly ChainStepResult[], error: NounVerbError, options: BuildCliOptions): void {
  writeChainReportSafely(steps, { error: error.toEnvelope().error }, options);
  // Fail-closed: only apply the original error's exit code if the safe
  // write itself didn't already set one for a serialization failure.
  if (process.exitCode === 0 || process.exitCode === undefined) {
    process.exitCode = resolveExitCode(error.code, options.errorCodeMap);
  }
}
