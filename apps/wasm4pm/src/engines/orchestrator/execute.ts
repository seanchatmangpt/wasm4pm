/**
 * Orchestrator executor — runs an `OrchestratorPlan` in topological order,
 * dispatching each step through a host-supplied `StepDispatcher` (the wpm
 * noun/verb registry itself — see `nouns/pipeline/run.ts`), with a per-step
 * OTEL span and a BLAKE3 receipt chained to the previous step's output hash
 * (Absolute Rule 6/7: every op gets a receipt + span).
 *
 * Chaining: step N's receipt `input_hash` IS step N-1's receipt
 * `output_hash` (the first step's input is a fixed genesis hash). Each
 * step's receipt is persisted via `saveCommandReceipt` to
 * `.wasm4pm/receipts/<run_id>.json` (plus the rolling `latest.json`), so the
 * chain is inspectable on disk after a run, not just in the in-memory
 * `ExecutionReport`.
 */
import { blake3Hex, newReceipt, saveCommandReceipt, type CommandReceipt } from '../../receipts/_shared.js';
import { withSpanRaw } from '../../commands/_otel.js';
import { topoSort } from './plan.js';
import type { ExecutionReport, OrchestratorPlan, OrchestratorStep, StepDispatcher, StepResult } from './types.js';

const GENESIS_HASH = blake3Hex('wpm.pipeline.genesis');

/** `@{stepId.dot.path}` — the orchestrator's own step-output reference syntax
 * (parallel to `packages/noun-verb/src/chain.ts`'s `@{n.path}` chain refs,
 * but keyed by step id rather than 1-based position, since orchestrator
 * steps form a DAG rather than a linear `++` chain). Kept local — `engines/`
 * must not depend on `packages/noun-verb`. */
const STEP_REF_PATTERN = /^@\{([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.]+)\}$/;

/** Resolve a single `@{stepId.path}` token against already-completed step results. */
function resolveStepRef(token: string, doneResults: readonly StepResult[]): unknown {
  const match = STEP_REF_PATTERN.exec(token);
  if (!match) {
    return token;
  }
  const [, stepId, path] = match;
  const source = doneResults.find((r) => r.stepId === stepId);
  if (!source) {
    throw new Error(`Step reference '${token}' points to step '${stepId}', which has not completed (or does not exist).`);
  }
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, source.result);
  if (value === undefined) {
    throw new Error(`Step reference '${token}' — path '${path}' not found in step '${stepId}'s result.`);
  }
  return value;
}

/** Substitute `@{stepId.path}` references in top-level string args against completed step results. */
function substituteArgs(args: Readonly<Record<string, unknown>>, doneResults: readonly StepResult[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = typeof value === 'string' ? resolveStepRef(value, doneResults) : value;
  }
  return out;
}

/** Persist one step's chained receipt. Best-effort: never fail a step over a receipt write. */
function saveStepReceipt(
  plan: OrchestratorPlan,
  step: OrchestratorStep,
  inputHash: string,
  outputHash: string,
  status: CommandReceipt['status'],
  durationMs: number,
  errorMessage?: string
): void {
  try {
    saveCommandReceipt({
      ...newReceipt(`pipeline.step.${step.noun}.${step.verb}`),
      input_hash: inputHash,
      output_hash: outputHash,
      status,
      summary: {
        planId: plan.planId,
        stepId: step.id,
        durationMs,
        ...(errorMessage ? { error: errorMessage } : {}),
      },
    });
  } catch {
    /* receipts are best-effort — never fail a pipeline step over one */
  }
}

export async function executePlan(plan: OrchestratorPlan, dispatch: StepDispatcher): Promise<ExecutionReport> {
  const ordered = topoSort(plan.steps);
  const results: StepResult[] = [];
  let previousHash = GENESIS_HASH;
  let sawError = false;

  for (const s of ordered) {
    const start = performance.now();
    // This step's receipt `input_hash` chains to the previous step's
    // `output_hash` (or the genesis hash for the first step).
    const inputHash = previousHash;
    try {
      const resolvedArgs = substituteArgs(s.args, results);
      const result = await withSpanRaw(
        `pipeline.step.${s.noun}.${s.verb}`,
        { 'pipeline.plan_id': plan.planId, 'pipeline.step_id': s.id },
        () => dispatch(s.noun, s.verb, resolvedArgs)
      );
      const durationMs = performance.now() - start;
      const outputHash = blake3Hex(`${inputHash}:${JSON.stringify(result)}`);
      previousHash = outputHash;
      results.push({ stepId: s.id, noun: s.noun, verb: s.verb, status: 'ok', durationMs, result, outputHash });
      saveStepReceipt(plan, s, inputHash, outputHash, 'success', durationMs);
    } catch (err) {
      sawError = true;
      const durationMs = performance.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      const outputHash = blake3Hex(`${inputHash}:ERROR:${message}`);
      previousHash = outputHash;
      results.push({ stepId: s.id, noun: s.noun, verb: s.verb, status: 'error', durationMs, error: message, outputHash });
      saveStepReceipt(plan, s, inputHash, outputHash, 'failed', durationMs, message);
      // Fail-fast: a later step may depend on this one's output.
      break;
    }
  }

  const allRan = results.length === ordered.length;
  const status: ExecutionReport['status'] = !sawError && allRan ? 'ok' : results.some((r) => r.status === 'ok') ? 'partial' : 'failed';

  return { planId: plan.planId, status, steps: results, chainHash: previousHash };
}
