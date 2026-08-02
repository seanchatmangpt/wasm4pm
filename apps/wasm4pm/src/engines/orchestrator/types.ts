/** Typed step DAG for the orchestrator engine (`wpm pipeline plan|run`). */

export type PipelineStanding = 'ALIVE' | 'PARTIAL_ALIVE' | 'BLOCKED';

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
  readonly planHash: string;
  readonly createdAt: string;
  readonly source: 'preset' | 'auto' | 'file';
  readonly presetName?: string;
  readonly steps: readonly OrchestratorStep[];
}

export interface StepResult {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly noun: string;
  readonly verb: string;
  readonly status: 'ok' | 'error';
  readonly durationMs: number;
  readonly argsHash: string;
  readonly inputHash: string;
  readonly resultHash?: string;
  readonly errorHash?: string;
  readonly result?: unknown;
  readonly error?: string;
  readonly outputHash: string;
  readonly pendingReceipt: string;
  readonly outcomeReceipt?: string;
}

export interface ExecutionReport {
  readonly schema_version: 'wasm4pm.pipeline-execution.v2';
  readonly planId: string;
  readonly planHash: string;
  readonly status: 'ok' | 'partial' | 'failed';
  readonly standing: PipelineStanding;
  readonly steps: readonly StepResult[];
  readonly chainHash: string;
  readonly evidenceHash: string;
  readonly bundlePath: string;
}

export interface PipelineBundle {
  readonly schema_version: 'wasm4pm.pipeline-bundle.v1';
  readonly plan: OrchestratorPlan;
  readonly status: ExecutionReport['status'];
  readonly standing: PipelineStanding;
  readonly steps: readonly StepResult[];
  readonly chainHash: string;
  readonly evidenceHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExecutePlanOptions {
  readonly bundlePath?: string;
  readonly receiptsDir?: string;
  readonly resumeFrom?: PipelineBundle;
}

/** Handler a host registers so `execute.ts` can dispatch a step without a circular import on the noun registry. */
export type StepDispatcher = (noun: string, verb: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
