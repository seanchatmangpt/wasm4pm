/**
 * Execution plan explanation in human-readable markdown format
 *
 * Per PRD §11: explain() == run()
 * The explanation is generated from the same plan used for execution
 */

import type { Config, ExecutionPlan } from './planner.js';
import { plan } from './planner.js';
import { topologicalSort } from './dag.js';
import {
  ALGORITHM_ID_TO_STEP_TYPE,
  ALGORITHM_DISPLAY_NAMES,
} from '@wasm4pm/contracts';

// ─── Algorithm quality and speed data (sourced from kernel registry) ───────
// These are embedded here so explain() can surface rich per-algorithm context
// without importing the full @wasm4pm/kernel package (avoids circular deps).
// Kept in sync with packages/kernel/src/registry.ts via code review.

interface AlgorithmHints {
  speedTier: number;     // 1-80, lower = faster
  qualityTier: number;   // 0-100, higher = better
  complexity: string;    // Big-O complexity class
  scalesWell: boolean;   // handles 100k+ events
  robustToNoise: boolean;
  /**
   * Actual output type — overrides ALGORITHM_OUTPUT_TYPES from contracts where
   * the contracts registry has a stale value. The kernel registry (registry.ts)
   * is the authoritative source for output types; the contracts registry may lag
   * after Phase 4 audits corrected several algorithms from 'petrinet' to 'dfg'.
   */
  outputType: string;
}

export type { AlgorithmHints };

/** Subset of kernel registry metadata needed by explain() */
export const ALGORITHM_HINTS: Record<string, AlgorithmHints> = {
  // outputType sourced from packages/kernel/src/registry.ts (authoritative after Phase 4 audit)
  dfg:                  { speedTier: 5,  qualityTier: 30,  complexity: 'O(n)',         scalesWell: true,  robustToNoise: true,  outputType: 'dfg'      },
  process_skeleton:     { speedTier: 3,  qualityTier: 25,  complexity: 'O(n)',         scalesWell: true,  robustToNoise: true,  outputType: 'dfg'      },
  simd_streaming_dfg:   { speedTier: 1,  qualityTier: 30,  complexity: 'O(n)',         scalesWell: true,  robustToNoise: true,  outputType: 'dfg'      },
  alpha_plus_plus:      { speedTier: 20, qualityTier: 50,  complexity: 'O(n²)',        scalesWell: false, robustToNoise: false, outputType: 'petrinet' },
  heuristic_miner:      { speedTier: 25, qualityTier: 50,  complexity: 'O(n²)',        scalesWell: true,  robustToNoise: true,  outputType: 'dfg'      },
  inductive_miner:      { speedTier: 30, qualityTier: 55,  complexity: 'O(n log n)',   scalesWell: true,  robustToNoise: true,  outputType: 'tree'     },
  hill_climbing:        { speedTier: 40, qualityTier: 55,  complexity: 'O(n²)',        scalesWell: true,  robustToNoise: true,  outputType: 'dfg'      },
  declare:              { speedTier: 35, qualityTier: 50,  complexity: 'O(n²)',        scalesWell: true,  robustToNoise: true,  outputType: 'declare'  },
  simulated_annealing:  { speedTier: 55, qualityTier: 65,  complexity: 'Exponential',  scalesWell: false, robustToNoise: true,  outputType: 'dfg'      },
  a_star:               { speedTier: 60, qualityTier: 70,  complexity: 'Exponential',  scalesWell: false, robustToNoise: false, outputType: 'dfg'      },
  aco:                  { speedTier: 65, qualityTier: 75,  complexity: 'Exponential',  scalesWell: false, robustToNoise: true,  outputType: 'dfg'      },
  pso:                  { speedTier: 70, qualityTier: 75,  complexity: 'Exponential',  scalesWell: false, robustToNoise: true,  outputType: 'dfg'      },
  genetic_algorithm:    { speedTier: 75, qualityTier: 80,  complexity: 'Exponential',  scalesWell: false, robustToNoise: true,  outputType: 'dfg'      },
  optimized_dfg:        { speedTier: 70, qualityTier: 85,  complexity: 'NP-Hard',      scalesWell: false, robustToNoise: false, outputType: 'dfg'      },
  ilp:                  { speedTier: 80, qualityTier: 90,  complexity: 'NP-Hard',      scalesWell: false, robustToNoise: false, outputType: 'petrinet' },
  alignments:           { speedTier: 20, qualityTier: 90,  complexity: 'NP-Hard',      scalesWell: false, robustToNoise: true,  outputType: 'analytics'},
};

/** Speed tier → human-readable label */
function speedLabel(tier: number): string {
  if (tier <= 5)  return 'very fast (sub-millisecond)';
  if (tier <= 25) return 'fast';
  if (tier <= 45) return 'moderate';
  if (tier <= 65) return 'slow';
  return 'very slow (may take minutes on large logs)';
}

/** Quality tier → human-readable label */
function qualityLabel(tier: number): string {
  if (tier >= 85) return 'excellent';
  if (tier >= 70) return 'very high';
  if (tier >= 55) return 'high';
  if (tier >= 40) return 'moderate';
  return 'basic';
}

/**
 * Generate an algorithm-specific advisory line for the explain() output.
 * Returns empty string when no hints are available for the algorithm.
 *
 * Uses ALGORITHM_HINTS.outputType (sourced from kernel registry, Phase 4 corrected)
 * rather than ALGORITHM_OUTPUT_TYPES from contracts, which may be stale for
 * algorithms where the Phase 4 audit changed the output type from 'petrinet' to 'dfg'.
 */
function algorithmAdvisory(algorithmId: string): string {
  const hints = ALGORITHM_HINTS[algorithmId];
  if (!hints) return '';

  const parts: string[] = [
    `Speed: ${speedLabel(hints.speedTier)} (tier ${hints.speedTier}/80)`,
    `Quality: ${qualityLabel(hints.qualityTier)} (score ${hints.qualityTier}/100)`,
    `Complexity: ${hints.complexity}`,
    hints.robustToNoise ? 'Noise-resistant: yes' : 'Noise-resistant: no (needs clean log)',
    `Output type: ${hints.outputType}`,
  ];

  const warnings: string[] = [];
  if (!hints.scalesWell) {
    warnings.push(
      `⚠ This algorithm does not scale to large logs (>100k events). ` +
        `Consider "heuristic_miner" or "dfg" for large-scale discovery.`
    );
  }
  if (hints.complexity === 'NP-Hard' || hints.complexity === 'Exponential') {
    warnings.push(
      `⚠ ${hints.complexity} complexity — execution time grows rapidly with log size. ` +
        `Set execution.timeoutMs to avoid indefinite hangs on large logs.`
    );
  }

  const advisory = parts.join(' | ');
  return warnings.length > 0 ? `${advisory}\n${warnings.join('\n')}` : advisory;
}

/**
 * Generates a human-readable markdown explanation of an execution plan
 *
 * The explanation includes:
 * - Plan metadata (ID, hash, profile)
 * - Configuration summary
 * - Execution steps in order
 * - Dependency graph visualization
 * - Resource estimates
 *
 * @param config - Configuration to explain
 * @returns Markdown string describing the plan
 */
export function explain(config: Config): string {
  // Generate the plan
  const executionPlan = plan(config);

  // Build markdown explanation
  const lines: string[] = [];

  // Header
  lines.push('# Execution Plan');
  lines.push('');

  // Metadata
  lines.push('## Plan Information');
  lines.push(`- **ID**: \`${executionPlan.id}\``);
  lines.push(`- **Hash**: \`${executionPlan.hash}\``);
  lines.push(`- **Profile**: ${executionPlan.profile}`);
  lines.push(`- **Source**: ${executionPlan.sourceKind}`);
  lines.push(`- **Sink**: ${executionPlan.sinkKind}`);
  lines.push('');

  // Configuration summary
  lines.push('## Configuration');
  lines.push(`- **Profile**: ${config.execution.profile}`);
  lines.push(`- **Execution Mode**: ${config.execution.mode || 'sync'}`);

  if (config.execution.maxEvents) {
    lines.push(`- **Max Events**: ${config.execution.maxEvents}`);
  }
  if (config.execution.maxMemoryMB) {
    lines.push(`- **Max Memory**: ${config.execution.maxMemoryMB} MB`);
  }
  if (config.execution.timeoutMs) {
    lines.push(`- **Timeout**: ${config.execution.timeoutMs} ms`);
  }

  // Algorithm override — surface it in the explanation so the narrative
  // matches plan() output. Without this, a user reading explain() cannot tell
  // their algorithm override was applied (parity violation per PRD §11).
  if (config.algorithm?.name) {
    const algoId = config.algorithm.name;
    const displayName = ALGORITHM_DISPLAY_NAMES[algoId] ?? algoId;
    lines.push(`- **Algorithm Override**: \`${algoId}\` (${displayName})`);

    // Surface algorithm-specific quality/speed/output advisory
    const advisory = algorithmAdvisory(algoId);
    if (advisory) {
      lines.push(`- **Algorithm Advisory**: ${advisory}`);
    }

    if (config.algorithm.parameters && Object.keys(config.algorithm.parameters).length > 0) {
      lines.push('- **Algorithm Parameters**:');
      for (const [key, value] of Object.entries(config.algorithm.parameters)) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        lines.push(`  - ${key}: ${valueStr}`);
      }
    }
  }

  // ML tasks — explain() previously dropped these from the narrative even
  // though plan() emits ML_* steps for them. Surfacing them keeps explain()
  // honest about what plan() will execute.
  if (config.ml?.enabled && config.ml.tasks && config.ml.tasks.length > 0) {
    lines.push(`- **ML Tasks**: ${config.ml.tasks.join(', ')}`);
    if (config.ml.method) {
      lines.push(`- **ML Method**: ${config.ml.method}`);
    }
  }

  lines.push('');

  // Budget Envelope — plan() always attaches a BudgetEnvelope per Section 4.1
  // for backend selection. explain() must surface it so the explanation
  // accurately reflects the dispatch constraints the runner will honor.
  lines.push('## Budget Envelope');
  lines.push(`- **Latency Budget**: ${executionPlan.budget.latencyBudget}`);
  const memMB = executionPlan.budget.memoryBudget
    ? `${(executionPlan.budget.memoryBudget / (1024 * 1024)).toFixed(0)} MB`
    : 'unlimited';
  lines.push(`- **Memory Budget**: ${memMB}`);
  lines.push(`- **Quality Floor**: ${executionPlan.budget.qualityFloor}`);
  lines.push(`- **Execution Mode**: ${executionPlan.budget.mode}`);
  lines.push(
    `- **Environment**: browser-safe=${executionPlan.budget.environment.browserSafe}, python-available=${executionPlan.budget.environment.pythonAvailable}`
  );
  lines.push('');

  // Execution steps
  lines.push('## Execution Steps');
  lines.push('');

  const sortedSteps = executionPlan.steps;
  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];

    lines.push(`### ${i + 1}. ${formatStepTitle(step.type)}`);
    lines.push(`**ID**: \`${step.id}\``);
    lines.push(`**Description**: ${step.description}`);

    // Surface per-algorithm quality/speed advisory for discovery steps.
    // Reverse-lookup the kernel algorithm ID from the step type, then pull hints.
    const algoEntry = Object.entries(ALGORITHM_ID_TO_STEP_TYPE).find(([, st]) => st === step.type);
    if (algoEntry) {
      const [algoId] = algoEntry;
      const advisory = algorithmAdvisory(algoId);
      if (advisory) {
        lines.push(`**Algorithm Advisory**: ${advisory}`);
      }
    }

    if (step.required) {
      lines.push('**Status**: Required');
    } else {
      lines.push('**Status**: Optional');
    }

    if (step.parallelizable) {
      lines.push('**Parallelizable**: Yes');
    } else {
      lines.push('**Parallelizable**: No');
    }

    if (step.dependsOn.length > 0) {
      const deps = step.dependsOn.map((d) => `\`${d}\``).join(', ');
      lines.push(`**Depends On**: ${deps}`);
    }

    if (step.estimatedDurationMs) {
      lines.push(`**Estimated Duration**: ${step.estimatedDurationMs} ms`);
    }

    if (step.estimatedMemoryMB) {
      lines.push(`**Estimated Memory**: ${step.estimatedMemoryMB} MB`);
    }

    if (Object.keys(step.parameters).length > 0) {
      lines.push('**Parameters**:');
      for (const [key, value] of Object.entries(step.parameters)) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        lines.push(`  - ${key}: ${valueStr}`);
      }
    }

    lines.push('');
  }

  // Dependency graph
  lines.push('## Dependency Graph');
  lines.push('');
  lines.push('```');

  // Try to create ASCII representation of the DAG
  const dag = executionPlan.graph;
  const adjList = new Map<string, string[]>();

  // Build adjacency list
  for (const node of dag.nodes) {
    adjList.set(node, []);
  }
  for (const [source, target] of dag.edges) {
    adjList.get(source)!.push(target);
  }

  // Print nodes with their dependencies
  for (const step of sortedSteps) {
    const deps = step.dependsOn;
    if (deps.length === 0) {
      lines.push(`${step.id}`);
    } else {
      const depStr = deps.join(', ');
      lines.push(`${step.id} <- [${depStr}]`);
    }
  }

  lines.push('```');
  lines.push('');

  // Resource summary
  lines.push('## Resource Estimates');
  lines.push('');

  const totalDuration = executionPlan.steps.reduce(
    (sum, s) => sum + (s.estimatedDurationMs || 0),
    0
  );
  const maxMemory = Math.max(...(executionPlan.steps.map((s) => s.estimatedMemoryMB || 0) || [0]));
  const parallelizableCount = executionPlan.steps.filter((s) => s.parallelizable).length;

  lines.push(`- **Total Sequential Duration**: ${totalDuration} ms`);
  lines.push(`- **Peak Memory Usage**: ${maxMemory} MB`);
  lines.push(`- **Parallelizable Steps**: ${parallelizableCount} of ${executionPlan.steps.length}`);
  lines.push('');

  // Footer note about reproducibility
  lines.push('## Reproducibility');
  lines.push('');
  lines.push('This plan is deterministic and reproducible:');
  lines.push('- The same configuration always produces the same plan ID and hash');
  lines.push('- The dependency graph ensures consistent ordering across runs');
  lines.push('- Use this plan for both `explain()` and `run()` operations');
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats a step type as a human-readable title
 */
function formatStepTitle(stepType: string): string {
  return stepType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generates a summary explanation (shorter version)
 * Useful for logging or quick reference
 *
 * @param config - Configuration to summarize
 * @returns Short markdown summary
 */
export function explainBrief(config: Config): string {
  const executionPlan = plan(config);

  const lines: string[] = [];

  lines.push(`# Plan: ${executionPlan.profile} (${executionPlan.sourceKind})`);
  lines.push(`Hash: ${executionPlan.hash.substring(0, 12)}...`);
  lines.push('');
  lines.push('Steps:');

  for (const step of executionPlan.steps) {
    const required = step.required ? '✓' : '○';
    const parallel = step.parallelizable ? '[P]' : '[S]';
    lines.push(`  ${required} ${parallel} ${step.description}`);
  }

  const totalDuration = executionPlan.steps.reduce(
    (sum, s) => sum + (s.estimatedDurationMs || 0),
    0
  );
  lines.push(`\nEstimated: ${totalDuration}ms`);

  return lines.join('\n');
}

// ─── explainStructured ───────────────────────────────────────────────────────

/**
 * Structured result returned by explainStructured().
 * Carries all explain() content in machine-readable form.
 */
export interface ExplainResult {
  /** One-line human-readable summary of the plan */
  summary: string;

  /** Details about the chosen algorithm */
  algorithm_choice: {
    name: string;
    reason: string;
    speed_tier: string;
    quality_tier: string;
  };

  /** Details about the chosen execution profile */
  profile_choice: {
    name: string;
    description: string;
  };

  /** Estimated wall-clock runtime as a human-readable string, e.g. "~1.3 seconds" */
  estimated_runtime: string;

  /**
   * Academic context: van der Aalst reference or foundational paper for the algorithm.
   * Returns empty string if no reference is known.
   */
  academic_context: string;

  /** The full ExecutionPlan that backs this explanation */
  plan: ExecutionPlan;

  /** Non-fatal advisory warnings from the plan (e.g. large log, memory constraints) */
  warnings: string[];
}

/** Van der Aalst academic references per algorithm */
const ACADEMIC_REFERENCES: Record<string, string> = {
  dfg: 'van der Aalst (2016), Process Mining (Springer), Chapter 5 — Directly-Follows Graph.',
  process_skeleton: 'van der Aalst (2011), Process Mining: Discovery, Conformance and Enhancement of Business Processes.',
  simd_streaming_dfg: 'van der Aalst (2018), Responsible Data Science, streaming DFG extension.',
  heuristic_miner: 'Weijters & van der Aalst (2003), Rediscovering workflow models from event-based data using little thumb. CIT.',
  alpha_plus_plus: 'van der Aalst, Weijters & Maruster (2004), Workflow Mining: Discovering Process Models from Event Logs. IEEE TKDE.',
  inductive_miner: 'Leemans, Fahland & van der Aalst (2013), Discovering Block-Structured Process Models from Event Logs. PETRI NETS.',
  hill_climbing: 'de Medeiros et al. (2007), Genetic Process Mining. ACSD.',
  declare: 'Pesic & van der Aalst (2006), A Declarative Approach for Flexible Business Processes. BPMDS.',
  simulated_annealing: 'Maruster, Weijters & van der Aalst (2006), A Rule-Based Approach for Process Discovery. CIT.',
  a_star: 'van der Aalst, Adriansyah & van Dongen (2012), Replaying history on process models for conformance checking. WIDM.',
  aco: 'van der Aalst (2010), Process discovery: An introduction. Process Mining, Springer.',
  pso: 'de Medeiros & van der Aalst (2004), Process Equivalence: Comparing Two Process Models. BPM.',
  genetic_algorithm: 'de Medeiros et al. (2007), Genetic Process Mining. ACSD. Uses evolutionary search over the space of Petri nets.',
  optimized_dfg: 'van der Aalst & Song (2004), Mining Social Networks: Uncovering Interaction Patterns in Business Processes. BPM.',
  ilp: 'van der Aalst & Weijters (2004), Process Mining: A Research Agenda. Computers in Industry. ILP yields optimal soundness guarantees.',
  alignments: 'Adriansyah, van Dongen & van der Aalst (2011), Conformance Checking Using Cost-Based Fitness Analysis. EDOC.',
};

/** Profile descriptions for the structured explain result */
const PROFILE_DESCRIPTIONS: Record<string, string> = {
  fast: 'O(n) algorithms only; sub-second on logs up to 1M events. Best for interactive exploration.',
  stream: 'Streaming SIMD-accelerated DFG; constant-memory processing for unbounded event streams.',
  balanced: 'Heuristic Miner + Alpha++ with noise filtering and ML analysis. Best general-purpose choice.',
  quality: 'Genetic Algorithm + ILP with full conformance and ML. Highest model quality; may be slow on large logs.',
};

/** Human-readable runtime label from milliseconds */
function formatRuntime(ms: number): string {
  if (ms < 10) return '< 10 ms';
  if (ms < 1000) return `~${ms} ms`;
  if (ms < 60_000) return `~${(ms / 1000).toFixed(1)} seconds`;
  return `~${(ms / 60_000).toFixed(1)} minutes`;
}

/**
 * Generate a structured, machine-readable explanation of the execution plan.
 *
 * Returns an ExplainResult with all fields populated from the plan and
 * algorithm metadata. Useful for programmatic inspection, logging, and
 * driving CLI human-output formatters.
 *
 * @param config - Configuration to explain
 * @returns ExplainResult with all required fields
 */
export function explainStructured(config: Config): ExplainResult {
  const executionPlan = plan(config);

  // Determine the primary discovery algorithm
  const profile = executionPlan.profile;
  const algorithmName = config.algorithm?.name ?? _primaryDiscoveryAlgorithm(profile);
  const hints = ALGORITHM_HINTS[algorithmName];

  const speedTierStr = hints
    ? `${speedLabel(hints.speedTier)} (tier ${hints.speedTier}/80)`
    : 'unknown';
  const qualityTierStr = hints
    ? `${qualityLabel(hints.qualityTier)} (score ${hints.qualityTier}/100)`
    : 'unknown';

  const algorithmDisplayName =
    ALGORITHM_DISPLAY_NAMES[algorithmName as keyof typeof ALGORITHM_DISPLAY_NAMES] ??
    algorithmName;

  const reason = hints
    ? `${algorithmDisplayName} — ${speedLabel(hints.speedTier)} speed, ${qualityLabel(hints.qualityTier)} quality, ${hints.complexity} complexity`
    : `${algorithmDisplayName} (no registry hints available)`;

  const profileDescription = PROFILE_DESCRIPTIONS[profile] ??
    `Execution profile "${profile}" (no description available).`;

  const summary = `Profile "${profile}" with algorithm "${algorithmName}": ` +
    `${formatRuntime(executionPlan.estimated_duration_ms)} estimated, ` +
    `${executionPlan.estimated_memory_mb} MB peak memory.`;

  const academicContext = ACADEMIC_REFERENCES[algorithmName] ?? '';

  return {
    summary,
    algorithm_choice: {
      name: algorithmName,
      reason,
      speed_tier: speedTierStr,
      quality_tier: qualityTierStr,
    },
    profile_choice: {
      name: profile,
      description: profileDescription,
    },
    estimated_runtime: formatRuntime(executionPlan.estimated_duration_ms),
    academic_context: academicContext,
    plan: executionPlan,
    warnings: executionPlan.warnings,
  };
}

/** Return the default primary discovery algorithm for a profile */
function _primaryDiscoveryAlgorithm(profile: string): string {
  const defaults: Record<string, string> = {
    fast: 'dfg',
    stream: 'simd_streaming_dfg',
    balanced: 'heuristic_miner',
    quality: 'genetic_algorithm',
  };
  return defaults[profile] ?? 'dfg';
}

/**
 * Export functions
 */
export default explain;
