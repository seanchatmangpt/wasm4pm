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

/** Subset of kernel registry metadata needed by explain() */
const ALGORITHM_HINTS: Record<string, AlgorithmHints> = {
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

/**
 * Export functions
 */
export default explain;
