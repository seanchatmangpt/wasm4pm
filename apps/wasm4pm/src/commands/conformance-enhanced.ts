/**
 * Enhanced conformance reporting utilities
 *
 * Provides breakdown analysis, multi-model comparison, and trace-level reporting
 */

import type { ConformancePayload } from './conformance.js';

export interface FitnessBreakdown {
  overall_fitness: number;
  token_missing_pct: number;
  token_produced_pct: number;
  token_consumed_pct: number;
  token_remaining_pct: number;
  total_missing: number;
  total_produced: number;
  total_consumed: number;
  total_remaining: number;
}

export interface ActivityFitnessContribution {
  activity: string;
  occurrences: number;
  conforming_occurrences: number;
  fitness: number;
  missing_tokens: number;
}

export interface EnhancedConformanceReport {
  fitness_breakdown: FitnessBreakdown;
  precision: number | null;
  conforming_traces: number;
  total_traces: number;
  conformance_rate: number;
}

export interface TraceConformanceDetail {
  case_id: string;
  is_conforming: boolean;
  trace_fitness: number;
  tokens_missing: number;
  tokens_remaining: number;
  deviation_count: number;
}

export interface ModelComparisonResult {
  models: Array<{
    model_path: string;
    fitness: number;
    precision: number | null;
    conformance_rate: number;
    rank: number;
  }>;
  best_model: string;
  recommendation: string;
}

/**
 * Format fitness breakdown for human-readable output
 */
export function formatFitnessBreakdown(breakdown: FitnessBreakdown): string {
  const lines: string[] = [];
  lines.push('Fitness Breakdown:');
  lines.push(`  Overall Fitness:     ${breakdown.overall_fitness.toFixed(3)}`);
  lines.push(`  Token Missing:       ${breakdown.token_missing_pct.toFixed(1)}% (${breakdown.total_missing} tokens)`);
  lines.push(`  Token Produced:      ${breakdown.token_produced_pct.toFixed(1)}% (${breakdown.total_produced} tokens)`);
  lines.push(`  Token Consumed:      ${breakdown.token_consumed_pct.toFixed(1)}% (${breakdown.total_consumed} tokens)`);
  lines.push(`  Token Remaining:     ${breakdown.token_remaining_pct.toFixed(1)}% (${breakdown.total_remaining} tokens)`);
  return lines.join('\n');
}

/**
 * Export trace-level details as CSV
 */
export function exportTracesAsCSV(traces: TraceConformanceDetail[]): string {
  const header = ['case_id', 'is_conforming', 'trace_fitness', 'tokens_missing', 'tokens_remaining', 'deviation_count'];
  const rows = traces.map((t) => [
    t.case_id,
    String(t.is_conforming),
    t.trace_fitness.toFixed(3),
    String(t.tokens_missing),
    String(t.tokens_remaining),
    String(t.deviation_count),
  ]);

  const csvContent = [header, ...rows].map((r) => r.join(',')).join('\n');
  return csvContent;
}

/**
 * Compare multiple models and return ranked results
 */
export function compareModels(
  results: Array<{ model_path: string; payload: ConformancePayload }>
): ModelComparisonResult {
  const models = results
    .map((r) => {
      const fitness = (r.payload.fitness as number) ?? 0;
      return {
        model_path: r.model_path,
        fitness,
        precision: r.payload.precision,
        conformance_rate: (fitness + (r.payload.precision ?? 0)) / 2,
        rank: 0,
      };
    })
    .sort((a, b) => b.fitness - a.fitness)
    .map((m, idx) => ({ ...m, rank: idx + 1 }));

  const bestModel = models[0].model_path;
  const recommendation =
    models[0].fitness > 0.85
      ? `Model ${bestModel} is well-fitting (fitness: ${models[0].fitness.toFixed(3)})`
      : `No model achieved fitness > 0.85. Top model: ${bestModel} (fitness: ${models[0].fitness.toFixed(3)})`;

  return { models, best_model: bestModel, recommendation };
}

/**
 * Identify bottleneck activities from conformance data
 */
export function identifyBottlenecks(
  activities: ActivityFitnessContribution[]
): Array<{ activity: string; missing_ratio: number }> {
  return activities
    .map((a) => ({
      activity: a.activity,
      missing_ratio: a.missing_tokens / Math.max(a.occurrences, 1),
    }))
    .sort((a, b) => b.missing_ratio - a.missing_ratio)
    .slice(0, 5);
}
