/**
 * root-cause.ts
 * Root Cause Diagnosis for Conformance Failures
 *
 * Analyzes conformance results and log statistics to classify failure categories:
 * - low_fitness: Token replay fitness < 0.85
 * - insufficient_coverage: Rare activities missing from model
 * - activity_ordering_violation: Activities occur in wrong sequence
 * - rework_loop: Repeated activities indicate process deviation
 * - insufficient_traces: Log too small for reliable discovery
 */

/**
 * Diagnosis result from root cause analysis
 */
export interface Diagnosis {
  /** Primary failure category */
  category:
    | 'low_fitness'
    | 'insufficient_coverage'
    | 'activity_ordering_violation'
    | 'rework_loop'
    | 'insufficient_traces'
    | 'healthy';

  /** Severity level (low, medium, high, critical) */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Human-readable explanation */
  explanation: string;

  /** Actionable recommendations */
  recommendations: string[];

  /** Supporting evidence (confidence 0-1) */
  confidence: number;

  /** Diagnostic metrics */
  metrics: {
    fitness?: number;
    trace_count?: number;
    activity_count?: number;
    rework_ratio?: number;
    variant_count?: number;
    coverage_percentage?: number;
  };
}

/**
 * Log statistics provided to diagnosis function
 */
export interface LogStats {
  event_count: number;
  trace_count: number;
  unique_activities: number;
  unique_variants: number;
  min_trace_length: number;
  max_trace_length: number;
  avg_trace_length: number;
  rework_ratio?: number; // Ratio of repeated activities per trace
  activity_coverage?: Record<string, number>; // Activity name → occurrence count
}

/**
 * Conformance result for diagnosis
 */
export interface ConformanceResult {
  fitness: number;
  precision: number | null;
  conformance_rate: number;
  deviating_cases: number;
  deviating_traces?: Array<{
    case_id: string;
    trace_fitness: number;
    tokens_missing: number;
    tokens_remaining: number;
    deviations?: Array<{
      activity: string;
      deviation_type: string;
    }>;
  }>;
}

/**
 * Diagnose root cause of conformance failures
 *
 * @param conformanceResult - Result from conformance checking
 * @param logStats - Statistics extracted from the event log
 * @returns Diagnosis object with category, severity, and recommendations
 *
 * @example
 * ```ts
 * const diagnosis = diagnose(
 *   { fitness: 0.72, precision: 0.80, conformance_rate: 0.72 },
 *   { event_count: 500, trace_count: 50, unique_activities: 8 }
 * );
 * console.log(diagnosis.category); // "low_fitness"
 * console.log(diagnosis.recommendations);
 * ```
 */
export function diagnose(conformanceResult: ConformanceResult, logStats: LogStats): Diagnosis {
  // Healthy case: fitness >= 0.85
  if (conformanceResult.fitness >= 0.85) {
    return {
      category: 'healthy',
      severity: 'low',
      explanation: 'Process model conforms well to the observed log.',
      recommendations: [
        'No immediate action required.',
        'Monitor for drift in future runs.',
      ],
      confidence: 0.95,
      metrics: { fitness: conformanceResult.fitness },
    };
  }

  // Insufficient traces: too few cases to reliably assess conformance
  if (logStats.trace_count < 10) {
    return {
      category: 'insufficient_traces',
      severity: 'high',
      explanation: `Only ${logStats.trace_count} traces found. Conformance assessment may be unreliable with such a small sample.`,
      recommendations: [
        'Collect more event data (target: 50+ traces minimum).',
        'Use logs with longer time windows to capture more process instances.',
        'Ensure all relevant process variants are represented in the log.',
      ],
      confidence: 0.9,
      metrics: {
        fitness: conformanceResult.fitness,
        trace_count: logStats.trace_count,
      },
    };
  }

  // Rework loop detection: high frequency of repeated activities
  const reworkRatio = logStats.rework_ratio ?? estimateReworkRatio(logStats);
  if (reworkRatio > 0.3) {
    return {
      category: 'rework_loop',
      severity: 'high',
      explanation: `High rework ratio (${(reworkRatio * 100).toFixed(1)}%) detected. Traces contain many repeated activities, indicating process deviations.`,
      recommendations: [
        'Investigate root causes of rework (system errors, compliance exceptions, etc.).',
        'If rework is expected, update the process model to include rework loops.',
        'Separate normal and exceptional process variants for distinct models.',
        'Consider filtering out error recovery paths before model discovery.',
      ],
      confidence: 0.85,
      metrics: {
        fitness: conformanceResult.fitness,
        rework_ratio: reworkRatio,
      },
    };
  }

  // Activity ordering violations: deviations show activities out of sequence
  const orderingViolations = detectOrderingViolations(conformanceResult);
  if (orderingViolations > 0.5) {
    return {
      category: 'activity_ordering_violation',
      severity: 'critical',
      explanation:
        'Many traces violate expected activity ordering. The discovered model does not capture real execution sequences.',
      recommendations: [
        'Re-run discovery with a stricter algorithm (e.g., inductive_miner, genetic_algorithm).',
        'Check for process exceptions or variant handling in the source system.',
        'Consider splitting into multiple sub-processes if multiple flows coexist.',
        'Validate activity naming and concept:name mapping in the event log.',
      ],
      confidence: 0.8,
      metrics: {
        fitness: conformanceResult.fitness,
      },
    };
  }

  // Insufficient coverage: model missing activities present in log
  const coverage = computeCoverage(conformanceResult, logStats);
  const coveragePercent = coverage * 100;
  if (coverage < 0.8) {
    return {
      category: 'insufficient_coverage',
      severity: 'high',
      explanation: `Model covers only ${coveragePercent.toFixed(1)}% of observed activities. Rare or conditional activities are missing.`,
      recommendations: [
        'Use quality-focused algorithm (genetic_algorithm, ilp) to capture rare variants.',
        'Increase discovery algorithm iterations or population size.',
        'Check for low-frequency activities that might indicate exceptions.',
        'Consider raising discovery algorithm thresholds to capture edge cases.',
      ],
      confidence: 0.75,
      metrics: {
        fitness: conformanceResult.fitness,
        activity_count: logStats.unique_activities,
        coverage_percentage: coveragePercent,
      },
    };
  }

  // Default: low fitness without other specific indicators
  return {
    category: 'low_fitness',
    severity: 'medium',
    explanation: `Fitness score of ${conformanceResult.fitness.toFixed(2)} is below acceptable threshold (0.85).`,
    recommendations: [
      'Try higher-quality discovery algorithm (genetic_algorithm, ilp, aco).',
      'Reduce discovery algorithm thresholds to capture more process variations.',
      'Check for data quality issues (missing activities, incorrect timestamps).',
      'Consider using conformance-based model improvement (alignment-based fitness).',
      'Verify the process model reflects the actual business process being mined.',
    ],
    confidence: 0.8,
    metrics: {
      fitness: conformanceResult.fitness,
      variant_count: logStats.unique_variants,
    },
  };
}

/**
 * Estimate rework ratio from log statistics
 * Rework = activities that appear multiple times in the same trace
 *
 * @param logStats - Log statistics
 * @returns Rework ratio (0-1)
 */
function estimateReworkRatio(logStats: LogStats): number {
  if (logStats.activity_coverage === undefined) return 0;

  // Simple heuristic: if avg trace length >> unique activities, likely rework
  const lengthToActivityRatio = logStats.avg_trace_length / logStats.unique_activities;

  // If ratio > 2, significant rework is likely
  // Ratio = 1 means each activity appears once on average (no rework)
  // Ratio = 3 means activities repeat on average 3x
  return Math.min(1, Math.max(0, (lengthToActivityRatio - 1) / 2));
}

/**
 * Detect proportion of deviations that are activity ordering violations
 * Based on deviation types in deviating traces
 *
 * @param conformanceResult - Conformance result
 * @returns Proportion (0-1) of ordering-type deviations
 */
function detectOrderingViolations(conformanceResult: ConformanceResult): number {
  if (!conformanceResult.deviating_traces || conformanceResult.deviating_traces.length === 0) {
    return 0;
  }

  let orderingViolations = 0;
  let totalDeviations = 0;

  for (const trace of conformanceResult.deviating_traces) {
    if (!trace.deviations) continue;

    for (const dev of trace.deviations) {
      totalDeviations++;
      if (dev.deviation_type === 'activity_missing' || dev.deviation_type === 'activity_out_of_order') {
        orderingViolations++;
      }
    }
  }

  return totalDeviations > 0 ? orderingViolations / totalDeviations : 0;
}

/**
 * Compute coverage of log activities by the model
 * Heuristic: low fitness combined with high activity count suggests missing activities
 *
 * @param conformanceResult - Conformance result
 * @param logStats - Log statistics
 * @returns Coverage ratio (0-1)
 */
function computeCoverage(conformanceResult: ConformanceResult, logStats: LogStats): number {
  if (logStats.unique_activities === 0) return 1;

  // Heuristic: if we have many activities and low fitness,
  // coverage is likely poor (model missing rare activities)
  // This is a simple proxy: high activity diversity + low fitness = coverage issue
  const activityDiversity = logStats.unique_activities / Math.max(1, logStats.avg_trace_length);

  // If precision is available, use it as coverage proxy
  if (conformanceResult.precision !== null) {
    // Low precision can indicate underfitting (model is too general)
    // which means it's missing specific activities or constraints
    return conformanceResult.precision;
  }

  // If precision not available, estimate from trace conformance
  // Higher conforming trace rate = better coverage of log activities
  const deviatingCount = conformanceResult.deviating_cases ?? 0;
  const conformingCount = logStats.trace_count - deviatingCount;
  const conformingRate = logStats.trace_count > 0 ? conformingCount / logStats.trace_count : 0;

  // Adjust by activity diversity: more diverse = harder to cover
  const diversityPenalty = Math.min(1, activityDiversity / 2); // Normalize to ~0-1
  const adjustedCoverage = conformingRate * (1 - diversityPenalty * 0.3);

  return Math.max(0, Math.min(1, adjustedCoverage));
}
