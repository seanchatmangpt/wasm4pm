/**
 * Configuration Schema for wasm4pm Engine
 * Defines all configuration structures, validation, and execution profiles
 */

import { Wasm4pmError, ErrorCode, ErrorRecovery } from "./errors";

/**
 * Supported data source formats
 */
export enum SourceFormat {
  XES = "xes",
  CSV = "csv",
  JSON = "json",
  PARQUET = "parquet",
  ARROW = "arrow",
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
export enum ExecutionProfile {
  /** Fast discovery: DFG + statistics (1-5ms per 100 events) */
  FAST = "fast",

  /** Balanced: Alpha++, stats, conformance, variants (20-50ms per 100 events) */
  BALANCED = "balanced",

  /** High quality: Multiple algorithms, comprehensive analysis (100-500ms per 100 events) */
  QUALITY = "quality",

  /** Streaming mode: Streaming DFG and conformance checking */
  STREAM = "stream",

  /** Research mode: All algorithms including genetic, PSO, A*, simulated annealing */
  RESEARCH = "research",
}

/**
 * Execution mode determines WASM runtime behavior
 */
export enum ExecutionMode {
  /** Compute everything synchronously */
  SYNC = "sync",

  /** Offload to Web Workers (browser only) */
  WORKER = "worker",

  /** Stream results incrementally */
  STREAMING = "streaming",
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
  format?: "json" | "csv" | "parquet";

  /** Optional callback for streaming output delivery */
  onProgress?: (progress: { step: string; percentage: number; result?: unknown }) => void;
}

/**
 * Types of pipeline steps
 */
export enum StepType {
  // Discovery algorithms
  DFG = "dfg",
  ALPHA_PLUS_PLUS = "alpha_plus_plus",
  HEURISTIC_MINER = "heuristic_miner",
  INDUCTIVE_MINER = "inductive_miner",
  GENETIC = "genetic",
  PSO = "pso",
  A_STAR = "a_star",
  ILP = "ilp",
  ACO = "aco",
  SIMULATED_ANNEALING = "simulated_annealing",

  // Analysis
  STATISTICS = "statistics",
  CONFORMANCE = "conformance",
  VARIANTS = "variants",
  PERFORMANCE = "performance",
  CLUSTERING = "clustering",

  // Utilities
  FILTER = "filter",
  TRANSFORM = "transform",
  VALIDATE = "validate",
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
export interface Wasm4pmConfig {
  /** Version of the configuration schema */
  version: "1.0";

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
  type: "missing" | "invalid" | "type_error" | "constraint_violation";

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
export function validateConfig(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Type check
  if (!config || typeof config !== "object") {
    return [
      {
        path: "$",
        type: "type_error",
        message: "Configuration must be a non-null object",
        suggestion: "Ensure config is passed as an object literal or parsed JSON",
      },
    ];
  }

  const cfg = config as Record<string, unknown>;

  // Check version
  if (cfg.version !== "1.0") {
    issues.push({
      path: "version",
      type: "invalid",
      message: `Invalid or missing version. Expected "1.0", got ${cfg.version}`,
      suggestion: 'Set version to "1.0"',
    });
  }

  // Check source
  if (!cfg.source || typeof cfg.source !== "object") {
    issues.push({
      path: "source",
      type: "missing",
      message: "source configuration is required",
      suggestion: "Add a source configuration object with format and content",
    });
  } else {
    const source = cfg.source as Record<string, unknown>;

    if (!source.format || !Object.values(SourceFormat).includes(source.format as SourceFormat)) {
      issues.push({
        path: "source.format",
        type: "invalid",
        message: `Invalid or missing source format. Expected one of: ${Object.values(SourceFormat).join(", ")}`,
        suggestion: `Set source.format to a valid format`,
      });
    }

    if (!source.content || typeof source.content !== "string") {
      issues.push({
        path: "source.content",
        type: "missing",
        message: "source.content is required and must be a string",
        suggestion: "Provide the source data as a string",
      });
    }
  }

  // Check execution
  if (!cfg.execution || typeof cfg.execution !== "object") {
    issues.push({
      path: "execution",
      type: "missing",
      message: "execution configuration is required",
      suggestion: "Add an execution configuration object with a profile",
    });
  } else {
    const execution = cfg.execution as Record<string, unknown>;

    if (!execution.profile || !Object.values(ExecutionProfile).includes(execution.profile as ExecutionProfile)) {
      issues.push({
        path: "execution.profile",
        type: "invalid",
        message: `Invalid or missing execution profile. Expected one of: ${Object.values(ExecutionProfile).join(", ")}`,
        suggestion: "Set execution.profile to a valid profile name",
      });
    }

    if (execution.mode && !Object.values(ExecutionMode).includes(execution.mode as ExecutionMode)) {
      issues.push({
        path: "execution.mode",
        type: "invalid",
        message: `Invalid execution mode. Expected one of: ${Object.values(ExecutionMode).join(", ")}`,
        suggestion: "Set execution.mode to a valid execution mode or omit it",
      });
    }

    if (execution.maxEvents !== undefined && typeof execution.maxEvents !== "number") {
      issues.push({
        path: "execution.maxEvents",
        type: "type_error",
        message: "execution.maxEvents must be a number",
      });
    }

    if (execution.maxMemoryMB !== undefined && typeof execution.maxMemoryMB !== "number") {
      issues.push({
        path: "execution.maxMemoryMB",
        type: "type_error",
        message: "execution.maxMemoryMB must be a number",
      });
    }

    if (execution.timeoutMs !== undefined && typeof execution.timeoutMs !== "number") {
      issues.push({
        path: "execution.timeoutMs",
        type: "type_error",
        message: "execution.timeoutMs must be a number",
      });
    }
  }

  // Validate pipeline if provided
  if (cfg.pipeline && Array.isArray(cfg.pipeline)) {
    const pipeline = cfg.pipeline as unknown[];
    pipeline.forEach((step, idx) => {
      if (!step || typeof step !== "object") {
        issues.push({
          path: `pipeline[${idx}]`,
          type: "type_error",
          message: "Pipeline step must be an object",
        });
      } else {
        const s = step as Record<string, unknown>;
        if (!s.id || typeof s.id !== "string") {
          issues.push({
            path: `pipeline[${idx}].id`,
            type: "missing",
            message: "Pipeline step must have an id (string)",
          });
        }
        if (!s.type || !Object.values(StepType).includes(s.type as StepType)) {
          issues.push({
            path: `pipeline[${idx}].type`,
            type: "invalid",
            message: `Invalid step type. Expected one of: ${Object.values(StepType).join(", ")}`,
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Asserts that a configuration is valid, throwing a Wasm4pmError if not
 * Type guard that narrows the type to Wasm4pmConfig
 *
 * @param config - Configuration to validate
 * @throws Wasm4pmError - If validation fails
 */
export function assertConfigValid(config: unknown): asserts config is Wasm4pmConfig {
  const issues = validateConfig(config);

  if (issues.length > 0) {
    const issueMessages = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");

    throw new Wasm4pmError(`Configuration validation failed: ${issueMessages}`, ErrorCode.CONFIG_INVALID, {
      nextAction: ErrorRecovery.RECONFIGURE,
      context: { issues },
    });
  }
}

/**
 * Resolves an execution profile to a default pipeline of steps
 * Returns the recommended sequence of algorithms and analyses for the profile
 *
 * @param profile - Execution profile
 * @returns Array of PipelineStep objects representing the default pipeline
 */
export function resolveProfile(profile: ExecutionProfile): PipelineStep[] {
  switch (profile) {
    case ExecutionProfile.FAST:
      return [
        {
          id: "step_dfg",
          type: StepType.DFG,
          required: true,
          parallelizable: true,
        },
        {
          id: "step_stats",
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ["step_dfg"],
          parallelizable: true,
        },
      ];

    case ExecutionProfile.BALANCED:
      return [
        {
          id: "step_alpha",
          type: StepType.ALPHA_PLUS_PLUS,
          required: true,
          parallelizable: true,
        },
        {
          id: "step_stats",
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ["step_alpha"],
          parallelizable: true,
        },
        {
          id: "step_conformance",
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ["step_alpha"],
          parallelizable: true,
        },
        {
          id: "step_variants",
          type: StepType.VARIANTS,
          required: true,
          dependsOn: ["step_alpha"],
          parallelizable: true,
        },
      ];

    case ExecutionProfile.QUALITY:
      return [
        // Primary algorithm with alternatives
        {
          id: "step_genetic",
          type: StepType.GENETIC,
          required: true,
          parallelizable: true,
          parameters: { generations: 50, populationSize: 30 },
        },
        {
          id: "step_ilp",
          type: StepType.ILP,
          required: false,
          dependsOn: ["step_genetic"],
          parallelizable: true,
          parameters: { timeout: 10000 },
        },
        {
          id: "step_heuristic",
          type: StepType.HEURISTIC_MINER,
          required: true,
          parallelizable: true,
        },

        // Comprehensive analysis
        {
          id: "step_stats",
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ["step_genetic"],
          parallelizable: true,
        },
        {
          id: "step_conformance",
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ["step_genetic"],
          parallelizable: true,
        },
        {
          id: "step_variants",
          type: StepType.VARIANTS,
          required: true,
          dependsOn: ["step_genetic"],
          parallelizable: true,
        },
        {
          id: "step_performance",
          type: StepType.PERFORMANCE,
          required: true,
          dependsOn: ["step_genetic"],
          parallelizable: true,
        },
      ];

    case ExecutionProfile.STREAM:
      return [
        {
          id: "step_stream_dfg",
          type: StepType.DFG,
          required: true,
          parallelizable: true,
          parameters: { streaming: true },
        },
        {
          id: "step_stream_conformance",
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ["step_stream_dfg"],
          parallelizable: true,
          parameters: { streaming: true },
        },
      ];

    case ExecutionProfile.RESEARCH:
      return [
        // All discovery algorithms
        {
          id: "step_dfg",
          type: StepType.DFG,
          required: true,
          parallelizable: true,
        },
        {
          id: "step_alpha",
          type: StepType.ALPHA_PLUS_PLUS,
          required: true,
          parallelizable: true,
        },
        {
          id: "step_genetic",
          type: StepType.GENETIC,
          required: true,
          parallelizable: true,
          parameters: { generations: 100, populationSize: 50 },
        },
        {
          id: "step_pso",
          type: StepType.PSO,
          required: true,
          parallelizable: true,
          parameters: { particles: 30, iterations: 100 },
        },
        {
          id: "step_astar",
          type: StepType.A_STAR,
          required: true,
          parallelizable: true,
        },
        {
          id: "step_aco",
          type: StepType.ACO,
          required: true,
          parallelizable: true,
          parameters: { ants: 20, iterations: 50 },
        },
        {
          id: "step_annealing",
          type: StepType.SIMULATED_ANNEALING,
          required: true,
          parallelizable: true,
          parameters: { temperature: 100, coolingRate: 0.95 },
        },
        {
          id: "step_ilp",
          type: StepType.ILP,
          required: false,
          parallelizable: true,
          parameters: { timeout: 30000 },
        },

        // Full analysis
        {
          id: "step_stats",
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ["step_dfg"],
          parallelizable: true,
        },
        {
          id: "step_conformance",
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ["step_alpha"],
          parallelizable: true,
        },
        {
          id: "step_variants",
          type: StepType.VARIANTS,
          required: true,
          dependsOn: ["step_dfg"],
          parallelizable: true,
        },
        {
          id: "step_performance",
          type: StepType.PERFORMANCE,
          required: true,
          dependsOn: ["step_dfg"],
          parallelizable: true,
        },
        {
          id: "step_clustering",
          type: StepType.CLUSTERING,
          required: true,
          dependsOn: ["step_dfg"],
          parallelizable: true,
        },
      ];

    default:
      const _exhaustive: never = profile;
      throw new Wasm4pmError(
        `Unknown execution profile: ${profile}`,
        ErrorCode.CONFIG_INVALID,

        {
          nextAction: ErrorRecovery.RECONFIGURE,
        }
      );
  }
}
