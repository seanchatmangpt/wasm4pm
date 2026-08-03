import * as fs from 'node:fs';
import * as path from 'node:path';
import { atomicWriteSync } from '../../receipts/_shared.js';
import { canonicalJson, hashCanonical } from './canonical.js';
import { assertPlanIdentity, topoSort } from './plan.js';
import type { ExecutionReport, OrchestratorPlan, OrchestratorStep, PipelineBundle, StepResult } from './types.js';

export const PIPELINE_BUNDLE_SCHEMA = 'wasm4pm.pipeline-bundle.v1' as const;

export function pipelineGenesisHash(planHash: string): string {
  return hashCanonical({ schema_version: 'wasm4pm.pipeline-genesis.v1', plan_hash: planHash });
}

export interface StepHashInput {
  planHash: string;
  stepIndex: number;
  step: Pick<OrchestratorStep, 'id' | 'noun' | 'verb'>;
  argsHash: string;
  inputHash: string;
  status: StepResult['status'];
  resultHash?: string;
  errorHash?: string;
}

export function computeStepOutputHash(input: StepHashInput): string {
  return hashCanonical({
    schema_version: 'wasm4pm.pipeline-step.v2',
    plan_hash: input.planHash,
    step_index: input.stepIndex,
    step_id: input.step.id,
    noun: input.step.noun,
    verb: input.step.verb,
    args_hash: input.argsHash,
    input_hash: input.inputHash,
    outcome: input.status === 'ok'
      ? { status: 'ok', result_hash: input.resultHash }
      : { status: 'error', error_hash: input.errorHash },
  });
}

function bundleEvidenceProjection(bundle: Omit<PipelineBundle, 'evidenceHash'> | PipelineBundle): Record<string, unknown> {
  return {
    schema_version: PIPELINE_BUNDLE_SCHEMA,
    plan_hash: bundle.plan.planHash,
    status: bundle.status,
    standing: bundle.standing,
    chain_hash: bundle.chainHash,
    steps: bundle.steps.map((result) => ({
      step_index: result.stepIndex,
      step_id: result.stepId,
      noun: result.noun,
      verb: result.verb,
      status: result.status,
      args_hash: result.argsHash,
      input_hash: result.inputHash,
      result_hash: result.resultHash,
      error_hash: result.errorHash,
      output_hash: result.outputHash,
    })),
  };
}

export function computeBundleEvidenceHash(bundle: Omit<PipelineBundle, 'evidenceHash'> | PipelineBundle): string {
  return hashCanonical(bundleEvidenceProjection(bundle));
}

export function makePipelineBundle(
  plan: OrchestratorPlan,
  report: Omit<ExecutionReport, 'schema_version' | 'planId' | 'planHash' | 'evidenceHash' | 'bundlePath'>,
  previous?: PipelineBundle
): PipelineBundle {
  const now = new Date().toISOString();
  const unsealed = {
    schema_version: PIPELINE_BUNDLE_SCHEMA,
    plan,
    status: report.status,
    standing: report.standing,
    steps: report.steps,
    chainHash: report.chainHash,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  } as const;
  return { ...unsealed, evidenceHash: computeBundleEvidenceHash(unsealed) };
}

export function defaultPipelineBundlePath(plan: OrchestratorPlan, cwd = process.cwd()): string {
  return path.resolve(cwd, '.wasm4pm', 'pipelines', `${plan.planId}.json`);
}

export function latestPipelineBundlePath(receiptsDir = '.wasm4pm/receipts', cwd = process.cwd()): string {
  const resolvedReceipts = path.resolve(cwd, receiptsDir);
  return path.join(path.dirname(resolvedReceipts), 'pipelines', 'latest.json');
}

export function writePipelineBundle(target: string, bundle: PipelineBundle): string {
  verifyPipelineBundle(bundle);
  const resolved = path.resolve(target);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const json = JSON.stringify(bundle, null, 2) + '\n';
  atomicWriteSync(resolved, json);
  atomicWriteSync(path.join(path.dirname(resolved), 'latest.json'), json);
  return resolved;
}

export function loadPipelineBundle(target: string): PipelineBundle {
  const resolved = path.resolve(target);
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as PipelineBundle;
  verifyPipelineBundle(parsed);
  return parsed;
}

export function verifyPipelineBundle(bundle: PipelineBundle): void {
  if (bundle.schema_version !== PIPELINE_BUNDLE_SCHEMA) {
    throw new Error(`Unsupported pipeline bundle schema '${String(bundle.schema_version)}'`);
  }
  assertPlanIdentity(bundle.plan);
  const ordered = topoSort(bundle.plan.steps);
  if (bundle.steps.length > ordered.length) throw new Error('Pipeline bundle contains more results than plan steps');

  let previous = pipelineGenesisHash(bundle.plan.planHash);
  for (let index = 0; index < bundle.steps.length; index += 1) {
    const result = bundle.steps[index];
    const planned = ordered[index];
    if (!planned || result.stepIndex !== index || result.stepId !== planned.id || result.noun !== planned.noun || result.verb !== planned.verb) {
      throw new Error(`Pipeline bundle step ${index} does not match the canonical execution order`);
    }
    if (result.inputHash !== previous) throw new Error(`Pipeline bundle chain mismatch at step '${result.stepId}'`);
    if (result.status === 'ok') {
      if (result.resultHash !== hashCanonical(result.result)) throw new Error(`Result hash mismatch at step '${result.stepId}'`);
    } else {
      if (!result.error || result.errorHash !== hashCanonical(result.error)) throw new Error(`Error hash mismatch at step '${result.stepId}'`);
    }
    const expectedOutput = computeStepOutputHash({
      planHash: bundle.plan.planHash,
      stepIndex: index,
      step: planned,
      argsHash: result.argsHash,
      inputHash: result.inputHash,
      status: result.status,
      resultHash: result.resultHash,
      errorHash: result.errorHash,
    });
    if (result.outputHash !== expectedOutput) throw new Error(`Output hash mismatch at step '${result.stepId}'`);
    previous = result.outputHash;
  }
  if (bundle.chainHash !== previous) throw new Error('Pipeline bundle terminal chain hash mismatch');
  const hasError = bundle.steps.some((step) => step.status === 'error');
  const hasSuccess = bundle.steps.some((step) => step.status === 'ok');
  const allRan = bundle.steps.length === ordered.length;
  const expectedStatus: PipelineBundle['status'] = !hasError && allRan
    ? 'ok'
    : bundle.steps.length === 0 || hasSuccess
      ? 'partial'
      : 'failed';
  const expectedStanding: PipelineBundle['standing'] = expectedStatus === 'ok' ? 'ALIVE' : expectedStatus === 'partial' ? 'PARTIAL_ALIVE' : 'BLOCKED';
  if (bundle.status !== expectedStatus || bundle.standing !== expectedStanding) throw new Error('Pipeline bundle standing/status mismatch');
  const expectedEvidence = computeBundleEvidenceHash(bundle);
  if (bundle.evidenceHash !== expectedEvidence) throw new Error('Pipeline bundle evidence hash mismatch');
  canonicalJson(bundle);
}
