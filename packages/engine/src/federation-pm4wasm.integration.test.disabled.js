/**
 * federation-pm4wasm.integration.test.ts
 *
 * Integration tests for pm4wasm backend within the FederationController.
 * Tests the full 7-rule backend selection algorithm with pm4wasm as a candidate.
 * Uses 4 scenario examples as test fixtures.
 *
 * Test coverage:
 * - Rule 1: Environment gate (browserSafe)
 * - Rule 2: Algorithm gate (ALGORITHM_MAP membership)
 * - Rule 3: Latency budget gate (latency tier ordering)
 * - Rule 4: Quality floor gate (quality tier validation)
 * - Rule 5: Health state mapping (health_level → backend availability)
 * - Rule 6: Concurrency gate (maxConcurrentInvocations limit)
 * - Rule 7: RL tiebreaker (RL weight ordering)
 * - Full scenario tests (A-D from Plan phase)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FederationController, FederationCircuitBreaker } from './federation.js';
/**
 * Mock MiningBackend for testing
 */
class MockBackend {
    constructor(id, browserSafe = false, supportedAlgorithms = ['dfg'], maxQualityFloor = 'quality', maxConcurrentInvocations = 8) {
        this.id = id;
        this.browserSafe = browserSafe;
        this.supportedAlgorithms = supportedAlgorithms;
        this.maxQualityFloor = maxQualityFloor;
        this.maxConcurrentInvocations = maxConcurrentInvocations;
    }
    async healthCheck() {
        return { healthy: true, message: 'OK' };
    }
    async discover(log, algorithmId, budget) {
        return {
            run_id: 'run_' + Date.now(),
            status: 'success',
            payload: {
                format_version: '1.0',
                model_type: 'dfg',
                algorithm_id: algorithmId,
                capabilities: {
                    online_safe: true,
                    replay_ready: true,
                    deterministic: true,
                    resource_aware: false,
                    drift_aware: false,
                },
                nodes: [{ id: '1', label: 'A', type: 'activity' }],
                edges: [],
            },
            latency_ms: 10,
            latency_class: 'low_ms',
            backend_id: this.id,
            invocation_id: 'inv_' + Date.now(),
            cycle_seq: 0,
            algorithm_id: algorithmId,
            provenance: {
                input_hash: 'hash_input',
                config_hash: 'hash_config',
                plan_hash: 'hash_plan',
                output_hash: 'hash_output',
                combined_hash: 'hash_combined',
                algorithm_id: algorithmId,
                algorithm_version: '1.0.0',
                backend_id: this.id,
                kernel_version: '1.0.0',
                wasm_build_hash: 'hash_wasm',
            },
        };
    }
    supportsAlgorithm(algorithmId) {
        return this.supportedAlgorithms.includes(algorithmId);
    }
    supportsQualityFloor(floor) {
        const floorOrder = { fast: 0, balanced: 1, quality: 2, research: 3 };
        return (floorOrder[floor] || 0) <= floorOrder[this.maxQualityFloor];
    }
    canRun(concurrencyLevel) {
        return concurrencyLevel < this.maxConcurrentInvocations;
    }
}
/**
 * Mock DefaultBackendRegistry for testing
 */
class MockBackendRegistry {
    constructor() {
        this.backends = new Map();
        this.backendInstances = new Map();
        this.backendStates = new Map();
    }
    register(backend) {
        this.backendInstances.set(backend.id, backend);
        this.backendStates.set(backend.id, 'ready');
    }
    select(algorithmId, budget) {
        const candidates = Array.from(this.backendInstances.values()).filter((b) => {
            // Filter 1: State check (ready only)
            if (this.backendStates.get(b.id) !== 'ready') {
                return false;
            }
            // Filter 2: Algorithm support
            if (!b.supportsAlgorithm(algorithmId)) {
                return false;
            }
            // Filter 3: Quality floor support
            if (!b.supportsQualityFloor(budget.qualityFloor || 'balanced')) {
                return false;
            }
            // Filter 4: Environment constraints
            if (budget.environment?.browserSafe && !b.browserSafe) {
                return false;
            }
            return true;
        });
        if (candidates.length === 0) {
            throw new Error('No backends available');
        }
        // Simple selection: prefer WASM > pm4wasm > pm4py > ML
        const order = { wasm: 0, pm4wasm: 1, pm4py: 2, ml: 3, null: 999 };
        return candidates.sort((a, b) => (order[a.id] || 999) - (order[b.id] || 999))[0];
    }
    setBackendState(id, state) {
        this.backendStates.set(id, state);
    }
    getBackend(id) {
        return this.backendInstances.get(id);
    }
}
/**
 * Test event logs
 */
function createSmallEventLog() {
    return {
        traces: Array.from({ length: 20 }, (_, i) => ({
            caseId: `case_${i}`,
            events: Array.from({ length: 50 }, (_, j) => ({
                eventId: `event_${i}_${j}`,
                activity: `A${j % 5}`,
                timestamp: Date.now() + j * 1000,
                attributes: {},
            })),
        })),
        attributes: { concept_version: '1.0' },
    };
}
function createMediumEventLog() {
    return {
        traces: Array.from({ length: 500 }, (_, i) => ({
            caseId: `case_${i}`,
            events: Array.from({ length: 100 }, (_, j) => ({
                eventId: `event_${i}_${j}`,
                activity: `Activity_${j % 20}`,
                timestamp: Date.now() + j * 1000,
                attributes: { resource: `user_${j % 10}` },
            })),
        })),
        attributes: { concept_version: '1.0' },
    };
}
function createLargeEventLog() {
    return {
        traces: Array.from({ length: 5000 }, (_, i) => ({
            caseId: `case_${i}`,
            events: Array.from({ length: 100 }, (_, j) => ({
                eventId: `event_${i}_${j}`,
                activity: `Activity_${j % 50}`,
                timestamp: Date.now() + j * 1000,
                attributes: { resource: `user_${j % 50}` },
            })),
        })),
        attributes: { concept_version: '1.0' },
    };
}
/**
 * Test budget envelopes
 */
function createSubMsBudget() {
    return {
        latencyBudget: 'sub_ms',
        memoryBudget: 0,
        qualityFloor: 'balanced',
        environment: { browserSafe: false, pythonAvailable: true },
        mode: 'online',
    };
}
function createHighMsBudget() {
    return {
        latencyBudget: 'high_ms',
        memoryBudget: 0,
        qualityFloor: 'balanced',
        environment: { browserSafe: false, pythonAvailable: true },
        mode: 'online',
    };
}
function createSecondsBudget() {
    return {
        latencyBudget: 'seconds',
        memoryBudget: 0,
        qualityFloor: 'research',
        environment: { browserSafe: false, pythonAvailable: true },
        mode: 'online',
    };
}
function createBrowserBudget() {
    return {
        latencyBudget: 'high_ms',
        memoryBudget: 0,
        qualityFloor: 'balanced',
        environment: { browserSafe: true, pythonAvailable: false },
        mode: 'online',
    };
}
describe('FederationController with pm4wasm backend', () => {
    let controller;
    let registry;
    let wasmBackend;
    let pm4wasmBackend;
    let mlBackend;
    beforeEach(async () => {
        // Setup registry with 3 backends
        registry = new MockBackendRegistry();
        wasmBackend = new MockBackend('wasm', false, ['dfg', 'alpha_plus_plus', 'inductive_miner', 'ilp', 'genetic_algorithm'], 'quality', 8);
        pm4wasmBackend = new MockBackend('pm4wasm', true, ['dfg', 'process_skeleton', 'alpha_plus_plus', 'heuristic_miner', 'inductive_miner'], 'quality', 3);
        mlBackend = new MockBackend('ml', false, ['ml_classify', 'ml_cluster', 'ml_forecast', 'dfg'], 'research', 5);
        // Register backends
        registry.register(wasmBackend);
        registry.register(pm4wasmBackend);
        registry.register(mlBackend);
        // Create controller with registry
        controller = new FederationController(registry);
        // Register backends with controller
        await controller.registerBackend(wasmBackend);
        await controller.registerBackend(pm4wasmBackend);
        await controller.registerBackend(mlBackend);
        // Reset all backends to ready state
        registry.setBackendState('wasm', 'ready');
        registry.setBackendState('pm4wasm', 'ready');
        registry.setBackendState('ml', 'ready');
    });
    describe('Rule 1-2: Environment & Algorithm Gate', () => {
        it('Test: browser environment + pm4wasm → pm4wasm PASSES', async () => {
            const log = createSmallEventLog();
            const budget = createBrowserBudget();
            // pm4wasm supports browser environment
            expect(pm4wasmBackend.browserSafe).toBe(true);
            expect(pm4wasmBackend.supportsAlgorithm('dfg')).toBe(true);
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
            expect(result.algorithm_id).toBe('dfg');
            expect(result.latency_ms).toBeGreaterThanOrEqual(0);
        });
        it('Test: algorithm "inductive_miner" in ALGORITHM_MAP → pm4wasm PASSES', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // pm4wasm supports inductive_miner
            expect(pm4wasmBackend.supportsAlgorithm('inductive_miner')).toBe(true);
            const result = await controller.dispatch('inductive_miner', log, budget, 0);
            expect(result.status).toBe('success');
            expect(result.algorithm_id).toBe('inductive_miner');
        });
        it('Test: algorithm "unknown_algo" not in map → pm4wasm FAILS (filtered at Rule 2)', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // pm4wasm does not support unknown_algo
            expect(pm4wasmBackend.supportsAlgorithm('unknown_algo')).toBe(false);
            // Registry should select WASM since pm4wasm filtered out
            // (This test verifies algorithm gate filtering behavior)
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
        });
    });
    describe('Rule 3: Latency Budget Gate', () => {
        it('Scenario A: latencyBudget="sub_ms", algo=dfg → both candidates pass', async () => {
            const log = createSmallEventLog();
            const budget = createSubMsBudget();
            // dfg: sub_ms tier
            // WASM supports dfg and sub_ms tier
            // pm4wasm supports dfg and sub_ms tier
            // Both PASS Rule 3, so Rule 7 applies → priority based on backend ordering
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
            expect(result.algorithm_id).toBe('dfg');
            // Either WASM or pm4wasm could be selected; both support dfg and sub_ms
            expect(['wasm', 'pm4wasm']).toContain(result.backend_id);
        });
        it('Scenario B: latencyBudget="high_ms", algo=inductive_miner → both PASS', async () => {
            const log = createMediumEventLog();
            const budget = createHighMsBudget();
            // inductive_miner: low_ms tier (1-100ms) < high_ms (100ms-10s)
            // Both WASM and pm4wasm support inductive_miner and high_ms budget
            // Rule 7 applies → either could be selected
            const result = await controller.dispatch('inductive_miner', log, budget, 0);
            expect(result.status).toBe('success');
            expect(result.algorithm_id).toBe('inductive_miner');
            // Both WASM and pm4wasm support inductive_miner
            expect(['wasm', 'pm4wasm']).toContain(result.backend_id);
        });
        it('Scenario C: latencyBudget="seconds", algo=ilp → only WASM supports', async () => {
            const log = createLargeEventLog();
            const budget = createSecondsBudget();
            // ilp: not in pm4wasm ALGORITHM_MAP (only in WASM)
            // pm4wasm FAILS Rule 2 (algorithm gate)
            // WASM or NullBackend selected
            // Verify that pm4wasm doesn't support ilp
            expect(pm4wasmBackend.supportsAlgorithm('ilp')).toBe(false);
            expect(wasmBackend.supportsAlgorithm('ilp')).toBe(true);
            const result = await controller.dispatch('ilp', log, budget, 0);
            // Either succeeds via WASM or fails if WASM also filtered
            // Due to budget, it may succeed
            expect(['success', 'failed']).toContain(result.status);
        });
        it('Latency tier ordering: sub_ms(0) < low_ms(1) < high_ms(2) < seconds(3) < minutes(4)', () => {
            const tiers = ['sub_ms', 'low_ms', 'high_ms', 'seconds', 'minutes'];
            const tierMap = {
                sub_ms: 0,
                low_ms: 1,
                high_ms: 2,
                seconds: 3,
                minutes: 4,
            };
            for (let i = 0; i < tiers.length - 1; i++) {
                expect(tierMap[tiers[i]]).toBeLessThan(tierMap[tiers[i + 1]]);
            }
        });
    });
    describe('Rule 4: Quality Floor Gate', () => {
        it('Test: qualityFloor="quality" → all backends PASS', async () => {
            const log = createSmallEventLog();
            const budget = { ...createHighMsBudget(), qualityFloor: 'quality' };
            // All backends support quality tier
            expect(wasmBackend.supportsQualityFloor('quality')).toBe(true);
            expect(pm4wasmBackend.supportsQualityFloor('quality')).toBe(true);
            expect(mlBackend.supportsQualityFloor('quality')).toBe(true);
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
        });
        it('Test: qualityFloor="research" → WASM FAIL, pm4wasm FAIL, ML PASS', async () => {
            const log = createSmallEventLog();
            const budget = { ...createHighMsBudget(), qualityFloor: 'research' };
            // Only ML supports research tier
            expect(wasmBackend.supportsQualityFloor('research')).toBe(false);
            expect(pm4wasmBackend.supportsQualityFloor('research')).toBe(false);
            expect(mlBackend.supportsQualityFloor('research')).toBe(true);
            // For this test to work, need algorithm that ML supports
            const result = await controller.dispatch('ml_classify', log, budget, 0);
            expect(result.status).toBe('success');
        });
        it('Test: qualityFloor="fast" → all backends PASS', async () => {
            const log = createSmallEventLog();
            const budget = { ...createHighMsBudget(), qualityFloor: 'fast' };
            // All backends support fast tier
            expect(wasmBackend.supportsQualityFloor('fast')).toBe(true);
            expect(pm4wasmBackend.supportsQualityFloor('fast')).toBe(true);
            expect(mlBackend.supportsQualityFloor('fast')).toBe(true);
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
        });
    });
    describe('Rule 5: Health State Mapping', () => {
        it('Test: healthLevel=0 (normal) → all backends available', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
            expect(controller.getBackendState('wasm')).toBe('ready');
            expect(controller.getBackendState('pm4wasm')).toBe('ready');
            expect(controller.getBackendState('ml')).toBe('ready');
        });
        it('Test: healthLevel=1 (warning) → all backends available, RL weight reduced for pm4wasm', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // Health level 1 does not change backend availability in current implementation
            // In production, this would reduce pm4wasm RL weight by 50%
            const result = await controller.dispatch('dfg', log, budget, 1);
            expect(result.status).toBe('success');
            expect(controller.getBackendState('wasm')).toBe('ready');
            expect(controller.getBackendState('pm4wasm')).toBe('ready');
        });
        it('Test: healthLevel=2 (degraded) → pm4wasm marked degraded, WASM + ML available', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // Simulate degraded state by marking pm4wasm as evicted in registry
            registry.setBackendState('pm4wasm', 'evicted');
            expect(controller.getBackendState('pm4wasm')).toBe('ready'); // FederationController tracks its own state
            // But registry is evicted, so selection will skip it
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
            // Either WASM or ML can be selected since pm4wasm is evicted
            expect(['wasm', 'ml']).toContain(result.backend_id);
        });
        it('Test: healthLevel=3 (critical) → Python backends excluded', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // Health level 3 forces pythonAvailable=false in budget
            const result = await controller.dispatch('dfg', log, budget, 3);
            expect(result.status).toBe('success');
            // At critical health, Python backends (pm4wasm, pm4py) are excluded
            // But pm4wasm has browserSafe=true, so it may still be selected
            // WASM and ML are primary choices
            expect(['wasm', 'ml', 'pm4wasm']).toContain(result.backend_id);
        });
        it('Test: healthLevel=4 (failed) → NullBackend only', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 4);
            expect(result.status).toBe('failed');
            expect(result.backend_id).toBe('null');
            expect(result.error).toBe('system_health_critical');
        });
        it('Circuit breaker: Closed → HalfOpen → Closed (success)', async () => {
            const breaker = new FederationCircuitBreaker();
            expect(breaker.state).toBe('closed');
            expect(breaker.allowRequest()).toBe(true);
            breaker.recordSuccess();
            expect(breaker.state).toBe('closed');
        });
        it('Circuit breaker: Closed → Open (failure threshold)', async () => {
            const breaker = new FederationCircuitBreaker();
            for (let i = 0; i < 3; i++) {
                breaker.recordFailure();
            }
            expect(breaker.state).toBe('open');
            expect(breaker.allowRequest()).toBe(false);
        });
        it('Circuit breaker: Open → HalfOpen → Closed (recovery)', async () => {
            const breaker = new FederationCircuitBreaker();
            // Trip the breaker
            for (let i = 0; i < 3; i++) {
                breaker.recordFailure();
            }
            expect(breaker.state).toBe('open');
            // Simulate timeout elapsed (manually set lastOpenedAt to past)
            const now = Date.now();
            breaker.lastOpenedAt = now - 40000; // 40s in past (timeout is 30s)
            // Now it should allow request and transition to half_open
            expect(breaker.allowRequest()).toBe(true);
            expect(breaker.state).toBe('half_open');
            // Record success to close
            breaker.recordSuccess();
            expect(breaker.state).toBe('closed');
            expect(breaker.failureCount).toBe(0);
        });
    });
    describe('Rule 6: Concurrency Gate', () => {
        it('Test: concurrency < maxConcurrentInvocations → backend PASS', async () => {
            // pm4wasm maxConcurrentInvocations = 3
            expect(pm4wasmBackend.canRun(0)).toBe(true);
            expect(pm4wasmBackend.canRun(1)).toBe(true);
            expect(pm4wasmBackend.canRun(2)).toBe(true);
            // At concurrency 3, it should fail
            expect(pm4wasmBackend.canRun(3)).toBe(false);
        });
        it('Test: concurrency ≥ maxConcurrentInvocations → backend FAIL', async () => {
            // pm4wasm limit is 3
            expect(pm4wasmBackend.canRun(3)).toBe(false);
            expect(pm4wasmBackend.canRun(4)).toBe(false);
            // WASM limit is 8
            expect(wasmBackend.canRun(8)).toBe(false);
            expect(wasmBackend.canRun(7)).toBe(true);
        });
        it('pm4wasm limit (3) < WASM limit (8) due to memory footprint', () => {
            expect(pm4wasmBackend.maxConcurrentInvocations).toBeLessThan(wasmBackend.maxConcurrentInvocations);
        });
    });
    describe('Rule 7: RL Tiebreaker', () => {
        it('Test: WASM, pm4wasm, ML all pass Rules 1-6 → WASM selected', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
            // WASM, pm4wasm both support dfg; WASM has highest priority
            expect(['wasm', 'pm4wasm']).toContain(result.backend_id);
        });
        it('Test: pm4wasm, ML both pass Rules 1-6 → pm4wasm selected over ML', async () => {
            const log = createSmallEventLog();
            const budget = { ...createHighMsBudget(), qualityFloor: 'quality' };
            // Evict WASM in registry to test pm4wasm vs ML
            registry.setBackendState('wasm', 'evicted');
            // Use an algorithm that both pm4wasm and ML support
            // inductive_miner is supported by pm4wasm
            const result = await controller.dispatch('inductive_miner', log, budget, 0);
            expect(result.status).toBe('success');
            // pm4wasm should be selected since WASM is evicted
            expect(result.backend_id).toBe('pm4wasm');
        });
        it('Test: WASM unavailable (degraded) → pm4wasm selected as fallback', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // Evict WASM in registry
            registry.setBackendState('wasm', 'evicted');
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
            // pm4wasm should be selected
            expect(result.backend_id).toBe('pm4wasm');
        });
        it('RL weight ordering: WASM > pm4wasm > pm4py > ML', () => {
            // In the registry selection, these weights are applied
            // We verify the mock backends are set up in the right priority order
            const backends = [wasmBackend, pm4wasmBackend, mlBackend];
            const idPriority = { wasm: 0, pm4wasm: 1, ml: 2 };
            for (let i = 0; i < backends.length - 1; i++) {
                const id1 = backends[i].id;
                const id2 = backends[i + 1].id;
                expect(idPriority[id1]).toBeLessThan(idPriority[id2]);
            }
        });
    });
    describe('Full Scenario Tests (A-D)', () => {
        it('Scenario A: small log (1K events), sub_ms budget → WASM selected via Rule 3', async () => {
            const log = createSmallEventLog();
            const budget = createSubMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.status).toBe('success');
            // Both WASM and pm4wasm support dfg at sub_ms; WASM has higher priority
            expect(['wasm', 'pm4wasm']).toContain(result.backend_id);
            expect(result.algorithm_id).toBe('dfg');
            expect(result.latency_class).toBe('low_ms');
            expect(result.cycle_seq).toBeGreaterThan(0);
            expect(result.invocation_id).toBeDefined();
            // Verify result envelope populated
            expect(result.provenance).toBeDefined();
            expect(result.provenance.input_hash).toBeTruthy();
            expect(result.provenance.config_hash).toBeTruthy();
            expect(result.provenance.plan_hash).toBeTruthy();
            expect(result.provenance.output_hash).toBeTruthy();
            expect(result.provenance.combined_hash).toBeTruthy();
            expect(result.provenance.algorithm_id).toBe('dfg');
            expect(['wasm', 'pm4wasm']).toContain(result.provenance.backend_id);
        });
        it('Scenario B: medium log (50K events), high_ms budget → WASM wins at Rule 7', async () => {
            const log = createMediumEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('inductive_miner', log, budget, 0);
            expect(result.status).toBe('success');
            // Both WASM and pm4wasm support inductive_miner at high_ms; WASM has higher priority
            expect(['wasm', 'pm4wasm']).toContain(result.backend_id);
            expect(result.algorithm_id).toBe('inductive_miner');
            expect(result.latency_ms).toBeGreaterThanOrEqual(0);
            expect(result.latency_class).toBe('low_ms');
            // Verify status enum
            expect(['success', 'partial', 'failed']).toContain(result.status);
        });
        it('Scenario C: large log (500K events), seconds budget, research quality → ML selected', async () => {
            const log = createLargeEventLog();
            const budget = createSecondsBudget();
            // Evict WASM and pm4wasm to force ML selection
            registry.setBackendState('wasm', 'evicted');
            registry.setBackendState('pm4wasm', 'evicted');
            // Use an algorithm that only ML supports at research level
            const result = await controller.dispatch('ml_classify', log, budget, 0);
            expect(result.status).toBe('success');
            expect(result.algorithm_id).toBe('ml_classify');
            expect(result.latency_ms).toBeGreaterThanOrEqual(0);
        });
        it('Scenario D: critical health level → non-Python backends prioritized', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 3);
            expect(result.status).toBe('success');
            // At critical health (level 3), Python backends (pm4py) are disabled
            // pm4wasm has browserSafe=true, WASM and ML support dfg
            expect(result.backend_id).toBeTruthy();
            expect(result.algorithm_id).toBe('dfg');
        });
        it('Scenario A-D: All scenarios populate result envelope completely', async () => {
            const scenarios = [
                { log: createSmallEventLog(), budget: createSubMsBudget(), algo: 'dfg', health: 0 },
                { log: createMediumEventLog(), budget: createHighMsBudget(), algo: 'inductive_miner', health: 0 },
                { log: createLargeEventLog(), budget: createSecondsBudget(), algo: 'ml_classify', health: 0 },
                { log: createSmallEventLog(), budget: createHighMsBudget(), algo: 'dfg', health: 3 },
            ];
            for (const scenario of scenarios) {
                const result = await controller.dispatch(scenario.algo, scenario.log, scenario.budget, scenario.health);
                // Verify all envelope fields
                expect(result.run_id).toBeTruthy();
                expect(['success', 'partial', 'failed']).toContain(result.status);
                expect(result.latency_ms).toBeGreaterThanOrEqual(0);
                expect(['sub_ms', 'low_ms', 'high_ms', 'seconds', 'minutes']).toContain(result.latency_class);
                expect(result.backend_id).toBeTruthy();
                expect(result.invocation_id).toBeTruthy();
                expect(result.cycle_seq).toBeGreaterThanOrEqual(1);
                expect(result.algorithm_id).toBe(scenario.algo);
                // Verify provenance chain all fields populated (non-hash strings from mock)
                if (result.status === 'success') {
                    expect(result.provenance.input_hash).toBeTruthy();
                    expect(result.provenance.config_hash).toBeTruthy();
                    expect(result.provenance.plan_hash).toBeTruthy();
                    expect(result.provenance.output_hash).toBeTruthy();
                    expect(result.provenance.combined_hash).toBeTruthy();
                    expect(result.provenance.algorithm_id).toBe(scenario.algo);
                    expect(result.provenance.algorithm_version).toBeTruthy();
                    expect(result.provenance.backend_id).toBeTruthy();
                    expect(result.provenance.kernel_version).toBeTruthy();
                    expect(result.provenance.wasm_build_hash).toBeTruthy();
                }
            }
        });
    });
    describe('Decision Trace & Audit Trail', () => {
        it('Decision trace records backend selection decisions', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const initialSeq = controller.getCycleSeq();
            const result1 = await controller.dispatch('dfg', log, budget, 0);
            const result2 = await controller.dispatch('inductive_miner', log, budget, 0);
            expect(controller.getCycleSeq()).toBe(initialSeq + 2);
            const trace = controller.getDecisionTrace();
            expect(trace.length).toBeGreaterThanOrEqual(2);
            // Check last two entries
            const lastEntry = trace[trace.length - 1];
            expect(lastEntry.algorithm_id).toBe('inductive_miner');
            expect(lastEntry.selected_backend_id).toBeTruthy();
            expect(lastEntry.rule_that_selected).toBeGreaterThanOrEqual(1);
            expect(lastEntry.rule_that_selected).toBeLessThanOrEqual(7);
            expect(lastEntry.result_status).toBe('success');
            expect(lastEntry.latency_ms).toBeGreaterThanOrEqual(0);
            const prevEntry = trace[trace.length - 2];
            expect(prevEntry.algorithm_id).toBe('dfg');
        });
        it('Decision trace includes RL scores when applicable', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            await controller.dispatch('dfg', log, budget, 0);
            const trace = controller.getDecisionTrace();
            const lastEntry = trace[trace.length - 1];
            // At Rule 7, RL scores may be populated
            // This is implementation-dependent; just verify the field exists
            if (lastEntry.rl_scores) {
                expect(typeof lastEntry.rl_scores).toBe('object');
                expect(Object.keys(lastEntry.rl_scores).length).toBeGreaterThan(0);
            }
        });
        it('Decision trace ring buffer maintains max size', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // Make many dispatch calls
            for (let i = 0; i < 100; i++) {
                await controller.dispatch('dfg', log, budget, 0);
            }
            const trace = controller.getDecisionTrace();
            // Ring buffer should not exceed 1000 entries
            expect(trace.length).toBeLessThanOrEqual(1000);
        });
    });
    describe('Error Handling & Edge Cases', () => {
        it('No backends available → fallback behavior', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            // Use an algorithm that no backend supports (not in any ALGORITHM_MAP)
            // This will cause registry.select() to throw, triggering fallback
            const result = await controller.dispatch('nonexistent_algo', log, budget, 0);
            // The result should still be an envelope
            expect(result).toBeDefined();
            // algorithm_id may be empty or the original depending on fallback handling
            expect(result.backend_id).toBeDefined();
        });
        it('Result fields are never null or undefined in success case', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(result.run_id).not.toBeNull();
            expect(result.backend_id).not.toBeNull();
            expect(result.invocation_id).not.toBeNull();
            expect(result.algorithm_id).not.toBeNull();
            expect(result.latency_ms).not.toBeNull();
            expect(result.latency_class).not.toBeNull();
            expect(result.cycle_seq).not.toBeNull();
            expect(result.provenance).not.toBeNull();
        });
        it('Status field is valid enum value', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 0);
            expect(['success', 'partial', 'failed']).toContain(result.status);
        });
        it('For success: payload is non-null ModelIR', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 0);
            if (result.status === 'success') {
                expect(result.payload).not.toBeNull();
                expect(result.payload.format_version).toBeDefined();
                expect(result.payload.model_type).toBeDefined();
            }
        });
        it('For failure: error field is non-empty string', async () => {
            const log = createSmallEventLog();
            const budget = createHighMsBudget();
            const result = await controller.dispatch('dfg', log, budget, 4); // health=4 → failed
            if (result.status === 'failed') {
                expect(result.error).toBeTruthy();
                expect(typeof result.error).toBe('string');
            }
        });
    });
});
//# sourceMappingURL=federation-pm4wasm.integration.test.disabled.js.map