/**
 * Explain/Run parity test harness.
 *
 * The invariant: for any config, `explain(config)` must describe exactly the steps
 * that `run(config)` executes. This harness captures both outputs and compares them
 * structurally.
 */

import { PLAN_STEP_TYPE_VALUES } from '@pictl/contracts';

export interface PlanStep {
  id: string;
  type: string;
  description: string;
  required?: boolean;
  parameters?: Record<string, unknown>;
  dependsOn?: string[];
}

export interface ExecutionPlan {
  id: string;
  hash: string;
  steps: PlanStep[];
}

export interface ParityResult {
  passed: boolean;
  config: unknown;
  explainSteps: string[];
  runSteps: string[];
  missingFromExplain: string[];
  missingFromRun: string[];
  orderMismatch: boolean;
  details: string;
}

export interface PlannerLike {
  plan(config: unknown): Promise<ExecutionPlan> | ExecutionPlan;
  explain(config: unknown): string;
}

/**
 * Compare explain output with actual plan steps.
 * Returns a detailed parity result.
 */
export async function checkParity(
  planner: PlannerLike,
  config: unknown,
): Promise<ParityResult> {
  const explainText = planner.explain(config);
  const plan = await planner.plan(config);

  const explainSteps = extractStepsFromExplain(explainText);
  const runSteps = plan.steps.map(s => s.type);

  const explainSet = new Set(explainSteps);
  const runSet = new Set(runSteps);

  const missingFromExplain = runSteps.filter(s => !explainSet.has(s));
  const missingFromRun = explainSteps.filter(s => !runSet.has(s));

  const orderMismatch = !arraysMatchOrder(explainSteps, runSteps);

  const passed = missingFromExplain.length === 0 &&
    missingFromRun.length === 0 &&
    !orderMismatch;

  let details = '';
  if (!passed) {
    const parts: string[] = [];
    if (missingFromExplain.length > 0) {
      parts.push(`Steps in run but not in explain: [${missingFromExplain.join(', ')}]`);
    }
    if (missingFromRun.length > 0) {
      parts.push(`Steps in explain but not in run: [${missingFromRun.join(', ')}]`);
    }
    if (orderMismatch) {
      parts.push(`Step order differs: explain=[${explainSteps.join(', ')}] vs run=[${runSteps.join(', ')}]`);
    }
    details = parts.join('; ');
  } else {
    details = `Parity verified: ${runSteps.length} steps match`;
  }

  return {
    passed,
    config,
    explainSteps,
    runSteps,
    missingFromExplain,
    missingFromRun,
    orderMismatch,
    details,
  };
}

/**
 * Run parity check across multiple configs.
 */
export async function checkParityBatch(
  planner: PlannerLike,
  configs: unknown[],
): Promise<{ results: ParityResult[]; allPassed: boolean; summary: string }> {
  const results: ParityResult[] = [];

  for (const config of configs) {
    results.push(await checkParity(planner, config));
  }

  const allPassed = results.every(r => r.passed);
  const passCount = results.filter(r => r.passed).length;
  const summary = `Parity: ${passCount}/${results.length} configs passed`;

  return { results, allPassed, summary };
}

/**
 * Extract step type identifiers from explain text output.
 * Looks for known step type patterns in the text.
 */
function extractStepsFromExplain(text: string): string[] {
  const knownSteps = [...PLAN_STEP_TYPE_VALUES];

  const lowerText = text.toLowerCase();

  // Find each known step and record its first position in the text
  const hits: Array<{ step: string; pos: number }> = [];
  for (const step of knownSteps) {
    const normalized = step.replace(/_/g, '[_ -]?');
    const pattern = new RegExp(normalized, 'i');
    const match = pattern.exec(lowerText);
    if (match) {
      hits.push({ step, pos: match.index });
    }
  }

  // Return in text order (preserves the order explain() rendered the steps)
  hits.sort((a, b) => a.pos - b.pos);
  return hits.map((h) => h.step);
}

/**
 * Check if the common elements between two arrays appear in the same relative order.
 */
function arraysMatchOrder(a: string[], b: string[]): boolean {
  const common = a.filter(item => b.includes(item));
  const bFiltered = b.filter(item => a.includes(item));

  if (common.length !== bFiltered.length) return false;
  for (let i = 0; i < common.length; i++) {
    if (common[i] !== bFiltered[i]) return false;
  }
  return true;
}
