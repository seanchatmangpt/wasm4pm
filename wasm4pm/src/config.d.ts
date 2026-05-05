/**
 * Configuration Schema for wasm4pm Engine
 * Defines all configuration structures, validation, and execution profiles
 */
/**
 * Supported data source formats
 */
export declare enum SourceFormat {
  XES = 'xes',
  CSV = 'csv',
  JSON = 'json',
  PARQUET = 'parquet',
  ARROW = 'arrow',
}
/**
 * Source location and format specification
 */
export interface SourceConfig {
  /** Format of the source data */
  format: SourceFormat;
  /** Content of the source (raw string, base64, or file path) */
  content: string;
  /** Optional: whether content is base64-encoded */
  isBase64?: boolean;
  /** Optional: original file name for debugging */
  fileName?: string;
  /** Optional: encoding of the source data (default: utf-8) */
  encoding?: string;
}
/**
 * Execution profile names and their characteristics
 */
export declare enum ExecutionProfile {
  /** Fast discovery: DFG + statistics (1-5ms per 100 events) */
  FAST = 'fast',
  /** Balanced: Alpha++, stats, conformance, variants (20-50ms per 100 events) */
  BALANCED = 'balanced',
  /** High quality: Multiple algorithms, comprehensive analysis (100-500ms per 100 events) */
  QUALITY = 'quality',
  /** Streaming mode: Streaming DFG and conformance checking */
  STREAM = 'stream',
  /** Research mode: All algorithms including genetic, PSO, A*, simulated annealing */
  RESEARCH = 'research',
}
/**
 * Execution mode determines WASM runtime behavior
 */
export declare enum ExecutionMode {
  /** Compute everything synchronously */
  SYNC = 'sync',
  /** Offload to Web Workers (browser only) */
  WORKER = 'worker',
  /** Stream results incrementally */
  STREAMING = 'streaming',
}
/**
 * Resource and performance constraints
 */
export interface ExecutionConfig {
  /** Execution profile (determines default pipeline) */
  profile: ExecutionProfile;
  /** Execution mode (sync, worker, streaming) */
  mode?: ExecutionMode;
  /** Maximum events to process (default: unlimited) */
  maxEvents?: number;
  /** Maximum memory usage in MB (default: 512) */
  maxMemoryMB?: number;
  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Enable performance profiling (default: false) */
  enableProfiling?: boolean;
  /** Custom parameters for the selected profile */
  parameters?: Record<string, unknown>;
}
/**
 * Output configuration and delivery
 */
export interface OutputConfig {
  /** Whether to generate visual reports (HTML, Mermaid, D3) */
  generateReports?: boolean;
  /** Whether to include performance metrics in output */
  includeMetrics?: boolean;
  /** Whether to include raw algorithm results */
  includeRawResults?: boolean;
  /** Output format preference: json, csv, parquet */
  format?: 'json' | 'csv' | 'parquet';
  /** Optional callback for streaming output delivery */
  onProgress?: (progress: { step: string; percentage: number; result?: unknown }) => void;
}
/**
 * Types of pipeline steps
 */
export declare enum StepType {
  DFG = 'dfg',
  ALPHA_PLUS_PLUS = 'alpha_plus_plus',
  HEURISTIC_MINER = 'heuristic_miner',
  INDUCTIVE_MINER = 'inductive_miner',
  GENETIC = 'genetic',
  PSO = 'pso',
  A_STAR = 'a_star',
  ILP = 'ilp',
  ACO = 'aco',
  SIMULATED_ANNEALING = 'simulated_annealing',
  STATISTICS = 'statistics',
  CONFORMANCE = 'conformance',
  VARIANTS = 'variants',
  PERFORMANCE = 'performance',
  CLUSTERING = 'clustering',
  FILTER = 'filter',
  TRANSFORM = 'transform',
  VALIDATE = 'validate',
}
/**
 * Represents a single step in the execution pipeline
 */
export interface PipelineStep {
  /** Unique identifier for this step */
  id: string;
  /** Type of step (algorithm, analysis, utility) */
  type: StepType;
  /** Whether this step is required */
  required: boolean;
  /** Parameters for this step */
  parameters?: Record<string, unknown>;
  /** Dependencies on other steps (step IDs) */
  dependsOn?: string[];
  /** Whether this step can be parallelized */
  parallelizable?: boolean;
}
/**
 * Top-level configuration for the wasm4pm engine
 */
export interface PictlConfig {
  /** Version of the configuration schema */
  version: '1.0';
  /** Source data configuration */
  source: SourceConfig;
  /** Execution configuration */
  execution: ExecutionConfig;
  /** Output configuration */
  output?: OutputConfig;
  /** Custom pipeline steps (overrides default for profile) */
  pipeline?: PipelineStep[];
  /** Optional metadata */
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}
/**
 * Validation issue found during config validation
 */
export interface ValidationIssue {
  /** Path to the problematic field */
  path: string;
  /** Type of validation issue */
  type: 'missing' | 'invalid' | 'type_error' | 'constraint_violation';
  /** Human-readable error message */
  message: string;
  /** Suggested fix if available */
  suggestion?: string;
}
/**
 * Validates a configuration object for structural correctness
 * Returns an array of validation issues (empty if valid)
 *
 * @param config - Configuration object to validate
 * @returns Array of ValidationIssue objects (empty if valid)
 */
export declare function validateConfig(config: unknown): ValidationIssue[];
/**
 * Asserts that a configuration is valid, throwing a PictlError if not
 * Type guard that narrows the type to PictlConfig
 *
 * @param config - Configuration to validate
 * @throws PictlError - If validation fails
 */
export declare function assertConfigValid(config: unknown): asserts config is PictlConfig;
/**
 * Resolves an execution profile to a default pipeline of steps
 * Returns the recommended sequence of algorithms and analyses for the profile
 *
 * @param profile - Execution profile
 * @returns Array of PipelineStep objects representing the default pipeline
 */
export declare function resolveProfile(profile: ExecutionProfile): PipelineStep[];
/**
 * Type alias for backward compatibility
 * @deprecated Use PictlConfig instead
 */
export type Wasm4pmConfig = PictlConfig;
//# sourceMappingURL=config.d.ts.map
