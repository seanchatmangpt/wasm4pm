import * as fs from 'node:fs/promises';
import { NounVerbError } from '@wasm4pm/noun-verb';
import { hashCanonical } from './canonical.js';
import type { OrchestratorPlan, OrchestratorStep } from './types.js';

export type PresetName = 'full' | 'quick' | 'compliance';
export const PRESET_NAMES: readonly PresetName[] = ['full', 'quick', 'compliance'];

function step(id: string, noun: string, verb: string, args: Record<string, unknown>, dependsOn: string[] = []): OrchestratorStep {
  return { id, noun, verb, args, dependsOn };
}

function buildPreset(name: PresetName, input: string): OrchestratorStep[] {
  switch (name) {
    case 'quick':
      return [step('validate', 'log', 'validate', { input }), step('discover', 'model', 'discover', { input }, ['validate'])];
    case 'compliance':
      return [
        step('validate', 'log', 'validate', { input }),
        step('discover', 'model', 'discover', { input, algorithm: 'alpha_plus_plus' }, ['validate']),
        step('check', 'model', 'check', { input, mode: 'replay', model: '@{discover.handle}' }, ['discover']),
      ];
    case 'full':
    default:
      return [
        step('validate', 'log', 'validate', { input }),
        step('stats', 'log', 'stats', { input }, ['validate']),
        step('discover', 'model', 'discover', { input, algorithm: 'alpha_plus_plus' }, ['validate']),
        step('check', 'model', 'check', { input, mode: 'replay', model: '@{discover.handle}' }, ['discover']),
        step('explain', 'model', 'explain', { input }, ['discover']),
      ];
  }
}

export interface BuildPlanOptions { preset?: string; planFile?: string; auto?: boolean; input?: string; }
interface RawFileStep { id?: string; noun: string; verb: string; args?: Record<string, unknown>; dependsOn?: string[]; }

function planProjection(plan: Pick<OrchestratorPlan, 'source' | 'presetName' | 'steps'>): Record<string, unknown> {
  return {
    schema_version: 'wasm4pm.orchestrator-plan.v2',
    source: plan.source,
    ...(plan.presetName ? { presetName: plan.presetName } : {}),
    steps: plan.steps.map((candidate) => ({
      id: candidate.id,
      noun: candidate.noun,
      verb: candidate.verb,
      args: candidate.args,
      dependsOn: [...candidate.dependsOn].sort(),
    })),
  };
}

export function computePlanHash(plan: Pick<OrchestratorPlan, 'source' | 'presetName' | 'steps'>): string {
  return hashCanonical(planProjection(plan));
}

function finalizePlan(
  source: OrchestratorPlan['source'],
  steps: readonly OrchestratorStep[],
  presetName?: string
): OrchestratorPlan {
  topoSort(steps);
  const identity = { source, presetName, steps };
  const planHash = computePlanHash(identity);
  return {
    planId: `plan-${planHash.slice(0, 24)}`,
    planHash,
    createdAt: new Date().toISOString(),
    source,
    ...(presetName ? { presetName } : {}),
    steps,
  };
}

export function assertPlanIdentity(plan: OrchestratorPlan): void {
  const expected = computePlanHash(plan);
  if (expected !== plan.planHash) {
    throw NounVerbError.invalidInput(`Pipeline plan hash mismatch: expected ${expected}, received ${plan.planHash}`);
  }
  const expectedId = `plan-${expected.slice(0, 24)}`;
  if (plan.planId !== expectedId) {
    throw NounVerbError.invalidInput(`Pipeline plan id mismatch: expected ${expectedId}, received ${plan.planId}`);
  }
  topoSort(plan.steps);
}

async function loadPlanFile(planFile: string): Promise<OrchestratorStep[]> {
  let content: string;
  try { content = await fs.readFile(planFile, 'utf-8'); }
  catch (e) { throw NounVerbError.invalidInput(`Cannot read plan file '${planFile}': ${e instanceof Error ? e.message : String(e)}`); }
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch (e) { throw NounVerbError.invalidInput(`Plan file '${planFile}' is not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }
  const rawSteps: RawFileStep[] = Array.isArray(parsed) ? parsed as RawFileStep[] : (parsed as { steps?: RawFileStep[] })?.steps ?? [];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw NounVerbError.invalidInput(`Plan file '${planFile}' must contain a non-empty 'steps' array (or be one)`);
  }
  return rawSteps.map((candidate, index) => {
    if (!candidate.noun || !candidate.verb) throw NounVerbError.invalidInput(`Plan file step ${index} is missing 'noun'/'verb'`);
    return step(candidate.id ?? `step-${index}`, candidate.noun, candidate.verb, candidate.args ?? {}, candidate.dependsOn ?? []);
  });
}

export async function buildPlan(options: BuildPlanOptions): Promise<OrchestratorPlan> {
  if (options.preset) {
    if (!PRESET_NAMES.includes(options.preset as PresetName)) {
      throw NounVerbError.invalidInput(`Unknown pipeline preset '${options.preset}'. Available: ${PRESET_NAMES.join(', ')}`);
    }
    if (!options.input) throw NounVerbError.invalidInput(`Preset '${options.preset}' requires --input <log>`);
    return finalizePlan('preset', buildPreset(options.preset as PresetName, options.input), options.preset);
  }
  if (options.planFile) return finalizePlan('file', await loadPlanFile(options.planFile));
  if (options.auto) {
    if (!options.input) throw NounVerbError.invalidInput('--auto requires --input <log>');
    return finalizePlan('auto', buildPreset('quick', options.input));
  }
  throw NounVerbError.invalidInput('Specify one of: a preset name, --plan-file <path>, or --auto');
}

export function topoSort(steps: readonly OrchestratorStep[]): OrchestratorStep[] {
  const byId = new Map<string, OrchestratorStep>();
  for (const candidate of steps) {
    if (!candidate.id.trim()) throw NounVerbError.invalidInput('Pipeline step id cannot be empty');
    if (byId.has(candidate.id)) throw NounVerbError.invalidInput(`Duplicate pipeline step id '${candidate.id}'`);
    if (new Set(candidate.dependsOn).size !== candidate.dependsOn.length) {
      throw NounVerbError.invalidInput(`Step '${candidate.id}' declares a dependency more than once`);
    }
    if (candidate.dependsOn.includes(candidate.id)) throw NounVerbError.invalidInput(`Step '${candidate.id}' cannot depend on itself`);
    byId.set(candidate.id, candidate);
  }
  for (const candidate of steps) {
    for (const dep of candidate.dependsOn) {
      if (!byId.has(dep)) throw NounVerbError.invalidInput(`Step '${candidate.id}' depends on unknown step '${dep}'`);
    }
  }
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  const ordered: OrchestratorStep[] = [];
  function visit(id: string): void {
    if (visited.has(id)) return;
    if (inProgress.has(id)) throw NounVerbError.invalidInput(`Cycle detected in pipeline plan at step '${id}'`);
    inProgress.add(id);
    const candidate = byId.get(id);
    if (candidate) {
      for (const dep of candidate.dependsOn) visit(dep);
      ordered.push(candidate);
    }
    inProgress.delete(id);
    visited.add(id);
  }
  for (const candidate of steps) visit(candidate.id);
  return ordered;
}
