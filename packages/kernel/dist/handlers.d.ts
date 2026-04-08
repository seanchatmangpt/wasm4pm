/**
 * handlers.ts
 * Algorithm step handlers - execute algorithm steps from execution plans
 * Bridge between planner (algorithm name) and WASM module (function calls)
 */
import { type PlanStep } from '@wasm4pm/planner';
/**
 * WASM module interface - defines all discoverable WASM functions
 * Maps to the actual wasm4pm Rust module compiled to JavaScript
 */
export interface WasmModule {
    discover_dfg(eventlog_handle: string, activity_key: string): Promise<{
        handle: string;
    }>;
    discover_ocel_dfg(ocel_handle: string): Promise<{
        handle: string;
    }>;
    discover_ocel_dfg_per_type(ocel_handle: string): Promise<{
        handle: string;
    }>;
    discover_alpha_plus_plus(eventlog_handle: string, activity_key: string): Promise<{
        handle: string;
    }>;
    discover_heuristic_miner(eventlog_handle: string, activity_key: string, dependency_threshold: number): Promise<{
        handle: string;
    }>;
    discover_inductive_miner(eventlog_handle: string, activity_key: string, noise_threshold: number): Promise<{
        handle: string;
    }>;
    discover_genetic_algorithm(eventlog_handle: string, activity_key: string, population_size: number, generations: number): Promise<{
        handle: string;
    }>;
    discover_pso_algorithm(eventlog_handle: string, activity_key: string, swarm_size: number, iterations: number): Promise<{
        handle: string;
    }>;
    discover_astar(eventlog_handle: string, activity_key: string, max_iterations: number): Promise<{
        handle: string;
    }>;
    discover_hill_climbing(eventlog_handle: string, activity_key: string, max_iterations: number): Promise<{
        handle: string;
    }>;
    discover_ilp_petri_net(eventlog_handle: string, activity_key: string, timeout_seconds: number): Promise<{
        handle: string;
    }>;
    discover_ant_colony(eventlog_handle: string, activity_key: string, colony_size: number, iterations: number): Promise<{
        handle: string;
    }>;
    discover_simulated_annealing(eventlog_handle: string, activity_key: string, initial_temperature: number, cooling_rate: number): Promise<{
        handle: string;
    }>;
    discover_declare(eventlog_handle: string, activity_key: string, support_threshold: number): Promise<{
        handle: string;
    }>;
    discover_optimized_dfg(eventlog_handle: string, activity_key: string, timeout_seconds: number): Promise<{
        handle: string;
    }>;
    discover_powl_from_log(log_json: string, variant: string): Promise<{
        root: number;
        node_count: number;
        repr: string;
        variant: string;
    }>;
    discover_powl_from_log_config(log_json: string, activity_key: string, variant: string, min_trace_count: number, noise_threshold: number): Promise<{
        root: number;
        node_count: number;
        repr: string;
        variant: string;
        config: {
            activity_key: string;
            min_trace_count: number;
            noise_threshold: number;
        };
    }>;
}
/**
 * Algorithm step execution output
 */
export interface AlgorithmStepOutput {
    /** Model handle returned by WASM function */
    modelHandle: string;
    /** Algorithm that was executed */
    algorithm: string;
    /** Output type produced */
    outputType: string;
    /** Execution time in milliseconds */
    executionTimeMs: number;
    /** Parameters used */
    parameters: Record<string, unknown>;
    /** Metadata about the result */
    metadata?: Record<string, unknown>;
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
export declare function implementAlgorithmStep(step: PlanStep, wasmModule: WasmModule, eventLogHandle: string): Promise<AlgorithmStepOutput>;
/**
 * Get the list of all registered algorithms
 */
export declare function listAlgorithms(): Array<{
    id: string;
    name: string;
    outputType: string;
    complexity: string;
}>;
/**
 * Validate algorithm parameters
 */
export declare function validateAlgorithmParameters(algorithmId: string, parameters: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=handlers.d.ts.map