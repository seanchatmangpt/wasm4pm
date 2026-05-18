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

export interface SavedResult {
  version: 1;
  savedAt: string;
  task: string;
  input: string;
  activityKey: string;
  result: Record<string, unknown>;
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
 * Creates the directory on first use.  Never throws — failures are silently
 * reported so they don't break the main predict command.
 *
 * @returns The absolute path of the written file, or null on failure.
 */
export async function savePredictionResult(
  task: string,
  input: string,
  activityKey: string,
  result: Record<string, unknown>
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

/**
 * Resolve a result reference (1-based index or filename) to a filepath.
 * Returns undefined if the reference does not match any file.
 */
function resolveRef(
  ref: string,
  files: Array<{ name: string; filepath: string }>
): string | undefined {
  const idx = parseInt(ref, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= files.length) {
    return files[idx - 1].filepath;
  }
  const name = ref.endsWith('.json') ? ref : `${ref}.json`;
  return files.find((f) => f.name === name)?.filepath;
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
    description: 'List and inspect saved discovery and prediction results from .wasm4pm/results/',
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

    // Determine operation early so the span attribute is always set
    const operation = ctx.args.verify
      ? 'verify'
      : ctx.args.path
        ? 'path'
        : ctx.args.last
          ? 'last'
          : ctx.args.cat
            ? 'cat'
            : ctx.args.diff
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
        if (ctx.args.verify) {
          const ref = ctx.args.verify as string;
          const receiptsDir = path.resolve(process.cwd(), '.wasm4pm', 'receipts');

          const resultFilepath = resolveRef(ref, files);
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

          // output_hash was computed as blake3(JSON.stringify(payload)) where payload
          // is the result field inside the SavedResult wrapper.
          const recomputedOutputHash = blake3Hex(JSON.stringify(savedResult.result));

          // Scan receipts for any whose output_hash matches (check latest first as fast path)
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
              const r = JSON.parse(await fs.readFile(rPath, 'utf-8')) as CommandReceipt;
              if (r.output_hash === recomputedOutputHash) {
                matchedReceipt = r;
                matchedReceiptFile = rFile;
                break;
              }
            } catch {
              /* skip unreadable files */
            }
          }

          const integrity = matchedReceipt
            ? matchedReceipt.output_hash === recomputedOutputHash
              ? 'ok'
              : 'mismatch'
            : 'no_receipt';

          const verifyPayload = {
            result_file: path.basename(resultFilepath),
            recomputed_output_hash: recomputedOutputHash,
            receipt_found: matchedReceipt !== null,
            receipt_file: matchedReceiptFile,
            receipt_output_hash: matchedReceipt?.output_hash ?? null,
            integrity,
            run_id: matchedReceipt?.run_id ?? null,
            command: matchedReceipt?.command ?? null,
            timestamp: matchedReceipt?.timestamp ?? null,
          };

          const verifyExitCode =
            integrity === 'mismatch' ? EXIT_CODES.partial_failure : EXIT_CODES.success;

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
            projection.log(`  Output hash (recomputed):`);
            projection.log(`    ${p.recomputed_output_hash}`);
            projection.log('');
            if (p.integrity === 'ok') {
              projection.success(`Integrity OK — receipt ${p.receipt_file} matches`);
              projection.log(`  run_id:  ${p.run_id}`);
              projection.log(`  command: ${p.command}`);
              projection.log(`  saved:   ${p.timestamp}`);
            } else if (p.integrity === 'mismatch') {
              projection.error('Integrity MISMATCH — receipt hash differs from recomputed hash');
              projection.log(`  Receipt:     ${p.receipt_output_hash}`);
              projection.log(`  Recomputed:  ${p.recomputed_output_hash}`);
            } else {
              projection.warn('No receipt found for this result file');
              projection.log(
                '  The result may have been saved with --no-save, or receipts were cleared.'
              );
              projection.log(`  Recomputed hash: ${p.recomputed_output_hash}`);
            }
            projection.log('');
          });
          return await exitWithFlush(verifyExitCode);
        }

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
          const filepath = resolveRef(ref, files);

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

          const parsed = await catResult(filepath);
          const result = makeResult('results', { cat: parsed, filepath }, performance.now() - t0);
          emitResult(result, { format, verbose, quiet }, (_res, projection) => {
            printCatResult(filepath!, parsed, projection);
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // --diff <ref1,ref2>: compare two saved results side-by-side
        if (ctx.args.diff) {
          const parts = (ctx.args.diff as string).split(',').map((s) => s.trim());
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
          const fp1 = resolveRef(ref1, files);
          const fp2 = resolveRef(ref2, files);

          if (!fp1 || !fp2) {
            const missing = !fp1 ? ref1 : ref2;
            const hint =
              files.length > 0
                ? `  Available indexes: 1–${files.length}. Run 'wpm results' to list them.`
                : '  No results saved yet.';
            const errResult = makeErrorResult(
              'results',
              new Error(`Result not found: '${missing}'\n\n${hint}`),
              EXIT_CODES.source_error,
              'RESULT_NOT_FOUND'
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(errResult.exit_code);
          }

          const [parsed1, parsed2] = await Promise.all([catResult(fp1), catResult(fp2)]);
          const diffPayload = { left: parsed1, right: parsed2, leftPath: fp1, rightPath: fp2 };
          const result = makeResult('results', diffPayload, performance.now() - t0);
          emitResult(result, { format, verbose, quiet }, (_res, projection) => {
            printDiffResult(fp1, parsed1, fp2, parsed2, projection);
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
          results: displayed.map((f, i) => {
            const s = summaries[i];
            return {
              index: i + 1,
              name: f.name,
              filepath: f.filepath,
              savedAt: f.mtime.toISOString(),
              task: s?.saved.task ?? f.name.replace(/^\d{8}T\d{6}-/, '').replace(/\.json$/, ''),
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
          projection.log('  Tip: wpm results --diff 1,2      Compare result #1 vs #2 side-by-side');
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

/**
 * Emit a single saved result to the console projection.
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
  projection.log('  Result:');
  const lines = JSON.stringify(parsed.result, null, 2).split('\n');
  for (const line of lines) {
    projection.log(`    ${line}`);
  }
  projection.log('');
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

  // PM-aware interpretation of the fitness delta
  if (fA !== undefined && fB !== undefined && fA !== fB) {
    const delta = Math.abs(fA - fB);
    const higher = fA > fB ? '#A' : '#B';
    const lowerPct = Math.round(Math.min(fA, fB) * 100);
    const unrplayedPct = Math.round((1 - Math.min(fA, fB)) * 100);
    projection.log(`  Fitness interpretation:`);
    projection.log(`    ${higher} has ${(delta * 100).toFixed(1)}pp higher fitness.`);
    projection.log(`    The lower-fitness result (${lowerPct}%) means ~${unrplayedPct}% of traces`);
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

  projection.log(`  Use 'wpm results --cat <ref>' to see the full result for either entry.`);
  projection.log('');
}
