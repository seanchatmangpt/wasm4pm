/**
 * handlers.ts
 * Algorithm step handlers - execute algorithm steps from execution plans
 * Bridge between planner (algorithm name) and WASM module (function calls)
 */
import { PlanStepType } from '@wasm4pm/planner';
import { getRegistry } from './registry';
/**
 * Map PlanStepType to algorithm ID
 */
function stepTypeToAlgorithmId(stepType) {
    const mapping = {
        [PlanStepType.DISCOVER_DFG]: 'dfg',
        [PlanStepType.DISCOVER_PROCESS_SKELETON]: 'process_skeleton',
        [PlanStepType.DISCOVER_ALPHA_PLUS_PLUS]: 'alpha_plus_plus',
        [PlanStepType.DISCOVER_HEURISTIC]: 'heuristic_miner',
        [PlanStepType.DISCOVER_INDUCTIVE]: 'inductive_miner',
        [PlanStepType.DISCOVER_HILL_CLIMBING]: 'hill_climbing',
        [PlanStepType.DISCOVER_DECLARE]: 'declare',
        [PlanStepType.DISCOVER_GENETIC]: 'genetic_algorithm',
        [PlanStepType.DISCOVER_PSO]: 'pso',
        [PlanStepType.DISCOVER_A_STAR]: 'a_star',
        [PlanStepType.DISCOVER_ILP]: 'ilp',
        [PlanStepType.DISCOVER_ACO]: 'aco',
        [PlanStepType.DISCOVER_SIMULATED_ANNEALING]: 'simulated_annealing',
        [PlanStepType.DISCOVER_OPTIMIZED_DFG]: 'optimized_dfg',
        // POWL Discovery
        [PlanStepType.DISCOVER_POWL]: 'powl',
        [PlanStepType.DISCOVER_POWL_TREE]: 'powl_tree',
        [PlanStepType.DISCOVER_POWL_MAXIMAL]: 'powl_maximal',
        [PlanStepType.DISCOVER_POWL_DYNAMIC_CLUSTERING]: 'powl_dynamic_clustering',
        [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_MAX]: 'powl_decision_graph_max',
        [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_CLUSTERING]: 'powl_decision_graph_clustering',
        [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_CYCLIC]: 'powl_decision_graph_cyclic',
        [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_CYCLIC_STRICT]: 'powl_decision_graph_cyclic_strict',
        // Map these to non-discovery types (won't be found)
        [PlanStepType.BOOTSTRAP]: 'unknown',
        [PlanStepType.INIT_WASM]: 'unknown',
        [PlanStepType.LOAD_SOURCE]: 'unknown',
        [PlanStepType.VALIDATE_SOURCE]: 'unknown',
        [PlanStepType.ANALYZE_STATISTICS]: 'unknown',
        [PlanStepType.ANALYZE_CONFORMANCE]: 'unknown',
        [PlanStepType.ANALYZE_VARIANTS]: 'unknown',
        [PlanStepType.ANALYZE_PERFORMANCE]: 'unknown',
        [PlanStepType.ANALYZE_CLUSTERING]: 'unknown',
        [PlanStepType.FILTER_LOG]: 'unknown',
        [PlanStepType.TRANSFORM_LOG]: 'unknown',
        [PlanStepType.GENERATE_REPORTS]: 'unknown',
        [PlanStepType.WRITE_SINK]: 'unknown',
        [PlanStepType.CLEANUP]: 'unknown',
        // ML Analysis
        [PlanStepType.ML_CLASSIFY]: 'ml_classify',
        [PlanStepType.ML_CLUSTER]: 'ml_cluster',
        [PlanStepType.ML_FORECAST]: 'ml_forecast',
        [PlanStepType.ML_ANOMALY]: 'ml_anomaly',
        [PlanStepType.ML_REGRESS]: 'ml_regress',
        [PlanStepType.ML_PCA]: 'ml_pca',
    };
    return mapping[stepType] || 'unknown';
}
/**
 * Execute an algorithm step from an execution plan
 * Loads the WASM module, validates algorithm, and calls appropriate WASM function
 *
 * @param step Execution plan step (must be a discovery step)
 * @param wasmModule Initialized WASM module
 * @param eventLogHandle Handle to the loaded event log
 * @returns AlgorithmStepOutput with model handle and metadata
 * @throws Error if algorithm not found, WASM call fails, or validation fails
 */
export async function implementAlgorithmStep(step, wasmModule, eventLogHandle) {
    const startTime = Date.now();
    // Extract algorithm type from step type
    const algorithmId = stepTypeToAlgorithmId(step.type);
    // Look up algorithm metadata
    const registry = getRegistry();
    const metadata = registry.get(algorithmId);
    if (!metadata) {
        throw new Error(`Algorithm not found in registry: ${algorithmId} (step type: ${step.type}). ` +
            `Available algorithms: ${registry.list().map((a) => a.id).join(', ')}`);
    }
    // Extract parameters from step
    const params = step.parameters || {};
    const activityKey = params.activity_key || 'concept:name';
    // Validate required parameters
    for (const paramDef of metadata.parameters) {
        if (paramDef.required && !(paramDef.name in params)) {
            throw new Error(`Missing required parameter "${paramDef.name}" for algorithm "${metadata.name}". ` +
                `Expected type: ${paramDef.type}`);
        }
    }
    // Execute the appropriate WASM function
    let modelHandle;
    try {
        switch (algorithmId) {
            case 'dfg': {
                const result = await wasmModule.discover_dfg(eventLogHandle, activityKey);
                modelHandle = result.handle;
                break;
            }
            case 'process_skeleton': {
                // Process skeleton is actually DFG with minimal parameters
                const result = await wasmModule.discover_dfg(eventLogHandle, activityKey);
                modelHandle = result.handle;
                break;
            }
            case 'alpha_plus_plus': {
                const result = await wasmModule.discover_alpha_plus_plus(eventLogHandle, activityKey);
                modelHandle = result.handle;
                break;
            }
            case 'heuristic_miner': {
                const depThreshold = params.dependency_threshold || 0.5;
                const result = await wasmModule.discover_heuristic_miner(eventLogHandle, activityKey, depThreshold);
                modelHandle = result.handle;
                break;
            }
            case 'inductive_miner': {
                const noiseThreshold = params.noise_threshold || 0.2;
                const result = await wasmModule.discover_inductive_miner(eventLogHandle, activityKey, noiseThreshold);
                modelHandle = result.handle;
                break;
            }
            case 'genetic_algorithm': {
                const popSize = params.population_size || 50;
                const generations = params.generations || 100;
                const result = await wasmModule.discover_genetic_algorithm(eventLogHandle, activityKey, popSize, generations);
                modelHandle = result.handle;
                break;
            }
            case 'pso': {
                const swarmSize = params.swarm_size || 30;
                const iterations = params.iterations || 50;
                const result = await wasmModule.discover_pso_algorithm(eventLogHandle, activityKey, swarmSize, iterations);
                modelHandle = result.handle;
                break;
            }
            case 'a_star': {
                const maxIterations = params.max_iterations || 10000;
                const result = await wasmModule.discover_astar(eventLogHandle, activityKey, maxIterations);
                modelHandle = result.handle;
                break;
            }
            case 'hill_climbing': {
                const maxIterations = params.max_iterations || 100;
                const result = await wasmModule.discover_hill_climbing(eventLogHandle, activityKey, maxIterations);
                modelHandle = result.handle;
                break;
            }
            case 'ilp': {
                const timeout = params.timeout_seconds || 30;
                const result = await wasmModule.discover_ilp_petri_net(eventLogHandle, activityKey, timeout);
                modelHandle = result.handle;
                break;
            }
            case 'aco': {
                const colonySize = params.colony_size || 40;
                const iterations = params.iterations || 100;
                const result = await wasmModule.discover_ant_colony(eventLogHandle, activityKey, colonySize, iterations);
                modelHandle = result.handle;
                break;
            }
            case 'simulated_annealing': {
                const initialTemp = params.initial_temperature || 100;
                const coolingRate = params.cooling_rate || 0.95;
                const result = await wasmModule.discover_simulated_annealing(eventLogHandle, activityKey, initialTemp, coolingRate);
                modelHandle = result.handle;
                break;
            }
            case 'declare': {
                const supportThreshold = params.support_threshold || 0.8;
                const result = await wasmModule.discover_declare(eventLogHandle, activityKey, supportThreshold);
                modelHandle = result.handle;
                break;
            }
            case 'optimized_dfg': {
                const timeout = params.timeout_seconds || 15;
                const result = await wasmModule.discover_optimized_dfg(eventLogHandle, activityKey, timeout);
                modelHandle = result.handle;
                break;
            }
            // POWL Discovery variants
            case 'powl':
            case 'powl_tree':
            case 'powl_maximal':
            case 'powl_dynamic_clustering':
            case 'powl_decision_graph_max':
            case 'powl_decision_graph_clustering':
            case 'powl_decision_graph_cyclic':
            case 'powl_decision_graph_cyclic_strict': {
                // POWL discovery requires log JSON instead of handle
                // We need to get the log JSON from the event log handle first
                // For now, we'll use the basic discover_powl_from_log function
                const variant = params.variant || 'decision_graph_cyclic';
                // Get log JSON from WASM module (need to serialize the event log)
                // For now, we'll need to handle this differently since POWL functions take JSON
                const logJson = params.log_json;
                if (!logJson) {
                    throw new Error(`POWL discovery requires log_json parameter. ` +
                        `Use Kernel.run_powl() instead of Kernel.run() for POWL discovery.`);
                }
                const powlResult = await wasmModule.discover_powl_from_log(logJson, variant);
                // Store the POWL result as a handle
                // POWL results include: root, node_count, repr, variant
                modelHandle = JSON.stringify(powlResult);
                break;
            }
            // ── ML Analysis (dynamic import from @wasm4pm/ml) ──────
            case 'ml_classify': {
                const { classifyTraces } = await import('@wasm4pm/ml');
                const configJson = JSON.stringify({
                    features: ['trace_length', 'elapsed_time', 'activity_counts', 'rework_count', 'unique_activities', 'avg_inter_event_time'],
                    target: params.target_key || 'outcome',
                });
                const rawFeatures = wasmModule.extract_case_features(eventLogHandle, activityKey, 'time:timestamp', configJson);
                const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
                const result = await classifyTraces(features, {
                    method: params.method,
                    k: params.k,
                });
                modelHandle = JSON.stringify(result);
                break;
            }
            case 'ml_cluster': {
                const { clusterTraces } = await import('@wasm4pm/ml');
                const configJson = JSON.stringify({
                    features: ['trace_length', 'elapsed_time', 'activity_counts', 'rework_count', 'unique_activities'],
                });
                const rawFeatures = wasmModule.extract_case_features(eventLogHandle, activityKey, 'time:timestamp', configJson);
                const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
                const result = await clusterTraces(features, {
                    method: params.method,
                    k: params.k ?? 3,
                    eps: params.eps ?? 1.0,
                });
                modelHandle = JSON.stringify(result);
                break;
            }
            case 'ml_forecast': {
                const { forecastSeries } = await import('@wasm4pm/ml');
                const driftRaw = wasmModule.detect_drift(eventLogHandle, activityKey, 5);
                const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
                const distances = (driftResult?.drifts ?? []).map((d) => d.distance ?? 0);
                const result = await forecastSeries(distances, {
                    forecastPeriods: params.forecast_periods ?? 5,
                    useExponential: params.use_exponential,
                });
                modelHandle = JSON.stringify(result);
                break;
            }
            case 'ml_anomaly': {
                const { detectEnhancedAnomalies } = await import('@wasm4pm/ml');
                const driftRaw = wasmModule.detect_drift(eventLogHandle, activityKey, 10);
                const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
                const distances = (driftResult?.drifts ?? []).map((d) => d.distance ?? 0);
                const result = await detectEnhancedAnomalies(distances, {
                    smoothingMethod: params.smoothing_method,
                });
                modelHandle = JSON.stringify(result);
                break;
            }
            case 'ml_regress': {
                const { regressRemainingTime } = await import('@wasm4pm/ml');
                const configJson = JSON.stringify({
                    features: ['trace_length', 'elapsed_time', 'rework_count', 'unique_activities', 'avg_inter_event_time'],
                    target: params.target_key || 'remaining_time',
                });
                const rawFeatures = wasmModule.extract_case_features(eventLogHandle, activityKey, 'time:timestamp', configJson);
                const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
                const result = await regressRemainingTime(features, {
                    method: params.method,
                });
                modelHandle = JSON.stringify(result);
                break;
            }
            case 'ml_pca': {
                const { reduceFeaturesPCA } = await import('@wasm4pm/ml');
                const configJson = JSON.stringify({
                    features: ['trace_length', 'elapsed_time', 'activity_counts', 'rework_count', 'unique_activities', 'avg_inter_event_time'],
                });
                const rawFeatures = wasmModule.extract_case_features(eventLogHandle, activityKey, 'time:timestamp', configJson);
                const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
                const result = await reduceFeaturesPCA(features, {
                    nComponents: params.n_components ?? 2,
                });
                modelHandle = JSON.stringify(result);
                break;
            }
            default:
                throw new Error(`Unsupported algorithm: ${algorithmId}. ` +
                    `Available: ${registry.list().map((a) => a.id).join(', ')}`);
        }
        // Validate output
        if (!modelHandle || typeof modelHandle !== 'string') {
            throw new Error(`Invalid model handle returned by WASM function. Expected string, got: ${typeof modelHandle}`);
        }
        const executionTimeMs = Date.now() - startTime;
        return {
            modelHandle,
            algorithm: metadata.id,
            outputType: metadata.outputType,
            executionTimeMs,
            parameters: {
                activity_key: activityKey,
                ...Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'activity_key')),
            },
            metadata: {
                algorithmName: metadata.name,
                complexity: metadata.complexity,
                speedTier: metadata.speedTier,
                qualityTier: metadata.qualityTier,
            },
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Provide helpful error messages
        if (errorMessage.includes('not found')) {
            throw new Error(`WASM function for algorithm "${algorithmId}" not found. ` +
                `Check that WASM module is properly initialized and contains this function.`);
        }
        if (errorMessage.includes('not an EventLog')) {
            throw new Error(`Invalid event log handle: "${eventLogHandle}". ` +
                `Make sure an event log was loaded before running discovery algorithms.`);
        }
        throw new Error(`Failed to execute algorithm "${algorithmId}" (${metadata.name}): ${errorMessage}`);
    }
}
/**
 * Get the list of all registered algorithms
 */
export function listAlgorithms() {
    const registry = getRegistry();
    return registry.list().map((algo) => ({
        id: algo.id,
        name: algo.name,
        outputType: algo.outputType,
        complexity: algo.complexity,
    }));
}
/**
 * Validate algorithm parameters
 */
export function validateAlgorithmParameters(algorithmId, parameters) {
    const registry = getRegistry();
    const metadata = registry.get(algorithmId);
    if (!metadata) {
        return {
            valid: false,
            errors: [`Algorithm not found: ${algorithmId}`],
        };
    }
    const errors = [];
    for (const paramDef of metadata.parameters) {
        const paramValue = parameters[paramDef.name];
        // Check required
        if (paramDef.required && paramValue === undefined) {
            errors.push(`Missing required parameter: ${paramDef.name}`);
            continue;
        }
        // Check type
        if (paramValue !== undefined && typeof paramValue !== paramDef.type) {
            errors.push(`Parameter "${paramDef.name}" has wrong type. ` +
                `Expected ${paramDef.type}, got ${typeof paramValue}`);
            continue;
        }
        // Check number range
        if (paramDef.type === 'number' && typeof paramValue === 'number') {
            if (paramDef.min !== undefined && paramValue < paramDef.min) {
                errors.push(`Parameter "${paramDef.name}" is below minimum: ${paramDef.min}`);
            }
            if (paramDef.max !== undefined && paramValue > paramDef.max) {
                errors.push(`Parameter "${paramDef.name}" is above maximum: ${paramDef.max}`);
            }
        }
        // Check options
        if (paramDef.type === 'select' && paramDef.options) {
            if (paramValue !== undefined && !paramDef.options.includes(paramValue)) {
                errors.push(`Parameter "${paramDef.name}" has invalid value. ` +
                    `Must be one of: ${paramDef.options.join(', ')}`);
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
//# sourceMappingURL=handlers.js.map