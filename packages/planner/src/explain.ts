/**
 * Execution plan explanation in human-readable markdown format
 *
 * Per PRD §11: explain() == run()
 * The explanation is generated from the same plan used for execution
 */

import type { Config, ExecutionPlan } from './planner';
import { plan } from './planner';
import { topologicalSort } from './dag';

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
  const maxMemory = Math.max(
    ...(executionPlan.steps.map((s) => s.estimatedMemoryMB || 0) || [0])
  );
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
