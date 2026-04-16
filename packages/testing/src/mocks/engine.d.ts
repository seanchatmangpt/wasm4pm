/**
 * Mock Engine for testing without real WASM or execution.
 */
export type EngineState = 'uninitialized' | 'bootstrapping' | 'ready' | 'planning' | 'running' | 'watching' | 'degraded' | 'failed';
export interface LifecycleEvent {
    timestamp: Date;
    fromState: EngineState;
    toState: EngineState;
    reason?: string;
}
export interface ExecutionPlan {
    id: string;
    hash: string;
    steps: Array<{
        id: string;
        type: string;
        description: string;
    }>;
}
export interface ExecutionReceipt {
    runId: string;
    planId: string;
    state: EngineState;
    startedAt: Date;
    finishedAt?: Date;
    durationMs?: number;
    progress: number;
    errors: Array<{
        code: string;
        message: string;
    }>;
}
export interface StatusUpdate {
    timestamp: Date;
    state: EngineState;
    progress: number;
    message?: string;
}
export interface MockEngineOptions {
    shouldFailBootstrap?: boolean;
    shouldFailPlan?: boolean;
    shouldFailRun?: boolean;
    planDelay?: number;
    runDelay?: number;
    watchUpdates?: number;
    watchInterval?: number;
}
export declare class MockEngine {
    private _state;
    private _history;
    private _options;
    private _runCounter;
    readonly calls: {
        method: string;
        timestamp: number;
    }[];
    constructor(options?: MockEngineOptions);
    state(): EngineState;
    private _transition;
    bootstrap(): Promise<void>;
    plan(config: unknown): Promise<ExecutionPlan>;
    run(plan: ExecutionPlan): Promise<ExecutionReceipt>;
    watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate>;
    shutdown(): Promise<void>;
    getTransitionHistory(): LifecycleEvent[];
    isReady(): boolean;
    isFailed(): boolean;
    reset(): void;
}
export declare function createMockEngine(options?: MockEngineOptions): MockEngine;
//# sourceMappingURL=engine.d.ts.map