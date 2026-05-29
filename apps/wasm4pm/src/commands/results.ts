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
          let integrity: 'ok' | 'mismatch' | 'no_receipt' | 'missing_ocel';
          if (matchedReceipt === null) {
            integrity = 'no_receipt';
          } else if ((matchedReceipt as any).output_hash !== recomputedOutputHash) {
            integrity = 'mismatch';
          } else {
            integrity = 'ok';
          }

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
          // Guard: the resolved path must stay within cwd and be a .json file.
          const cwd = path.resolve(process.cwd());
          const relative = path.relative(cwd, filepath);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
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
        const displayed = files.slice(0, limit);

        // Read summaries in parallel; failures return null (we skip silently)
        const summaries = await Promise.all(
          displayed.map(async (f) => {
            try {
              const raw = await fs.readFile(f.filepath, 'utf-8');
              const saved = JSON.parse(raw) as SavedResult;
              return { saved, summary: extractSummary(saved) };
            } catch {
              return null;
            }
          })
        );

        const payload = {
          directory: dir,
          count: files.length,
          showing: displayed.length,
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
              // backward compatibility with existing consumers.
              path: f.filepath,
              filepath: f.filepath,
              name: f.name,
              // timestamp is the canonical contract field; savedAt is kept for
              // backward compatibility.
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

          projection.info(`Saved results (${p.count} total — discovery + prediction)`);
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
            projection.log(`  ${idxStr}  ${savedAt}  ${algo}  ${ms}  ${fit}  ${taskSlug}`);

            if (verbose) {
              if (entry.input) projection.log(`       Input:        ${entry.input}`);
              if (entry.activityKey) projection.log(`       Activity key: ${entry.activityKey}`);
            }
          }

          if (p.count > limit) {
            projection.log('');
            projection.log(`  ... ${p.count - limit} more. Use --limit to show more.`);
          }

          projection.log('');
          projection.log('  Tip: wpm results --last          Print the most recent result');
          projection.log('  Tip: wpm results --cat 1         Print result #1 in full');
          projection.log(
            '  Tip: wpm results --diff 1,2      Compare process model quality of #1 vs #2'
          );
          projection.log(
            '  Tip: wpm results --verify 1      Confirm result #1 has not been tampered with'
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

  projection.log('');
  projection.log('  Comparing two saved results:');
  projection.log('');
  projection.log(`  Left  (#A): ${path.basename(fp1)}`);
  projection.log(`  Right (#B): ${path.basename(fp2)}`);
  projection.log('');

  // Header row
  projection.log(
    `  Field              #A                              #B                              Winner`
  );
  projection.log(
    `  ─────────────────  ──────────────────────────────  ──────────────────────────────  ──────`
  );

  function row(
    label: string,
    a: string | undefined,
    b: string | undefined,
    winner?: '#A' | '#B' | 'tie' | ''
  ): void {
    const aStr = (a ?? '—').padEnd(30);
    const bStr = (b ?? '—').padEnd(30);
    const changed = a !== b ? ' <' : '';
    const winStr = winner === '#A' ? '#A' : winner === '#B' ? '#B' : winner === 'tie' ? 'tie' : '';
    projection.log(`  ${label.padEnd(17)}  ${aStr}  ${bStr}${changed.padEnd(2)}  ${winStr}`);
  }

  row('Task', p1.task, p2.task);
  row('Algorithm', s1.algorithm, s2.algorithm);

  // Elapsed — lower is better (faster)
  const elA = s1.elapsedMs;
  const elB = s2.elapsedMs;
  const elWinner: '#A' | '#B' | 'tie' | '' =
    elA !== undefined && elB !== undefined ? (elA < elB ? '#A' : elA > elB ? '#B' : 'tie') : '';
  row(
    'Elapsed (lower=faster)',
    elA !== undefined ? fmtMs(elA).trim() : undefined,
    elB !== undefined ? fmtMs(elB).trim() : undefined,
    elWinner
  );

  // Fitness — higher is better; translate delta into PM interpretation
  const fA = s1.fitness;
  const fB = s2.fitness;
  const fitWinner: '#A' | '#B' | 'tie' | '' =
    fA !== undefined && fB !== undefined ? (fA > fB ? '#A' : fA < fB ? '#B' : 'tie') : '';
  row(
    'Fitness (higher=better)',
    fA !== undefined ? `${(fA * 100).toFixed(1)}%` : undefined,
    fB !== undefined ? `${(fB * 100).toFixed(1)}%` : undefined,
    fitWinner
  );

  // Jaccard similarity over DFG edge sets
  const edgesA = extractEdgeSet(p1);
  const edgesB = extractEdgeSet(p2);
  const jaccard = jaccardSimilarity(edgesA, edgesB);
  if (jaccard !== null) {
    row(
      'Edge overlap (Jaccard)',
      `${(jaccard * 100).toFixed(1)}%`,
      `${(jaccard * 100).toFixed(1)}%`,
      'tie'
    );
  }

  row(
    'Input',
    p1.input ? path.basename(p1.input) : undefined,
    p2.input ? path.basename(p2.input) : undefined
  );
  row('Activity key', p1.activityKey, p2.activityKey);
  row('Saved at', p1.savedAt.slice(0, 19), p2.savedAt.slice(0, 19));

  projection.log('');
  projection.log('  Fields marked with "<" differ between the two results.');
  projection.log('');

  // Jaccard plain-language explanation
  if (jaccard !== null) {
    const jPct = Math.round(jaccard * 100);
    const sharedEdges = [...edgesA].filter((x) => edgesB.has(x)).length;
    const totalEdges = new Set([...edgesA, ...edgesB]).size;
    projection.log(`  Edge similarity (Jaccard):`);
    projection.log(`    ${jPct}% of process edges are shared between these two runs`);
    projection.log(
      `    (${sharedEdges} shared out of ${totalEdges} unique edges across both models).`
    );
    if (jaccard >= 0.95) {
      projection.log(`    The two models are structurally near-identical. Any quality difference`);
      projection.log(`    is due to parameter tuning, not algorithm choice.`);
    } else if (jaccard >= 0.75) {
      projection.log(`    The two models agree on most process flows but differ on some paths.`);
      projection.log(`    Inspect the deviating edges with: wpm diff <log1.xes> <log2.xes>`);
    } else {
      projection.log(`    The two models have substantially different process structures.`);
      projection.log(`    This is likely algorithm-driven, not just noise. Fitness alone does not`);
      projection.log(
        `    capture this — a high-fitness model may still be imprecise (flower model).`
      );
      projection.log(`    Use: wpm compare <algos> -i <log.xes> to compare algorithms directly.`);
    }
    projection.log('');
  }

  // PM-aware interpretation of the fitness delta
  if (fA !== undefined && fB !== undefined && fA !== fB) {
    const delta = Math.abs(fA - fB);
    const higher = fA > fB ? '#A' : '#B';
    const lowerPct = Math.round(Math.min(fA, fB) * 100);
    const unreplayedPct = Math.round((1 - Math.min(fA, fB)) * 100);
    projection.log(`  Fitness interpretation:`);
    projection.log(`    ${higher} has ${(delta * 100).toFixed(1)}pp higher fitness.`);
    projection.log(
      `    The lower-fitness result (${lowerPct}%) means ~${unreplayedPct}% of traces`
    );
    projection.log(`    had missing or extra tokens during model replay — those traces deviate`);
    projection.log(`    from the discovered process model.`);
    if (Math.min(fA, fB) < 0.85) {
      projection.log(
        `    Van der Aalst target is >=0.85. The lower result is below this threshold.`
      );
      projection.log(`    Consider using a less restrictive algorithm (e.g. inductive miner) or`);
      projection.log(`    investigating the deviating traces with: wpm conformance <log.xes>`);
    }
    projection.log('');
  }

  // Speed interpretation
  if (elA !== undefined && elB !== undefined && elA !== elB) {
    const faster = elA < elB ? '#A' : '#B';
    const slower = elA < elB ? '#B' : '#A';
    const ratio = (Math.max(elA, elB) / Math.min(elA, elB)).toFixed(1);
    projection.log(`  Speed interpretation:`);
    projection.log(`    ${faster} is ${ratio}x faster than ${slower}.`);
    projection.log(`    For large logs (>10K events), this gap compounds significantly.`);
    projection.log('');
  }

  projection.log('  When to use --diff vs --verify:');
  projection.log('    --diff <r1,r2>   Compare process model quality between two runs.');
  projection.log('                     Use this to choose between algorithms or configurations.');
  projection.log('    --verify <ref>   Check that a saved result has not been tampered with.');
  projection.log('                     Use this before treating a result as audit evidence.');
  projection.log('');
  projection.log(`  Use 'wpm results --cat <ref>' to see the full result for either entry.`);
  projection.log('');
}
