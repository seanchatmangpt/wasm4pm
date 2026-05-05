/**
 * Planner Policy and Budget Enforcement
 *
 * Section 4 of the Three-Layer Architecture Specification.
 * Implements backend selection rules, algorithm decision tables, and job promotion/degradation.
 */
import { latencyTierLte, } from '@wasm4pm/contracts';
/**
 * Section 4.2: Seven-Priority Engine Selection Rule Table
 * Applied in priority order; first matching rule wins.
 *
 * Returns the backend ID that should handle the algorithm, or null if no rule matched.
 * At null, rule 7 (general selection algorithm) applies.
 *
 * Invariants:
 * - Rules 1–6 are deterministic decision paths.
 * - Rule 7 defers to the general 7-rule selection algorithm (Section 3.5).
 * - RL tiebreaker applies only at rule 7, never overriding rules 1–6.
 */
export function selectEngineByPriority(algorithmId, budget, pythonAvailable, algorithmFamily) {
    // Rule 1: mode == "research" → route to pm4py regardless of latency
    if (budget.mode === 'research') {
        if (pythonAvailable)
            return 'pm4py';
        // pm4py not available in research mode; fall through to rule 7
    }
    // Rule 2: mode == "batch" → route to pm4py if available; else WASM
    if (budget.mode === 'batch') {
        if (pythonAvailable)
            return 'pm4py';
        return 'wasm';
    }
    // Rule 3: environment.browserSafe == true → force WASM only
    if (budget.environment.browserSafe) {
        return 'wasm';
    }
    // Rule 4: qualityFloor == "research" → route to pm4py if available
    if (budget.qualityFloor === 'research') {
        if (pythonAvailable)
            return 'pm4py';
        // Fall through to rule 7
    }
    // Rule 5: latencyBudget == "sub_ms" → force WASM only
    if (budget.latencyBudget === 'sub_ms') {
        return 'wasm';
    }
    // Rule 6: algorithmId in ML family → route to MlBackend
    if (algorithmFamily === 'ml' || isMLAlgorithm(algorithmId)) {
        return 'ml';
    }
    // Rule 7: No other rule matched → apply general selection algorithm (Section 3.5)
    // Return null to signal that the 7-rule selection algorithm should be used
    return null;
}
/**
 * Helper to detect if an algorithm ID belongs to the ML family.
 */
function isMLAlgorithm(algorithmId) {
    const mlIds = [
        'ml_classify',
        'ml_cluster',
        'ml_forecast',
        'ml_anomaly',
        'ml_regress',
        'ml_pca',
    ];
    return mlIds.includes(algorithmId);
}
/**
 * Section 4.3: Algorithm Selection Decision Table
 *
 * Maps (latencyBudget, qualityFloor) → list of candidate algorithm IDs.
 * This table governs which algorithms the planner considers for a given budget constraint.
 *
 * The decision table is the source of truth for algorithm selection based on budget.
 * Higher-tier algorithms (ilp, genetic) are only selected when quality and latency budgets permit.
 */
export function selectAlgorithmByBudget(latencyBudget, qualityFloor) {
    // sub_ms + fast/balanced: only fast algorithms (dfg, streaming)
    if (latencyBudget === 'sub_ms') {
        if (qualityFloor === 'fast' || qualityFloor === 'balanced') {
            return ['dfg', 'simd_streaming_dfg'];
        }
    }
    // low_ms + fast: fast discovery algorithms
    if (latencyBudget === 'low_ms' && qualityFloor === 'fast') {
        return ['dfg', 'heuristic_miner'];
    }
    // low_ms + balanced: heuristic and alpha (faster than genetic)
    if (latencyBudget === 'low_ms' && qualityFloor === 'balanced') {
        return ['inductive_miner', 'alpha_plus_plus'];
    }
    // high_ms + balanced: inductive and simulated annealing
    if (latencyBudget === 'high_ms' && qualityFloor === 'balanced') {
        return ['inductive_miner', 'simulated_annealing'];
    }
    // high_ms + quality: genetic algorithms and swarm (quality-first)
    if (latencyBudget === 'high_ms' && qualityFloor === 'quality') {
        return ['genetic_algorithm', 'aco', 'pso'];
    }
    // seconds + quality: ILP and optimized DFG (highest quality for discovery)
    if (latencyBudget === 'seconds' && qualityFloor === 'quality') {
        return ['ilp', 'optimized_dfg'];
    }
    // seconds + research: ILP and pm4py-only algorithms
    if (latencyBudget === 'seconds' && qualityFloor === 'research') {
        return ['ilp', 'pm4py_alpha_miner', 'pm4py_heuristics_miner', 'pm4py_inductive_miner'];
    }
    // minutes + research: full conformance suite (alignments, advanced analyses)
    if (latencyBudget === 'minutes' && qualityFloor === 'research') {
        return [
            'ilp',
            'pm4py_alpha_miner',
            'pm4py_heuristics_miner',
            'pm4py_inductive_miner',
            'pm4py_alignments',
        ];
    }
    // Default fallback: return dfg (fastest, most general)
    return ['dfg'];
}
/**
 * Section 4.5: Four Promotion Rules
 *
 * A pending or near-online job is promoted to a higher-priority queue when one of these conditions is met.
 * Returns true if the job should be promoted to a higher-priority tier.
 */
export function shouldPromoteJob(priorLatencyMs, priorLatencyBudget, newBudget, conformanceScore, spcAlertLevel, priorSpcAlertLevel, healthLevel, priorHealthLevel) {
    // Rule 1: Latency budget upgraded — user explicitly upgrades the budget on resubmit
    const latencyUpgraded = !latencyTierLte(newBudget.latencyBudget, priorLatencyBudget);
    if (latencyUpgraded) {
        return true;
    }
    // Rule 2: Quality deficit detected — conformance score falls below qualityFloor
    // Map qualityFloor to a conformance threshold
    const qualityThreshold = {
        fast: 0.7,
        balanced: 0.8,
        quality: 0.85,
        research: 0.9,
    };
    const threshold = qualityThreshold[newBudget.qualityFloor];
    if (conformanceScore < threshold) {
        return true;
    }
    // Rule 3: SPC alert level increased — spc_alert_level rises since last dispatch
    if (spcAlertLevel > priorSpcAlertLevel) {
        return true;
    }
    // Rule 4: Health improved — health_level decreased since the job was enqueued
    if (healthLevel < priorHealthLevel) {
        return true;
    }
    return false;
}
/**
 * Section 4.6: Five Degradation Rules
 *
 * The planner downgrades the selected algorithm when one of these conditions is met.
 * Returns true if the algorithm should be demoted to a faster/cheaper alternative.
 *
 * Degradation rules apply after a job has run once and we have execution history.
 */
export function shouldDegradeAlgorithm(priorLatencyMs, latencyBudgetMs, priorMemoryBytes, memoryBudgetBytes, circuitOpen, backendHealthy, spcViolation) {
    // Rule 1: Memory exceeded — prior run exceeded memoryBudget; demote to next-cheaper algorithm
    if (memoryBudgetBytes > 0 && priorMemoryBytes > memoryBudgetBytes) {
        return true;
    }
    // Rule 2: Latency exceeded — prior run exceeded latencyBudget; demote to faster backend
    // Convert latency budget from LatencyClass to milliseconds
    if (priorLatencyMs > latencyBudgetMs) {
        return true;
    }
    // Rule 3: Circuit open — selected backend circuit breaker is open; skip to next available backend
    if (circuitOpen) {
        return true;
    }
    // Rule 4: Backend unhealthy — healthCheck() returned healthy: false; remove from candidate set
    if (!backendHealthy) {
        return true;
    }
    // Rule 5: SPC Rule 1 violation — a single result exceeded BENCH_NS_LIMIT; flag algorithm as "slow"
    if (spcViolation) {
        return true;
    }
    return false;
}
/**
 * Helper to convert execution profile to BudgetEnvelope.mode.
 * Used by the planner to derive mode from profile.
 *
 * Mapping (Section 5.8):
 * - fast → online
 * - balanced → online or near-online (by log size: >50K events → near-online)
 * - quality → near-online or batch (by algorithm: ilp/genetic → batch)
 * - stream → online (always)
 */
export function profileToExecutionMode(profile, eventCount, algorithmId) {
    switch (profile) {
        case 'fast':
            return 'online';
        case 'stream':
            return 'online';
        case 'balanced': {
            // balanced → online or near-online (by log size: >50K events → near-online)
            if (eventCount && eventCount > 50000) {
                return 'near-online';
            }
            return 'online';
        }
        case 'quality': {
            // quality → near-online or batch (by algorithm: ilp/genetic → batch)
            const batchAlgorithms = ['ilp', 'genetic_algorithm', 'aco', 'pso'];
            if (algorithmId && batchAlgorithms.some((id) => algorithmId.includes(id))) {
                return 'batch';
            }
            return 'near-online';
        }
        default:
            return 'online';
    }
}
/**
 * Helper to convert execution profile to latency budget.
 * Used by the planner to derive latencyBudget from profile.
 */
export function profileToLatencyBudget(profile) {
    switch (profile) {
        case 'fast':
            return 'sub_ms';
        case 'stream':
            return 'sub_ms';
        case 'balanced':
            return 'low_ms';
        case 'quality':
            return 'high_ms';
        default:
            return 'high_ms';
    }
}
/**
 * Helper to convert execution profile to quality floor.
 * Used by the planner to derive qualityFloor from profile.
 */
export function profileToQualityFloor(profile) {
    switch (profile) {
        case 'fast':
            return 'fast';
        case 'stream':
            return 'fast';
        case 'balanced':
            return 'balanced';
        case 'quality':
            return 'quality';
        default:
            return 'balanced';
    }
}
//# sourceMappingURL=policy.js.map