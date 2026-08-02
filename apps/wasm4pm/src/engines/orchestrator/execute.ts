import * as path from 'node:path';
import { blake3Hex, newReceipt, saveCommandReceipt, type CommandReceipt } from '../../receipts/_shared.js';
import { withSpanRaw } from '../../commands/_otel.js';
import { hashCanonical } from './canonical.js';
import {
  computeStepOutputHash,
  defaultPipelineBundlePath,
  makePipelineBundle,
  pipelineGenesisHash,
  verifyPipelineBundle,
  writePipelineBundle,
} from './bundle.js';
import { assertPlanIdentity, topoSort } from './plan.js';
import type {
  ExecutePlanOptions,
  ExecutionReport,
  OrchestratorPlan,
  OrchestratorStep,
  PipelineBundle,
  StepDispatcher,
  StepResult,
} from './types.js';

const STEP_REF_PATTERN = /^@\{([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.]+)\}$/;

function resolveStepRef(token: string, doneResults: readonly StepResult[]): unknown {
  const match = STEP_REF_PATTERN.exec(token);
  if (!match) return token;
  const [, stepId, fieldPath] = match;
  const source = doneResults.find((result) => result.stepId === stepId && result.status === 'ok');
  if (!source) throw new Error(`Step reference '${token}' points to step '${stepId}', which has not completed successfully.`);
  const value = fieldPath.split('.').reduce<unknown>((accumulator, key) => {
    if (accumulator === null || accumulator === undefined || typeof accumulator !== 'object') return undefined;
    return (accumulator as Record<string, unknown>)[key];
  }, source.result);
  if (value === undefined) throw new Error(`Step reference '${token}' — path '${fieldPath}' not found in step '${stepId}'s result.`);
  return value;
}

function substituteValue(value: unknown, doneResults: readonly StepResult[]): unknown {
  if (typeof value === 'string') return resolveStepRef(value, doneResults);
  if (Array.isArray(value)) return value.map((entry) => substituteValue(entry, doneResults));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, substituteValue(entry, doneResults)]));
  }
  return value;
}

function substituteArgs(args: Readonly<Record<string, unknown>>, doneResults: readonly StepResult[]): Record<string, unknown> {
  return substituteValue(args, doneResults) as Record<string, unknown>;
}

function saveStepReceipt(
  plan: OrchestratorPlan,
  step: OrchestratorStep,
  stepIndex: number,
  kind: 'pending' | 'outcome',
  inputHash: string,
  outputHash: string,
  status: CommandReceipt['status'],
  receiptsDir: string,
  summary: Record<string, unknown>
): string {
  const receipt: CommandReceipt = {
    ...newReceipt(`pipeline.step.${step.noun}.${step.verb}`),
    input_hash: inputHash,
    output_hash: outputHash,
    status,
    summary: {
      schema_version: 'wasm4pm.pipeline-step-receipt.v2',
      receipt_kind: kind,
      planId: plan.planId,
      planHash: plan.planHash,
      stepIndex,
      stepId: step.id,
      ...summary,
    },
  };
  return saveCommandReceipt(receipt, receiptsDir);
}

function successfulPrefix(bundle: PipelineBundle, ordered: readonly OrchestratorStep[]): StepResult[] {
  verifyPipelineBundle(bundle);
  const prefix: StepResult[] = [];
  for (let index = 0; index < bundle.steps.length; index += 1) {
    const result = bundle.steps[index];
    const planned = ordered[index];
    if (!planned || result.stepId !== planned.id || result.status !== 'ok') break;
    prefix.push(result);
  }
  return prefix;
}

function statusFor(results: readonly StepResult[], orderedLength: number): Pick<ExecutionReport, 'status' | 'standing'> {
  const hasError = results.some((result) => result.status === 'error');
  const hasSuccess = results.some((result) => result.status === 'ok');
  const allRan = results.length === orderedLength;
  const status: ExecutionReport['status'] = !hasError && allRan
    ? 'ok'
    : results.length === 0 || hasSuccess
      ? 'partial'
      : 'failed';
  return { status, standing: status === 'ok' ? 'ALIVE' : status === 'partial' ? 'PARTIAL_ALIVE' : 'BLOCKED' };
}

function checkpoint(
  plan: OrchestratorPlan,
  results: readonly StepResult[],
  orderedLength: number,
  chainHash: string,
  bundlePath: string,
  previous?: PipelineBundle
): PipelineBundle {
  const state = statusFor(results, orderedLength);
  const bundle = makePipelineBundle(plan, { ...state, steps: results, chainHash }, previous);
  writePipelineBundle(bundlePath, bundle);
  return bundle;
}

export async function executePlan(plan: OrchestratorPlan, dispatch: StepDispatcher, options: ExecutePlanOptions = {}): Promise<ExecutionReport> {
  assertPlanIdentity(plan);
  const ordered = topoSort(plan.steps);
  const receiptsDir = options.receiptsDir ?? '.wasm4pm/receipts';
  const bundlePath = path.resolve(options.bundlePath ?? defaultPipelineBundlePath(plan));
  const previousBundle = options.resumeFrom;
  if (previousBundle && previousBundle.plan.planHash !== plan.planHash) {
    throw new Error(`Cannot resume plan ${plan.planHash} from checkpoint for ${previousBundle.plan.planHash}`);
  }

  const results: StepResult[] = previousBundle ? successfulPrefix(previousBundle, ordered) : [];
  let previousHash = results.length > 0 ? results[results.length - 1].outputHash : pipelineGenesisHash(plan.planHash);
  let currentBundle = checkpoint(plan, results, ordered.length, previousHash, bundlePath, previousBundle);

  for (let stepIndex = results.length; stepIndex < ordered.length; stepIndex += 1) {
    const candidate = ordered[stepIndex];
    const inputHash = previousHash;
    let resolvedArgs: Record<string, unknown>;
    let argsHash: string;
    try {
      resolvedArgs = substituteArgs(candidate.args, results);
      argsHash = hashCanonical(resolvedArgs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorHash = hashCanonical(message);
      const pendingReceipt = saveStepReceipt(plan, candidate, stepIndex, 'pending', inputHash, errorHash, 'partial', receiptsDir, {
        admission: 'refused',
        errorHash,
      });
      const outputHash = computeStepOutputHash({ planHash: plan.planHash, stepIndex, step: candidate, argsHash: blake3Hex('unresolved'), inputHash, status: 'error', errorHash });
      const outcomeReceipt = saveStepReceipt(plan, candidate, stepIndex, 'outcome', inputHash, outputHash, 'failed', receiptsDir, { errorHash });
      results.push({ stepIndex, stepId: candidate.id, noun: candidate.noun, verb: candidate.verb, status: 'error', durationMs: 0, argsHash: blake3Hex('unresolved'), inputHash, error: message, errorHash, outputHash, pendingReceipt, outcomeReceipt });
      previousHash = outputHash;
      currentBundle = checkpoint(plan, results, ordered.length, previousHash, bundlePath, currentBundle);
      break;
    }

    const pendingHash = hashCanonical({ schema_version: 'wasm4pm.pipeline-pending.v1', plan_hash: plan.planHash, step_index: stepIndex, step_id: candidate.id, args_hash: argsHash, input_hash: inputHash });
    const pendingReceipt = saveStepReceipt(plan, candidate, stepIndex, 'pending', inputHash, pendingHash, 'partial', receiptsDir, { argsHash });
    const started = performance.now();

    try {
      const result = await withSpanRaw(
        `pipeline.step.${candidate.noun}.${candidate.verb}`,
        { 'pipeline.plan_id': plan.planId, 'pipeline.plan_hash': plan.planHash, 'pipeline.step_id': candidate.id },
        () => dispatch(candidate.noun, candidate.verb, resolvedArgs)
      );
      const durationMs = performance.now() - started;
      const resultHash = hashCanonical(result);
      const outputHash = computeStepOutputHash({ planHash: plan.planHash, stepIndex, step: candidate, argsHash, inputHash, status: 'ok', resultHash });
      let outcomeReceipt: string;
      try {
        outcomeReceipt = saveStepReceipt(plan, candidate, stepIndex, 'outcome', inputHash, outputHash, 'success', receiptsDir, { argsHash, resultHash, durationMs });
      } catch (receiptError) {
        const message = `OUTCOME_RECEIPT_BLOCKED after '${candidate.id}' executed: ${receiptError instanceof Error ? receiptError.message : String(receiptError)}`;
        const errorHash = hashCanonical(message);
        const blockedHash = computeStepOutputHash({ planHash: plan.planHash, stepIndex, step: candidate, argsHash, inputHash, status: 'error', errorHash });
        results.push({ stepIndex, stepId: candidate.id, noun: candidate.noun, verb: candidate.verb, status: 'error', durationMs, argsHash, inputHash, error: message, errorHash, outputHash: blockedHash, pendingReceipt });
        previousHash = blockedHash;
        currentBundle = checkpoint(plan, results, ordered.length, previousHash, bundlePath, currentBundle);
        break;
      }
      results.push({ stepIndex, stepId: candidate.id, noun: candidate.noun, verb: candidate.verb, status: 'ok', durationMs, argsHash, inputHash, result, resultHash, outputHash, pendingReceipt, outcomeReceipt });
      previousHash = outputHash;
      currentBundle = checkpoint(plan, results, ordered.length, previousHash, bundlePath, currentBundle);
    } catch (error) {
      const durationMs = performance.now() - started;
      const message = error instanceof Error ? error.message : String(error);
      const errorHash = hashCanonical(message);
      const outputHash = computeStepOutputHash({ planHash: plan.planHash, stepIndex, step: candidate, argsHash, inputHash, status: 'error', errorHash });
      const outcomeReceipt = saveStepReceipt(plan, candidate, stepIndex, 'outcome', inputHash, outputHash, 'failed', receiptsDir, { argsHash, errorHash, durationMs });
      results.push({ stepIndex, stepId: candidate.id, noun: candidate.noun, verb: candidate.verb, status: 'error', durationMs, argsHash, inputHash, error: message, errorHash, outputHash, pendingReceipt, outcomeReceipt });
      previousHash = outputHash;
      currentBundle = checkpoint(plan, results, ordered.length, previousHash, bundlePath, currentBundle);
      break;
    }
  }

  verifyPipelineBundle(currentBundle);
  return {
    schema_version: 'wasm4pm.pipeline-execution.v2',
    planId: plan.planId,
    planHash: plan.planHash,
    status: currentBundle.status,
    standing: currentBundle.standing,
    steps: currentBundle.steps,
    chainHash: currentBundle.chainHash,
    evidenceHash: currentBundle.evidenceHash,
    bundlePath,
  };
}
