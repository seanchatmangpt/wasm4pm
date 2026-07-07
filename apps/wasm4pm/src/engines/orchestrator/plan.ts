/**
 * Orchestrator planner — builds a typed `OrchestratorStep` DAG from a
 * built-in preset name, a custom plan file, or `--auto` (a fixed
 * validate -> discover -> check pipeline over one input).
 *
 * Scoping note: `@wasm4pm/planner`'s `plan()` (used by the legacy
 * `commands/run.ts` auto-select path) builds a DAG of raw execution phases
 * (`init_wasm`, `load_source`, ...) for a single discovery run. This
 * orchestrator instead builds a DAG of noun/verb steps — the unit `execute.ts`
 * actually knows how to dispatch — because that is what `wpm pipeline`
 * chains across the new CLI surface. The two are complementary, not
 * duplicates: `wpm model discover --auto-select` still goes through
 * `@wasm4pm/planner` internally (unchanged); `wpm pipeline plan` is about
 * sequencing multiple *verbs*.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { NounVerbError } from '@wasm4pm/noun-verb';
import type { OrchestratorPlan, OrchestratorStep } from './types.js';

export type PresetName = 'full' | 'quick' | 'compliance';

export const PRESET_NAMES: readonly PresetName[] = ['full', 'quick', 'compliance'];

function step(
  id: string,
  noun: string,
  verb: string,
  args: Record<string, unknown>,
  dependsOn: string[] = []
): OrchestratorStep {
  return { id, noun, verb, args, dependsOn };
}

function buildPreset(name: PresetName, input: string): OrchestratorStep[] {
  switch (name) {
    case 'quick':
      return [
        step('validate', 'log', 'validate', { input }),
        step('discover', 'model', 'discover', { input }, ['validate']),
      ];
    case 'compliance':
      return [
        step('validate', 'log', 'validate', { input }),
        // 'model check --mode replay' requires a real PetriNet handle. The
        // discover verb's own default algorithm (heuristic_miner) currently
        // returns a DFG-shaped handle at runtime despite the algorithm
        // registry's declared 'petrinet' outputType, so a preset that chains
        // discover -> check must pin an algorithm that actually produces one
        // (alpha_plus_plus, verified live).
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

export interface BuildPlanOptions {
  preset?: string;
  planFile?: string;
  auto?: boolean;
  input?: string;
}

function newPlanId(): string {
  return randomUUID();
}

interface RawFileStep {
  id?: string;
  noun: string;
  verb: string;
  args?: Record<string, unknown>;
  dependsOn?: string[];
}

async function loadPlanFile(planFile: string): Promise<OrchestratorStep[]> {
  let content: string;
  try {
    content = await fs.readFile(planFile, 'utf-8');
  } catch (e) {
    throw NounVerbError.invalidInput(`Cannot read plan file '${planFile}': ${e instanceof Error ? e.message : String(e)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw NounVerbError.invalidInput(`Plan file '${planFile}' is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const rawSteps: RawFileStep[] = Array.isArray(parsed)
    ? (parsed as RawFileStep[])
    : (parsed as { steps?: RawFileStep[] })?.steps ?? [];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw NounVerbError.invalidInput(`Plan file '${planFile}' must contain a non-empty 'steps' array (or be one)`);
  }
  return rawSteps.map((s, i) => {
    if (!s.noun || !s.verb) {
      throw NounVerbError.invalidInput(`Plan file step ${i} is missing 'noun'/'verb'`);
    }
    return step(s.id ?? `step-${i}`, s.noun, s.verb, s.args ?? {}, s.dependsOn ?? []);
  });
}

/** Build an `OrchestratorPlan`. Exactly one of `preset`/`planFile`/`auto` should be set; `preset` wins if several are. */
export async function buildPlan(options: BuildPlanOptions): Promise<OrchestratorPlan> {
  if (options.preset) {
    if (!PRESET_NAMES.includes(options.preset as PresetName)) {
      throw NounVerbError.invalidInput(
        `Unknown pipeline preset '${options.preset}'. Available: ${PRESET_NAMES.join(', ')}`
      );
    }
    if (!options.input) {
      throw NounVerbError.invalidInput(`Preset '${options.preset}' requires --input <log>`);
    }
    return {
      planId: newPlanId(),
      createdAt: new Date().toISOString(),
      source: 'preset',
      presetName: options.preset,
      steps: buildPreset(options.preset as PresetName, options.input),
    };
  }

  if (options.planFile) {
    return {
      planId: newPlanId(),
      createdAt: new Date().toISOString(),
      source: 'file',
      steps: await loadPlanFile(options.planFile),
    };
  }

  if (options.auto) {
    if (!options.input) {
      throw NounVerbError.invalidInput('--auto requires --input <log>');
    }
    return {
      planId: newPlanId(),
      createdAt: new Date().toISOString(),
      source: 'auto',
      steps: buildPreset('quick', options.input),
    };
  }

  throw NounVerbError.invalidInput('Specify one of: a preset name, --plan-file <path>, or --auto');
}

/** Topologically order `steps` by `dependsOn`. Throws on a cycle or a dangling dependency. */
export function topoSort(steps: readonly OrchestratorStep[]): OrchestratorStep[] {
  const byId = new Map(steps.map((s) => [s.id, s] as const));
  for (const s of steps) {
    for (const dep of s.dependsOn) {
      if (!byId.has(dep)) {
        throw NounVerbError.invalidInput(`Step '${s.id}' depends on unknown step '${dep}'`);
      }
    }
  }
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  const ordered: OrchestratorStep[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (inProgress.has(id)) {
      throw NounVerbError.invalidInput(`Cycle detected in pipeline plan at step '${id}'`);
    }
    inProgress.add(id);
    const s = byId.get(id);
    if (s) {
      for (const dep of s.dependsOn) visit(dep);
      ordered.push(s);
    }
    inProgress.delete(id);
    visited.add(id);
  }

  for (const s of steps) visit(s.id);
  return ordered;
}
