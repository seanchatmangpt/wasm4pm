/**
 * feedback-loop.ts
 * Algorithm Feedback Loop — captures and stores quality metrics for process mining discovery
 *
 * Provides: captureFeedback(algorithm, logSize, metrics) → saves JSON to .wasm4pm/algorithm-feedback/
 * Indexed by: algorithm ID + log size bucket (0-100, 100-1K, 1K-10K, 10K-100K, 100K+)
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Quality metrics from a discovery run
 */
export interface QualityMetrics {
  /** Token-replay fitness (0-1) */
  fitness: number;

  /** Model precision (0-1), or null if not computed */
  precision: number | null;

  /** Model generalization score (0-1), or null if not computed */
  generalization: number | null;

  /** Simplicity metric (typically element count or normalized score) */
  simplicity: number | null;

  /** Timestamp when metrics were captured (ISO 8601) */
  timestamp?: string;
}

/**
 * Feedback record stored per algorithm per log size bucket
 */
export interface FeedbackRecord {
  algorithm: string;
  log_size_bucket: string;
  timestamp: string;
  execution_time_ms: number;
  metrics: QualityMetrics;
  metadata?: Record<string, unknown>;
}

/**
 * Classify log size into buckets for statistical tracking
 * @param logSize - Number of events in the log
 * @returns Bucket name: "0-100", "100-1K", "1K-10K", "10K-100K", "100K+"
 */
export function getLogSizeBucket(logSize: number): string {
  if (logSize <= 100) return '0-100';
  if (logSize <= 1000) return '100-1K';
  if (logSize <= 10000) return '1K-10K';
  if (logSize <= 100000) return '10K-100K';
  return '100K+';
}

/**
 * Compute heuristic generalization score based on trace variants
 * Higher variant count = lower generalization (overfitting risk)
 *
 * @param traceVariants - Number of unique trace variants observed
 * @param totalTraces - Total number of traces in the log
 * @returns Generalization score (0-1), where 1 is perfect, 0 is maximally variant
 */
export function estimateGeneralization(
  traceVariants: number,
  totalTraces: number
): number {
  if (totalTraces === 0) return 0;
  const variantRatio = traceVariants / totalTraces;
  // Generalization = 1 - (variant_ratio * variance_penalty)
  // If every trace is unique, variantRatio = 1, generalization = 0
  // If all traces are identical, variantRatio ~0, generalization = 1
  return Math.max(0, 1 - variantRatio);
}

/**
 * Compute simplicity score (higher is simpler)
 * Typically based on model element count (places, transitions, etc.)
 *
 * @param elementCount - Number of model elements (places, transitions, etc.)
 * @param logSize - Number of events for normalization context
 * @returns Simplicity score (0-1), where 1 is maximally simple
 */
export function estimateSimplicity(elementCount: number, logSize: number): number {
  if (logSize === 0) return 0;
  // Ideal simplicity: elementCount is small relative to logSize
  // penalize models with many elements
  const elementRatio = elementCount / Math.sqrt(logSize);
  // Cap at 5 for normalization purposes
  const normalized = Math.min(elementRatio, 5);
  // Invert: high ratio = low simplicity, low ratio = high simplicity
  return Math.max(0, 1 - normalized / 5);
}

/**
 * Capture and store algorithm feedback to disk
 *
 * @param algorithm - Algorithm ID (e.g., 'dfg', 'heuristic_miner')
 * @param logSize - Number of events in the processed log
 * @param metrics - Quality metrics (fitness, precision, etc.)
 * @param executionTimeMs - Algorithm execution time in milliseconds
 * @param metadata - Optional contextual data (activity_key, params, etc.)
 * @throws Error if feedback directory cannot be created or file write fails
 *
 * @example
 * ```ts
 * await captureFeedback('dfg', 5000, {
 *   fitness: 0.92,
 *   precision: 0.88,
 *   generalization: 0.75,
 *   simplicity: 0.85
 * }, 145);
 * ```
 */
export async function captureFeedback(
  algorithm: string,
  logSize: number,
  metrics: QualityMetrics,
  executionTimeMs: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Ensure .wasm4pm/algorithm-feedback/ directory exists
    // const __dirname   = dirname(fileURLToPath(import.meta.url));
    const baseDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');

    await fs.mkdir(baseDir, { recursive: true });

    // Create feedback record
    const bucket = getLogSizeBucket(logSize);
    const record: FeedbackRecord = {
      algorithm,
      log_size_bucket: bucket,
      timestamp: metrics.timestamp ?? new Date().toISOString(),
      execution_time_ms: executionTimeMs,
      metrics: {
        fitness: metrics.fitness,
        precision: metrics.precision,
        generalization: metrics.generalization,
        simplicity: metrics.simplicity,
      },
      metadata,
    };

    // Write to algorithm-specific feedback file
    const feedbackFile = path.join(baseDir, `${algorithm}_feedback.jsonl`);

    // Append record as JSONL (one record per line)
    await fs.appendFile(feedbackFile, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    // Per TPS rules: never swallow errors silently
    // However, feedback capture is non-blocking, so log but don't throw
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[feedback-loop] Failed to capture feedback: ${message}`);
    // Don't re-throw — feedback is observability, not core functionality
  }
}

/**
 * Load all feedback records for an algorithm (across all log size buckets)
 * Useful for analyzing algorithm behavior trends
 *
 * @param algorithm - Algorithm ID
 * @returns Array of feedback records, or empty array if no feedback exists
 */
export async function loadAlgorithmFeedback(algorithm: string): Promise<FeedbackRecord[]> {
  try {
    const baseDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');
    const feedbackFile = path.join(baseDir, `${algorithm}_feedback.jsonl`);

    try {
      const content = await fs.readFile(feedbackFile, 'utf8');
      const records: FeedbackRecord[] = [];

      for (const line of content.split('\n')) {
        if (line.trim()) {
          records.push(JSON.parse(line));
        }
      }

      return records;
    } catch (err) {
      // File doesn't exist yet or is unreadable
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  } catch (err) {
    console.warn(
      `[feedback-loop] Failed to load feedback: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/**
 * Get aggregate statistics for an algorithm across all log size buckets
 * Useful for determining optimal parameter tuning
 *
 * @param algorithm - Algorithm ID
 * @returns Statistics: count, mean/median fitness, etc.
 */
export async function getAlgorithmStats(
  algorithm: string
): Promise<{
  count: number;
  meanFitness: number;
  medianFitness: number;
  meanPrecision: number | null;
  bucketStats: Record<string, { count: number; meanFitness: number }>;
}> {
  const records = await loadAlgorithmFeedback(algorithm);

  if (records.length === 0) {
    return {
      count: 0,
      meanFitness: 0,
      medianFitness: 0,
      meanPrecision: null,
      bucketStats: {},
    };
  }

  const fitnesses = records.map((r) => r.metrics.fitness).sort((a, b) => a - b);
  const precisions = records
    .map((r) => r.metrics.precision)
    .filter((p) => p !== null) as number[];

  const bucketStats: Record<string, { count: number; meanFitness: number }> = {};
  for (const record of records) {
    const bucket = record.log_size_bucket;
    if (!bucketStats[bucket]) {
      bucketStats[bucket] = { count: 0, meanFitness: 0 };
    }
    bucketStats[bucket].count++;
    bucketStats[bucket].meanFitness += record.metrics.fitness;
  }

  // Normalize bucket means
  for (const bucket of Object.keys(bucketStats)) {
    bucketStats[bucket].meanFitness /= bucketStats[bucket].count;
  }

  const meanFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
  const medianFitness = fitnesses[Math.floor(fitnesses.length / 2)];
  const meanPrecision =
    precisions.length > 0 ? precisions.reduce((a, b) => a + b, 0) / precisions.length : null;

  return {
    count: records.length,
    meanFitness,
    medianFitness,
    meanPrecision,
    bucketStats,
  };
}
