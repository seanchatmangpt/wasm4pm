/**
 * Execution plan generator for wasm4pm process mining engine
 * Generates deterministic, reproducible execution plans from configuration
 *
 * Per PRD §11: explain() == run()
 * The plan is used by both explain() and run() - only difference is explanation vs execution
 */

import { v4 as uuidv4 } from 'uuid';
import { hash as blake3Hash } from 'blake3';
import type { ErrorInfo, BudgetEnvelope } from '@wasm4pm/contracts';
import { createError, createDefaultBudgetEnvelope } from '@wasm4pm/contracts';
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
  sourceKind: string
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
export function plan(config: Config): ExecutionPlan {
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

  const algorithmOverride = config.algorithm?.name;
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
    let stepType = algoType;
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
    // NOTE: These deprecated fields are intentionally used here for backward compatibility.
    // They are promoted to their nested counterparts by migrateLegacyMl() during validation.
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
  };

  return executionPlan;
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
