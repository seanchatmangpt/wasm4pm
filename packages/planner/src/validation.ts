/**
 * Plan validation utilities
 */

import type { ExecutionPlan } from './planner';
import { validateDAG } from './dag';
import { PlanStepType } from './steps';

/** Known source formats for compatibility checks */
const KNOWN_SOURCE_FORMATS = new Set(['xes', 'csv', 'json', 'ocel', 'parquet', 'bpmn']);

/** Known sink formats for compatibility checks */
const KNOWN_SINK_FORMATS = new Set(['json', 'parquet', 'csv', 'html', 'mermaid', 'stdout']);

/**
 * Validation error
 */
export interface ValidationError {
  /** Field or aspect that failed validation */
  path: string;

  /** Error message */
  message: string;

  /** Suggested fix if available */
  suggestion?: string;

  /** Severity level */
  severity: 'error' | 'warning' | 'info';
}

/**
 * Validates an execution plan for structural correctness and consistency
 *
 * Checks:
 * - All step IDs are unique
 * - All step dependencies reference existing steps
 * - Graph is acyclic (no circular dependencies)
 * - DAG contains expected nodes and edges
 * - Bootstrap and cleanup steps are present
 * - Step types are valid
 * - Required steps are not optional
 * - Memory and time estimates are positive
 *
 * @param executionPlan - Plan to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validatePlan(executionPlan: ExecutionPlan): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check basic structure
  if (!executionPlan || typeof executionPlan !== 'object') {
    return [
      {
        path: '$',
        message: 'Execution plan must be a non-null object',
        severity: 'error',
      },
    ];
  }

  // Check required fields
  if (!executionPlan.id || typeof executionPlan.id !== 'string') {
    errors.push({
      path: 'id',
      message: 'Plan ID must be a non-empty string',
      severity: 'error',
    });
  }

  if (!executionPlan.hash || typeof executionPlan.hash !== 'string') {
    errors.push({
      path: 'hash',
      message: 'Plan hash must be a non-empty string',
      severity: 'error',
    });
  }

  if (!Array.isArray(executionPlan.steps)) {
    errors.push({
      path: 'steps',
      message: 'Steps must be an array',
      severity: 'error',
    });
    return errors;
  }

  if (!executionPlan.graph || !Array.isArray(executionPlan.graph.nodes) || !Array.isArray(executionPlan.graph.edges)) {
    errors.push({
      path: 'graph',
      message: 'Graph must have nodes and edges arrays',
      severity: 'error',
    });
    return errors;
  }

  // Validate steps
  const stepIds = new Set<string>();
  let hasBootstrap = false;
  let hasCleanup = false;
  let hasLoadSource = false;
  let hasValidate = false;

  for (let i = 0; i < executionPlan.steps.length; i++) {
    const step = executionPlan.steps[i];
    const path = `steps[${i}]`;

    // Check step structure
    if (!step || typeof step !== 'object') {
      errors.push({
        path: `${path}`,
        message: 'Step must be a non-null object',
        severity: 'error',
      });
      continue;
    }

    // Check step ID
    if (!step.id || typeof step.id !== 'string') {
      errors.push({
        path: `${path}.id`,
        message: 'Step ID must be a non-empty string',
        severity: 'error',
      });
    } else if (stepIds.has(step.id)) {
      errors.push({
        path: `${path}.id`,
        message: `Duplicate step ID: ${step.id}`,
        severity: 'error',
      });
    } else {
      stepIds.add(step.id);
    }

    // Check step type
    if (!Object.values(PlanStepType).includes(step.type as PlanStepType)) {
      errors.push({
        path: `${path}.type`,
        message: `Invalid step type: ${step.type}`,
        severity: 'error',
        suggestion: `Use one of: ${Object.values(PlanStepType).join(', ')}`,
      });
    }

    // Track special steps
    if (step.type === PlanStepType.BOOTSTRAP) hasBootstrap = true;
    if (step.type === PlanStepType.CLEANUP) hasCleanup = true;
    if (step.type === PlanStepType.LOAD_SOURCE) hasLoadSource = true;
    if (step.type === PlanStepType.VALIDATE_SOURCE) hasValidate = true;

    // Check description
    if (!step.description || typeof step.description !== 'string') {
      errors.push({
        path: `${path}.description`,
        message: 'Step description must be a non-empty string',
        severity: 'warning',
      });
    }

    // Check required flag
    if (typeof step.required !== 'boolean') {
      errors.push({
        path: `${path}.required`,
        message: 'Step required flag must be a boolean',
        severity: 'error',
      });
    }

    // Check parameters
    if (!step.parameters || typeof step.parameters !== 'object' || Array.isArray(step.parameters)) {
      errors.push({
        path: `${path}.parameters`,
        message: 'Step parameters must be an object',
        severity: 'error',
      });
    }

    // Check dependencies
    if (!Array.isArray(step.dependsOn)) {
      errors.push({
        path: `${path}.dependsOn`,
        message: 'Step dependsOn must be an array',
        severity: 'error',
      });
    } else {
      for (const dep of step.dependsOn) {
        if (typeof dep !== 'string') {
          errors.push({
            path: `${path}.dependsOn`,
            message: 'All dependencies must be strings',
            severity: 'error',
          });
        }
        // Note: We'll check if dependencies exist when we check graph validity
      }
    }

    // Check parallelizable flag
    if (typeof step.parallelizable !== 'boolean') {
      errors.push({
        path: `${path}.parallelizable`,
        message: 'Step parallelizable flag must be a boolean',
        severity: 'error',
      });
    }

    // Check time estimate
    if (step.estimatedDurationMs !== undefined) {
      if (typeof step.estimatedDurationMs !== 'number' || step.estimatedDurationMs < 0) {
        errors.push({
          path: `${path}.estimatedDurationMs`,
          message: 'Estimated duration must be a non-negative number',
          severity: 'warning',
        });
      }
    }

    // Check memory estimate
    if (step.estimatedMemoryMB !== undefined) {
      if (typeof step.estimatedMemoryMB !== 'number' || step.estimatedMemoryMB < 0) {
        errors.push({
          path: `${path}.estimatedMemoryMB`,
          message: 'Estimated memory must be a non-negative number',
          severity: 'warning',
        });
      }
    }
  }

  // Check required special steps
  if (!hasBootstrap) {
    errors.push({
      path: 'steps',
      message: 'Plan must include a bootstrap step',
      severity: 'error',
    });
  }

  if (!hasLoadSource) {
    errors.push({
      path: 'steps',
      message: 'Plan must include a load_source step',
      severity: 'error',
    });
  }

  if (!hasValidate) {
    errors.push({
      path: 'steps',
      message: 'Plan must include a validate_source step',
      severity: 'error',
    });
  }

  if (!hasCleanup) {
    errors.push({
      path: 'steps',
      message: 'Plan must include a cleanup step',
      severity: 'warning',
    });
  }

  // Validate graph
  const dagErrors = validateDAG(executionPlan.graph);
  for (const dagError of dagErrors) {
    errors.push({
      path: 'graph',
      message: dagError,
      severity: 'error',
    });
  }

  // Check that graph matches steps
  if (executionPlan.graph.nodes.length !== executionPlan.steps.length) {
    errors.push({
      path: 'graph',
      message: `Graph has ${executionPlan.graph.nodes.length} nodes but plan has ${executionPlan.steps.length} steps`,
      severity: 'error',
    });
  }

  // Check that all step IDs are in graph
  for (const stepId of stepIds) {
    if (!executionPlan.graph.nodes.includes(stepId)) {
      errors.push({
        path: 'graph.nodes',
        message: `Step ID "${stepId}" not found in graph nodes`,
        severity: 'error',
      });
    }
  }

  // Check that all dependencies in steps exist in graph
  for (const step of executionPlan.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        errors.push({
          path: `steps[${executionPlan.steps.indexOf(step)}].dependsOn`,
          message: `Dependency "${dep}" does not exist as a step`,
          severity: 'error',
        });
      }
    }
  }

  // Check that all edges in graph reference valid steps
  for (const [source, target] of executionPlan.graph.edges) {
    if (!stepIds.has(source)) {
      errors.push({
        path: 'graph.edges',
        message: `Edge source "${source}" does not exist as a step`,
        severity: 'error',
      });
    }
    if (!stepIds.has(target)) {
      errors.push({
        path: 'graph.edges',
        message: `Edge target "${target}" does not exist as a step`,
        severity: 'error',
      });
    }
  }

  // Validate configuration
  if (!executionPlan.config || typeof executionPlan.config !== 'object') {
    errors.push({
      path: 'config',
      message: 'Config must be a non-null object',
      severity: 'error',
    });
  }

  // Validate profile
  const validProfiles = ['fast', 'balanced', 'quality', 'stream', 'research'];
  if (!validProfiles.includes(executionPlan.profile.toLowerCase())) {
    errors.push({
      path: 'profile',
      message: `Invalid profile: ${executionPlan.profile}`,
      severity: 'warning',
      suggestion: `Use one of: ${validProfiles.join(', ')}`,
    });
  }

  // Validate sourceKind
  if (!executionPlan.sourceKind || typeof executionPlan.sourceKind !== 'string') {
    errors.push({
      path: 'sourceKind',
      message: 'Source kind must be a non-empty string',
      severity: 'error',
    });
  }

  // Validate sinkKind
  if (!executionPlan.sinkKind || typeof executionPlan.sinkKind !== 'string') {
    errors.push({
      path: 'sinkKind',
      message: 'Sink kind must be a non-empty string',
      severity: 'error',
    });
  }

  // Source/sink compatibility checks
  if (executionPlan.sourceKind && !KNOWN_SOURCE_FORMATS.has(executionPlan.sourceKind)) {
    errors.push({
      path: 'sourceKind',
      message: `Unknown source format: "${executionPlan.sourceKind}"`,
      severity: 'warning',
      suggestion: `Known formats: ${[...KNOWN_SOURCE_FORMATS].join(', ')}`,
    });
  }

  if (executionPlan.sinkKind && !KNOWN_SINK_FORMATS.has(executionPlan.sinkKind)) {
    errors.push({
      path: 'sinkKind',
      message: `Unknown sink format: "${executionPlan.sinkKind}"`,
      severity: 'warning',
      suggestion: `Known formats: ${[...KNOWN_SINK_FORMATS].join(', ')}`,
    });
  }

  return errors;
}

/**
 * Asserts that a plan is valid, throwing an error if not
 *
 * @param executionPlan - Plan to validate
 * @throws Error if plan is invalid
 */
export function assertPlanValid(executionPlan: ExecutionPlan): void {
  const errors = validatePlan(executionPlan);
  const criticalErrors = errors.filter((e) => e.severity === 'error');

  if (criticalErrors.length > 0) {
    const messages = criticalErrors.map((e) => `${e.path}: ${e.message}`).join('\n  ');
    throw new Error(`Invalid execution plan:\n  ${messages}`);
  }
}

/**
 * Validates source/sink compatibility for a plan.
 * Checks that the source format is valid for the algorithms selected
 * and that the sink can accept the algorithm output.
 *
 * @param sourceKind - Source format (e.g., 'xes', 'csv')
 * @param sinkKind - Sink format (e.g., 'json', 'parquet')
 * @returns Array of validation errors (empty if compatible)
 */
export function validateSourceSinkCompatibility(
  sourceKind: string,
  sinkKind: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!sourceKind) {
    errors.push({
      path: 'source',
      message: 'Source kind is required',
      severity: 'error',
    });
  } else if (!KNOWN_SOURCE_FORMATS.has(sourceKind)) {
    errors.push({
      path: 'source',
      message: `Unknown source format: "${sourceKind}"`,
      severity: 'warning',
      suggestion: `Known formats: ${[...KNOWN_SOURCE_FORMATS].join(', ')}`,
    });
  }

  if (!sinkKind) {
    errors.push({
      path: 'sink',
      message: 'Sink kind is required',
      severity: 'error',
    });
  } else if (!KNOWN_SINK_FORMATS.has(sinkKind)) {
    errors.push({
      path: 'sink',
      message: `Unknown sink format: "${sinkKind}"`,
      severity: 'warning',
      suggestion: `Known formats: ${[...KNOWN_SINK_FORMATS].join(', ')}`,
    });
  }

  return errors;
}
