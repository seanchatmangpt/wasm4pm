/**
 * Mock Engine for testing without real WASM or execution.
 */
export class MockEngine {
    constructor(options = {}) {
        this._state = 'uninitialized';
        this._history = [];
        this._runCounter = 0;
        this.calls = [];
        this._options = options;
    }
    state() {
        return this._state;
    }
    _transition(to, reason) {
        const from = this._state;
        this._state = to;
        this._history.push({ timestamp: new Date(), fromState: from, toState: to, reason });
    }
    async bootstrap() {
        this.calls.push({ method: 'bootstrap', timestamp: Date.now() });
        this._transition('bootstrapping', 'bootstrap called');
        if (this._options.shouldFailBootstrap) {
            this._transition('failed', 'mock bootstrap failure');
            throw new Error('Mock bootstrap failure');
        }
        this._transition('ready', 'bootstrap complete');
    }
    async plan(config) {
        this.calls.push({ method: 'plan', timestamp: Date.now() });
        this._transition('planning', 'plan called');
        if (this._options.planDelay) {
            await delay(this._options.planDelay);
        }
        if (this._options.shouldFailPlan) {
            this._transition('failed', 'mock plan failure');
            throw new Error('Mock plan failure');
        }
        const plan = {
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
    async run(plan) {
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
        const receipt = {
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
    async *watch(plan) {
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
    async shutdown() {
        this.calls.push({ method: 'shutdown', timestamp: Date.now() });
        this._transition('uninitialized', 'shutdown');
    }
    getTransitionHistory() {
        return [...this._history];
    }
    isReady() { return this._state === 'ready'; }
    isFailed() { return this._state === 'failed'; }
    reset() {
        this._state = 'uninitialized';
        this._history.length = 0;
        this.calls.length = 0;
        this._runCounter = 0;
    }
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export function createMockEngine(options) {
    return new MockEngine(options);
}
//# sourceMappingURL=engine.js.map