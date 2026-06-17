/**
 * Execution plan generator for wasm4pm process mining engine
 * Generates deterministic, reproducible execution plans from configuration
 *
 * Per PRD §11: explain() == run()
 * The plan is used by both explain() and run() - only difference is explanation vs execution
 */

import { v4 as uuidv4 } from 'uuid';
import { hash as blake3Hash } from 'blake3';
import { estimateDurationMs as benchEstimateDurationMs, benchSpeedTier } from './benchmark-costs.js';
import { checkCostModelDrift, type CostDriftSignal } from './cost-drift.js';
import type { ErrorInfo, BudgetEnvelope } from '@wasm4pm/contracts';
import { createError } from '@wasm4pm/contracts';
import {
  ALGORITHM_ID_TO_STEP_TYPE,
  getProfileAlgorithms,
  ALGORITHM_DISPLAY_NAMES,
} from '@wasm4pm/contracts';
import type { DAG } from './dag.js';
import { topologicalSort, validateDAG } from './dag.js';
import type { PlanStep } from './steps.js';
import {
  PlanStepType,
  createBootstrapStep,
  createInitWasmStep,
  createLoadSourceStep,
  createValidateSourceStep,
  createAlgorithmStep,
  createAnalysisStep,
  createGenerateReportsStep,
  createSinkStep,
  createCleanupStep,
} from './steps.js';

/**
 * Typed error for planner failures.
 * Extends Error for compatibility with try/catch while carrying ErrorInfo.
 */
export class PlannerError extends Error {
  readonly info: ErrorInfo;

  constructor(info: ErrorInfo) {
    super(info.message);
    this.name = 'PlannerError';
    this.info = info;
  }
}

/**
 * Configuration for plan generation
 * Mirrors the wasm4pm config structure
 */
export interface Config {
  version: '1.0';
  source: {
    format: string;
    content?: string;
  };
  execution: {
    profile: string;
    mode?: string;
    maxEvents?: number;
    maxMemoryMB?: number;
    timeoutMs?: number;
    enableProfiling?: boolean;
    parameters?: Record<string, unknown>;
  };
  algorithm?: {
    /** Override the profile's default discovery algorithm with a specific registry ID */
    name?: string;
    parameters?: Record<string, unknown>;
  };
  output?: {
    generateReports?: boolean;
    includeMetrics?: boolean;
    includeRawResults?: boolean;
    format?: string;
    onProgress?: (progress: unknown) => void;
  };
  pipeline?: Array<{
    id: string;
    type: string;
    required?: boolean;
    parameters?: Record<string, unknown>;
    dependsOn?: string[];
    parallelizable?: boolean;
  }>;
  ml?: {
    enabled?: boolean;
    tasks?: string[];
    method?: string;
    k?: number;
    targetKey?: string;
    forecastPeriods?: number;
    nComponents?: number;
    eps?: number;
  };
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}

/**
 * Alternative plan option produced alongside the primary plan.
 * Carries enough metadata for callers to compare tradeoffs without re-planning.
 */
export interface AlternativePlan {
  /** Algorithm ID of the alternative */
  algorithm: string;

  /** Short human-readable reason this alternative was generated */
  reason: string;

  /** Speed tier of the alternative (lower = faster) */
  speed_tier: number;

  /** Quality tier of the alternative (higher = better model) */
  quality_tier: number;

  /** Estimated wall-clock duration in ms for this alternative */
  estimated_duration_ms: number;

  /** Quality efficiency: qualityTier / estimated_duration_ms. Higher = more quality per ms. */
  quality_efficiency: number;
}

/**
 * Predicted quality for the chosen algorithm and profile.
 */
export interface QualityPrediction {
  /** Expected fitness score in [0, 1] (higher = better conformance) */
  fitness_estimate: number;

  /** Confidence level of the prediction */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Execution plan with deterministic layout and reproducible hash
 * Section 4 of the Three-Layer Architecture Specification requires BudgetEnvelope
 * to be attached to every ExecutionPlan for budget-first dispatch.
 */
export interface ExecutionPlan {
  /** Unique plan identifier (UUID) */
  id: string;

  /** BLAKE3 hash of normalized plan structure */
  hash: string;

  /** Original configuration used to generate this plan */
  config: Config;

  /** Ordered list of execution steps */
  steps: PlanStep[];

  /** Directed acyclic graph of step dependencies */
  graph: DAG;

  /** Kind of source data (e.g., 'xes', 'csv') */
  sourceKind: string;

  /** Kind of sink output (e.g., 'json', 'parquet') */
  sinkKind: string;

  /** Execution profile used (e.g., 'fast', 'balanced', 'quality') */
  profile: string;

  /** Budget envelope defining execution constraints (Section 4.1)
   * Attached by plan() and used by backend selection algorithm (Section 3.5).
   * Immutable; governs latency, memory, quality, and execution mode.
   */
  budget: BudgetEnvelope;

  /**
   * Estimated total wall-clock duration in milliseconds, summed across
   * all sequential steps. Parallelizable steps are counted once.
   */
  estimated_duration_ms: number;

  /**
   * Estimated peak memory usage in MB (max across all steps).
   */
  estimated_memory_mb: number;

  /**
   * Predicted quality for the primary discovery algorithm and profile.
   */
  quality_prediction: QualityPrediction;

  /**
   * Alternative algorithm options with their tradeoffs.
   * Callers can switch to an alternative without re-planning from scratch.
   */
  alternatives: AlternativePlan[];

  /**
   * Advisory warnings about this plan, e.g. log size, algorithm mismatch,
   * missing features. Non-fatal; plan is still valid.
   */
  warnings: string[];

  /** Quality efficiency of the primary algorithm: primaryQualityTier / calibrated_duration_ms. */
  quality_efficiency: number;

  /**
   * Cost-model drift alerts for the primary algorithm. Populated only when
   * the caller passes a receiptsDir to plan() and runtime evidence exists.
   */
  cost_drift_alerts?: CostDriftSignal[];
}

/**
 * Maps execution profile to default pipeline steps.
 * Discovery algorithms align with the registry's supportedProfiles field.
 *
 * fast    → dfg + process_skeleton (O(n), instant)
 * balanced → heuristic_miner + alpha_plus_plus + conformance/variant analysis
 * quality → genetic_algorithm + ilp + all analyses
 * stream  → dfg only (streaming-safe)
 */
/**
 * Returns the profile's primary discovery step types + standard analysis steps.
 * Discovery algorithm IDs come from @wasm4pm/generated (ontology-derived).
 * Analysis steps are structural and always appended for non-fast profiles.
 */
/** ML algorithm IDs (from kernel registry supportedProfiles: ['balanced', 'quality']) */
const ML_ALGORITHM_IDS = new Set([
  'ml_classify',
  'ml_cluster',
  'ml_forecast',
  'ml_anomaly',
  'ml_regress',
  'ml_pca',
]);

/** ML PlanStepType values, in canonical order */
const ML_STEP_TYPES: PlanStepType[] = [
  PlanStepType.ML_CLASSIFY,
  PlanStepType.ML_CLUSTER,
  PlanStepType.ML_FORECAST,
  PlanStepType.ML_ANOMALY,
  PlanStepType.ML_REGRESS,
  PlanStepType.ML_PCA,
];

/**
 * Returns true if the profile includes ML algorithms by default.
 * balanced and quality profiles automatically include all 6 ML algorithms.
 */
function profileIncludesML(profile: string): boolean {
  return profile === 'balanced' || profile === 'quality';
}

function getDefaultPipeline(profile: string): PlanStepType[] {
  const discoveryIds = getProfileAlgorithms(profile);
  // Exclude ML algorithm IDs from the discovery pipeline — ML steps are handled
  // separately so they can be deduplicated cleanly with config.ml.tasks opt-ins.
  const nonMlDiscoveryIds = discoveryIds.filter((id) => !ML_ALGORITHM_IDS.has(id));
  const discoverySteps = nonMlDiscoveryIds
    .map((id) => ALGORITHM_ID_TO_STEP_TYPE[id])
    .filter((st): st is string => Boolean(st))
    .map((st) => st as PlanStepType);

  // Analysis steps per profile
  const analysisSteps: PlanStepType[] = (() => {
    switch (profile.toLowerCase()) {
      case 'fast':
        return [PlanStepType.ANALYZE_STATISTICS];
      case 'stream':
        return [PlanStepType.ANALYZE_STATISTICS];
      case 'balanced':
        return [
          PlanStepType.ANALYZE_STATISTICS,
          PlanStepType.ANALYZE_CONFORMANCE,
          PlanStepType.ANALYZE_VARIANTS,
        ];
      case 'quality':
        return [
          PlanStepType.ANALYZE_STATISTICS,
          PlanStepType.ANALYZE_CONFORMANCE,
          PlanStepType.ANALYZE_VARIANTS,
          PlanStepType.ANALYZE_PERFORMANCE,
        ];
      case 'research':
        return [
          PlanStepType.ANALYZE_STATISTICS,
          PlanStepType.ANALYZE_CONFORMANCE,
          PlanStepType.ANALYZE_VARIANTS,
          PlanStepType.ANALYZE_PERFORMANCE,
          PlanStepType.ANALYZE_CLUSTERING,
        ];
      default:
        return [PlanStepType.ANALYZE_STATISTICS];
    }
  })();

  return [...discoverySteps, ...analysisSteps];
}

/**
 * Converts PlanStepType to algorithm display name for step description.
 * Discovery step names come from the ontology via ALGORITHM_DISPLAY_NAMES.
 * Lifecycle/analysis step names are structural and hardcoded here.
 */
function algorithmNameFromStepType(stepType: PlanStepType): string {
  // For discovery steps, reverse-lookup the kernel ID via ALGORITHM_ID_TO_STEP_TYPE
  const entry = Object.entries(ALGORITHM_ID_TO_STEP_TYPE).find(([, st]) => st === stepType);
  if (entry) return ALGORITHM_DISPLAY_NAMES[entry[0]] ?? stepType;

  // Lifecycle and analysis steps — not in the ontology yet
  const lifecycle: Partial<Record<PlanStepType, string>> = {
    [PlanStepType.ANALYZE_STATISTICS]: 'Statistics',
    [PlanStepType.ANALYZE_CONFORMANCE]: 'Conformance Checking',
    [PlanStepType.ANALYZE_VARIANTS]: 'Variant Analysis',
    [PlanStepType.ANALYZE_PERFORMANCE]: 'Performance Analysis',
    [PlanStepType.ANALYZE_CLUSTERING]: 'Clustering Analysis',
    [PlanStepType.BOOTSTRAP]: 'Bootstrap',
    [PlanStepType.INIT_WASM]: 'WASM Init',
    [PlanStepType.LOAD_SOURCE]: 'Load Source',
    [PlanStepType.VALIDATE_SOURCE]: 'Validate Source',
    [PlanStepType.FILTER_LOG]: 'Filter Log',
    [PlanStepType.TRANSFORM_LOG]: 'Transform Log',
    [PlanStepType.GENERATE_REPORTS]: 'Generate Reports',
    [PlanStepType.WRITE_SINK]: 'Write Sink',
    [PlanStepType.CLEANUP]: 'Cleanup',
    // ML Analysis
    [PlanStepType.ML_CLASSIFY]: 'ML Classification',
    [PlanStepType.ML_CLUSTER]: 'ML Clustering',
    [PlanStepType.ML_FORECAST]: 'ML Forecasting',
    [PlanStepType.ML_ANOMALY]: 'ML Anomaly Detection',
    [PlanStepType.ML_REGRESS]: 'ML Regression',
    [PlanStepType.ML_PCA]: 'ML PCA',
  };
  return lifecycle[stepType] ?? stepType;
}

/**
 * Helper to create BudgetEnvelope from Config (Section 4.1)
 * Maps execution profile and runtime context to budget constraints.
 *
 * Derives:
 * - latencyBudget: from profile (fast→sub_ms, balanced→low_ms, quality→high_ms, stream→sub_ms)
 * - memoryBudget: from config.execution.maxMemoryMB (0 = unlimited)
 * - qualityFloor: from profile (fast→fast, balanced→balanced, quality→quality, stream→fast)
 * - environment: from config or detected (browserSafe, pythonAvailable)
 * - mode: from profile + heuristics (log size for balanced, algorithm for quality)
 */
function createBudgetEnvelopeFromConfig(
  config: Config,
  _sourceKind: string
): { budget: BudgetEnvelope; eventCount?: number } {
  const profile = config.execution.profile.toLowerCase();

  // Derive latency budget from profile
  const latencyBudgetMap: Record<string, 'sub_ms' | 'low_ms' | 'high_ms'> = {
    fast: 'sub_ms',
    stream: 'sub_ms',
    balanced: 'low_ms',
    quality: 'high_ms',
  };
  const latencyBudget = latencyBudgetMap[profile] || 'high_ms';

  // Derive quality floor from profile
  const qualityFloorMap: Record<string, 'fast' | 'balanced' | 'quality'> = {
    fast: 'fast',
    stream: 'fast',
    balanced: 'balanced',
    quality: 'quality',
  };
  const qualityFloor = qualityFloorMap[profile] || 'balanced';

  // Derive execution mode from profile
  // mode determines dispatch pattern (online vs async job queue)
  let mode: 'online' | 'near-online' | 'batch' | 'research' = 'online';
  if (profile === 'quality') {
    // quality → near-online or batch (by algorithm: ilp/genetic → batch)
    const algorithmName = config.algorithm?.name || '';
    const batchAlgorithms = ['ilp', 'genetic_algorithm', 'aco', 'pso'];
    if (batchAlgorithms.some((id) => algorithmName.includes(id))) {
      mode = 'batch';
    } else {
      mode = 'near-online';
    }
  } else if (profile === 'balanced') {
    // balanced → online or near-online (by log size: >50K events → near-online)
    // Note: event count typically not available at planning time, so default to online
    // FederationController may upgrade to near-online at runtime if needed
    mode = 'online';
  } else if (profile === 'fast' || profile === 'stream') {
    mode = 'online';
  }

  // Memory budget from config (0 = unlimited)
  const memoryBudget = (config.execution.maxMemoryMB || 0) * 1_024 * 1_024;

  // Environment defaults
  const environment = {
    browserSafe: false, // Default; can be overridden
    pythonAvailable: false, // Default; runtime detection may override
  };

  const budget: BudgetEnvelope = {
    latencyBudget,
    memoryBudget,
    qualityFloor,
    environment,
    mode,
  };

  return { budget };
}

/**
 * Generates an execution plan from a configuration
 *
 * Plan structure:
 * 1. Bootstrap -> init_wasm -> load_source -> validate_source
 * 2. Parallel discovery and analysis steps (with validate_source as dependency)
 * 3. Optional: generate_reports (depends on all prior steps)
 * 4. Optional: write_sink (depends on reports or prior steps)
 * 5. Optional: cleanup (depends on everything)
 *
 * @param config - Configuration specifying source, profile, and options
 * @returns ExecutionPlan with deterministic structure and BLAKE3 hash, BudgetEnvelope attached
 * @throws Error if configuration is invalid
 */
export function plan(
  config: Config,
  options?: { receiptsDir?: string }
): ExecutionPlan {
  // Validate configuration with typed errors
  if (!config || typeof config !== 'object') {
    throw new PlannerError(
      createError('CONFIG_INVALID', 'Configuration must be a non-null object', {
        received: typeof config,
      })
    );
  }

  if (config.version !== '1.0') {
    throw new PlannerError(
      createError(
        'CONFIG_INVALID',
        `Invalid config version: expected "1.0", got "${config.version}"`,
        { version: config.version }
      )
    );
  }

  if (!config.source || !config.source.format) {
    throw new PlannerError(
      createError('CONFIG_INVALID', 'Configuration must include source.format', {
        source: config.source,
      })
    );
  }

  if (!config.execution || !config.execution.profile) {
    throw new PlannerError(
      createError('CONFIG_INVALID', 'Configuration must include execution.profile', {
        execution: config.execution,
      })
    );
  }

  // Extract configuration values
  const sourceKind = config.source.format.toLowerCase();
  const profile = config.execution.profile.toLowerCase();
  const sinkKind = config.output?.format || 'json';
  const shouldGenerateReports = config.output?.generateReports !== false;

  // Start building the plan
  const planId = uuidv4();
  const steps: PlanStep[] = [];
  const stepIds: Set<string> = new Set();

  // 1. Add initialization steps
  steps.push(createBootstrapStep());
  steps.push(createInitWasmStep());

  // 2. Add source loading and validation
  steps.push(createLoadSourceStep(sourceKind));
  steps.push(createValidateSourceStep());

  // 3. Add discovery and analysis steps based on profile (or algorithm override)
  //
  // If config.algorithm.name is set, replace the profile's discovery steps with
  // that single algorithm. Analysis steps from the profile are preserved.
  let pipelineSteps = getDefaultPipeline(profile);

  // Treat 'auto' (and empty string) as "no override" — use the profile's default pipeline.
  // Callers may pass algorithm.name='auto' as a sentinel meaning "pick the best for the profile".
  const rawAlgorithmOverride = config.algorithm?.name;
  const algorithmOverride =
    !rawAlgorithmOverride || rawAlgorithmOverride === 'auto' ? undefined : rawAlgorithmOverride;
  if (algorithmOverride) {
    const overrideStepType = ALGORITHM_ID_TO_STEP_TYPE[algorithmOverride];
    if (!overrideStepType) {
      throw new PlannerError(
        createError(
          'CONFIG_INVALID',
          `Unknown algorithm: "${algorithmOverride}". See ALGORITHM_ID_TO_STEP_TYPE for valid IDs.`,
          { algorithmName: algorithmOverride }
        )
      );
    }

    // Guard: stream profile is incompatible with full-log algorithms.
    // Streaming algorithms process events incrementally and cannot buffer the
    // complete log required by ILP, genetic, PSO, ACO, and A* search.
    // A user specifying profile=stream + algorithm=ilp has a contradictory config.
    const STREAM_INCOMPATIBLE_ALGORITHMS = new Set([
      'ilp',
      'genetic_algorithm',
      'pso',
      'aco',
      'a_star',
      'simulated_annealing',
      'alignments',
    ]);
    if (profile === 'stream' && STREAM_INCOMPATIBLE_ALGORITHMS.has(algorithmOverride)) {
      throw new PlannerError(
        createError(
          'CONFIG_INVALID',
          `Algorithm "${algorithmOverride}" requires a complete event log and is incompatible with the "stream" profile. ` +
            `Use profile "quality" for full-log algorithms, or choose a streaming-compatible algorithm such as "dfg" or "simd_streaming_dfg".`,
          { algorithmName: algorithmOverride, profile }
        )
      );
    }

    // Guard: validate algorithm parameters against known registry limits.
    // Catches obvious misconfiguration (e.g. population_size=100000 when max=500)
    // before any expensive work begins.
    const algorithmParams = config.algorithm?.parameters;
    if (algorithmParams) {
      const ALGORITHM_PARAM_LIMITS: Record<string, Record<string, { min?: number; max?: number }>> = {
        genetic_algorithm: { population_size: { min: 10, max: 500 }, generations: { min: 10, max: 1000 } },
        pso: { swarm_size: { min: 10, max: 300 }, iterations: { min: 10, max: 500 } },
        aco: { colony_size: { min: 10, max: 500 }, iterations: { min: 10, max: 1000 } },
        a_star: { max_iterations: { min: 1000, max: 100000 } },
        simulated_annealing: { initial_temperature: { min: 1, max: 1000 }, cooling_rate: { min: 0.8, max: 0.99 } },
        heuristic_miner: { dependency_threshold: { min: 0, max: 1 } },
        inductive_miner: { noise_threshold: { min: 0, max: 1 } },
        declare: { support_threshold: { min: 0, max: 1 } },
        alpha_plus_plus: { min_support: { min: 0, max: 1 }, causal_threshold: { min: 0, max: 1 } },
      };
      const limits = ALGORITHM_PARAM_LIMITS[algorithmOverride];
      if (limits) {
        for (const [paramName, { min, max }] of Object.entries(limits)) {
          const value = algorithmParams[paramName];
          if (value !== undefined && typeof value === 'number') {
            if (min !== undefined && value < min) {
              throw new PlannerError(
                createError(
                  'CONFIG_INVALID',
                  `Parameter "${paramName}" for algorithm "${algorithmOverride}" must be >= ${min}, got ${value}.`,
                  { algorithmName: algorithmOverride, paramName, value, min }
                )
              );
            }
            if (max !== undefined && value > max) {
              throw new PlannerError(
                createError(
                  'CONFIG_INVALID',
                  `Parameter "${paramName}" for algorithm "${algorithmOverride}" must be <= ${max}, got ${value}. ` +
                    `Large values may cause extremely long execution times.`,
                  { algorithmName: algorithmOverride, paramName, value, max }
                )
              );
            }
          }
        }
      }
    }

    // Keep analysis steps, replace discovery steps with the override
    const analysisOnly = pipelineSteps.filter(
      (s) =>
        !s.toString().includes('discover') &&
        !s.toString().includes('import') &&
        !s.toString().includes('convert') &&
        !s.toString().includes('export') &&
        !s.toString().includes('simulate')
    );
    pipelineSteps = [overrideStepType as PlanStepType, ...analysisOnly];
  }

  for (const algoType of pipelineSteps) {
    const algoName = algorithmNameFromStepType(algoType);
    let planStep: PlanStep;
    const algoParams = algorithmOverride
      ? { ...(config.execution.parameters || {}), ...(config.algorithm?.parameters || {}) }
      : config.execution.parameters || {};

    if (
      algoType.toString().includes('discover') ||
      algoType.toString().includes('import') ||
      algoType.toString().includes('convert') ||
      algoType.toString().includes('export') ||
      algoType.toString().includes('simulate')
    ) {
      // It's a discovery algorithm
      planStep = createAlgorithmStep(
        algoName,
        algoType as PlanStepType,
        algoParams,
        true,
        ['validate_source'],
        true
      );
    } else {
      // It's an analysis step
      planStep = createAnalysisStep(
        algoName,
        algoType as PlanStepType,
        config.execution.parameters || {},
        ['validate_source'],
        true
      );
    }

    steps.push(planStep);
    stepIds.add(planStep.id);
  }

  // 3b. Add ML analysis steps.
  //
  // Two sources of ML step requests:
  //   A) Profile auto-inclusion: balanced and quality profiles include all 6 ML algorithms
  //      (kernel registry: supportedProfiles: ['balanced', 'quality']).
  //      ML_STEP_TYPES (module-level constant) lists all 6, in canonical order.
  //   B) Explicit config.ml.tasks opt-in: caller requests specific ML tasks with parameters.
  //      Works on any profile, including fast/stream.
  //
  // Merge strategy: collect all desired (mlType, mlParams) pairs, then add each type at most
  // once.  Explicit config.ml.tasks overrides profile defaults for the same type.
  //
  // ml_classify = 'ml_classify' etc. — step IDs are the enum value string.
  // stepIds (Set<string>) already contains all step IDs pushed in section 3.

  const mlStepMap: Record<string, PlanStepType> = {
    classify: PlanStepType.ML_CLASSIFY,
    cluster: PlanStepType.ML_CLUSTER,
    forecast: PlanStepType.ML_FORECAST,
    anomaly: PlanStepType.ML_ANOMALY,
    regress: PlanStepType.ML_REGRESS,
    pca: PlanStepType.ML_PCA,
  };

  // Collect the desired params per ML step type.
  // Profile auto-inclusion uses empty params (inherits execution defaults).
  // Explicit config.ml.tasks overrides with caller-supplied params.
  const mlStepsToAdd = new Map<PlanStepType, Record<string, unknown>>();

  // A) Profile auto-inclusion
  if (profileIncludesML(profile)) {
    const defaultMlParams: Record<string, unknown> = {
      ...(config.execution.parameters || {}),
    };
    for (const mlType of ML_STEP_TYPES) {
      mlStepsToAdd.set(mlType, defaultMlParams);
    }
  }

  // B) Explicit config.ml.tasks (overrides profile defaults for any overlapping type)
  if (config.ml?.enabled && config.ml.tasks) {
    // NOTE: These removed fields are intentionally used here for baseline admissibility.
    // They are promoted to their nested counterparts by migrateMl() during validation.
    // Users are encouraged to migrate to: ml.classify.targetKey, ml.forecast.periods,
    // ml.pca.nComponents, and ml.cluster.eps respectively.
    const explicitMlParams: Record<string, unknown> = {
      ...(config.execution.parameters || {}),
      method: config.ml.method,
      k: config.ml.k,
      target_key: config.ml.targetKey,
      forecast_periods: config.ml.forecastPeriods,
      n_components: config.ml.nComponents,
      eps: config.ml.eps,
    };
    for (const mlTask of config.ml.tasks) {
      const mlType = mlStepMap[mlTask];
      if (mlType) {
        mlStepsToAdd.set(mlType, explicitMlParams); // override profile default if present
      }
    }
  }

  // Add each ML step exactly once (Map guarantees uniqueness per type)
  // Skip if a step with the same ID was already added via algorithm override in section 3.
  for (const [mlType, mlParams] of mlStepsToAdd) {
    const mlStep = createAnalysisStep(
      algorithmNameFromStepType(mlType),
      mlType,
      mlParams,
      ['validate_source'],
      true
    );
    if (!stepIds.has(mlStep.id)) {
      steps.push(mlStep);
      stepIds.add(mlStep.id);
    }
  }

  // Collect IDs of discovery/analysis steps for later dependencies
  const analysisStepIds = steps
    .filter(
      (s) =>
        s.type !== PlanStepType.BOOTSTRAP &&
        s.type !== PlanStepType.INIT_WASM &&
        s.type !== PlanStepType.LOAD_SOURCE &&
        s.type !== PlanStepType.VALIDATE_SOURCE
    )
    .map((s) => s.id);

  // 4. Optionally add report generation
  if (shouldGenerateReports) {
    steps.push(createGenerateReportsStep(analysisStepIds));
  }

  // 5. Optionally add sink writing
  const sinkDeps = shouldGenerateReports ? ['generate_reports'] : analysisStepIds;
  if (config.output) {
    steps.push(createSinkStep(sinkKind, sinkDeps));
  }

  // 6. Add cleanup step that depends on all prior steps
  const allStepIds = steps.map((s) => s.id);
  steps.push(createCleanupStep(allStepIds));

  // Build DAG from step dependencies
  const nodes = steps.map((s) => s.id);
  const edges: [string, string][] = [];

  for (const step of steps) {
    // Validate required field: dependsOn must always be an array
    if (!Array.isArray(step.dependsOn)) {
      throw new PlannerError(
        createError(
          'CONFIG_INVALID',
          `Step "${step.id}" is missing required field: dependsOn must be an array`,
          { stepId: step.id, dependsOn: step.dependsOn }
        )
      );
    }
    for (const dep of step.dependsOn) {
      edges.push([dep, step.id]);
    }
  }

  const graph: DAG = { nodes, edges };

  // Validate DAG
  const dagErrors = validateDAG(graph);
  if (dagErrors.length > 0) {
    throw new PlannerError(
      createError('CONFIG_INVALID', `Invalid execution plan DAG: ${dagErrors.join('; ')}`, {
        dagErrors,
      })
    );
  }

  // Verify topological sort is possible
  try {
    topologicalSort(graph);
  } catch (err) {
    throw new PlannerError(
      createError(
        'CONFIG_INVALID',
        `Execution plan contains cycles: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }

  // Generate deterministic hash
  const planHash = computePlanHash(planId, steps, graph, config);

  // Section 4.1: Create BudgetEnvelope for backend selection (Section 3.5)
  // Derive budget from profile and config
  const { budget } = createBudgetEnvelopeFromConfig(config, sourceKind);

  // ── Enhanced plan metadata ──────────────────────────────────────────────

  // Estimated duration: sum of all step durations (sequential model; parallelizable
  // steps are counted at their own cost since we don't know the worker count here)
  const estimated_duration_ms = steps.reduce(
    (sum, s) => sum + (s.estimatedDurationMs ?? 0),
    0
  );

  // Estimated peak memory: max across all steps
  const estimated_memory_mb = steps.reduce(
    (max, s) => Math.max(max, s.estimatedMemoryMB ?? 0),
    0
  );

  // Quality prediction: derived from profile and primary discovery algorithm
  const quality_prediction = deriveQualityPrediction(profile, config.algorithm?.name);

  // Event count hint for bench-calibrated duration estimates
  const eventCount = config.execution.maxEvents ?? 10_000;

  // Refine primary estimated_duration_ms with bench data when a single algorithm is specified
  const primaryAlgo = config.algorithm?.name;
  const bench_primary_ms = primaryAlgo ? benchEstimateDurationMs(primaryAlgo, eventCount) : undefined;
  const calibrated_duration_ms = bench_primary_ms !== undefined
    ? Math.max(1, Math.round(bench_primary_ms))
    : estimated_duration_ms;

  // Alternative plans: other good discovery algorithms for this profile
  const alternatives = deriveAlternatives(profile, config.algorithm?.name, calibrated_duration_ms, eventCount);

  // Warnings: advisory notes about this plan
  const warnings = deriveWarnings(profile, config, steps);

  // Quality efficiency for primary algorithm
  const primaryQualityTier = primaryAlgo ? (ALT_QUALITY_TIER[primaryAlgo] ?? 50) : 50;
  const quality_efficiency = calibrated_duration_ms > 0 ? primaryQualityTier / calibrated_duration_ms : 0;

  // Return the execution plan with BudgetEnvelope attached
  const executionPlan: ExecutionPlan = {
    id: planId,
    hash: planHash,
    config,
    steps,
    graph,
    sourceKind,
    sinkKind,
    profile,
    budget,
    estimated_duration_ms: calibrated_duration_ms,
    estimated_memory_mb,
    quality_prediction,
    alternatives,
    warnings,
    quality_efficiency,
  };

  // Cost-model drift alerts: only when caller provides runtime receipt evidence
  if (options?.receiptsDir && primaryAlgo) {
    try {
      const signal = checkCostModelDrift(options.receiptsDir, primaryAlgo);
      if (signal) {
        executionPlan.cost_drift_alerts = [signal];
      }
    } catch {
      // drift detection must never break planning
    }
  }

  return executionPlan;
}

// ── Quality prediction helpers ──────────────────────────────────────────────

/** Per-algorithm fitness score estimates (conservative, data-independent) */
const ALGORITHM_FITNESS_ESTIMATE: Record<string, number> = {
  dfg: 0.70,
  process_skeleton: 0.65,
  simd_streaming_dfg: 0.70,
  heuristic_miner: 0.78,
  alpha_plus_plus: 0.75,
  inductive_miner: 0.82,
  hill_climbing: 0.80,
  declare: 0.72,
  simulated_annealing: 0.83,
  a_star: 0.86,
  aco: 0.87,
  pso: 0.87,
  genetic_algorithm: 0.89,
  optimized_dfg: 0.88,
  ilp: 0.93,
};

/** Per-profile default fitness estimate when no explicit algorithm is set */
const PROFILE_FITNESS_ESTIMATE: Record<string, number> = {
  fast: 0.70,
  stream: 0.70,
  balanced: 0.78,
  quality: 0.89,
};

function deriveQualityPrediction(
  profile: string,
  algorithmName?: string
): import('./planner.js').QualityPrediction {
  // If a specific algorithm is named, use its estimate; otherwise fall back to profile.
  const fitness_estimate =
    (algorithmName ? ALGORITHM_FITNESS_ESTIMATE[algorithmName] : undefined) ??
    PROFILE_FITNESS_ESTIMATE[profile] ??
    0.75;

  // Confidence: high if we know the exact algorithm, medium for balanced/quality profiles,
  // low for fast/stream where quality varies most with log characteristics.
  let confidence: 'high' | 'medium' | 'low';
  if (algorithmName && algorithmName in ALGORITHM_FITNESS_ESTIMATE) {
    confidence = 'high';
  } else if (profile === 'quality' || profile === 'balanced') {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { fitness_estimate, confidence };
}

// ── Alternative plan helpers ────────────────────────────────────────────────

/** Speed tiers for alternative suggestions (1=fastest, 80=slowest).
 *  Values for benchmarked algorithms are derived from measured dispatchUs
 *  (see benchmark-costs.ts); unmeasured algorithms keep hand-authored values. */
const ALT_SPEED_TIER: Record<string, number> = {
  dfg: benchSpeedTier('dfg') ?? 5,
  process_skeleton: 3,
  simd_streaming_dfg: 2,
  heuristic_miner: benchSpeedTier('heuristic_miner') ?? 25,
  alpha_plus_plus: 20,
  inductive_miner: benchSpeedTier('inductive_miner') ?? 30,
  hill_climbing: benchSpeedTier('hill_climbing') ?? 35,
  simulated_annealing: benchSpeedTier('simulated_annealing') ?? 40,
  transition_system: benchSpeedTier('transition_system') ?? 30,
  log_to_trie: benchSpeedTier('log_to_trie') ?? 30,
  batches: benchSpeedTier('batches') ?? 30,
  correlation_miner: benchSpeedTier('correlation_miner') ?? 35,
  genetic_algorithm: 75,
  ilp: benchSpeedTier('ilp') ?? 80,
};

/** Quality tiers for alternative suggestions */
const ALT_QUALITY_TIER: Record<string, number> = {
  dfg: 30,
  process_skeleton: 25,
  simd_streaming_dfg: 30,
  heuristic_miner: 50,
  alpha_plus_plus: 50,
  inductive_miner: 55,
  genetic_algorithm: 80,
  ilp: 90,
};

function deriveAlternatives(
  profile: string,
  primaryAlgorithm: string | undefined,
  baseDurationMs: number,
  eventCount = 10_000
): AlternativePlan[] {
  // Map profile → sensible alternative algorithms
  const PROFILE_ALTERNATIVES: Record<string, Array<{ alg: string; reason: string }>> = {
    fast: [
      { alg: 'simd_streaming_dfg', reason: 'SIMD-accelerated variant of DFG; faster on large logs' },
      { alg: 'inductive_miner', reason: 'Higher quality than DFG at moderate cost' },
    ],
    stream: [
      { alg: 'dfg', reason: 'Non-streaming DFG for smaller logs' },
    ],
    balanced: [
      { alg: 'inductive_miner', reason: 'Sound process trees for conformance checking' },
      { alg: 'genetic_algorithm', reason: 'Higher quality if runtime allows' },
      { alg: 'dfg', reason: 'Faster exploration if runtime is constrained' },
    ],
    quality: [
      { alg: 'genetic_algorithm', reason: 'Faster than ILP with near-equivalent quality' },
      { alg: 'heuristic_miner', reason: 'Much faster fallback if quality profile times out' },
    ],
  };

  const candidates = PROFILE_ALTERNATIVES[profile] ?? [];

  return candidates
    .filter(({ alg }) => alg !== primaryAlgorithm)
    .map(({ alg, reason }) => {
      const speed_tier = ALT_SPEED_TIER[alg] ?? 50;
      const quality_tier = ALT_QUALITY_TIER[alg] ?? 50;
      // Bench-calibrated estimate when measured; speed-tier ratio fallback otherwise
      const bench_ms = benchEstimateDurationMs(alg, eventCount);
      let estimated_duration_ms: number;
      if (bench_ms !== undefined) {
        estimated_duration_ms = Math.max(1, Math.round(bench_ms));
      } else {
        const primarySpeedTier = primaryAlgorithm ? (ALT_SPEED_TIER[primaryAlgorithm] ?? 25) : 25;
        const speedRatio = primarySpeedTier > 0 ? speed_tier / primarySpeedTier : 1;
        estimated_duration_ms = Math.max(10, Math.round(baseDurationMs * speedRatio));
      }
      const quality_efficiency = estimated_duration_ms > 0 ? quality_tier / estimated_duration_ms : 0;
      return { algorithm: alg, reason, speed_tier, quality_tier, estimated_duration_ms, quality_efficiency };
    });
}

// ── Warning helpers ─────────────────────────────────────────────────────────

function deriveWarnings(profile: string, config: Config, steps: PlanStep[]): string[] {
  const warnings: string[] = [];

  // Warn if quality algorithm used with fast profile
  const algorithmName = config.algorithm?.name ?? '';
  const heavyAlgorithms = ['ilp', 'genetic_algorithm', 'aco', 'pso', 'simulated_annealing', 'a_star'];
  if (profile === 'fast' && heavyAlgorithms.some((a) => algorithmName === a)) {
    warnings.push(
      `Algorithm "${algorithmName}" is CPU-intensive; the "fast" profile may not provide enough time budget. Consider the "quality" profile.`
    );
  }

  // Warn if streaming algorithm in non-stream profile
  const streamingAlgorithms = ['simd_streaming_dfg', 'streaming_log'];
  if (profile !== 'stream' && streamingAlgorithms.some((a) => algorithmName === a)) {
    warnings.push(
      `Algorithm "${algorithmName}" is a streaming algorithm. Consider using the "stream" profile for optimal configuration.`
    );
  }

  // Warn if no discovery step is present (unusual configuration)
  const hasDiscovery = steps.some((s) =>
    s.type.startsWith('discover_') || s.type.startsWith('ml_')
  );
  if (!hasDiscovery) {
    warnings.push(
      'No discovery or ML step found in plan. Verify that the profile and algorithm configuration are correct.'
    );
  }

  // Warn if memory budget is very low for quality algorithms
  const maxMemory = config.execution?.maxMemoryMB ?? 0;
  if (maxMemory > 0 && maxMemory < 256 && heavyAlgorithms.some((a) => algorithmName === a)) {
    warnings.push(
      `Memory budget is set to ${maxMemory} MB, but "${algorithmName}" may require 256–2048 MB for large logs.`
    );
  }

  return warnings;
}

/**
 * Computes a deterministic BLAKE3 hash of the plan structure for reproducibility.
 * Hash is computed from normalized, sorted representation.
 *
 * @param planId - The plan UUID (excluded from hash for determinism across plan instances)
 * @param steps - The execution steps
 * @param graph - The dependency graph
 * @param config - The configuration
 * @returns 64-character hex-encoded BLAKE3 hash
 */
function computePlanHash(_planId: string, steps: PlanStep[], graph: DAG, config: Config): string {
  // Normalize and sort for deterministic hashing
  const normalized = {
    version: '1.0',
    steps: steps
      .map((s) => ({
        id: s.id,
        type: s.type,
        required: s.required,
        parallelizable: s.parallelizable,
        dependsOn: [...s.dependsOn].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    graph: {
      nodes: [...graph.nodes].sort(),
      edges: graph.edges
        .map(([src, tgt]) => [src, tgt])
        .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
    },
    config: {
      source: config.source.format,
      execution: config.execution.profile,
    },
  };

  const hashInput = JSON.stringify(normalized);
  const hash = blake3Hash(Buffer.from(hashInput, 'utf-8'));
  return hash.toString('hex');
}

/**
 * Converts an ExecutionPlan to the contracts Plan schema.
 * Maps internal steps to PlanNode kinds (source/algorithm/sink).
 */
export function toContractsPlan(executionPlan: ExecutionPlan): {
  schema_version: '1.0';
  plan_id: string;
  created_at: string;
  nodes: Array<{
    id: string;
    kind: 'source' | 'algorithm' | 'sink';
    label: string;
    config: Record<string, unknown>;
    version: string;
  }>;
  edges: Array<{ from: string; to: string; label?: string }>;
  metadata: { planner: string; planner_version: string; estimated_duration_ms?: number };
} {
  const nodes = executionPlan.steps.map((step) => {
    let kind: 'source' | 'algorithm' | 'sink';

    if (
      step.type === PlanStepType.BOOTSTRAP ||
      step.type === PlanStepType.INIT_WASM ||
      step.type === PlanStepType.LOAD_SOURCE ||
      step.type === PlanStepType.VALIDATE_SOURCE
    ) {
      kind = 'source';
    } else if (
      step.type === PlanStepType.WRITE_SINK ||
      step.type === PlanStepType.GENERATE_REPORTS ||
      step.type === PlanStepType.CLEANUP
    ) {
      kind = 'sink';
    } else {
      kind = 'algorithm';
    }

    return {
      id: step.id,
      kind,
      label: step.description,
      config: step.parameters,
      version: '1.0.0',
    };
  });

  const edges = executionPlan.graph.edges.map(([from, to]) => ({ from, to }));

  const totalDuration = executionPlan.steps.reduce(
    (sum, s) => sum + (s.estimatedDurationMs || 0),
    0
  );

  return {
    schema_version: '1.0',
    plan_id: executionPlan.id,
    created_at: new Date().toISOString(),
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    metadata: {
      planner: '@wasm4pm/planner',
      planner_version: '26.4.5',
      estimated_duration_ms: totalDuration,
    },
  };
}

/**
 * Default export for plan function
 */
export default plan;
