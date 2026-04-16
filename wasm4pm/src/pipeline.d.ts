/**
 * pipeline.ts
 * Pipeline resolver: translates config to executable steps
 * Maps StepType enums to WASM function names and orders execution dependencies
 */
import { PictlConfig, StepType } from './config.js';
/**
 * Represents a single executable step in the pipeline with WASM binding details
 */
export interface ExecutableStep {
    stepId: string;
    type: StepType;
    wasmFunction: string;
    params: Record<string, unknown>;
    dependencies: string[];
    timeout?: number;
    retryable: boolean;
    required: boolean;
}
/**
 * PipelineResolver translates PictlConfig to executable pipeline steps
 * Handles profile-based default resolution and custom pipeline compilation
 */
export declare class PipelineResolver {
    private stepTypeToWasm;
    constructor();
    /**
     * Resolves a configuration to an ordered list of executable pipeline steps
     * If custom pipeline is provided, uses it; otherwise resolves from execution profile
     *
     * @param config - The pipeline configuration
     * @returns Ordered array of executable pipeline steps
     * @throws PictlError if configuration is invalid or WASM bindings are missing
     */
    resolve(config: PictlConfig): ExecutableStep[];
    /**
     * Validates that all dependencies between steps exist and don't form cycles
     *
     * @param steps - Array of steps to validate
     * @throws PictlError if dependencies are invalid
     */
    private validateDependencies;
    /**
     * Returns available step types
     */
    getAvailableStepTypes(): StepType[];
    /**
     * Gets the WASM function name for a given step type
     */
    getWasmFunction(stepType: StepType): string | undefined;
}
/**
 * Topologically sorts pipeline steps based on dependencies
 * Ensures steps execute in correct order without circular dependencies
 *
 * @param steps - Array of executable steps
 * @returns Dependency-ordered array of steps
 * @throws PictlError if circular dependencies are detected
 */
export declare function topologicalSort(steps: ExecutableStep[]): ExecutableStep[];
/**
 * Extracts all transitive dependencies for a given step
 * Useful for understanding the full execution context
 *
 * @param stepId - The step ID to analyze
 * @param steps - All available steps
 * @returns Set of all steps that must complete before this step
 */
export declare function getTransitiveDependencies(stepId: string, steps: ExecutableStep[]): Set<string>;
//# sourceMappingURL=pipeline.d.ts.map