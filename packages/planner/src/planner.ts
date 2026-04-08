/**
 * Execution plan generator for wasm4pm process mining engine
 * Generates deterministic, reproducible execution plans from configuration
 *
 * Per PRD §11: explain() == run()
 * The plan is used by both explain() and run() - only difference is explanation vs execution
 */

import { v4 as uuidv4 } from 'uuid';
import { hash as blake3Hash } from 'blake3';
import type { ErrorInfo } from '@wasm4pm/contracts';
import { createError } from '@wasm4pm/contracts';
import {
  ALGORITHM_ID_TO_STEP_TYPE,
  getProfileAlgorithms,
  ALGORITHM_DISPLAY_NAMES,
} from '@wasm4pm/contracts';
import type { DAG } from './dag';
import { topologicalSort, validateDAG } from './dag';
import type { PlanStep } from './steps';
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
} from './steps';

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
function getDefaultPipeline(profile: string): PlanStepType[] {
  const discoveryIds = getProfileAlgorithms(profile);
  const discoverySteps = discoveryIds
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
 * @returns ExecutionPlan with deterministic structure and BLAKE3 hash
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
    // Keep analysis steps, replace discovery steps with the override
    const analysisOnly = pipelineSteps.filter((s) => !s.toString().includes('discover'));
    pipelineSteps = [overrideStepType as PlanStepType, ...analysisOnly];
  }

  for (const algoType of pipelineSteps) {
    let stepType = algoType;
    const algoName = algorithmNameFromStepType(algoType);
    let planStep: PlanStep;
    const algoParams = algorithmOverride
      ? { ...(config.execution.parameters || {}), ...(config.algorithm?.parameters || {}) }
      : config.execution.parameters || {};

    if (algoType.toString().includes('discover')) {
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

  // 3b. Add ML analysis steps if configured
  if (config.ml?.enabled && config.ml.tasks && config.ml.tasks.length > 0) {
    const mlStepMap: Record<string, PlanStepType> = {
      classify: PlanStepType.ML_CLASSIFY,
      cluster: PlanStepType.ML_CLUSTER,
      forecast: PlanStepType.ML_FORECAST,
      anomaly: PlanStepType.ML_ANOMALY,
      regress: PlanStepType.ML_REGRESS,
      pca: PlanStepType.ML_PCA,
    };

    for (const mlTask of config.ml.tasks) {
      const mlType = mlStepMap[mlTask];
      if (!mlType) continue;

      const mlParams: Record<string, unknown> = {
        ...config.execution.parameters,
        method: config.ml.method,
        k: config.ml.k,
        target_key: config.ml.targetKey,
        forecast_periods: config.ml.forecastPeriods,
        n_components: config.ml.nComponents,
        eps: config.ml.eps,
      };

      const mlStep = createAnalysisStep(
        algorithmNameFromStepType(mlType),
        mlType,
        mlParams,
        ['validate_source'],
        true
      );
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

  // Return the execution plan
  const executionPlan: ExecutionPlan = {
    id: planId,
    hash: planHash,
    config,
    steps,
    graph,
    sourceKind,
    sinkKind,
    profile,
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
