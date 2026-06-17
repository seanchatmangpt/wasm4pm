import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { blake3Hex } from '../receipts/_shared.js';
import type { CommandReceipt } from '../receipts/_shared.js';

/**
 * Default directory where prediction results are persisted.
 * Relative to cwd at invocation time.
 */
export const RESULTS_DIR = path.join('.wasm4pm', 'results');

/**
 * Van der Aalst four quality dimensions stored with every result.
 * Values are 0-1 when measured; null when the algorithm does not
 * produce a conformance-checked model (e.g. DFG-only runs).
 *
 * fitness        - fraction of log traces the model can replay
 * precision      - fraction of model behaviour seen in the log (1 = no flower model)
 * generalization - how well the model covers unseen traces from the same process
 * simplicity     - Occam score: 1 = minimum nodes/edges, 0 = overly complex
 * qualityTier    - registry score 0-100 (higher = better expected model quality)
 * interpretation - one-line practitioner hint derived from the scores
 */
export interface QualityDimensions {
  fitness: number | null;
  precision: number | null;
  generalization: number | null;
  simplicity: number | null;
  qualityTier: number | null;
  interpretation: string;
}

export interface SavedResult {
  version: 1;
  savedAt: string;
  task: string;
  input: string;
  activityKey: string;
  qualityDimensions: QualityDimensions;
  result: Record<string, unknown>;
  /**
   * BLAKE3 hex-64 of JSON.stringify(result) computed at save time.
   * Present in results saved with wpm >= 26.5.17.
   * When present, --verify detects tampering even without a matching receipt.
   */
  output_hash?: string;
}

/**
 * Key metrics extracted from a SavedResult for compact listing.
 * All fields are optional — older result files may not have them.
 */
interface ResultSummary {
  algorithm?: string;
  elapsedMs?: number;
  fitness?: number;
  traces?: number;
}

/**
 * Extract a brief summary from a SavedResult without loading the full object.
 */
function extractSummary(saved: SavedResult): ResultSummary {
  const r = saved.result as Record<string, unknown>;
  const algorithm = typeof r['algorithm'] === 'string' ? r['algorithm'] : undefined;
  const elapsedMs = typeof r['elapsedMs'] === 'number' ? r['elapsedMs'] : undefined;

  // Quality metrics may live at result.quality.fitness (wpm run --with-quality)
  // or directly in the result (prediction tasks emit fitness-like scores).
  let fitness: number | undefined;
  const quality = r['quality'] as Record<string, unknown> | undefined;
  if (quality && typeof quality['fitness'] === 'number') {
    fitness = quality['fitness'];
  } else if (typeof r['fitness'] === 'number') {
    fitness = r['fitness'];
  }

  // For predictions: next-activity has predictions[], remaining-time has remaining_time_mean
  let traces: number | undefined;
  const model = r['model'] as Record<string, unknown> | undefined;
  if (model && typeof model['traces'] === 'number') {
    traces = model['traces'];
  } else if (typeof r['traces'] === 'number') {
    traces = r['traces'];
  }

  return { algorithm, elapsedMs, fitness, traces };
}

// --- Quality dimension helpers -----------------------------------------------

function extractNumber(
  obj: Record<string, unknown> | undefined | null,
  keys: string[]
): number | null {
  if (obj == null || typeof obj !== 'object') return null;
  for (const key of keys) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === 'number' && isFinite(v)) return Math.round(v * 1000) / 1000;
  }
  return null;
}

function deriveSimplicity(result: Record<string, unknown>): number | null {
  const model = result?.['model'] as Record<string, unknown> | undefined;
  const nodesRaw = model?.['nodes'];
  const nodeCount = Array.isArray(nodesRaw)
    ? nodesRaw.length
    : typeof nodesRaw === 'number'
      ? nodesRaw
      : null;
  if (nodeCount == null) return null;
  // Simplicity decays linearly from 1.0 at 1 node to 0.0 at 50+ nodes
  return Math.max(0, Math.round((1 - Math.min(nodeCount, 50) / 50) * 1000) / 1000);
}

function buildInterpretation(dims: Omit<QualityDimensions, 'interpretation'>): string {
  const { fitness, precision, simplicity, qualityTier } = dims;
  if (fitness == null && precision == null && qualityTier == null) {
    return 'No conformance data - run wpm conformance to measure fitness and precision.';
  }
  if (fitness != null && fitness < 0.85) {
    return (
      `Fitness ${fitness.toFixed(2)} is below the 0.85 threshold - the model cannot replay ` +
      `${((1 - fitness) * 100).toFixed(0)}% of observed traces. ` +
      `Consider a higher-quality algorithm (heuristic_miner -> inductive_miner -> ilp).`
    );
  }
  if (precision != null && precision < 0.5) {
    return (
      `Precision ${precision.toFixed(2)} is low - the model allows much behaviour never seen ` +
      `in the log (flower model risk). Add constraints or switch to inductive_miner.`
    );
  }
  if (simplicity != null && simplicity < 0.3) {
    return (
      `Model is complex (simplicity ${simplicity.toFixed(2)}). Many nodes increase replay cost ` +
      `and reduce interpretability. Try process_skeleton or dfg for a first view.`
    );
  }
  if (qualityTier != null && qualityTier >= 70) {
    return `Quality tier ${qualityTier}/100 - high-quality model. Validate with wpm conformance before using in production.`;
  }
  if (qualityTier != null && qualityTier < 40) {
    return (
      `Quality tier ${qualityTier}/100 - exploratory model. Good for quick inspection; ` +
      `upgrade to heuristic_miner or inductive_miner for actionable results.`
    );
  }
  return 'Model looks reasonable. Run wpm conformance for fitness/precision scores before drawing conclusions.';
}

/**
 * Build quality dimension metadata from available result fields.
 * Exported so callers (e.g. run.ts, predict.ts) can embed quality in saved results.
 */
export function buildQualityDimensions(
  result: Record<string, unknown>,
  qualityTierOverride?: number
): QualityDimensions {
  const fitness = extractNumber(result, ['fitness', 'replay_fitness', 'token_fitness']);
  const precision = extractNumber(result, ['precision', 'et_precision', 'model_precision']);
  const generalization = extractNumber(result, ['generalization', 'generalisation']);
  const simplicity = deriveSimplicity(result);
  const qualityTier =
    qualityTierOverride ??
    extractNumber(result, ['qualityTier', 'quality_tier']) ??
    extractNumber(result?.['model'] as Record<string, unknown> | undefined, ['quality_tier']);
  const interpretation = buildInterpretation({
    fitness,
    precision,
    generalization,
    simplicity,
    qualityTier: qualityTier ?? null,
  });
  return { fitness, precision, generalization, simplicity, qualityTier: qualityTier ?? null, interpretation };
}

// --- Persistence --------------------------------------------------------------

/**
 * Derive a safe filename slug from a task name and timestamp.
 * Format: <timestamp>-<task>.json  e.g. 20260406T143012-next-activity.json
 */
function buildResultFilename(task: string, now: Date): string {
  const ts = now.toISOString().replace(/[-:]/g, '').replace('T', 'T').slice(0, 15); // YYYYMMDDTHHmmss
  return `${ts}-${task}.json`;
}

/**
 * Persist a prediction result to .wasm4pm/results/<timestamp>-<task>.json.
 * Creates the directory on first use.  Never throws - failures are silently
 * reported so they don't break the main predict command.
 *
 * @param qualityTierOverride Optional registry qualityTier (0-100) for the algorithm used.
 * @returns The absolute path of the written file, or null on failure.
 */
export async function savePredictionResult(
  task: string,
  input: string,
  activityKey: string,
  result: Record<string, unknown>,
  qualityTierOverride?: number
): Promise<string | null> {
  try {
    const dir = path.resolve(process.cwd(), RESULTS_DIR);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err: any) {
      if (err.code === 'EACCES' || err.code === 'EROFS') {
        const msg = `Permission denied when writing to ${dir}. ` +
                    `You are running in a restricted filesystem (e.g. read-only container or Docker). ` +
                    `Please set WASM4PM_HOME or run in a writable directory.`;
        throw new Error(msg);
      }
      throw err;
    }

    const now = new Date();
    const filename = buildResultFilename(task, now);
    const filepath = path.join(dir, filename);

    const payload: SavedResult = {
      version: 1,
      savedAt: now.toISOString(),
      task,
      input,
      activityKey,
      qualityDimensions: buildQualityDimensions(result, qualityTierOverride),
      result,
      output_hash: blake3Hex(JSON.stringify(result)),
    };

    await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf-8');
    return filepath;
  } catch (error) {
    console.error(
      `Failed to save prediction result: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * List all saved result files sorted by modification time (newest first).
 */
async function listResultFiles(
  dir: string
): Promise<Array<{ name: string; filepath: string; mtime: Date }>> {
  if (!existsSync(dir)) return [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));

  const withStats = await Promise.all(
    jsonFiles.map(async (e) => {
      const filepath = path.join(dir, e.name);
      const stat = await fs.stat(filepath);
      return { name: e.name, filepath, mtime: stat.mtime };
    })
  );

  return withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

/**
 * Error thrown by catResult when a result file exists but contains malformed JSON.
 * Distinguished from other errors so callers can emit source_error (2) rather than system_error (5).
 */
export class ResultParseError extends Error {
  constructor(
    public readonly filepath: string,
    cause: unknown
  ) {
    super(
      `Result file is not valid JSON: ${filepath}
` +
        `  Cause: ${cause instanceof Error ? cause.message : String(cause)}
` +
        `  The file may have been truncated or manually edited.
` +
        `  Delete it with: rm ${filepath}`
    );
    this.name = 'ResultParseError';
  }
}

/**
 * Read and parse a single saved result file.
 * Throws ResultParseError on malformed JSON (so callers can return source_error 2).
 * Throws the original fs error on I/O failure.
 */
async function catResult(filepath: string): Promise<SavedResult> {
  const raw = await fs.readFile(filepath, 'utf-8');
  try {
    return JSON.parse(raw) as SavedResult;
  } catch (parseErr) {
    throw new ResultParseError(filepath, parseErr);
  }
}

/**
 * Safely normalize a path to prevent directory traversal attacks (../../../etc/passwd).
 * Ensures the normalized path is within the target directory.
 *
 * @param targetDir - The allowed directory (e.g., .wasm4pm/results)
 * @param requestedPath - The requested file path (potentially malicious)
 * @returns The safe absolute path, or undefined if traversal is attempted
 */
function safeNormalizePath(targetDir: string, requestedPath: string): string | undefined {
  try {
    // Resolve both paths to absolute, canonical form
    const resolvedTarget = path.resolve(targetDir);
    const resolvedRequested = path.resolve(targetDir, requestedPath);

    // Ensure resolved path is within target directory
    // Use path.relative() to check: if it starts with .., it's outside
    const relative = path.relative(resolvedTarget, resolvedRequested);
    if (relative.startsWith('..')) {
      return undefined; // Path traversal attempt detected
    }

    return resolvedRequested;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a result reference (1-based index or filename) to a filepath.
 * Returns undefined if the reference does not match any file or attempts path traversal.
 */
function resolveRef(
  ref: string,
  files: Array<{ name: string; filepath: string }>,
  resultsDir: string
): string | undefined {
  const idx = parseInt(ref, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= files.length) {
    const candidate = files[idx - 1];
    // Security: verify indexed filepath is within results directory
    const safePath = safeNormalizePath(resultsDir, candidate.name);
    return safePath ? candidate.filepath : undefined;
  }

  // Construct filename and validate against path traversal
  const name = ref.endsWith('.json') ? ref : `${ref}.json`;

  // Security: reject any path traversal attempts in the reference itself
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return undefined;
  }

  const candidate = files.find((f) => f.name === name);
  if (!candidate) {
    return undefined;
  }

  // Security: verify the candidate filepath is safe (not traversing)
  const safePath = safeNormalizePath(resultsDir, candidate.name);
  return safePath ? candidate.filepath : undefined;
}

/**
 * Format a number as a compact millisecond string for display.
 */
function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return '     ';
  if (ms < 1000) return `${ms.toFixed(0)}ms `.padStart(6);
  return `${(ms / 1000).toFixed(1)}s `.padStart(6);
}

/**
 * Format a fitness score as a compact percentage string for display.
 */
function fmtFitness(fitness: number | undefined): string {
  if (fitness === undefined) return '    ';
  return `${(fitness * 100).toFixed(0)}%`.padStart(4);
}

// ─── Trend chart ─────────────────────────────────────────────────────────────

/**
 * Build a compact ASCII line chart for a metric series (0-1 values).
 * Returns an array of lines ready to print.
 */
function buildTrendChart(
  values: number[],
  timestamps: string[],
  metricName: string
): string[] {
  const CHART_WIDTH = 50;
  const CHART_HEIGHT = 7;

  if (values.length === 0) return ['  (no data)'];

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 0.01;

  // Sample to CHART_WIDTH columns
  const sampled: number[] = [];
  if (values.length <= CHART_WIDTH) {
    const pad = CHART_WIDTH - values.length;
    for (let i = 0; i < pad; i++) sampled.push(values[0]);
    sampled.push(...values);
  } else {
    const step = values.length / CHART_WIDTH;
    for (let i = 0; i < CHART_WIDTH; i++) {
      sampled.push(values[Math.floor(i * step)] ?? values[0]);
    }
  }

  // Convert to row indices (0 = bottom)
  const rows = sampled.map((v) =>
    Math.round(((v - minVal) / range) * (CHART_HEIGHT - 1))
  );

  const lines: string[] = [];
  const labelWidth = 5;

  for (let r = CHART_HEIGHT - 1; r >= 0; r--) {
    const displayRow = CHART_HEIGHT - 1 - r;
    const labelVal = minVal + ((displayRow / (CHART_HEIGHT - 1)) * range);
    const label = labelVal.toFixed(2).padStart(labelWidth);
    let line = `${label} ┤`;
    for (let c = 0; c < CHART_WIDTH; c++) {
      const colRow = rows[c] ?? 0;
      const prevRow = c > 0 ? (rows[c - 1] ?? colRow) : colRow;
      const nextRow = c < CHART_WIDTH - 1 ? (rows[c + 1] ?? colRow) : colRow;
      if (colRow === r) {
        // Mark the latest value specially
        if (c === CHART_WIDTH - 1) line += '●';
        else line += '─';
      } else if (colRow > r && prevRow <= r) {
        line += '╭';
      } else if (colRow < r && prevRow >= r) {
        line += '╰';
      } else if (colRow > r && nextRow <= r) {
        line += '╮';
      } else if (colRow < r && nextRow >= r) {
        line += '╯';
      } else if (colRow > r) {
        line += '│';
      } else {
        line += ' ';
      }
    }
    if (r === CHART_HEIGHT - 1) line += `  ← latest: ${values[values.length - 1].toFixed(3)}`;
    if (r === 0) line += `  ← earliest: ${values[0].toFixed(3)}`;
    lines.push(line);
  }

  // X-axis
  lines.push(' '.repeat(labelWidth + 1) + '└' + '─'.repeat(CHART_WIDTH));
  const n = values.length;
  const oldest = timestamps[0] ? timestamps[0].slice(0, 10) : '';
  const newest = timestamps[timestamps.length - 1] ? timestamps[timestamps.length - 1].slice(0, 10) : '';
  lines.push(' '.repeat(labelWidth + 2) + oldest + ' '.repeat(Math.max(0, CHART_WIDTH - oldest.length - newest.length)) + newest);

  // Summary
  const best = Math.max(...values);
  const worst = Math.min(...values);
  const trend = values.length >= 2
    ? values[values.length - 1] > values[0] ? 'IMPROVING' : values[values.length - 1] < values[0] ? 'DECLINING' : 'STABLE'
    : 'STABLE';
  const delta = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const sign = delta >= 0 ? '+' : '';

  lines.push('');
  lines.push(`Best: ${best.toFixed(3)}   Worst: ${worst.toFixed(3)}`);
  lines.push(`Trend: ${trend} (${sign}${delta.toFixed(3)} over ${n} runs)`);

  return lines;
}

// ─── Stats computation ────────────────────────────────────────────────────────

interface AggStats {
  total_runs: number;
  successful: number;
  failed: number;
  algorithms: Record<
    string,
    { count: number; avg_fitness: number | null; avg_duration_ms: number | null }
  >;
  fitness: { mean: number | null; median: number | null; best: number | null; worst: number | null };
  duration_ms: { mean: number | null; median: number | null; best: number | null; worst: number | null };
}

function computeStats(
  savedList: Array<{ saved: SavedResult; summary: ResultSummary } | null>
): AggStats {
  const items = savedList.filter((s): s is { saved: SavedResult; summary: ResultSummary } => s !== null);
  const algMap: Record<string, { fitnesses: number[]; durations: number[] }> = {};

  for (const item of items) {
    const algo = item.summary.algorithm ?? '(unknown)';
    if (!algMap[algo]) algMap[algo] = { fitnesses: [], durations: [] };
    if (item.summary.fitness != null) algMap[algo].fitnesses.push(item.summary.fitness);
    if (item.summary.elapsedMs != null) algMap[algo].durations.push(item.summary.elapsedMs);
  }

  const algorithms: AggStats['algorithms'] = {};
  for (const [algo, data] of Object.entries(algMap)) {
    const avg_fitness =
      data.fitnesses.length > 0
        ? data.fitnesses.reduce((a, b) => a + b, 0) / data.fitnesses.length
        : null;
    const avg_duration_ms =
      data.durations.length > 0
        ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
        : null;
    algorithms[algo] = { count: items.filter((i) => (i.summary.algorithm ?? '(unknown)') === algo).length, avg_fitness, avg_duration_ms };
  }

  const allFitnesses = items.map((i) => i.summary.fitness).filter((f): f is number => f != null);
  const allDurations = items.map((i) => i.summary.elapsedMs).filter((d): d is number => d != null);

  function median(arr: number[]): number | null {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  return {
    total_runs: items.length,
    successful: items.filter((i) => i.summary.fitness != null || i.summary.elapsedMs != null).length,
    failed: items.filter((i) => i.summary.fitness == null && i.summary.elapsedMs == null).length,
    algorithms,
    fitness: {
      mean: allFitnesses.length > 0 ? allFitnesses.reduce((a, b) => a + b, 0) / allFitnesses.length : null,
      median: median(allFitnesses),
      best: allFitnesses.length > 0 ? Math.max(...allFitnesses) : null,
      worst: allFitnesses.length > 0 ? Math.min(...allFitnesses) : null,
    },
    duration_ms: {
      mean: allDurations.length > 0 ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length : null,
      median: median(allDurations),
      best: allDurations.length > 0 ? Math.min(...allDurations) : null,
      worst: allDurations.length > 0 ? Math.max(...allDurations) : null,
    },
  };
}

export const results = defineCommand({
  meta: {
    name: 'results',
    description: 'List and inspect saved discovery and prediction results from .wasm4pm/results/. Example: wpm results --last',
  },
  args: {
    cat: {
      type: 'string',
      description: 'Print the full content of a saved result file (by name or 1-based index)',
      alias: 'c',
    },
    last: {
      type: 'boolean',
      description: 'Print the most recent saved result',
      alias: 'l',
    },
    diff: {
      type: 'string',
      description:
        'Compare two saved results side-by-side — pass two indexes or names separated by a comma (e.g. --diff 1,2)',
      alias: 'd',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of results to list (default: 20)',
      default: '20',
    },
    top: {
      type: 'string',
      description: 'Show only the top N results by sort key',
    },
    sort: {
      type: 'string',
      description: 'Sort listed results by: fitness, duration, date (default: date)',
      default: 'date',
    },
    trend: {
      type: 'string',
      description: 'Show ASCII trend chart for a metric: fitness, duration',
    },
    stats: {
      type: 'boolean',
      description: 'Show aggregate statistics across all saved results',
    },
    purge: {
      type: 'boolean',
      description: 'Delete results matching --older-than criteria (requires --older-than)',
    },
    'older-than': {
      type: 'string',
      description: 'Filter: results older than N days (e.g. 30d) — used with --purge',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show input path and activity key for each listed result',
      alias: 'v',
    },
    path: {
      type: 'string',
      description: 'Path to a saved result JSON file to display',
      alias: 'p',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    verify: {
      type: 'string',
      description:
        'Verify the BLAKE3 integrity of a saved result by re-hashing its payload and ' +
        'matching against the stored receipt. Pass a 1-based index or filename.',
      alias: 'V',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // Determine operation early so the span attribute is always set.
    // Use explicit undefined checks for string args so that empty-string
    // values (--diff "") are still recognised as that operation.
    const operation = ctx.args.verify !== undefined
      ? 'verify'
      : ctx.args.path !== undefined
        ? 'path'
        : ctx.args.last
          ? 'last'
          : ctx.args.cat !== undefined
            ? 'cat'
            : ctx.args.diff !== undefined
              ? 'diff'
              : ctx.args.trend !== undefined
                ? 'trend'
                : ctx.args.stats
                  ? 'stats'
                  : ctx.args.purge
                    ? 'purge'
                    : 'list';

    return withSpan('results', { operation, format }, async () => {
      try {
        const dir = path.resolve(process.cwd(), RESULTS_DIR);
        const files = await listResultFiles(dir);
        const rawLimit = ctx.args.limit as string | undefined;
        const parsedLimit = rawLimit != null ? parseInt(rawLimit, 10) : undefined;
        if (parsedLimit !== undefined && Number.isNaN(parsedLimit)) {
          const errResult = makeErrorResult(
            'results',
            new Error('Invalid --limit value: must be a number'),
            EXIT_CODES.config_error,
            'INVALID_LIMIT'
          );
          emitResult(errResult, { format, verbose, quiet });
          return await exitWithFlush(errResult.exit_code);
        }
        const limit = parsedLimit ?? 20;

        // ── NEW: --stats: aggregate statistics across all saved results ──────────
        if (ctx.args.stats) {
          const allSummaries = await Promise.all(
            files.map(async (f) => {
              try {
                const raw = await fs.readFile(f.filepath, 'utf-8');
                const saved = JSON.parse(raw) as SavedResult;
                return { saved, summary: extractSummary(saved) };
              } catch {
                return null;
              }
            })
          );

          const statsPayload = computeStats(allSummaries);
          const statResult = makeResult('results', statsPayload, performance.now() - t0, EXIT_CODES.success);
          emitResult(statResult, { format, verbose, quiet }, (_res, projection) => {
            const s = _res.payload as AggStats;
            projection.log('');
            projection.log(`Aggregate Statistics (${s.total_runs} runs)`);
            projection.log('═'.repeat(50));
            projection.log(`  Total runs:  ${s.total_runs}`);
            projection.log(`  Successful:  ${s.successful}`);
            projection.log(`  Failed:      ${s.failed}`);
            projection.log('');
            projection.log('  Fitness:');
            if (s.fitness.mean != null) projection.log(`    Mean:    ${s.fitness.mean.toFixed(3)}`);
            if (s.fitness.median != null) projection.log(`    Median:  ${s.fitness.median.toFixed(3)}`);
            if (s.fitness.best != null) projection.log(`    Best:    ${s.fitness.best.toFixed(3)}`);
            if (s.fitness.worst != null) projection.log(`    Worst:   ${s.fitness.worst.toFixed(3)}`);
            projection.log('');
            projection.log('  Duration (ms):');
            if (s.duration_ms.mean != null) projection.log(`    Mean:    ${Math.round(s.duration_ms.mean)}ms`);
            if (s.duration_ms.best != null) projection.log(`    Fastest: ${Math.round(s.duration_ms.best)}ms`);
            if (s.duration_ms.worst != null) projection.log(`    Slowest: ${Math.round(s.duration_ms.worst)}ms`);
            projection.log('');
            projection.log('  By algorithm:');
            for (const [algo, data] of Object.entries(s.algorithms)) {
              const fitStr = data.avg_fitness != null ? ` avg_fitness=${data.avg_fitness.toFixed(3)}` : '';
              const durStr = data.avg_duration_ms != null ? ` avg_ms=${Math.round(data.avg_duration_ms)}` : '';
              projection.log(`    ${algo.padEnd(24)} count=${data.count}${fitStr}${durStr}`);
            }
            projection.log('');
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // ── NEW: --trend <metric>: ASCII trend chart ──────────────────────────────
        if (ctx.args.trend !== undefined) {
          const metricName = String(ctx.args.trend ?? 'fitness').toLowerCase();
          const allowed = ['fitness', 'duration'];
          if (!allowed.includes(metricName)) {
            const errResult = makeErrorResult(
              'results',
              new Error(`Unknown --trend metric: '${metricName}'. Use: ${allowed.join(', ')}`),
              EXIT_CODES.config_error,
              'TREND_INVALID_METRIC'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          const trendLimit = parsedLimit ?? 30;
          const trendFiles = [...files].reverse().slice(0, trendLimit); // oldest first

          const trendData: Array<{ value: number; timestamp: string }> = [];
          for (const f of trendFiles) {
            try {
              const raw = await fs.readFile(f.filepath, 'utf-8');
              const saved = JSON.parse(raw) as SavedResult;
              const summary = extractSummary(saved);
              const value =
                metricName === 'fitness'
                  ? summary.fitness
                  : metricName === 'duration'
                    ? summary.elapsedMs != null ? summary.elapsedMs / 1000 : undefined
                    : undefined;
              if (value != null) {
                trendData.push({ value, timestamp: f.mtime.toISOString() });
              }
            } catch {
              /* skip */
            }
          }

          const values = trendData.map((d) => d.value);
          const timestamps = trendData.map((d) => d.timestamp);

          const trendDirection =
            values.length >= 2
              ? values[values.length - 1] > values[0]
                ? 'IMPROVING'
                : values[values.length - 1] < values[0]
                  ? 'DECLINING'
                  : 'STABLE'
              : 'STABLE';
          const trendDelta =
            values.length >= 2 ? values[values.length - 1] - values[0] : 0;

          const trendPayload = {
            metric: metricName,
            trend_direction: trendDirection,
            trend_delta: Math.round(trendDelta * 1000) / 1000,
            // data_points is an array of {timestamp, value} objects per spec
            data_points: trendData.map((d) => ({ timestamp: d.timestamp, value: d.value })),
            // Convenience aggregates
            count: trendData.length,
            best: values.length > 0 ? Math.max(...values) : null,
            worst: values.length > 0 ? Math.min(...values) : null,
            //  field names kept for backward compat
            values,
            timestamps,
            trend: trendDirection,
          };

          const trendResult = makeResult('results', trendPayload, performance.now() - t0, EXIT_CODES.success);
          emitResult(trendResult, { format, verbose, quiet }, (_res, projection) => {
            const p = _res.payload as typeof trendPayload;
            projection.log('');
            projection.log(`${metricName.charAt(0).toUpperCase() + metricName.slice(1)} Trend (last ${p.count} runs)`);
            projection.log('═'.repeat(56));
            if (values.length === 0) {
              projection.warn('  No data points with this metric found.');
            } else {
              const chartLines = buildTrendChart(values, timestamps, metricName);
              for (const line of chartLines) projection.log('  ' + line);
            }
            projection.log('');
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // ── NEW: --purge --older-than <N>d: delete old results ───────────────────
        if (ctx.args.purge) {
          const olderThanStr = ctx.args['older-than'] ? String(ctx.args['older-than']) : undefined;
          if (!olderThanStr) {
            const errResult = makeErrorResult(
              'results',
              new Error('--purge requires --older-than <N>d (e.g. --older-than 30d)'),
              EXIT_CODES.config_error,
              'PURGE_REQUIRES_OLDER_THAN'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          const match = olderThanStr.match(/^(\d+)d?$/i);
          if (!match) {
            const errResult = makeErrorResult(
              'results',
              new Error(`Invalid --older-than value: '${olderThanStr}'. Use format: 30d`),
              EXIT_CODES.config_error,
              'PURGE_INVALID_AGE'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          const days = parseInt(match[1], 10);
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const toDelete = files.filter((f) => f.mtime < cutoff);

          let deleted = 0;
          const errors: string[] = [];
          for (const f of toDelete) {
            try {
              await fs.unlink(f.filepath);
              deleted++;
            } catch (e) {
              errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          const purgePayload = { deleted, errors, cutoff: cutoff.toISOString(), days };
          const purgeResult = makeResult('results', purgePayload, performance.now() - t0, EXIT_CODES.success);
          emitResult(purgeResult, { format, verbose, quiet }, (_res, projection) => {
            const p = _res.payload as typeof purgePayload;
            projection.log('');
            if (p.deleted === 0) {
              projection.info(`No results older than ${p.days} days found.`);
            } else {
              projection.success(`Deleted ${p.deleted} result${p.deleted === 1 ? '' : 's'} older than ${p.days} days.`);
            }
            if (p.errors.length > 0) {
              projection.warn(`Errors: ${p.errors.join(', ')}`);
            }
            projection.log('');
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // --verify <ref>: re-hash the stored result payload and compare against the receipt
        if (ctx.args.verify !== undefined) {
          const ref = ctx.args.verify as string;
          if (!ref) {
            const errResult = makeErrorResult(
              'results',
              new Error('--verify requires a result reference (e.g. wpm results --verify 1 or --verify <timestamp>)'),
              EXIT_CODES.config_error,
              'MISSING_VERIFY_REF'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }
          const receiptsDir = path.resolve(process.cwd(), '.wasm4pm', 'receipts');

          const resultFilepath = resolveRef(ref, files, dir);
          if (!resultFilepath) {
            const hint =
              files.length > 0
                ? `\n\n  Available indexes: 1–${files.length}. Run 'wpm results' to list them.`
                : '\n\n  No results saved yet.';
            const errResult = makeErrorResult(
              'results',
              new Error(`Result not found: '${ref}'${hint}`),
              EXIT_CODES.source_error,
              'RESULT_NOT_FOUND'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          let savedResult: SavedResult;
          try {
            const raw = await fs.readFile(resultFilepath, 'utf-8');
            savedResult = JSON.parse(raw) as SavedResult;
          } catch (e) {
            const errResult = makeErrorResult(
              'results',
              new Error(`Failed to read result file: ${(e as Error).message}`),
              EXIT_CODES.source_error,
              'RESULT_READ_ERROR'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          // Recompute the blake3 hash of the current result payload.
          // If the file was tampered with, this will differ from the stored output_hash.
          // Guard: if the result field is missing (malformed file), hash null so verify
          // can still run and report no_receipt rather than crashing with a TypeError.
          const resultPayloadStr =
            savedResult.result !== undefined ? JSON.stringify(savedResult.result) : JSON.stringify(null);
          const recomputedOutputHash = blake3Hex(resultPayloadStr);

          // Primary tamper detection: if the SavedResult carries its own output_hash
          // (written at save time), compare immediately without scanning receipts.
          // This enables tamper detection even when no receipt exists.
          const storedHash = typeof savedResult.output_hash === 'string'
            ? savedResult.output_hash
            : null;
          const storedHashMismatch =
            storedHash !== null && storedHash !== recomputedOutputHash;

          // Scan receipts for matching output_hash.
          // Match against recomputed hash (clean file) or stored hash (tampered file,
          // so we can report which receipt it originally belonged to).
          const hashesToMatch = new Set<string>([recomputedOutputHash]);
          if (storedHash) hashesToMatch.add(storedHash);

          let matchedReceipt: CommandReceipt | null = null;
          let matchedReceiptFile: string | null = null;
          const candidateFiles: string[] = [];
          try {
            if (existsSync(receiptsDir)) {
              candidateFiles.push(
                ...(await fs.readdir(receiptsDir)).filter(
                  (f) => f.endsWith('.json') && f !== 'latest.json'
                )
              );
            }
          } catch {
            /* receipts dir unreadable */
          }

          // Prepend latest.json for the fast path
          for (const rFile of ['latest.json', ...candidateFiles]) {
            try {
              const rPath = path.join(receiptsDir, rFile);
              if (!existsSync(rPath)) continue;
              const r = JSON.parse(await fs.readFile(rPath, 'utf-8'));
              if (hashesToMatch.has(r.output_hash || r.receipt_hash || r.observed_path?.observed_result_hash)) {
                matchedReceipt = r;
                matchedReceiptFile = rFile;
                break;
              }
            } catch {
              /* skip unreadable files */
            }
          }

          let ocelMissing = false;
          if (matchedReceipt) {
             const r = matchedReceipt as any;
             if (!r.observed_path || !r.observed_path.observed_ocel2) {
                ocelMissing = true;
             } else if (r.algorithms && Array.isArray(r.algorithms)) {
                for (const algo of r.algorithms) {
                   if (!algo.observed_path || !algo.observed_path.observed_ocel2) {
                      ocelMissing = true;
                      break;
                   }
                }
             }
          }

          // Determine integrity:
          //   missing_ocel - matched receipt lacks embedded OCEL path
          //   mismatch   — stored output_hash differs from current payload (tampering detected)
          //   ok         — hashes agree and a matching receipt was found
          //   no_receipt — hashes agree (or no stored hash) but no receipt found
          let integrity: 'ok' | 'mismatch' | 'no_receipt' | 'missing_ocel' = storedHashMismatch
            ? 'mismatch'
            : matchedReceipt !== null && (matchedReceipt as any).output_hash === recomputedOutputHash
              ? 'ok'
              : 'no_receipt';

          if (matchedReceipt !== null && ocelMissing && integrity !== 'mismatch') {
            integrity = 'missing_ocel';
          }

          const verifyPayload = {
            ref,
            result_file: path.basename(resultFilepath),
            recomputed_output_hash: recomputedOutputHash,
            stored_output_hash: storedHash,
            // Contract aliases: expected_hash = what was stored at save time,
            // actual_hash = what the current payload hashes to.
            expected_hash: storedHash,
            actual_hash: recomputedOutputHash,
            receipt_found: matchedReceipt !== null,
            receipt_file: matchedReceiptFile,
            receipt_output_hash: matchedReceipt?.output_hash ?? null,
            integrity,
            verified: integrity === 'ok',
            hash_match: !storedHashMismatch,
            run_id: matchedReceipt?.run_id ?? null,
            command: matchedReceipt?.command ?? null,
            timestamp: matchedReceipt?.timestamp ?? null,
          };

          // exit 4 (partial_failure) when hash mismatch or missing OCEL is detected — the
          // stored receipt proof does not match the current payload, indicating
          // tampering or corruption.  partial_failure (4) is the correct code because
          // the verify command ran successfully (not an execution error) but found that
          // the result is no longer intact — a data-integrity failure, not a runtime failure.
          // exit 0 for ok or no_receipt (no breach detected).
          const verifyExitCode =
            (integrity === 'mismatch' || integrity === 'missing_ocel') ? EXIT_CODES.partial_failure : EXIT_CODES.success;

          const verifyResult = makeResult(
            'results',
            verifyPayload,
            performance.now() - t0,
            verifyExitCode
          );
          emitResult(verifyResult, { format, verbose, quiet }, (_res, projection) => {
            const p = _res.payload as typeof verifyPayload;
            projection.log('');
            projection.log(`  Result file:  ${p.result_file}`);
            projection.log('');
            if (p.integrity === 'ok') {
              projection.success(`PASS — receipt hash matches recomputed hash`);
              projection.log('');
              projection.log(`  Output hash: ${p.recomputed_output_hash}`);
              projection.log(`  Receipt:     ${p.receipt_file ?? '(none)'}`);
              projection.log(`  run_id:      ${p.run_id}`);
              projection.log(`  command:     ${p.command}`);
              projection.log(`  saved:       ${p.timestamp}`);
            } else if (p.integrity === 'mismatch') {
              projection.error(`FAIL — payload hash mismatch detected`);
              projection.log('');
              projection.log('  The result file payload does not match the hash stored at save time.');
              projection.log('  This means the result file was altered after it was originally written.');
              projection.log('');
              // Show both hashes and highlight the first differing character position
              const rec = p.stored_output_hash ?? p.receipt_output_hash ?? '';
              const recomp = p.recomputed_output_hash;
              let firstDiff = -1;
              for (let i = 0; i < Math.max(rec.length, recomp.length); i++) {
                if (rec[i] !== recomp[i]) {
                  firstDiff = i;
                  break;
                }
              }
              projection.log(`  Hash at save time:`);
              projection.log(`    ${rec || '(not stored)'}`);
              projection.log(`  Recomputed hash:`);
              projection.log(`    ${recomp}`);
              if (firstDiff >= 0) {
                projection.log(
                  `    ${'~'.repeat(firstDiff)}^ first difference at byte ${firstDiff}`
                );
              }
            } else if (p.integrity === 'missing_ocel') {
              projection.error(`FAIL — missing embedded OCEL path`);
              projection.log('');
              projection.log('  The receipt was found but does not contain an embedded canonical OCEL slice.');
              projection.log('  This violates the Wasm4pmExecutionReceipt constraint requiring the object-centric execution path.');
            } else {
              projection.warn(`INFO — no receipt found for this result`);
              projection.log('');
              projection.log('  The result payload was hashed successfully, but no matching');
              projection.log('  receipt was found in .wasm4pm/receipts/.');
              projection.log('  This is expected if the result was saved with --no-save,');
              projection.log('  or if receipts were cleared manually.');
              projection.log('');
              projection.log(`  Recomputed hash: ${p.recomputed_output_hash}`);
            }
            projection.log('');
            projection.log('  When to use --verify vs --diff:');
            projection.log(
              '    --verify <ref>   Checks that a saved result has not been tampered with.'
            );
            projection.log(
              '                     Use this to confirm a result is the exact artifact from'
            );
            projection.log('                     its original run (receipt chain audit).');
            projection.log(
              '    --diff <r1,r2>   Compares the process model quality of two separate runs.'
            );
            projection.log(
              '                     Use this to decide which algorithm or configuration'
            );
            projection.log('                     produced a better-fitting model.');
            projection.log('');
          });
          return await exitWithFlush(verifyExitCode);
        }

        // --path: cat a specific file by absolute or relative path.
        // Security: restrict reads to files ending in .json within cwd to prevent
        // path traversal (e.g. --path /etc/passwd, --path ../../shadow).
        if (ctx.args.path) {
          const requestedPath = ctx.args.path as string;
          const filepath = path.resolve(process.cwd(), requestedPath);

          if (!existsSync(filepath)) {
            const errResult = makeErrorResult(
              'results',
              new Error(`Result file not found: ${path.basename(filepath)}`),
              EXIT_CODES.source_error,
              'RESULT_PATH_NOT_FOUND'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          const cwd = path.resolve(process.cwd());
          const relative = path.relative(cwd, filepath);
          const isWithinCwd = !relative.startsWith('..') && !path.isAbsolute(relative);

          const os = await import('node:os');
          const tempDir = path.resolve(os.tmpdir());
          const relativeToTemp = path.relative(tempDir, filepath);
          const isWithinTemp = !relativeToTemp.startsWith('..') && !path.isAbsolute(relativeToTemp);

          if (!isWithinCwd && !isWithinTemp) {
            const errResult = makeErrorResult(
              'results',
              new Error(
                `Path traversal denied: '${requestedPath}' resolves outside the working directory.\n` +
                  `  Use a relative path within the current project, e.g.:\n` +
                  `    wpm results --path .wasm4pm/results/myresult.json`
              ),
              EXIT_CODES.config_error,
              'PATH_TRAVERSAL_DENIED'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          if (!filepath.endsWith('.json')) {
            const errResult = makeErrorResult(
              'results',
              new Error(
                `Invalid file type: --path only accepts .json result files.\n` +
                  `  Got: '${requestedPath}'`
              ),
              EXIT_CODES.config_error,
              'RESULT_PATH_INVALID_TYPE'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }
          let parsed: unknown;
          try {
            parsed = await catResult(filepath);
          } catch (e) {
            const errResult = makeErrorResult(
              'results',
              new Error(`Failed to parse result file: ${(e as Error).message}`),
              EXIT_CODES.source_error,
              'RESULT_PATH_INVALID'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }
          const result = makeResult('results', { cat: parsed, filepath }, performance.now() - t0);
          emitResult(result, { format, verbose, quiet }, (_res, projection) => {
            try {
              printCatResult(filepath, parsed as SavedResult, projection);
            } catch {
              projection.log(JSON.stringify(parsed, null, 2));
            }
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // --last: cat the newest result
        if (ctx.args.last) {
          if (files.length === 0) {
            const result = makeResult(
              'results',
              { files: [], count: 0, directory: dir },
              performance.now() - t0
            );
            emitResult(result, { format, verbose, quiet }, (_res, projection) => {
              projection.warn('No saved results found.');
            });
            return await exitWithFlush(EXIT_CODES.success);
          }
          const file = files[0];
          let lastParsed: SavedResult;
          try {
            lastParsed = await catResult(file.filepath);
          } catch (e) {
            const errResult = makeErrorResult(
              'results',
              new Error(e instanceof ResultParseError ? e.message : `Failed to read result file: ${(e as Error).message}`),
              EXIT_CODES.source_error,
              e instanceof ResultParseError ? 'RESULT_PARSE_ERROR' : 'RESULT_READ_ERROR'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }
          const result = makeResult(
            'results',
            { cat: lastParsed, filepath: file.filepath },
            performance.now() - t0
          );
          emitResult(result, { format, verbose, quiet }, (_res, projection) => {
            printCatResult(file.filepath, lastParsed, projection);
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // --cat <name|index>: print a specific result
        if (ctx.args.cat) {
          const ref = ctx.args.cat as string;
          const filepath = resolveRef(ref, files, dir);

          if (!filepath) {
            const hint =
              files.length > 0
                ? `\n\n  Available indexes: 1–${files.length}. Run 'wpm results' to list them.`
                : '\n\n  No results saved yet.';
            const errResult = makeErrorResult(
              'results',
              new Error(`Result not found: '${ref}'${hint}`),
              EXIT_CODES.source_error,
              'RESULT_NOT_FOUND'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          let catParsed: SavedResult;
          try {
            catParsed = await catResult(filepath);
          } catch (e) {
            const errResult = makeErrorResult(
              'results',
              new Error(e instanceof ResultParseError ? e.message : `Failed to read result file: ${(e as Error).message}`),
              EXIT_CODES.source_error,
              e instanceof ResultParseError ? 'RESULT_PARSE_ERROR' : 'RESULT_READ_ERROR'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }
          const result = makeResult('results', { cat: catParsed, filepath }, performance.now() - t0);
          emitResult(result, { format, verbose, quiet }, (_res, projection) => {
            printCatResult(filepath!, catParsed, projection);
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // --diff <ref1,ref2>: compare two saved results side-by-side
        // Note: check for ctx.args.diff !== undefined rather than truthiness so
        // that --diff "" (empty string) is also caught as a config_error.
        if (ctx.args.diff !== undefined) {
          const rawDiff = ctx.args.diff as string;
          const parts = rawDiff.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
          if (parts.length !== 2) {
            const errResult = makeErrorResult(
              'results',
              new Error(
                `--diff expects two references separated by a comma.\n\n` +
                  `  Examples:\n` +
                  `    wpm results --diff 1,2          Compare result #1 vs #2\n` +
                  `    wpm results --diff 3,5          Compare result #3 vs #5\n` +
                  `    wpm results --diff 20260507T003718-discover-dfg,20260507T003718-discover-heuristic`
              ),
              EXIT_CODES.config_error,
              'DIFF_INVALID_REFS'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          const [ref1, ref2] = parts;
          const fp1 = resolveRef(ref1, files, dir);
          const fp2 = resolveRef(ref2, files, dir);

          if (!fp1 || !fp2) {
            // Report both missing refs if both are absent, or just the one that's missing.
            const bothMissing = !fp1 && !fp2;
            const missing = bothMissing ? `'${ref1}' and '${ref2}'` : !fp1 ? `'${ref1}'` : `'${ref2}'`;
            const hint =
              files.length > 0
                ? `  Available indexes: 1–${files.length}. Run 'wpm results' to list them.`
                : '  No results saved yet.';
            const errResult = makeErrorResult(
              'results',
              new Error(`Result not found: ${missing}\n\n${hint}`),
              EXIT_CODES.source_error,
              'RESULT_NOT_FOUND'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          let diffParsed1: SavedResult;
          let diffParsed2: SavedResult;
          try {
            [diffParsed1, diffParsed2] = await Promise.all([catResult(fp1), catResult(fp2)]);
          } catch (e) {
            const errResult = makeErrorResult(
              'results',
              new Error(e instanceof ResultParseError ? e.message : `Failed to read result file: ${(e as Error).message}`),
              EXIT_CODES.source_error,
              e instanceof ResultParseError ? 'RESULT_PARSE_ERROR' : 'RESULT_READ_ERROR'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }
          // Build a compact diff summary for the JSON contract.
          const diffSummary1 = extractSummary(diffParsed1);
          const diffSummary2 = extractSummary(diffParsed2);
          const diffEdges1 = extractEdgeSet(diffParsed1);
          const diffEdges2 = extractEdgeSet(diffParsed2);
          const diffJaccard = jaccardSimilarity(diffEdges1, diffEdges2);
          const diffPayload = {
            ref1,
            ref2,
            diff: {
              fitness_a: diffSummary1.fitness ?? null,
              fitness_b: diffSummary2.fitness ?? null,
              fitness_delta:
                diffSummary1.fitness !== undefined && diffSummary2.fitness !== undefined
                  ? diffSummary2.fitness - diffSummary1.fitness
                  : null,
              elapsed_ms_a: diffSummary1.elapsedMs ?? null,
              elapsed_ms_b: diffSummary2.elapsedMs ?? null,
              algorithm_a: diffSummary1.algorithm ?? null,
              algorithm_b: diffSummary2.algorithm ?? null,
              jaccard_similarity: diffJaccard,
              edge_count_a: diffEdges1.size,
              edge_count_b: diffEdges2.size,
            },
            left: diffParsed1,
            right: diffParsed2,
            leftPath: fp1,
            rightPath: fp2,
          };
          const result = makeResult('results', diffPayload, performance.now() - t0);
          emitResult(result, { format, verbose, quiet }, (_res, projection) => {
            printDiffResult(fp1, diffParsed1, fp2, diffParsed2, projection);
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // Default: list results — eagerly read each file to extract key metrics
        const sortKey = String(ctx.args.sort ?? 'date').toLowerCase();
        const topN = ctx.args.top ? parseInt(String(ctx.args.top), 10) : undefined;
        const effectiveLimit = topN ?? limit;

        // For sort-by-fitness/duration, we need to read all files to sort
        // then slice. For date sort, files are already sorted newest-first.
        const filesToRead = (sortKey === 'date') ? files.slice(0, effectiveLimit) : files;

        // Read summaries in parallel; failures return null (we skip silently)
        const allSummaries = await Promise.all(
          filesToRead.map(async (f) => {
            try {
              const raw = await fs.readFile(f.filepath, 'utf-8');
              const saved = JSON.parse(raw) as SavedResult;
              return { f, saved, summary: extractSummary(saved) };
            } catch {
              return null;
            }
          })
        );

        let sortedEntries = allSummaries.filter(
          (s): s is { f: (typeof files)[0]; saved: SavedResult; summary: ResultSummary } => s !== null
        );

        // Apply sort
        if (sortKey === 'fitness') {
          sortedEntries.sort((a, b) => {
            const fa = a.summary.fitness ?? -1;
            const fb = b.summary.fitness ?? -1;
            return fb - fa; // highest first
          });
        } else if (sortKey === 'duration') {
          sortedEntries.sort((a, b) => {
            const da = a.summary.elapsedMs ?? Infinity;
            const db = b.summary.elapsedMs ?? Infinity;
            return da - db; // fastest first
          });
        }
        // For 'date': already sorted newest-first (from listResultFiles)

        // Apply top N slice
        if (topN != null) sortedEntries = sortedEntries.slice(0, topN);

        const displayed = sortedEntries.map((s) => s.f);
        const summaries = sortedEntries.map((s) => ({ saved: s.saved, summary: s.summary }));

        const payload = {
          directory: dir,
          count: files.length,
          showing: displayed.length,
          sort: sortKey,
          oldest: files.length > 0 ? files[files.length - 1].mtime.toISOString() : null,
          newest: files.length > 0 ? files[0].mtime.toISOString() : null,
          results: displayed.map((f, i) => {
            const s = summaries[i];
            const taskName = s?.saved.task ?? f.name.replace(/^\d{8}T\d{6}-/, '').replace(/\.json$/, '');
            return {
              // index and id are the same value (1-based); id is the
              // canonical contract field name for machine consumers.
              id: i + 1,
              index: i + 1,
              // path is the canonical contract field; filepath is kept for
              // baseline admissibility with existing consumers.
              path: f.filepath,
              filepath: f.filepath,
              name: f.name,
              // timestamp is the canonical contract field; savedAt is kept for
              // baseline admissibility.
              timestamp: f.mtime.toISOString(),
              savedAt: f.mtime.toISOString(),
              task: taskName,
              input: s?.saved.input,
              activityKey: s?.saved.activityKey,
              algorithm: s?.summary.algorithm,
              elapsedMs: s?.summary.elapsedMs,
              fitness: s?.summary.fitness,
            };
          }),
        };

        const result = makeResult('results', payload, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (_res, projection) => {
          const p = _res.payload as typeof payload;

          if (p.count === 0) {
            projection.info('No saved results found.');
            projection.log(`  Directory: ${p.directory}`);
            projection.log('');
            projection.log('  Results are saved automatically when you run:');
            projection.log('    wpm run <log.xes>                       (discovery)');
            projection.log('    wpm predict <task> --input <log.xes>    (prediction)');
            return;
          }

          const sortLabel = (p as typeof payload).sort !== 'date' ? ` — sorted by ${(p as typeof payload).sort}` : '';
          projection.info(`Saved results (${p.count} total${sortLabel})`);
          projection.log(`  Directory: ${p.directory}`);
          projection.log('');
          projection.log(`  #    Saved at             Algorithm         ms      Fit   Task`);
          projection.log(
            `  ───  ───────────────────  ────────────────  ──────  ────  ─────────────────`
          );

          for (const entry of p.results) {
            const savedAt = entry.savedAt.slice(0, 19).replace('T', ' ');
            const idxStr = String(entry.index).padStart(3);
            const algo = (entry.algorithm ?? '—').padEnd(16);
            const ms = fmtMs(entry.elapsedMs);
            const fit = fmtFitness(entry.fitness);
            const taskSlug = entry.task.replace(/^discover-/, '');
            const lowFitFlag = entry.fitness != null && entry.fitness < 0.85 ? '  ⚠' : '';
            projection.log(`  ${idxStr}  ${savedAt}  ${algo}  ${ms}  ${fit}  ${taskSlug}${lowFitFlag}`);

            if (verbose) {
              if (entry.input) projection.log(`       Input:        ${entry.input}`);
              if (entry.activityKey) projection.log(`       Activity key: ${entry.activityKey}`);
            }
          }

          if (p.count > effectiveLimit) {
            projection.log('');
            projection.log(`  ... ${p.count - effectiveLimit} more. Use --limit to show more.`);
          }

          projection.log('');
          projection.log('  Tip: wpm results --last              Print the most recent result');
          projection.log('  Tip: wpm results --cat 1             Print result #1 in full');
          projection.log('  Tip: wpm results --sort fitness      Sort by best fitness');
          projection.log('  Tip: wpm results --top 5             Show top 5 results');
          projection.log('  Tip: wpm results --trend fitness     Show fitness trend chart');
          projection.log('  Tip: wpm results --stats             Aggregate statistics');
          projection.log(
            '  Tip: wpm results --diff 1,2         Compare process model quality of #1 vs #2'
          );
          projection.log(
            '  Tip: wpm results --verify 1         Confirm result #1 has not been tampered with'
          );
          projection.log(
            '  Tip: wpm results --purge --older-than 30d   Delete old results'
          );
          projection.log('');
          projection.log('  When to use --diff vs --verify:');
          projection.log(
            '    --diff    Compare two runs to decide which algorithm produced a better model.'
          );
          projection.log(
            '              Shows fitness delta, speed ratio, and Jaccard edge overlap.'
          );
          projection.log(
            '    --verify  Audit a single result — confirms the payload matches its receipt.'
          );
          projection.log(
            '              Use before submitting a result as evidence or sharing externally.'
          );
          projection.log('');
        });

        return await exitWithFlush(result.exit_code);
      } catch (error) {
        const errResult = makeErrorResult(
          'results',
          error,
          EXIT_CODES.system_error,
          'RESULTS_ERROR'
        );
        emitResult(errResult, { format, verbose, quiet });
        return await exitWithFlush(errResult.exit_code);
      }
    }); // end withSpan
  },
});

// --- Print helpers ------------------------------------------------------------

/** Render a proportion glyph bar (8 chars) for a 0-1 value */
function qualityBar(value: number | null): string {
  if (value == null) return '░░░░░░░░';
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 8);
  return '▓'.repeat(filled) + '░'.repeat(8 - filled);
}

/**
 * Emit a single saved result to the console projection.
 * Shows the four quality dimensions prominently before the raw model data.
 */
function printCatResult(
  filepath: string,
  parsed: SavedResult,
  projection: ConsoleProjection
): void {
  const summary = extractSummary(parsed);
  projection.log('');
  projection.log(`  File:         ${path.basename(filepath)}`);
  projection.log(`  Task:         ${parsed.task}`);
  projection.log(`  Saved at:     ${parsed.savedAt}`);
  projection.log(`  Input:        ${parsed.input}`);
  projection.log(`  Activity key: ${parsed.activityKey}`);
  if (summary.algorithm) projection.log(`  Algorithm:    ${summary.algorithm}`);
  if (summary.elapsedMs !== undefined)
    projection.log(`  Elapsed:      ${fmtMs(summary.elapsedMs).trim()}`);
  if (summary.fitness !== undefined)
    projection.log(`  Fitness:      ${(summary.fitness * 100).toFixed(1)}%`);
  projection.log('');
  projection.log('  -- Raw result --');
  const lines = JSON.stringify(parsed.result, null, 2).split('\n');
  for (const line of lines) {
    projection.log(`    ${line}`);
  }
  projection.log('');
}

/**
 * Extract a set of edge keys ("from->to") from a saved result's DFG output.
 * Looks in common locations: result.edges[], result.dfg.edges[], result.model.edges[].
 */
function extractEdgeSet(saved: SavedResult): Set<string> {
  const r = saved.result as Record<string, unknown>;
  let edges: unknown[] = [];

  // Direct edges array (dfg output)
  if (Array.isArray(r['edges'])) {
    edges = r['edges'];
  } else {
    // Nested under dfg or model
    for (const key of ['dfg', 'model', 'graph']) {
      const sub = r[key] as Record<string, unknown> | undefined;
      if (sub && Array.isArray(sub['edges'])) {
        edges = sub['edges'];
        break;
      }
    }
  }

  const set = new Set<string>();
  for (const e of edges) {
    const edge = e as Record<string, unknown>;
    if (typeof edge['from'] === 'string' && typeof edge['to'] === 'string') {
      set.add(`${edge['from']}->${edge['to']}`);
    } else if (typeof edge['source'] === 'string' && typeof edge['target'] === 'string') {
      set.add(`${edge['source']}->${edge['target']}`);
    }
  }
  return set;
}

/**
 * Compute Jaccard similarity between two edge sets.
 * J = |A ∩ B| / |A ∪ B|. Returns null when both sets are empty.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number | null {
  if (a.size === 0 && b.size === 0) return null;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/**
 * Emit a side-by-side diff of two saved results.
 */
function printDiffResult(
  fp1: string,
  p1: SavedResult,
  fp2: string,
  p2: SavedResult,
  projection: ConsoleProjection
): void {
  const s1 = extractSummary(p1);
  const s2 = extractSummary(p2);

  const algo1 = s1.algorithm ?? p1.task ?? path.basename(fp1).replace(/\.json$/, '');
  const algo2 = s2.algorithm ?? p2.task ?? path.basename(fp2).replace(/\.json$/, '');
  const ts1 = p1.savedAt ? p1.savedAt.slice(0, 19).replace('T', ' ') : '(unknown)';
  const ts2 = p2.savedAt ? p2.savedAt.slice(0, 19).replace('T', ' ') : '(unknown)';

  projection.log('');
  projection.log(`Comparing Result #A vs Result #B`);
  projection.log('='.repeat(45));
  projection.log(`#A: ${algo1} (${ts1})`);
  projection.log(`#B: ${algo2} (${ts2})`);
  projection.log('');

  // ─── Metric table with Δ column ──────────────────────────────────────────
  const COL_METRIC = 18;
  const COL_A = 18;
  const COL_B = 18;
  const COL_DELTA = 14;

  const hdr = `${'Metric'.padEnd(COL_METRIC)}${'#A (' + algo1.slice(0, 12) + ')'.padEnd(COL_A - algo1.slice(0, 12).length - 4)}${'#B (' + algo2.slice(0, 12) + ')'.padEnd(COL_B - algo2.slice(0, 12).length - 4)}${'Δ'.padEnd(COL_DELTA)}`;
  projection.log(hdr);
  projection.log('─'.repeat(COL_METRIC + COL_A + COL_B + COL_DELTA));

  function deltaArrow(val: number, higherBetter: boolean): string {
    if (Math.abs(val) < 0.001) return ' (=)';
    const better = higherBetter ? val > 0 : val < 0;
    const sign = val > 0 ? '+' : '';
    const arrow = better ? ' ▲' : ' ▼';
    return `${sign}${val.toFixed(3)}${arrow}`;
  }

  function metricRow(
    label: string,
    a: string,
    b: string,
    deltaStr: string
  ): void {
    projection.log(
      `${label.padEnd(COL_METRIC)}${a.padEnd(COL_A)}${b.padEnd(COL_B)}${deltaStr}`
    );
  }

  // Fitness
  const fA = s1.fitness;
  const fB = s2.fitness;
  if (fA !== undefined || fB !== undefined) {
    const aStr = fA !== undefined ? fA.toFixed(2) : '—';
    const bStr = fB !== undefined ? fB.toFixed(2) : '—';
    const dStr = fA !== undefined && fB !== undefined ? deltaArrow(fB - fA, true) : '—';
    metricRow('Fitness', aStr, bStr, dStr);
  }

  // Precision from qualityDimensions
  const prA = p1.qualityDimensions?.precision;
  const prB = p2.qualityDimensions?.precision;
  if (prA !== null || prB !== null) {
    const aStr = prA != null ? prA.toFixed(2) : '—';
    const bStr = prB != null ? prB.toFixed(2) : '—';
    const dStr = prA != null && prB != null ? deltaArrow(prB - prA, true) : '—';
    metricRow('Precision', aStr, bStr, dStr);
  }

  // Duration
  const elA = s1.elapsedMs;
  const elB = s2.elapsedMs;
  if (elA !== undefined || elB !== undefined) {
    const aStr = elA !== undefined ? fmtMs(elA).trim() : '—';
    const bStr = elB !== undefined ? fmtMs(elB).trim() : '—';
    const dStr =
      elA !== undefined && elB !== undefined
        ? deltaArrow((elB - elA) / 1000, false) + 's'
        : '—';
    metricRow('Duration', aStr, bStr, dStr);
  }

  // Activities (traces count)
  const trA = s1.traces;
  const trB = s2.traces;
  if (trA !== undefined || trB !== undefined) {
    const dVal = trA !== undefined && trB !== undefined ? trB - trA : null;
    metricRow(
      'Activities',
      trA !== undefined ? String(trA) : '—',
      trB !== undefined ? String(trB) : '—',
      dVal !== null ? (dVal === 0 ? ' (=)' : (dVal > 0 ? `+${dVal}` : `${dVal}`)) : '—'
    );
  }

  // Edge overlap (Jaccard)
  const edgesA = extractEdgeSet(p1);
  const edgesB = extractEdgeSet(p2);
  const jaccard = jaccardSimilarity(edgesA, edgesB);
  if (jaccard !== null) {
    metricRow('Edge overlap', `${(jaccard * 100).toFixed(0)}%`, `${(jaccard * 100).toFixed(0)}%`, ' (shared)');
  }

  projection.log('');

  // ─── Verdict ─────────────────────────────────────────────────────────────
  let verdictLines: string[] = [];
  let recommendLines: string[] = [];

  const fDelta = fA !== undefined && fB !== undefined ? fB - fA : null;
  const elDelta = elA !== undefined && elB !== undefined ? elB - elA : null;

  if (fDelta !== null && elDelta !== null) {
    const higherQuality = fDelta > 0.001 ? '#B' : fDelta < -0.001 ? '#A' : null;
    const fasterRun = elDelta < -100 ? '#B' : elDelta > 100 ? '#A' : null;

    if (higherQuality === '#B' && fasterRun === '#A') {
      // A is faster, B has higher quality
      const ratio = (Math.max(elA!, elB!) / Math.min(elA!, elB!)).toFixed(1);
      verdictLines.push(`#B (${algo2}) has higher fitness (+${(Math.abs(fDelta) * 100).toFixed(1)}pp) but takes ${ratio}× longer.`);
      if (fDelta > 0.05) {
        recommendLines.push(`Use ${algo2} for final analysis where quality matters, ${algo1} for quick exploration.`);
      } else {
        recommendLines.push(`The quality difference (${(Math.abs(fDelta) * 100).toFixed(1)}pp) is small — ${algo1} is likely sufficient given its speed.`);
      }
    } else if (higherQuality === '#A' && fasterRun === '#B') {
      const ratio = (Math.max(elA!, elB!) / Math.min(elA!, elB!)).toFixed(1);
      verdictLines.push(`#A (${algo1}) has higher fitness (+${(Math.abs(fDelta) * 100).toFixed(1)}pp) and is ${ratio}× faster. Clear winner.`);
      recommendLines.push(`Use ${algo1} — it dominates on both quality and speed.`);
    } else if (higherQuality === '#B' && fasterRun === '#B') {
      const ratio = (Math.max(elA!, elB!) / Math.min(elA!, elB!)).toFixed(1);
      verdictLines.push(`#B (${algo2}) is both higher quality (+${(Math.abs(fDelta) * 100).toFixed(1)}pp fitness) and ${ratio}× faster. Clear winner.`);
      recommendLines.push(`Use ${algo2} — it dominates on both quality and speed.`);
    } else if (higherQuality === '#A' && fasterRun === '#A') {
      const ratio = (Math.max(elA!, elB!) / Math.min(elA!, elB!)).toFixed(1);
      verdictLines.push(`#A (${algo1}) is both higher quality (+${(Math.abs(fDelta) * 100).toFixed(1)}pp fitness) and ${ratio}× faster. Clear winner.`);
      recommendLines.push(`Use ${algo1} — it dominates on both quality and speed.`);
    } else if (higherQuality === null && fasterRun !== null) {
      verdictLines.push(`Fitness is similar between the two results.`);
      recommendLines.push(`Use ${fasterRun === '#A' ? algo1 : algo2} for its speed advantage with equivalent quality.`);
    } else if (fasterRun === null && higherQuality !== null) {
      verdictLines.push(`Speed is similar; #${higherQuality === '#A' ? 'A' : 'B'} (${higherQuality === '#A' ? algo1 : algo2}) has marginally higher fitness.`);
      recommendLines.push(`Either is acceptable; prefer ${higherQuality === '#A' ? algo1 : algo2} for production use.`);
    } else {
      verdictLines.push(`Results are similar in both fitness and duration.`);
      recommendLines.push(`Use either algorithm — consider ${algo2} if repeatability is important.`);
    }
  } else if (fDelta !== null) {
    const better = fDelta > 0.001 ? '#B' : fDelta < -0.001 ? '#A' : null;
    if (better) verdictLines.push(`${better} (${better === '#A' ? algo1 : algo2}) has higher fitness (+${(Math.abs(fDelta) * 100).toFixed(1)}pp).`);
    else verdictLines.push(`Fitness is equivalent between the two results.`);
  } else if (elDelta !== null) {
    const faster = elDelta < -100 ? '#B' : elDelta > 100 ? '#A' : null;
    if (faster) verdictLines.push(`${faster} (${faster === '#A' ? algo1 : algo2}) is faster — no fitness data to compare quality.`);
  }

  if (verdictLines.length > 0) {
    projection.log(`Verdict: ${verdictLines.join(' ')}`);
  }
  if (recommendLines.length > 0) {
    projection.log(`Recommendation: ${recommendLines.join(' ')}`);
  }
  projection.log('');

  // ─── Jaccard plain-language explanation ──────────────────────────────────
  if (jaccard !== null) {
    const jPct = Math.round(jaccard * 100);
    const sharedEdges = [...edgesA].filter((x) => edgesB.has(x)).length;
    const totalEdges = new Set([...edgesA, ...edgesB]).size;
    projection.log(`  Edge similarity (Jaccard): ${jPct}% of process edges shared`);
    projection.log(`    (${sharedEdges} shared out of ${totalEdges} unique edges across both models).`);
    if (jaccard < 0.75) {
      projection.log(`    Models have substantially different structures — use`);
      projection.log(`    wpm compare <algos> -i <log.xes> to compare algorithms directly.`);
    }
    projection.log('');
  }

  projection.log('  When to use --diff vs --verify:');
  projection.log('    --diff <r1,r2>   Compare process model quality between two runs.');
  projection.log('                     Use this to choose between algorithms or configurations.');
  projection.log('    --verify <ref>   Check that a saved result has not been tampered with.');
  projection.log('');
  projection.log(`  Use 'wpm results --cat <ref>' to see the full result for either entry.`);
  projection.log('');
}
