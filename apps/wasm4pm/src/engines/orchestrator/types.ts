/** Typed step DAG for the orchestrator engine (`wpm pipeline plan|run`). */

export interface OrchestratorStep {
  readonly id: string;
  readonly noun: string;
  readonly verb: string;
  readonly args: Readonly<Record<string, unknown>>;
  /** Step ids that must complete before this one runs. */
  readonly dependsOn: readonly string[];
}

export interface OrchestratorPlan {
  readonly planId: string;
  readonly createdAt: string;
  readonly source: 'preset' | 'auto' | 'file';
  readonly presetName?: string;
  readonly steps: readonly OrchestratorStep[];
}

export interface StepResult {
  readonly stepId: string;
  readonly noun: string;
  readonly verb: string;
  readonly status: 'ok' | 'error';
  readonly durationMs: number;
  readonly result?: unknown;
  readonly error?: string;
  readonly outputHash: string;
}

export interface ExecutionReport {
  readonly planId: string;
  readonly status: 'ok' | 'partial' | 'failed';
  readonly steps: readonly StepResult[];
  readonly chainHash: string;
}

/** Handler a host registers so `execute.ts` can dispatch a step without a circular import on the noun registry. */
export type StepDispatcher = (noun: string, verb: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
