/**
 * Explain/Run parity test harness.
 *
 * The invariant: for any config, `explain(config)` must describe exactly the steps
 * that `run(config)` executes. This harness captures both outputs and compares them
 * structurally.
 */
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
export declare function checkParity(planner: PlannerLike, config: unknown): Promise<ParityResult>;
/**
 * Run parity check across multiple configs.
 */
export declare function checkParityBatch(planner: PlannerLike, configs: unknown[]): Promise<{
    results: ParityResult[];
    allPassed: boolean;
    summary: string;
}>;
//# sourceMappingURL=parity.d.ts.map