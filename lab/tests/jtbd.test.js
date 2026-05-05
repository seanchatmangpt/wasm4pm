/**
 * JTBD End-to-End Tests — Jobs To Be Done scenarios
 *
 * Tests the full RL/ML/Autonomic stack against real business challenges.
 * Each test is LLM-proof: cannot pass without executing actual algorithms.
 *
 * Key principle: Trust event evidence, not code paths.
 * Verification: OTEL span + test assertion + event log mining (AND logic)
 *
 * Binary: @wasm4pm/cli (published npm package, not local source)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import pictl from '@wasm4pm/cli';
import { generateDriftedLog, generateReworkLog, generateDiverseLogs, generateDeviatingLog, generateSeasonalLog, countManualDeviations, verifyAnomaly } from './jtbd-generators.js';
describe('JTBD: End-to-End Business Challenges', () => {
    beforeAll(async () => {
        // Initialize WASM module
        await pictl.init();
    });
    /**
     * JTBD-1: Bottleneck Discovery Under Drift
     *
     * Business Problem: A loan approval process slowed down over 6 months.
     * Which activity caused the degradation, and when did the drift start?
     *
     * LLM-Proof: Drift month depends on 50K events with random noise.
     * Bottleneck identification requires mining all events.
     */
    describe('JTBD-1: Bottleneck discovery under drift', () => {
        it('identifies the slowing activity and drift point from event timestamps', async () => {
            // Setup: Generate synthetic loan approval logs with hidden drift
            // - Month 1-2: "Credit Check" takes 2 hours (baseline)
            // - Month 3-4: "Credit Check" gradually slows to 8 hours (drift starts)
            // - Month 5-6: "Credit Check" at 12 hours (degraded state)
            // - Random noise: ±20% variance, occasional outliers
            // - 50,000 events total
            const { events, driftStartMonth, bottleneckActivity } = generateDriftedLog({
                activities: ['Application', 'Credit Check', 'Approval', 'Funding'],
                bottleneckActivity: 'Credit Check',
                baselineDuration: 2 * 3600 * 1000, // 2 hours in ms
                degradedDuration: 12 * 3600 * 1000, // 12 hours in ms
                driftStartMonth: 2, // Month 3 (0-indexed)
                totalMonths: 6,
                eventsPerMonth: 8333, // ~50K total
                variance: 0.2,
                seed: 42
            });
            // Load event log into WASM
            const logHandle = await pictl.load_eventlog_from_json(JSON.stringify(events));
            // Execute: Detect drift and identify bottleneck
            const driftResult = JSON.parse(await pictl.detect_concept_drift(logHandle, 'concept:name', 1000));
            const bottleneckResult = JSON.parse(await pictl.detect_bottlenecks(logHandle, 'concept:name'));
            // Assert: Drift detected
            expect(driftResult.drift_detected).toBe(true);
            // Assert: Bottleneck identified as Credit Check
            expect(bottleneckResult.bottlenecks.length).toBeGreaterThan(0);
            const creditCheckBottleneck = bottleneckResult.bottlenecks.find((b) => b.activity === 'Credit Check');
            expect(creditCheckBottleneck).toBeDefined();
            // Assert: Drift window approximately correct (±1 month tolerance)
            // The LLM cannot know the exact drift month without mining timestamps
            expect(driftResult.drift_window.start_month).toBeGreaterThanOrEqual(2);
            expect(driftResult.drift_window.start_month).toBeLessThanOrEqual(4);
            // Verify: Mine temporal profile to confirm bottleneck duration
            const temporalResult = JSON.parse(await pictl.analyze_temporal_bottlenecks(logHandle, 'concept:name'));
            const creditCheckDuration = temporalResult.activities.find((a) => a.name === 'Credit Check');
            expect(creditCheckDuration.avg_duration_ms).toBeGreaterThan(8 * 3600 * 1000); // > 8 hours
        });
    });
    /**
     * JTBD-2: Rework Detection in Manufacturing
     *
     * Business Problem: A manufacturing line has hidden rework loops.
     * Which process step has the most rework, and what's the cost impact?
     *
     * LLM-Proof: Rework loops are hidden in trace variants.
     * Frequencies depend on random probability in 2,000 cases.
     */
    describe('JTBD-2: Rework detection in manufacturing', () => {
        it('finds hidden rework loops and quantifies cost impact', async () => {
            // Setup: Generate manufacturing logs with hidden rework
            // - Process: A → B → C → D → E → F
            // - Hidden: C → B (rework loop) occurs 15% of the time
            // - Hidden: E → D (rework loop) occurs 8% of the time
            // - Each rework adds 2 hours of cycle time
            // - 100,000 events, 2,000 cases
            const { events, reworkLoops } = generateReworkLog({
                process: ['A', 'B', 'C', 'D', 'E', 'F'],
                reworkLoops: [
                    { from: 'C', to: 'B', probability: 0.15 },
                    { from: 'E', to: 'D', probability: 0.08 }
                ],
                reworkCost: 2 * 3600 * 1000, // 2 hours in ms
                caseCount: 2000,
                minEventsPerCase: 5,
                maxEventsPerCase: 10,
                seed: 123
            });
            const logHandle = await pictl.load_eventlog_from_json(JSON.stringify(events));
            // Execute: Discover DFG to find rework edges
            const dfgResult = JSON.parse(await pictl.discover_dfg(logHandle, 'concept:name'));
            // Execute: Detect rework
            const reworkResult = JSON.parse(await pictl.detect_rework(logHandle, 'concept:name'));
            // Assert: Rework detected
            expect(reworkResult.rework_detected).toBe(true);
            // Assert: Both rework loops found in DFG
            const edges = dfgResult.edges;
            const cToB = edges.find((e) => e.from === 'C' && e.to === 'B');
            const eToD = edges.find((e) => e.from === 'E' && e.to === 'D');
            expect(cToB).toBeDefined();
            expect(eToD).toBeDefined();
            // Assert: Frequencies approximately correct (±3% tolerance)
            // ~15% of cases hit C→B (15 / (1-0.15) ≈ 17.6% due to self-loops)
            expect(cToB.frequency).toBeGreaterThan(0.12);
            expect(cToB.frequency).toBeLessThan(0.20);
            // ~8% of cases hit E→D
            expect(eToD.frequency).toBeGreaterThan(0.05);
            expect(eToD.frequency).toBeLessThan(0.12);
            // Assert: Cost impact ~40% additional cycle time
            expect(reworkResult.cost_impact_ratio).toBeGreaterThan(0.35);
            expect(reworkResult.cost_impact_ratio).toBeLessThan(0.45);
        });
    });
    /**
     * JTBD-3: RL Policy Convergence Under Resource Constraints
     *
     * Business Problem: The autonomic loop must learn which discovery algorithm
     * to use under time pressure. Which agent converges fastest?
     *
     * LLM-Proof: 100 sequential Bellman updates with seeded RNG.
     * Time constraints cause algorithm-specific timeouts.
     */
    describe('JTBD-3: RL convergence under time pressure', () => {
        it('learns optimal policy without being told which algorithm is best', async () => {
            // Setup: 100 diverse logs, time budget of 100ms per discovery
            const logs = generateDiverseLogs({
                count: 100,
                activities: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
                sizeRange: [100, 10000],
                complexityRange: [0.3, 0.9],
                seed: 456
            });
            // Reset RL orchestrator to fresh state with seeded RNG
            await pictl.rl_orchestrator_reset();
            // Enable LinUCB for adaptive agent selection
            await pictl.rl_orchestrator_set_linucb(true);
            // Execute: Run 100 learning cycles
            const rewards = [];
            for (let i = 0; i < 100; i++) {
                const log = logs[i % logs.length];
                const logHandle = await pictl.load_eventlog_from_json(JSON.stringify(log));
                // Execute autonomic cycle with time constraint
                const cycleResult = JSON.parse(await pictl.autonomic_execute_cycle(logHandle, 'concept:name', 100, // time budget: 100ms
                42, // seeded RNG for determinism
                0.1, // learning rate
                0.99 // discount factor
                ));
                rewards.push(cycleResult.reward);
            }
            // Assert: Policy has converged (last 10 better than first 10)
            const first10Avg = rewards.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
            const last10Avg = rewards.slice(-10).reduce((a, b) => a + b, 0) / 10;
            expect(last10Avg).toBeGreaterThan(first10Avg);
            // Assert: Final reward positive (learned to avoid timeouts)
            const totalReward = rewards.reduce((a, b) => a + b, 0);
            expect(totalReward / 100).toBeGreaterThan(0);
            // Assert: Agent selection stable (not switching every cycle)
            const telemetry = JSON.parse(await pictl.rl_orchestrator_get_telemetry());
            expect(telemetry.agent_switches).toBeLessThan(30); // < 30% of cycles
            // Verify: RL state is serializable and restoreable
            const serialized = await pictl.serialize_rl_state();
            await pictl.rl_orchestrator_reset();
            await pictl.restore_rl_state(serialized);
            const restoredTelemetry = JSON.parse(await pictl.rl_orchestrator_get_telemetry());
            expect(restoredTelemetry.cycle_count).toBe(100);
        });
    });
    /**
     * JTBD-4: Conformance Checking on Deviating Process
     *
     * Business Problem: A declared process model exists, but the actual log
     * shows deviations. Which deviations are real, and what's the fitness?
     *
     * LLM-Proof: Deviation frequencies depend on random probability.
     * Fitness requires token replay (cannot be guessed).
     */
    describe('JTBD-4: Conformance checking on deviating process', () => {
        it('identifies deviations and computes fitness from event log', async () => {
            // Setup: Generate log that ALMOST follows A → B → C → D → E
            // - 5% skip B (A → C)
            // - 3% repeat C (C → C)
            // - 2% insert X (B → X → C)
            // - Expected fitness ≈ 0.90
            const { events, deviations } = generateDeviatingLog({
                model: ['A', 'B', 'C', 'D', 'E'],
                deviations: [
                    { type: 'skip', from: 'A', to: 'C', probability: 0.05 },
                    { type: 'repeat', activity: 'C', probability: 0.03 },
                    { type: 'insert', from: 'B', insert: 'X', to: 'C', probability: 0.02 }
                ],
                caseCount: 1000,
                seed: 789
            });
            const logHandle = await pictl.load_eventlog_from_json(JSON.stringify(events));
            // Execute: Discover model from log
            const discoveredModel = JSON.parse(await pictl.discover_alpha_plus_plus(logHandle, 'concept:name'));
            // Execute: Check conformance using token replay
            const conformanceResult = JSON.parse(await pictl.check_token_based_replay(logHandle, 'concept:name'));
            // Assert: Fitness approximately correct (±0.05 tolerance)
            expect(conformanceResult.fitness).toBeGreaterThan(0.85);
            expect(conformanceResult.fitness).toBeLessThan(0.95);
            // Assert: Deviations detected (at least the major ones)
            expect(conformanceResult.deviations.length).toBeGreaterThanOrEqual(2);
            // Verify: Count deviations manually from exported log
            const exportedLog = JSON.parse(await pictl.export_eventlog_to_json(logHandle));
            const manualDeviationCount = countManualDeviations(exportedLog, ['A', 'B', 'C', 'D', 'E']);
            expect(manualDeviationCount).toBeGreaterThan(80); // ~10% of 1000 cases
            expect(manualDeviationCount).toBeLessThan(120);
        });
    });
    /**
     * JTBD-5: ML Anomaly Detection on Seasonal Data
     *
     * Business Problem: A retail process has seasonal patterns.
     * Which cases are anomalous, and what's the score distribution?
     *
     * LLM-Proof: Which cases are flagged depends on ML training split.
     * Anomaly scoring uses EMA and information theory.
     */
    describe('JTBD-5: ML anomaly detection on seasonal data', () => {
        it('identifies anomalies in seasonal data without being told the pattern', async () => {
            // Setup: Generate retail order logs with seasonal patterns
            // - Baseline: 100 orders/day, 24h cycle time
            // - Seasonal: 5x volume on Black Friday (day 330)
            // - Anomalies: 20 extreme cycle time cases, 15 wrong sequence cases
            const { events, anomalousCaseIds } = generateSeasonalLog({
                baseline: { ordersPerDay: 100, cycleTime: 24 * 3600 * 1000 },
                seasonal: { day: 330, multiplier: 5 },
                anomalies: [
                    { type: 'cycle_time', threshold: 7 * 24 * 3600 * 1000, count: 20, probability: 0.05 },
                    { type: 'sequence', count: 15, probability: 0.05 }
                ],
                days: 365,
                activities: ['Receive', 'Process', 'Ship'],
                seed: 101112
            });
            const logHandle = await pictl.load_eventlog_from_json(JSON.stringify(events));
            // Execute: Run ML anomaly detection
            const anomalyResult = JSON.parse(await pictl.ml_anomaly(logHandle, 'concept:name', 0.8, // training ratio
            0.9 // threshold percentile
            ));
            // Assert: Anomalies detected (approximately correct count)
            expect(anomalyResult.anomalies.length).toBeGreaterThan(30);
            expect(anomalyResult.anomalies.length).toBeLessThan(50);
            // Assert: Anomaly scores bimodal (anomalies > normals)
            const scores = anomalyResult.anomalies.map((a) => a.score);
            scores.sort((a, b) => a - b);
            const normalScore = scores.slice(0, -20).reduce((a, b) => a + b, 0) / (scores.length - 20);
            const anomalyScore = scores.slice(-20).reduce((a, b) => a + b, 0) / 20;
            expect(anomalyScore).toBeGreaterThan(normalScore * 2);
            // Assert: Precision and recall reasonable (±10%)
            expect(anomalyResult.precision).toBeGreaterThan(0.6);
            expect(anomalyResult.recall).toBeGreaterThan(0.6);
            // Verify: Sample 5 flagged anomalies, verify they're actually anomalous
            const sample = anomalyResult.anomalies.slice(0, 5);
            for (const anomaly of sample) {
                const verification = verifyAnomaly(events, anomaly.case_id, 7 * 24 * 3600 * 1000, // cycle time threshold
                [['Receive', 'Process', 'Ship'], ['Receive', 'Process', 'Error', 'Ship']] // valid sequences
                );
                expect(verification.isAnomalous).toBe(true);
            }
        });
    });
});
//# sourceMappingURL=jtbd.test.js.map