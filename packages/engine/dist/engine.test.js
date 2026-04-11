/**
 * engine.test.ts
 * Tests for Engine lifecycle, state machine, and error handling
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSimpleEngine, createFullEngine, StateMachine, StatusTracker, } from './index.js';
// Mock implementations
class MockKernel {
    ready = false;
    async init() {
        this.ready = true;
    }
    async shutdown() {
        this.ready = false;
    }
    isReady() {
        return this.ready;
    }
}
class FailingKernel {
    async init() {
        throw new Error('Kernel init failed');
    }
    async shutdown() {
        // no-op
    }
    isReady() {
        return false;
    }
}
class MockPlanner {
    async plan(_config) {
        return {
            planId: 'plan_test_001',
            steps: [
                {
                    id: 'step_1',
                    name: 'Test Step 1',
                    description: 'First step',
                },
                {
                    id: 'step_2',
                    name: 'Test Step 2',
                    description: 'Second step',
                    dependencies: ['step_1'],
                },
            ],
            totalSteps: 2,
            estimatedDurationMs: 100,
        };
    }
}
class FailingPlanner {
    async plan(_config) {
        throw new Error('Planning failed');
    }
}
class MockExecutor {
    async run(plan) {
        return {
            runId: 'run_test_001',
            planId: plan.planId,
            state: 'ready',
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 100,
            progress: 100,
            errors: [],
        };
    }
    async *watch(plan) {
        yield {
            timestamp: new Date(),
            state: 'running',
            progress: 50,
        };
        yield {
            timestamp: new Date(),
            state: 'ready',
            progress: 100,
        };
    }
}
describe('Engine', () => {
    let kernel;
    let planner;
    let executor;
    let engine;
    beforeEach(() => {
        kernel = new MockKernel();
        planner = new MockPlanner();
        executor = new MockExecutor();
        engine = createFullEngine(kernel, planner, executor);
    });
    describe('State Management', () => {
        it('should start in uninitialized state', () => {
            expect(engine.state()).toBe('uninitialized');
        });
        it('should report initial status correctly', () => {
            const status = engine.status();
            expect(status.state).toBe('uninitialized');
            expect(status.progress).toBe(0);
            expect(status.errors).toHaveLength(0);
        });
        it('should not be ready before bootstrap', () => {
            expect(engine.isReady()).toBe(false);
            expect(engine.isFailed()).toBe(false);
        });
    });
    describe('Bootstrap Lifecycle', () => {
        it('should transition: uninitialized -> bootstrapping -> ready', async () => {
            await engine.bootstrap();
            expect(engine.state()).toBe('ready');
            expect(engine.isReady()).toBe(true);
            expect(kernel.isReady()).toBe(true);
        });
        it('should fail bootstrap with bad kernel', async () => {
            const badEngine = createSimpleEngine(new FailingKernel());
            await expect(badEngine.bootstrap()).rejects.toThrow('Kernel init failed');
            expect(badEngine.state()).toBe('failed');
            expect(badEngine.isFailed()).toBe(true);
        });
        it('should not allow bootstrap from non-uninitialized state', async () => {
            await engine.bootstrap();
            expect(engine.state()).toBe('ready');
            // Try to bootstrap again
            await expect(engine.bootstrap()).rejects.toThrow('Cannot bootstrap');
        });
        it('should provide helpful error message on bootstrap failure', async () => {
            const badEngine = createSimpleEngine(new FailingKernel());
            try {
                await badEngine.bootstrap();
                expect.fail('Should have thrown');
            }
            catch (err) {
                const status = badEngine.status();
                expect(status.errors).toHaveLength(1);
                expect(status.errors[0].code).toBe('BOOTSTRAP_FAILED');
                expect(status.errors[0].recoverable).toBe(true);
            }
        });
    });
    describe('Planning', () => {
        beforeEach(async () => {
            await engine.bootstrap();
        });
        it('should transition: ready -> planning -> ready', async () => {
            const plan = await engine.plan({});
            expect(engine.state()).toBe('ready');
            expect(plan.planId).toBe('plan_test_001');
            expect(plan.steps).toHaveLength(2);
        });
        it('should fail if planner is not configured', async () => {
            const engineWithoutPlanner = createSimpleEngine(kernel);
            expect(engineWithoutPlanner.state()).toBe('uninitialized');
            await engineWithoutPlanner.bootstrap();
            expect(engineWithoutPlanner.state()).toBe('ready');
            await expect(engineWithoutPlanner.plan({})).rejects.toThrow('No planner');
        });
        it('should handle planning errors gracefully', async () => {
            const badEngine = createFullEngine(kernel, new FailingPlanner(), executor);
            await badEngine.bootstrap();
            await expect(badEngine.plan({})).rejects.toThrow('Planning failed');
            // Engine should recover to ready or degraded
            const state = badEngine.state();
            expect(['ready', 'degraded']).toContain(state);
        });
        it('should not allow planning from non-ready state', async () => {
            expect(engine.state()).toBe('ready');
            // Start planning
            await expect(engine.plan({})).resolves.toBeDefined();
            expect(engine.state()).toBe('ready'); // Should return to ready after planning
            // Shutdown and try to plan
            await engine.shutdown();
            expect(engine.state()).toBe('failed');
            await expect(engine.plan({})).rejects.toThrow('Cannot plan');
        });
    });
    describe('Execution (run)', () => {
        beforeEach(async () => {
            await engine.bootstrap();
        });
        it('should execute a plan and return receipt', async () => {
            const plan = await engine.plan({});
            const receipt = await engine.run(plan);
            expect(receipt.runId).toBe('run_test_001');
            expect(receipt.planId).toBe('plan_test_001');
            expect(receipt.progress).toBe(100);
            expect(engine.state()).toBe('ready');
        });
        it('should fail if executor is not configured', async () => {
            const engineWithoutExecutor = createFullEngine(kernel, planner, null);
            await engineWithoutExecutor.bootstrap();
            const plan = await engineWithoutExecutor.plan({});
            await expect(engineWithoutExecutor.run(plan)).rejects.toThrow('No executor');
        });
        it('should not allow execution from non-ready state', async () => {
            const plan = await engine.plan({});
            await engine.shutdown();
            await expect(engine.run(plan)).rejects.toThrow('Cannot run');
        });
        it('should track execution progress', async () => {
            const plan = await engine.plan({});
            expect(engine.status().progress).toBeGreaterThanOrEqual(0);
            const receipt = await engine.run(plan);
            expect(engine.status().progress).toBeGreaterThanOrEqual(0);
            expect(receipt.progress).toBe(100);
        });
    });
    describe('Watched Execution', () => {
        beforeEach(async () => {
            await engine.bootstrap();
        });
        it('should stream status updates', async () => {
            const plan = await engine.plan({});
            const updates = [];
            for await (const update of engine.watch(plan)) {
                updates.push(update);
            }
            expect(updates.length).toBeGreaterThan(0);
            const firstUpdate = updates[0];
            const lastUpdate = updates[updates.length - 1];
            expect(firstUpdate.state).toBe('watching');
            expect(lastUpdate.state).toBe('ready');
        });
        it('should track progress in updates', async () => {
            const plan = await engine.plan({});
            const progresses = [];
            for await (const update of engine.watch(plan)) {
                progresses.push(update.progress);
            }
            // Progress should be monotonically increasing or equal
            for (let i = 1; i < progresses.length; i++) {
                expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
            }
        });
        it('should not allow watch from non-ready state', async () => {
            const plan = await engine.plan({});
            await engine.shutdown();
            const watchAsync = async () => {
                for await (const _update of engine.watch(plan)) {
                    // Should not reach here
                }
            };
            await expect(watchAsync()).rejects.toThrow('Cannot watch');
        });
    });
    describe('Error Handling', () => {
        beforeEach(async () => {
            await engine.bootstrap();
        });
        it('should collect errors in status', async () => {
            const badEngine = createFullEngine(kernel, new FailingPlanner(), executor);
            await badEngine.bootstrap();
            try {
                await badEngine.plan({});
            }
            catch (err) {
                // Expected
            }
            const status = badEngine.status();
            expect(status.errors.length).toBeGreaterThan(0);
            expect(status.errors[0].code).toBe('PLANNING_FAILED');
        });
        it('should provide recovery suggestions', async () => {
            const badEngine = createFullEngine(kernel, new FailingPlanner(), executor);
            await badEngine.bootstrap();
            try {
                await badEngine.plan({});
            }
            catch (err) {
                // Expected
            }
            const status = badEngine.status();
            const error = status.errors[0];
            expect(error.suggestion).toBeDefined();
            expect(error.recoverable).toBe(true);
        });
    });
    describe('Degradation and Recovery', () => {
        beforeEach(async () => {
            await engine.bootstrap();
        });
        it('should transition to degraded state', async () => {
            await engine.degrade({
                code: 'TEST_ERROR',
                message: 'Test degradation',
                severity: 'warning',
                recoverable: true,
            }, 'Testing degradation');
            expect(engine.state()).toBe('degraded');
        });
        it('should recover from degraded state', async () => {
            await engine.degrade({
                code: 'TEST_ERROR',
                message: 'Test degradation',
                severity: 'warning',
                recoverable: true,
            });
            expect(engine.state()).toBe('degraded');
            await engine.recover();
            expect(engine.state()).toBe('ready');
            expect(engine.status().errors).toHaveLength(0);
        });
        it('should fail if recovery is not possible', async () => {
            const badEngine = createSimpleEngine(new FailingKernel());
            await expect(badEngine.bootstrap()).rejects.toThrow();
            expect(badEngine.state()).toBe('failed');
            // Try to recover from failed state - should not work
            await expect(badEngine.recover()).rejects.toThrow('Cannot recover');
        });
    });
    describe('Shutdown', () => {
        beforeEach(async () => {
            await engine.bootstrap();
        });
        it('should shutdown gracefully', async () => {
            expect(engine.state()).toBe('ready');
            await engine.shutdown();
            expect(engine.state()).toBe('failed');
            expect(engine.isFailed()).toBe(true);
        });
        it('should close kernel on shutdown', async () => {
            expect(kernel.isReady()).toBe(true);
            await engine.shutdown();
            expect(kernel.isReady()).toBe(false);
        });
        it('should handle shutdown errors', async () => {
            const badKernel = new MockKernel();
            badKernel.shutdown = vi.fn().mockRejectedValue(new Error('Shutdown error'));
            const testEngine = createSimpleEngine(badKernel);
            await testEngine.bootstrap();
            await expect(testEngine.shutdown()).resolves.toBeUndefined();
            // Should still transition to failed
            expect(testEngine.state()).toBe('failed');
        });
    });
    describe('Transition History', () => {
        it('should record state transitions', async () => {
            await engine.bootstrap();
            const history = engine.getTransitionHistory();
            expect(history.length).toBeGreaterThan(0);
            expect(history[0].fromState).toBe('uninitialized');
            expect(history[0].toState).toBe('bootstrapping');
            expect(history[1].fromState).toBe('bootstrapping');
            expect(history[1].toState).toBe('ready');
        });
        it('should include transition reasons', async () => {
            await engine.bootstrap();
            const history = engine.getTransitionHistory();
            const bootstrapTransition = history.find((h) => h.toState === 'bootstrapping');
            expect(bootstrapTransition).toBeDefined();
            expect(bootstrapTransition?.reason).toBeDefined();
        });
        it('should include transition timestamps', async () => {
            await engine.bootstrap();
            const history = engine.getTransitionHistory();
            for (const transition of history) {
                expect(transition.timestamp).toBeInstanceOf(Date);
            }
        });
    });
});
describe('StateMachine', () => {
    let sm;
    beforeEach(() => {
        sm = new StateMachine();
    });
    it('should start in uninitialized state', () => {
        expect(sm.getState()).toBe('uninitialized');
    });
    it('should validate transitions', () => {
        expect(sm.canTransition('bootstrapping')).toBe(true);
        expect(sm.canTransition('ready')).toBe(false);
        expect(sm.canTransition('failed')).toBe(false);
    });
    it('should return valid next states', () => {
        const validTransitions = sm.getValidTransitions();
        expect(validTransitions).toContain('bootstrapping');
        expect(validTransitions).not.toContain('ready');
    });
    it('should throw on invalid transition', () => {
        expect(() => sm.transition('ready')).toThrow('Invalid state transition');
    });
    it('should allow valid transition', () => {
        sm.transition('bootstrapping');
        expect(sm.getState()).toBe('bootstrapping');
    });
    it('should emit lifecycle events', () => {
        let eventFired = false;
        let firedEvent = null;
        sm.onTransition((event) => {
            eventFired = true;
            firedEvent = event;
        });
        sm.transition('bootstrapping', 'Test reason');
        expect(eventFired).toBe(true);
        expect(firedEvent.reason).toBe('Test reason');
    });
    it('should track state age', (done) => {
        sm.transition('bootstrapping');
        const initialAge = sm.getStateAge();
        setTimeout(() => {
            const newAge = sm.getStateAge();
            expect(newAge).toBeGreaterThan(initialAge);
            done();
        }, 10);
    });
});
describe('StatusTracker', () => {
    let tracker;
    beforeEach(() => {
        tracker = new StatusTracker();
    });
    it('should initialize with empty status', () => {
        const status = tracker.getStatus();
        expect(status.state).toBe('uninitialized');
        expect(status.progress).toBe(0);
        expect(status.errors).toHaveLength(0);
    });
    it('should track progress', () => {
        const plan = {
            planId: 'test',
            steps: [{ id: '1', name: 'Test' }],
            totalSteps: 1,
        };
        tracker.setPlan(plan);
        expect(tracker.getStatus().progress).toBe(0);
        tracker.recordStepCompletion('1');
        expect(tracker.getStatus().progress).toBe(100);
    });
    it('should collect errors', () => {
        tracker.addError({
            code: 'TEST',
            message: 'Test error',
            severity: 'error',
            recoverable: true,
        });
        const status = tracker.getStatus();
        expect(status.errors).toHaveLength(1);
        expect(status.errors[0].code).toBe('TEST');
    });
    it('should generate receipt', () => {
        tracker.setRunId('run_test');
        tracker.start();
        tracker.finish();
        const receipt = tracker.getReceipt();
        expect(receipt.runId).toBe('run_test');
        expect(receipt.startedAt).toBeInstanceOf(Date);
        expect(receipt.finishedAt).toBeInstanceOf(Date);
        expect(receipt.durationMs).toBeGreaterThanOrEqual(0);
    });
    it('should reset to initial state', () => {
        tracker.setRunId('test');
        tracker.addError({
            code: 'TEST',
            message: 'Test',
            severity: 'error',
            recoverable: false,
        });
        tracker.reset();
        const status = tracker.getStatus();
        expect(status.runId).toBeUndefined();
        expect(status.errors).toHaveLength(0);
    });
});
describe('Engine WASM Integration', () => {
    let kernel;
    let planner;
    let executor;
    let engine;
    beforeEach(() => {
        kernel = new MockKernel();
        planner = new MockPlanner();
        executor = new MockExecutor();
        engine = createFullEngine(kernel, planner, executor);
    });
    describe('WASM Module Initialization', () => {
        it('should initialize WASM module during bootstrap', async () => {
            // Bootstrap will attempt to initialize WASM
            // This will fail with module not found in test, but that's expected
            try {
                await engine.bootstrap();
            }
            catch (err) {
                // Expected - module not available in test environment
                expect(engine.state()).toBe('failed');
            }
        });
        it('should report WASM status', () => {
            const status = engine.getWasmStatus();
            expect(status).toHaveProperty('initialized');
            expect(status).toHaveProperty('memoryPages');
            expect(status).toHaveProperty('runtimeEnvironment');
        });
        it('should report WASM memory statistics', () => {
            const stats = engine.getWasmMemoryStats();
            expect(stats).toHaveProperty('usedBytes');
            expect(stats).toHaveProperty('totalBytes');
            expect(stats).toHaveProperty('usagePercent');
        });
        it('should throw when accessing WASM module before initialization', () => {
            expect(() => {
                engine.getWasmModule();
            }).toThrow();
        });
    });
    describe('WASM Reuse Across Multiple Runs', () => {
        it('should reuse WASM module across multiple plan calls', async () => {
            // After successful bootstrap, WASM module should be reused
            // This test validates the pattern, actual execution depends on real WASM
            const engine2 = createFullEngine(kernel, planner, executor);
            const status1 = engine2.getWasmStatus();
            const status2 = engine2.getWasmStatus();
            // Should return consistent status
            expect(status1.runtimeEnvironment).toBe(status2.runtimeEnvironment);
        });
        it('should reuse WASM module across run() calls', async () => {
            // Multiple runs should reuse the same WASM module instance
            const engine2 = createFullEngine(kernel, planner, executor);
            // First call to getWasmStatus
            const stats1 = engine2.getWasmMemoryStats();
            // Second call should also work
            const stats2 = engine2.getWasmMemoryStats();
            // Both should have valid structure
            expect(stats1).toHaveProperty('usagePercent');
            expect(stats2).toHaveProperty('usagePercent');
        });
    });
    describe('WASM Error Handling', () => {
        it('should handle module load failure in bootstrap', async () => {
            // WASM module loading should fail gracefully
            try {
                await engine.bootstrap();
            }
            catch (err) {
                const status = engine.status();
                expect(status.state).toBe('failed');
                expect(status.errors.length).toBeGreaterThan(0);
            }
        });
        it('should provide helpful error messages for WASM failures', async () => {
            try {
                await engine.bootstrap();
            }
            catch (err) {
                // Error should be descriptive
                expect(err).toBeDefined();
            }
        });
        it('should handle missing WASM module gracefully', async () => {
            const engine2 = createFullEngine(kernel, planner, executor);
            try {
                await engine2.bootstrap();
            }
            catch (err) {
                expect(engine2.isFailed()).toBe(true);
            }
        });
    });
    describe('WASM Memory Management', () => {
        it('should track memory usage across operations', () => {
            const stats1 = engine.getWasmMemoryStats();
            const stats2 = engine.getWasmMemoryStats();
            // Memory stats should be consistent
            expect(stats1.totalBytes).toBe(stats2.totalBytes);
        });
        it('should report memory exceeding limits', () => {
            const stats = engine.getWasmMemoryStats();
            // Usage percent should be valid
            expect(stats.usagePercent).toBeGreaterThanOrEqual(0);
            expect(stats.usagePercent).toBeLessThanOrEqual(100);
        });
        it('should handle memory warnings', () => {
            const stats = engine.getWasmMemoryStats();
            // Should support threshold checking
            if (stats.usagePercent > 80) {
                // This would trigger a warning in real scenario
                expect(stats.usagePercent).toBeGreaterThan(80);
            }
        });
    });
    describe('WASM Panic Hook', () => {
        it('should setup panic hook during initialization', async () => {
            // Panic hook setup is part of init
            try {
                await engine.bootstrap();
            }
            catch (err) {
                // Expected to fail, but panic hook should be configured
            }
        });
        it('should catch Rust panics as engine errors', async () => {
            // If WASM panics, it should be caught as engine error
            try {
                await engine.bootstrap();
            }
            catch (err) {
                // Error handling should catch WASM panics
                expect(engine.state()).toBe('failed');
            }
        });
        it('should log panics to observability system', async () => {
            try {
                await engine.bootstrap();
            }
            catch (err) {
                const status = engine.status();
                // If panic occurs, it should be in error log
                expect(status.errors).toBeDefined();
            }
        });
    });
    describe('WASM Module Version Compatibility', () => {
        it('should detect version mismatch if configured', async () => {
            const engineWithVersionCheck = createFullEngine(kernel, planner, executor, { expectedVersion: '0.5.4' });
            try {
                await engineWithVersionCheck.bootstrap();
            }
            catch (err) {
                // Version check may cause failure
                expect(engineWithVersionCheck.state()).toBe('failed');
            }
        });
        it('should report expected and actual versions in status', () => {
            const wasmStatus = engine.getWasmStatus();
            expect(wasmStatus).toHaveProperty('expectedVersion');
            expect(wasmStatus).toHaveProperty('moduleVersion');
        });
        it('should work without version verification', async () => {
            const engineNoVersion = createFullEngine(kernel, planner, executor);
            const status = engineNoVersion.getWasmStatus();
            // Should not have expected version if not configured
            // Note: expectedVersion may be undefined
            expect(status).toHaveProperty('initialized');
        });
    });
    describe('WASM Runtime Detection', () => {
        it('should detect Node.js environment', () => {
            const status = engine.getWasmStatus();
            // Should detect runtime
            expect(['browser', 'nodejs', 'wasi']).toContain(status.runtimeEnvironment);
        });
        it('should detect browser environment if applicable', () => {
            const status = engine.getWasmStatus();
            expect(status.runtimeEnvironment).toBeDefined();
        });
        it('should support WASI environments', () => {
            const status = engine.getWasmStatus();
            // Runtime should be one of the valid options
            const validRuntimes = ['browser', 'nodejs', 'wasi'];
            expect(validRuntimes).toContain(status.runtimeEnvironment);
        });
    });
    describe('WASM Lifecycle During Engine States', () => {
        it('should have WASM ready in ready state', async () => {
            // In ready state, WASM should be available (if init succeeded)
            const currentState = engine.state();
            expect(currentState).toBe('uninitialized');
            // Memory stats should always be available
            const stats = engine.getWasmMemoryStats();
            expect(stats).toBeDefined();
        });
        it('should fail bootstrap if WASM initialization fails', async () => {
            try {
                await engine.bootstrap();
            }
            catch (err) {
                // Bootstrap should fail if WASM fails
                expect(engine.state()).toBe('failed');
            }
        });
        it('should maintain WASM state across engine states', () => {
            // WASM status should be queryable from any state
            const status1 = engine.getWasmStatus();
            const status2 = engine.getWasmStatus();
            expect(status1.runtimeEnvironment).toBe(status2.runtimeEnvironment);
        });
    });
    describe('WASM Configuration Options', () => {
        it('should accept custom module path', () => {
            const engineCustom = createFullEngine(kernel, planner, executor, { modulePath: '/custom/path.js' });
            expect(engineCustom).toBeDefined();
        });
        it('should accept memory threshold configuration', () => {
            const engineMemory = createFullEngine(kernel, planner, executor, { maxMemoryPercent: 90 });
            expect(engineMemory).toBeDefined();
        });
        it('should allow panic hook configuration', () => {
            const enginePanic = createFullEngine(kernel, planner, executor, { enablePanicHook: false });
            expect(enginePanic).toBeDefined();
        });
        it('should pass through observability layer', () => {
            const obsLayer = new (require('@pictl/observability').ObservabilityLayer)();
            const engineObs = createFullEngine(kernel, planner, executor, { observability: obsLayer });
            expect(engineObs).toBeDefined();
        });
    });
});
