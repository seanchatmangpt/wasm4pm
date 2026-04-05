/**
 * Mock Engine for testing without real WASM or execution.
 */

export type EngineState =
  | 'uninitialized'
  | 'bootstrapping'
  | 'ready'
  | 'planning'
  | 'running'
  | 'watching'
  | 'degraded'
  | 'failed';

export interface LifecycleEvent {
  timestamp: Date;
  fromState: EngineState;
  toState: EngineState;
  reason?: string;
}

export interface ExecutionPlan {
  id: string;
  hash: string;
  steps: Array<{ id: string; type: string; description: string }>;
}

export interface ExecutionReceipt {
  runId: string;
  planId: string;
  state: EngineState;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  progress: number;
  errors: Array<{ code: string; message: string }>;
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

export class MockEngine {
  private _state: EngineState = 'uninitialized';
  private _history: LifecycleEvent[] = [];
  private _options: MockEngineOptions;
  private _runCounter = 0;

  readonly calls: { method: string; timestamp: number }[] = [];

  constructor(options: MockEngineOptions = {}) {
    this._options = options;
  }

  state(): EngineState {
    return this._state;
  }

  private _transition(to: EngineState, reason?: string): void {
    const from = this._state;
    this._state = to;
    this._history.push({ timestamp: new Date(), fromState: from, toState: to, reason });
  }

  async bootstrap(): Promise<void> {
    this.calls.push({ method: 'bootstrap', timestamp: Date.now() });
    this._transition('bootstrapping', 'bootstrap called');

    if (this._options.shouldFailBootstrap) {
      this._transition('failed', 'mock bootstrap failure');
      throw new Error('Mock bootstrap failure');
    }

    this._transition('ready', 'bootstrap complete');
  }

  async plan(config: unknown): Promise<ExecutionPlan> {
    this.calls.push({ method: 'plan', timestamp: Date.now() });
    this._transition('planning', 'plan called');

    if (this._options.planDelay) {
      await delay(this._options.planDelay);
    }

    if (this._options.shouldFailPlan) {
      this._transition('failed', 'mock plan failure');
      throw new Error('Mock plan failure');
    }

    const plan: ExecutionPlan = {
      id: `plan-${++this._runCounter}`,
      hash: `mock-hash-${this._runCounter}`,
      steps: [
        { id: 'step-1', type: 'load_source', description: 'Load source data' },
        { id: 'step-2', type: 'discover_dfg', description: 'Discover DFG' },
        { id: 'step-3', type: 'write_sink', description: 'Write output' },
      ],
    };

    this._transition('ready', 'plan complete');
    return plan;
  }

  async run(plan: ExecutionPlan): Promise<ExecutionReceipt> {
    this.calls.push({ method: 'run', timestamp: Date.now() });
    this._transition('running', 'run called');

    if (this._options.runDelay) {
      await delay(this._options.runDelay);
    }

    if (this._options.shouldFailRun) {
      this._transition('failed', 'mock run failure');
      throw new Error('Mock run failure');
    }

    const start = new Date();
    const receipt: ExecutionReceipt = {
      runId: `run-${this._runCounter}`,
      planId: plan.id,
      state: 'ready',
      startedAt: start,
      finishedAt: new Date(),
      durationMs: this._options.runDelay ?? 10,
      progress: 100,
      errors: [],
    };

    this._transition('ready', 'run complete');
    return receipt;
  }

  async *watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate> {
    this.calls.push({ method: 'watch', timestamp: Date.now() });
    this._transition('watching', 'watch started');

    const total = this._options.watchUpdates ?? 5;
    const interval = this._options.watchInterval ?? 10;

    for (let i = 0; i < total; i++) {
      await delay(interval);
      yield {
        timestamp: new Date(),
        state: 'watching',
        progress: Math.round(((i + 1) / total) * 100),
        message: `Step ${i + 1}/${total} complete`,
      };
    }

    this._transition('ready', 'watch complete');
  }

  async shutdown(): Promise<void> {
    this.calls.push({ method: 'shutdown', timestamp: Date.now() });
    this._transition('uninitialized', 'shutdown');
  }

  getTransitionHistory(): LifecycleEvent[] {
    return [...this._history];
  }

  isReady(): boolean { return this._state === 'ready'; }
  isFailed(): boolean { return this._state === 'failed'; }

  reset(): void {
    this._state = 'uninitialized';
    this._history.length = 0;
    this.calls.length = 0;
    this._runCounter = 0;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMockEngine(options?: MockEngineOptions): MockEngine {
  return new MockEngine(options);
}
