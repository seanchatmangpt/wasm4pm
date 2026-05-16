import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

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
    await fs.mkdir(dir, { recursive: true });

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
 * Read and pretty-print a single saved result file.
 * Returns parsed SavedResult for machine output; emits human projection inline.
 */
async function catResult(filepath: string): Promise<SavedResult> {
  const raw = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(raw) as SavedResult;
}

export const results = defineCommand({
  meta: {
    name: 'results',
    description: 'List and inspect saved discovery and prediction results from .wasm4pm/results/',
  },
  args: {
    cat: {
      type: 'string',
      description: 'Print the full content of a saved result file (by name or index)',
      alias: 'c',
    },
    last: {
      type: 'boolean',
      description: 'Print the most recent saved result',
      alias: 'l',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of results to list (default: 20)',
      default: '20',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show full result data when listing',
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
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

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

      // --path: cat a specific file by absolute or relative path
      if (ctx.args.path) {
        const filepath = path.resolve(process.cwd(), ctx.args.path as string);
        if (!existsSync(filepath)) {
          const errResult = makeErrorResult(
            'results',
            new Error(`Result file not found: ${filepath}`),
            EXIT_CODES.source_error,
            'RESULT_PATH_NOT_FOUND'
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
        const parsed = await catResult(file.filepath);
        const result = makeResult(
          'results',
          { cat: parsed, filepath: file.filepath },
          performance.now() - t0
        );
        emitResult(result, { format, verbose, quiet }, (_res, projection) => {
          printCatResult(file.filepath, parsed, projection);
        });
        return await exitWithFlush(EXIT_CODES.success);
      }

      // --cat <name|index>: print a specific result
      if (ctx.args.cat) {
        const ref = ctx.args.cat as string;
        let filepath: string | undefined;

        const idx = parseInt(ref, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= files.length) {
          filepath = files[idx - 1].filepath;
        } else {
          const name = ref.endsWith('.json') ? ref : `${ref}.json`;
          const match = files.find((f) => f.name === name);
          if (match) filepath = match.filepath;
        }

        if (!filepath) {
          const errResult = makeErrorResult(
            'results',
            new Error(`Result not found: ${ref}`),
            EXIT_CODES.source_error,
            'RESULT_NOT_FOUND'
          );
          emitResult(errResult, { format, verbose, quiet });
          return await exitWithFlush(errResult.exit_code);
        }

        const parsed = await catResult(filepath);
        const result = makeResult('results', { cat: parsed, filepath }, performance.now() - t0);
        emitResult(result, { format, verbose, quiet }, (_res, projection) => {
          printCatResult(filepath!, parsed, projection);
        });
        return await exitWithFlush(EXIT_CODES.success);
      }

      // Default: list results
      const displayed = files.slice(0, limit);

      const payload = {
        directory: dir,
        count: files.length,
        showing: displayed.length,
        results: displayed.map((f, i) => ({
          index: i + 1,
          name: f.name,
          filepath: f.filepath,
          savedAt: f.mtime.toISOString(),
        })),
      };

      const result = makeResult('results', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose, quiet }, async (res, projection) => {
        const p = res.payload as typeof payload;

        if (p.count === 0) {
          projection.info('No saved results found.');
          projection.log(`  Directory: ${p.directory}`);
          projection.log('');
          projection.log('  Results are saved automatically when you run:');
          projection.log('    wpm run <log.xes>                       (discovery)');
          projection.log('    wpm predict <task> --input <log.xes>    (prediction)');
          return;
        }

        projection.info(`Saved results (${p.count} total - discovery + prediction)`);
        projection.log(`  Directory: ${p.directory}`);
        projection.log('');
        projection.log(`  #   Saved at              Task              QTier  Interpretation`);
        projection.log(
          `  --  --------------------  ----------------  -----  ` +
            `--------------------------------------------------`
        );

        for (const entry of p.results) {
          const taskSlug = entry.name.replace(/^\d{8}T\d{6}-/, '').replace(/\.json$/, '');
          const savedAt = entry.savedAt.slice(0, 19).replace('T', ' ');
          const idxStr = String(entry.index).padStart(3);
          const task = taskSlug.padEnd(16);
          const at = savedAt.padEnd(20);

          let qtierStr = '  - ';
          let interpHint = '';
          try {
            const raw = await fs.readFile(entry.filepath, 'utf-8');
            const parsed: SavedResult = JSON.parse(raw);
            const qt = parsed.qualityDimensions?.qualityTier;
            qtierStr = qt != null ? String(qt).padStart(5) : '  - ';
            const interp = parsed.qualityDimensions?.interpretation ?? '';
            interpHint = interp.length > 50 ? interp.slice(0, 47) + '...' : interp;
          } catch {
            // skip unreadable files
          }

          projection.log(`  ${idxStr}  ${at}  ${task}  ${qtierStr}  ${interpHint}`);
          if (verbose) {
            try {
              const raw = await fs.readFile(entry.filepath, 'utf-8');
              const parsed: SavedResult = JSON.parse(raw);
              projection.log(`       Input: ${parsed.input}`);
              projection.log(`       Activity key: ${parsed.activityKey}`);
            } catch {
              // skip unreadable files
            }
          }
        }

        if (p.count > limit) {
          projection.log('');
          projection.log(`  ... ${p.count - limit} more. Use --limit to show more.`);
        }

        projection.log('');
        projection.log('  Tip: wpm results --last          Print the most recent result');
        projection.log('  Tip: wpm results --cat 1         Print result #1 in full');
        projection.log('  Tip: wpm conformance -i <log>    Measure fitness and precision');
        projection.log('');
      });

      return await exitWithFlush(result.exit_code);
    } catch (error) {
      const errResult = makeErrorResult('results', error, EXIT_CODES.system_error, 'RESULTS_ERROR');
      emitResult(errResult, { format, verbose, quiet });
      return await exitWithFlush(errResult.exit_code);
    }
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
  projection.log('');
  projection.log(`  File:         ${path.basename(filepath)}`);
  projection.log(`  Task:         ${parsed.task}`);
  projection.log(`  Saved at:     ${parsed.savedAt}`);
  projection.log(`  Input:        ${parsed.input}`);
  projection.log(`  Activity key: ${parsed.activityKey}`);

  // Quality dimensions block
  const qd = parsed.qualityDimensions;
  if (qd) {
    projection.log('');
    projection.log('  -- Quality Dimensions (van der Aalst) --');
    const qtierLabel = qd.qualityTier != null ? `${qd.qualityTier}/100` : 'not set';
    projection.log(`  Quality Tier:    ${qtierLabel}  (registry expected score)`);
    projection.log('');
    projection.log(
      `  Fitness        ${qualityBar(qd.fitness)}  ` +
        `${qd.fitness != null ? qd.fitness.toFixed(3) : 'not measured'}` +
        `  - fraction of traces replayable by model`
    );
    projection.log(
      `  Precision      ${qualityBar(qd.precision)}  ` +
        `${qd.precision != null ? qd.precision.toFixed(3) : 'not measured'}` +
        `  - fraction of model behaviour seen in log`
    );
    projection.log(
      `  Generalization ${qualityBar(qd.generalization)}  ` +
        `${qd.generalization != null ? qd.generalization.toFixed(3) : 'not measured'}` +
        `  - expected coverage on unseen traces`
    );
    projection.log(
      `  Simplicity     ${qualityBar(qd.simplicity)}  ` +
        `${qd.simplicity != null ? qd.simplicity.toFixed(3) : 'not measured'}` +
        `  - Occam score (1=minimal, 0=complex)`
    );
    projection.log('');
    projection.log('  Interpretation:');
    projection.log(`    ${qd.interpretation}`);
    if (qd.fitness == null || qd.precision == null) {
      projection.log('');
      projection.log('  Next steps:');
      projection.log('    wpm conformance -i <log.xes>                       Measure fitness + precision');
      projection.log(
        '    wpm compare dfg heuristic ilp -i <log.xes>    Compare algorithms side-by-side'
      );
    }
  }

  projection.log('');
  projection.log('  -- Raw result --');
  const lines = JSON.stringify(parsed.result, null, 2).split('\n');
  for (const line of lines) {
    projection.log(`    ${line}`);
  }
  projection.log('');
}
