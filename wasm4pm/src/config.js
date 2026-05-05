/**
 * Configuration Schema for wasm4pm Engine
 * Defines all configuration structures, validation, and execution profiles
 */
import { Wasm4pmError, ErrorCode, ErrorRecovery } from './errors.js';
/**
 * Supported data source formats
 */
export var SourceFormat;
(function (SourceFormat) {
  SourceFormat['XES'] = 'xes';
  SourceFormat['CSV'] = 'csv';
  SourceFormat['JSON'] = 'json';
  SourceFormat['PARQUET'] = 'parquet';
  SourceFormat['ARROW'] = 'arrow';
})(SourceFormat || (SourceFormat = {}));
/**
 * Execution profile names and their characteristics
 */
export var ExecutionProfile;
(function (ExecutionProfile) {
  /** Fast discovery: DFG + statistics (1-5ms per 100 events) */
  ExecutionProfile['FAST'] = 'fast';
  /** Balanced: Alpha++, stats, conformance, variants (20-50ms per 100 events) */
  ExecutionProfile['BALANCED'] = 'balanced';
  /** High quality: Multiple algorithms, comprehensive analysis (100-500ms per 100 events) */
  ExecutionProfile['QUALITY'] = 'quality';
  /** Streaming mode: Streaming DFG and conformance checking */
  ExecutionProfile['STREAM'] = 'stream';
  /** Research mode: All algorithms including genetic, PSO, A*, simulated annealing */
  ExecutionProfile['RESEARCH'] = 'research';
})(ExecutionProfile || (ExecutionProfile = {}));
/**
 * Execution mode determines WASM runtime behavior
 */
export var ExecutionMode;
(function (ExecutionMode) {
  /** Compute everything synchronously */
  ExecutionMode['SYNC'] = 'sync';
  /** Offload to Web Workers (browser only) */
  ExecutionMode['WORKER'] = 'worker';
  /** Stream results incrementally */
  ExecutionMode['STREAMING'] = 'streaming';
})(ExecutionMode || (ExecutionMode = {}));
/**
 * Types of pipeline steps
 */
export var StepType;
(function (StepType) {
  // Discovery algorithms
  StepType['DFG'] = 'dfg';
  StepType['ALPHA_PLUS_PLUS'] = 'alpha_plus_plus';
  StepType['HEURISTIC_MINER'] = 'heuristic_miner';
  StepType['INDUCTIVE_MINER'] = 'inductive_miner';
  StepType['GENETIC'] = 'genetic';
  StepType['PSO'] = 'pso';
  StepType['A_STAR'] = 'a_star';
  StepType['ILP'] = 'ilp';
  StepType['ACO'] = 'aco';
  StepType['SIMULATED_ANNEALING'] = 'simulated_annealing';
  // Analysis
  StepType['STATISTICS'] = 'statistics';
  StepType['CONFORMANCE'] = 'conformance';
  StepType['VARIANTS'] = 'variants';
  StepType['PERFORMANCE'] = 'performance';
  StepType['CLUSTERING'] = 'clustering';
  // Utilities
  StepType['FILTER'] = 'filter';
  StepType['TRANSFORM'] = 'transform';
  StepType['VALIDATE'] = 'validate';
})(StepType || (StepType = {}));
/**
 * Validates a configuration object for structural correctness
 * Returns an array of validation issues (empty if valid)
 *
 * @param config - Configuration object to validate
 * @returns Array of ValidationIssue objects (empty if valid)
 */
export function validateConfig(config) {
  const issues = [];
  // Type check
  if (!config || typeof config !== 'object') {
    return [
      {
        path: '$',
        type: 'type_error',
        message: 'Configuration must be a non-null object',
        suggestion: 'Ensure config is passed as an object literal or parsed JSON',
      },
    ];
  }
  const cfg = config;
  // Check version
  if (cfg.version !== '1.0') {
    issues.push({
      path: 'version',
      type: 'invalid',
      message: `Invalid or missing version. Expected "1.0", got ${cfg.version}`,
      suggestion: 'Set version to "1.0"',
    });
  }
  // Check source
  if (!cfg.source || typeof cfg.source !== 'object') {
    issues.push({
      path: 'source',
      type: 'missing',
      message: 'source configuration is required',
      suggestion: 'Add a source configuration object with format and content',
    });
  } else {
    const source = cfg.source;
    if (!source.format || !Object.values(SourceFormat).includes(source.format)) {
      issues.push({
        path: 'source.format',
        type: 'invalid',
        message: `Invalid or missing source format. Expected one of: ${Object.values(SourceFormat).join(', ')}`,
        suggestion: `Set source.format to a valid format`,
      });
    }
    if (!source.content || typeof source.content !== 'string') {
      issues.push({
        path: 'source.content',
        type: 'missing',
        message: 'source.content is required and must be a string',
        suggestion: 'Provide the source data as a string',
      });
    }
  }
  // Check execution
  if (!cfg.execution || typeof cfg.execution !== 'object') {
    issues.push({
      path: 'execution',
      type: 'missing',
      message: 'execution configuration is required',
      suggestion: 'Add an execution configuration object with a profile',
    });
  } else {
    const execution = cfg.execution;
    if (!execution.profile || !Object.values(ExecutionProfile).includes(execution.profile)) {
      issues.push({
        path: 'execution.profile',
        type: 'invalid',
        message: `Invalid or missing execution profile. Expected one of: ${Object.values(ExecutionProfile).join(', ')}`,
        suggestion: 'Set execution.profile to a valid profile name',
      });
    }
    if (execution.mode && !Object.values(ExecutionMode).includes(execution.mode)) {
      issues.push({
        path: 'execution.mode',
        type: 'invalid',
        message: `Invalid execution mode. Expected one of: ${Object.values(ExecutionMode).join(', ')}`,
        suggestion: 'Set execution.mode to a valid execution mode or omit it',
      });
    }
    if (execution.maxEvents !== undefined && typeof execution.maxEvents !== 'number') {
      issues.push({
        path: 'execution.maxEvents',
        type: 'type_error',
        message: 'execution.maxEvents must be a number',
      });
    }
    if (execution.maxMemoryMB !== undefined && typeof execution.maxMemoryMB !== 'number') {
      issues.push({
        path: 'execution.maxMemoryMB',
        type: 'type_error',
        message: 'execution.maxMemoryMB must be a number',
      });
    }
    if (execution.timeoutMs !== undefined && typeof execution.timeoutMs !== 'number') {
      issues.push({
        path: 'execution.timeoutMs',
        type: 'type_error',
        message: 'execution.timeoutMs must be a number',
      });
    }
  }
  // Validate pipeline if provided
  if (cfg.pipeline && Array.isArray(cfg.pipeline)) {
    const pipeline = cfg.pipeline;
    pipeline.forEach((step, idx) => {
      if (!step || typeof step !== 'object') {
        issues.push({
          path: `pipeline[${idx}]`,
          type: 'type_error',
          message: 'Pipeline step must be an object',
        });
      } else {
        const s = step;
        if (!s.id || typeof s.id !== 'string') {
          issues.push({
            path: `pipeline[${idx}].id`,
            type: 'missing',
            message: 'Pipeline step must have an id (string)',
          });
        }
        if (!s.type || !Object.values(StepType).includes(s.type)) {
          issues.push({
            path: `pipeline[${idx}].type`,
            type: 'invalid',
            message: `Invalid step type. Expected one of: ${Object.values(StepType).join(', ')}`,
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
export function assertConfigValid(config) {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    const issueMessages = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Wasm4pmError(
      `Configuration validation failed: ${issueMessages}`,
      ErrorCode.CONFIG_INVALID,
      {
        nextAction: ErrorRecovery.RECONFIGURE,
        context: { issues },
      }
    );
  }
}
/**
 * Resolves an execution profile to a default pipeline of steps
 * Returns the recommended sequence of algorithms and analyses for the profile
 *
 * @param profile - Execution profile
 * @returns Array of PipelineStep objects representing the default pipeline
 */
export function resolveProfile(profile) {
  switch (profile) {
    case ExecutionProfile.FAST:
      return [
        {
          id: 'step_dfg',
          type: StepType.DFG,
          required: true,
          parallelizable: true,
        },
        {
          id: 'step_stats',
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ['step_dfg'],
          parallelizable: true,
        },
      ];
    case ExecutionProfile.BALANCED:
      return [
        {
          id: 'step_alpha',
          type: StepType.ALPHA_PLUS_PLUS,
          required: true,
          parallelizable: true,
        },
        {
          id: 'step_stats',
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ['step_alpha'],
          parallelizable: true,
        },
        {
          id: 'step_conformance',
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ['step_alpha'],
          parallelizable: true,
        },
        {
          id: 'step_variants',
          type: StepType.VARIANTS,
          required: true,
          dependsOn: ['step_alpha'],
          parallelizable: true,
        },
      ];
    case ExecutionProfile.QUALITY:
      return [
        // Primary algorithm with alternatives
        {
          id: 'step_genetic',
          type: StepType.GENETIC,
          required: true,
          parallelizable: true,
          parameters: { generations: 50, populationSize: 30 },
        },
        {
          id: 'step_ilp',
          type: StepType.ILP,
          required: false,
          dependsOn: ['step_genetic'],
          parallelizable: true,
          parameters: { timeout: 10000 },
        },
        {
          id: 'step_heuristic',
          type: StepType.HEURISTIC_MINER,
          required: true,
          parallelizable: true,
        },
        // Comprehensive analysis
        {
          id: 'step_stats',
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ['step_genetic'],
          parallelizable: true,
        },
        {
          id: 'step_conformance',
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ['step_genetic'],
          parallelizable: true,
        },
        {
          id: 'step_variants',
          type: StepType.VARIANTS,
          required: true,
          dependsOn: ['step_genetic'],
          parallelizable: true,
        },
        {
          id: 'step_performance',
          type: StepType.PERFORMANCE,
          required: true,
          dependsOn: ['step_genetic'],
          parallelizable: true,
        },
      ];
    case ExecutionProfile.STREAM:
      return [
        {
          id: 'step_stream_dfg',
          type: StepType.DFG,
          required: true,
          parallelizable: true,
          parameters: { streaming: true },
        },
        {
          id: 'step_stream_conformance',
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ['step_stream_dfg'],
          parallelizable: true,
          parameters: { streaming: true },
        },
      ];
    case ExecutionProfile.RESEARCH:
      return [
        // All discovery algorithms
        {
          id: 'step_dfg',
          type: StepType.DFG,
          required: true,
          parallelizable: true,
        },
        {
          id: 'step_alpha',
          type: StepType.ALPHA_PLUS_PLUS,
          required: true,
          parallelizable: true,
        },
        {
          id: 'step_genetic',
          type: StepType.GENETIC,
          required: true,
          parallelizable: true,
          parameters: { generations: 100, populationSize: 50 },
        },
        {
          id: 'step_pso',
          type: StepType.PSO,
          required: true,
          parallelizable: true,
          parameters: { particles: 30, iterations: 100 },
        },
        {
          id: 'step_astar',
          type: StepType.A_STAR,
          required: true,
          parallelizable: true,
        },
        {
          id: 'step_aco',
          type: StepType.ACO,
          required: true,
          parallelizable: true,
          parameters: { ants: 20, iterations: 50 },
        },
        {
          id: 'step_annealing',
          type: StepType.SIMULATED_ANNEALING,
          required: true,
          parallelizable: true,
          parameters: { temperature: 100, coolingRate: 0.95 },
        },
        {
          id: 'step_ilp',
          type: StepType.ILP,
          required: false,
          parallelizable: true,
          parameters: { timeout: 30000 },
        },
        // Full analysis
        {
          id: 'step_stats',
          type: StepType.STATISTICS,
          required: true,
          dependsOn: ['step_dfg'],
          parallelizable: true,
        },
        {
          id: 'step_conformance',
          type: StepType.CONFORMANCE,
          required: true,
          dependsOn: ['step_alpha'],
          parallelizable: true,
        },
        {
          id: 'step_variants',
          type: StepType.VARIANTS,
          required: true,
          dependsOn: ['step_dfg'],
          parallelizable: true,
        },
        {
          id: 'step_performance',
          type: StepType.PERFORMANCE,
          required: true,
          dependsOn: ['step_dfg'],
          parallelizable: true,
        },
        {
          id: 'step_clustering',
          type: StepType.CLUSTERING,
          required: true,
          dependsOn: ['step_dfg'],
          parallelizable: true,
        },
      ];
    default:
      const _exhaustive = profile;
      throw new Wasm4pmError(`Unknown execution profile: ${profile}`, ErrorCode.CONFIG_INVALID, {
        nextAction: ErrorRecovery.RECONFIGURE,
      });
  }
}
//# sourceMappingURL=config.js.map
