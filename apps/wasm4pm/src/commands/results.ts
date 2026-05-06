import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';

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
        process.exit(errResult.exit_code);
      }
      const limit = parsedLimit ?? 20;

      // --last: cat the newest result
      if (ctx.args.last) {
        if (files.length === 0) {
          const result = makeResult('results', { files: [], count: 0, directory: dir }, performance.now() - t0);
          emitResult(result, { format, verbose, quiet }, (_res, projection) => {
            projection.warn('No saved results found.');
          });
          process.exit(EXIT_CODES.success);
        }
        const file = files[0];
        const parsed = await catResult(file.filepath);
        const result = makeResult('results', { cat: parsed, filepath: file.filepath }, performance.now() - t0);
        emitResult(result, { format, verbose, quiet }, (_res, projection) => {
          printCatResult(file.filepath, parsed, projection);
        });
        process.exit(EXIT_CODES.success);
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
          process.exit(errResult.exit_code);
        }

        const parsed = await catResult(filepath);
        const result = makeResult('results', { cat: parsed, filepath }, performance.now() - t0);
        emitResult(result, { format, verbose, quiet }, (_res, projection) => {
          printCatResult(filepath!, parsed, projection);
        });
        process.exit(EXIT_CODES.success);
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

        projection.info(`Saved results (${p.count} total — discovery + prediction)`);
        projection.log(`  Directory: ${p.directory}`);
        projection.log('');
        projection.log(`  #   Saved at              Task              File`);
        projection.log(
          `  ──  ────────────────────  ────────────────  ────────────────────────────────────`
        );

        for (const entry of p.results) {
          const taskSlug = entry.name.replace(/^\d{8}T\d{6}-/, '').replace(/\.json$/, '');
          const savedAt = entry.savedAt.slice(0, 19).replace('T', ' ');
          const idxStr = String(entry.index).padStart(3);
          const task = taskSlug.padEnd(16);
          const at = savedAt.padEnd(20);
          projection.log(`  ${idxStr}  ${at}  ${task}  ${entry.name}`);

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
        projection.log('');
      });

      process.exit(result.exit_code);
    } catch (error) {
      const errResult = makeErrorResult('results', error, EXIT_CODES.system_error, 'RESULTS_ERROR');
      emitResult(errResult, { format, verbose, quiet });
      process.exit(errResult.exit_code);
    }
  },
});

/**
 * Emit a single saved result to the console projection.
 */
function printCatResult(filepath: string, parsed: SavedResult, projection: ConsoleProjection): void {
  projection.log('');
  projection.log(`  File:         ${path.basename(filepath)}`);
  projection.log(`  Task:         ${parsed.task}`);
  projection.log(`  Saved at:     ${parsed.savedAt}`);
  projection.log(`  Input:        ${parsed.input}`);
  projection.log(`  Activity key: ${parsed.activityKey}`);
  projection.log('');
  projection.log('  Result:');
  const lines = JSON.stringify(parsed.result, null, 2).split('\n');
  for (const line of lines) {
    projection.log(`    ${line}`);
  }
  projection.log('');
}
