/**
 * Enhanced validation error formatting for detailed, user-friendly messages.
 * Provides exact field paths, allowed values, and helpful suggestions.
 */

import type { z, ZodTooSmallIssue, ZodTooBigIssue } from 'zod';
import type { Config } from '../types.js';
import { executionProfileSchema, mlTaskSchema, rlAgentSchema, ALGORITHM_IDS } from '../schema.js';

/** Cast once — avoids `as any` on every `.includes()` call. */
const ALGORITHM_IDS_STR = ALGORITHM_IDS as readonly string[];

export interface ValidationErrorContext {
  field: string;
  value: unknown;
  expectedType?: string;
  allowedValues?: string[];
  constraints?: Record<string, unknown>;
  suggestion?: string;
}

/**
 * Format a Zod error with helpful suggestions and exact field paths.
 *
 * Example output:
 *   Validation Error at [execution.profile]
 *     Value: "hyperfast"
 *     Expected: one of ['fast', 'balanced', 'quality', 'stream']
 *     Did you mean: "fast"? (Levenshtein distance 2)
 */
export function formatDetailedZodError(error: z.ZodError, config: unknown): string {
  const lines: string[] = [
    `Configuration Validation Failed (${error.errors.length} issue${error.errors.length === 1 ? '' : 's'}):`,
    '',
  ];

  for (const issue of error.errors) {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    const value = getValueAtPath(config as Record<string, unknown>, issue.path);

    const context: ValidationErrorContext = {
      field: fieldPath,
      value,
      expectedType: inferExpectedType(issue.code, fieldPath),
      allowedValues: inferAllowedValues(fieldPath),
      constraints: inferConstraints(issue),
      suggestion: generateSuggestion(fieldPath, value),
    };

    lines.push(formatIssue(context, issue.message));
  }

  return lines.join('\n');
}

/**
 * Validate algorithm compatibility with the selected deployment profile.
 * Returns warnings if algorithm is not available in the profile.
 */
export function validateAlgorithmProfile(
  algorithm: string,
  profile: 'mobile' | 'iot' | 'edge' | 'fog' | 'browser'
): { compatible: boolean; warning?: string } {
  const profileAlgos = getAlgorithmsForProfile(profile);

  if (!ALGORITHM_IDS_STR.includes(algorithm)) {
    return {
      compatible: false,
      warning: `Algorithm "${algorithm}" is not registered. Available: ${ALGORITHM_IDS.slice(0, 5).join(', ')}...`,
    };
  }

  if (!profileAlgos.includes(algorithm)) {
    const availableInBrowser = getAlgorithmsForProfile('browser').includes(algorithm);
    return {
      compatible: false,
      warning: availableInBrowser
        ? `Algorithm "${algorithm}" is not available in profile "${profile}". Upgrade to "browser" profile to use it.`
        : `Algorithm "${algorithm}" is not available in any profile.`,
    };
  }

  return { compatible: true };
}

/**
 * Warn on suspicious ML configurations (e.g., k > dataset size).
 */
export function validateMlConfig(
  config: Partial<Config>,
  logSize?: number
): Array<{ field: string; warning: string }> {
  const warnings: Array<{ field: string; warning: string }> = [];

  if (!config.ml?.enabled) return warnings;

  const { classify, cluster, pca, forecast } = config.ml || {};

  // Cluster k warning
  if (cluster && cluster.k && logSize) {
    if (cluster.k > logSize) {
      warnings.push({
        field: 'ml.cluster.k',
        warning: `k=${cluster.k} is larger than log size (${logSize} traces). K-means will fail.`,
      });
    }
    if (cluster.k > Math.sqrt(logSize)) {
      warnings.push({
        field: 'ml.cluster.k',
        warning: `k=${cluster.k} is aggressive for log size ${logSize}. Consider k ≤ ${Math.ceil(Math.sqrt(logSize))}.`,
      });
    }
  }

  // PCA n_components warning
  if (pca && pca.nComponents && logSize) {
    if (pca.nComponents >= logSize) {
      warnings.push({
        field: 'ml.pca.nComponents',
        warning: `nComponents=${pca.nComponents} should be < number of samples (${logSize}).`,
      });
    }
  }

  // Forecast periods warning
  if (forecast && forecast.periods && forecast.periods > 100) {
    warnings.push({
      field: 'ml.forecast.periods',
      warning: `periods=${forecast.periods} is very large. Consider ≤ 50 for typical processes.`,
    });
  }

  // Classification target key warning
  if (classify && classify.targetKey && !config.source) {
    warnings.push({
      field: 'ml.classify.targetKey',
      warning: `targetKey="${classify.targetKey}" should exist in your event log. Verify this attribute is present.`,
    });
  }

  return warnings;
}

/**
 * Warn on suspicious RL configurations.
 */
export function validateRlConfig(
  config: Partial<Config>
): Array<{ field: string; warning: string }> {
  const warnings: Array<{ field: string; warning: string }> = [];

  if (!config.rl?.enabled) return warnings;

  const { learning_rate, epsilon, convergence } = config.rl;

  if (learning_rate && learning_rate > 0.5) {
    warnings.push({
      field: 'rl.learning_rate',
      warning: `learning_rate=${learning_rate} is very high (>0.5). Consider 0.01–0.1 for stable learning.`,
    });
  }

  if (epsilon && epsilon > 0.5) {
    warnings.push({
      field: 'rl.epsilon',
      warning: `epsilon=${epsilon} means >50% random actions. Consider 0.05–0.2 for typical exploration.`,
    });
  }

  if (convergence && convergence.min_cycles && convergence.min_cycles > 1000) {
    warnings.push({
      field: 'rl.convergence.min_cycles',
      warning: `min_cycles=${convergence.min_cycles} is very large. Typical values are 50–200.`,
    });
  }

  if (
    convergence &&
    convergence.target_reward_improvement &&
    convergence.target_reward_improvement < 0.001
  ) {
    warnings.push({
      field: 'rl.convergence.target_reward_improvement',
      warning: `target_reward_improvement=${convergence.target_reward_improvement} is very small. Consider ≥ 0.01.`,
    });
  }

  return warnings;
}

/**
 * Warn on suspicious prediction configurations.
 */
export function validatePredictionConfig(
  config: Partial<Config>
): Array<{ field: string; warning: string }> {
  const warnings: Array<{ field: string; warning: string }> = [];

  if (!config.prediction?.enabled) return warnings;

  const { ngramOrder, driftWindowSize, drift } = config.prediction;

  if (ngramOrder && ngramOrder < 2) {
    warnings.push({
      field: 'prediction.ngramOrder',
      warning: `ngramOrder=${ngramOrder} is < 2. N-gram order must be ≥ 2.`,
    });
  }

  if (ngramOrder && ngramOrder > 5) {
    warnings.push({
      field: 'prediction.ngramOrder',
      warning: `ngramOrder=${ngramOrder} is very high. Domain typical: 2–4.`,
    });
  }

  if (driftWindowSize && driftWindowSize < 5) {
    warnings.push({
      field: 'prediction.driftWindowSize',
      warning: `driftWindowSize=${driftWindowSize} is very small. Consider ≥ 5 for stable EWMA.`,
    });
  }

  if (drift?.ewma_alpha && drift.ewma_alpha > 0.5) {
    warnings.push({
      field: 'prediction.drift.ewma_alpha',
      warning: `ewma_alpha=${drift.ewma_alpha} is high (>0.5). Use 0.1–0.3 for typical drift detection.`,
    });
  }

  return warnings;
}

// --- Internal helpers ---

function formatIssue(context: ValidationErrorContext, message: string): string {
  const lines = [`  ✗ [${context.field}]`, `      Received: ${JSON.stringify(context.value)}`];

  if (context.expectedType) {
    lines.push(`      Expected: ${context.expectedType}`);
  }

  if (context.allowedValues && context.allowedValues.length > 0) {
    if (context.allowedValues.length <= 5) {
      lines.push(`      Allowed values: ${context.allowedValues.map((v) => `'${v}'`).join(' | ')}`);
    } else {
      lines.push(
        `      Allowed values: ${context.allowedValues
          .slice(0, 3)
          .map((v) => `'${v}'`)
          .join(', ')}, ... (${context.allowedValues.length} total)`
      );
    }
  }

  if (context.constraints && Object.keys(context.constraints).length > 0) {
    const constraintStr = Object.entries(context.constraints)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`      Constraints: ${constraintStr}`);
  }

  if (context.suggestion) {
    lines.push(`      Hint: ${context.suggestion}`);
  }

  lines.push(`      Error: ${message}`);

  return lines.join('\n');
}

function getValueAtPath(obj: Record<string, unknown>, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const segment of path) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function inferExpectedType(code: string, fieldPath: string): string | undefined {
  if (code === 'invalid_type') return 'check schema for correct type';
  if (code === 'invalid_enum_value') return 'enum value (one of allowed options)';
  if (code === 'too_small' || code === 'too_big') return 'number within allowed range';
  if (fieldPath.includes('profile')) return 'execution profile: fast|balanced|quality|stream';
  if (fieldPath.includes('agent'))
    return 'RL agent: QLearning|SARSA|DoubleQLearning|ExpectedSARSA|REINFORCE';
  if (fieldPath.includes('task')) return 'ML task: classify|cluster|forecast|anomaly|regress|pca';
  return undefined;
}

function inferAllowedValues(fieldPath: string): string[] | undefined {
  if (fieldPath.includes('.profile') || fieldPath === 'execution.profile') {
    return ['fast', 'balanced', 'quality', 'stream'];
  }
  if (fieldPath.includes('.agent') || fieldPath === 'rl.agents') {
    return ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA', 'REINFORCE'];
  }
  if (fieldPath.includes('.task') || fieldPath === 'ml.tasks') {
    return ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'];
  }
  if (fieldPath.includes('.exporter') || fieldPath === 'observability.otel.exporter') {
    return ['otlp', 'console', 'none'];
  }
  if (fieldPath.includes('.kind')) {
    if (fieldPath.includes('source')) return ['file', 'stream', 'http'];
    if (fieldPath.includes('sink')) return ['stdout', 'file', 'http'];
  }
  if (fieldPath.includes('format')) {
    return ['human', 'json'];
  }
  if (fieldPath.includes('logLevel')) {
    return ['debug', 'info', 'warn', 'error'];
  }
  return undefined;
}

function inferConstraints(issue: z.ZodIssue): Record<string, unknown> {
  const constraints: Record<string, unknown> = {};

  if (issue.code === 'too_small' && 'minimum' in issue) {
    constraints.minimum = (issue as ZodTooSmallIssue).minimum;
  }
  if (issue.code === 'too_big' && 'maximum' in issue) {
    constraints.maximum = (issue as ZodTooBigIssue).maximum;
  }

  return constraints;
}

function generateSuggestion(fieldPath: string, value: unknown): string | undefined {
  const str = String(value).toLowerCase();

  // Profile suggestions
  if (fieldPath.includes('profile')) {
    const profiles = ['fast', 'balanced', 'quality', 'stream'];
    const close = profiles.find((p) => levenshteinDistance(str, p) <= 2);
    if (close) return `Did you mean "${close}"?`;
  }

  // Agent suggestions
  if (fieldPath.includes('agent')) {
    const agents = ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA', 'REINFORCE'];
    const close = agents.find((a) => levenshteinDistance(str, a.toLowerCase()) <= 2);
    if (close) return `Did you mean "${close}"?`;
  }

  // Task suggestions
  if (fieldPath.includes('task')) {
    const tasks = ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'];
    const close = tasks.find((t) => levenshteinDistance(str, t) <= 2);
    if (close) return `Did you mean "${close}"?`;
  }

  // Algorithm suggestions (only show first few)
  if (fieldPath.includes('algorithm')) {
    const matching = ALGORITHM_IDS.filter(
      (a) => levenshteinDistance(str, String(a).toLowerCase()) <= 3
    ).slice(0, 3);
    if (matching.length > 0) {
      return `Did you mean: ${matching.map((m) => `"${m}"`).join(', ')}?`;
    }
  }

  return undefined;
}

/**
 * Levenshtein distance for typo suggestions (iterative to avoid stack overflow).
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Create DP table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

function getAlgorithmsForProfile(
  profile: 'mobile' | 'iot' | 'edge' | 'fog' | 'browser'
): string[] {
  // Simplified profiles; in production, this would be derived from feature flags
  const allAlgos = ALGORITHM_IDS;
  const advanced: readonly string[] = [
    'genetic_algorithm',
    'ilp',
    'aco',
    'pso',
    'a_star',
    'ml_classify',
    'ml_cluster',
    'ml_forecast',
    'ml_anomaly',
    'ml_regress',
    'ml_pca',
  ];
  const ocel: readonly string[] = ['log_to_ocel'];
  const powl: readonly string[] = ['powl_to_process_tree'];

  if (profile === 'browser') return [...allAlgos];
  if (profile === 'fog') return allAlgos.filter((a) => !powl.includes(a));
  if (profile === 'edge')
    return allAlgos.filter((a) => !advanced.includes(a) && !ocel.includes(a));
  if (profile === 'iot')
    return allAlgos.filter(
      (a) =>
        ![...advanced, ...ocel, 'simulated_annealing', 'hill_climbing', 'declare'].includes(a)
    );
  if (profile === 'mobile')
    return allAlgos.filter(
      (a) =>
        ![
          ...advanced,
          ...ocel,
          'simulated_annealing',
          'hill_climbing',
          'declare',
          'heuristic_miner',
          'inductive_miner',
        ].includes(a)
    );

  return [...allAlgos];
}
