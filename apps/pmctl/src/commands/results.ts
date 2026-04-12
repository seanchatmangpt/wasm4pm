import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
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
  const ts = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', 'T')
    .slice(0, 15); // YYYYMMDDTHHmmss
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
  result: Record<string, unknown>,
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
    console.error(`Failed to save prediction result: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * List all saved result files sorted by modification time (newest first).
 */
async function listResultFiles(dir: string): Promise<Array<{ name: string; filepath: string; mtime: Date }>> {
  if (!existsSync(dir)) return [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));

  const withStats = await Promise.all(
    jsonFiles.map(async (e) => {
      const filepath = path.join(dir, e.name);
      const stat = await fs.stat(filepath);
      return { name: e.name, filepath, mtime: stat.mtime };
    }),
  );

  return withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      const dir = path.resolve(process.cwd(), RESULTS_DIR);
      const files = await listResultFiles(dir);
      const rawLimit = ctx.args.limit as string | undefined;
      const parsedLimit = rawLimit != null ? parseInt(rawLimit, 10) : undefined;
      if (parsedLimit !== undefined && Number.isNaN(parsedLimit)) {
        console.error('Invalid --limit value: must be a number');
        process.exit(EXIT_CODES.config_error);
      }
      const limit = parsedLimit ?? 20;

      // --last: cat the newest result
      if (ctx.args.last) {
        if (files.length === 0) {
          formatter.warn('No saved results found.');
          process.exit(EXIT_CODES.success);
        }
        const file = files[0];
        await catResult(file.filepath, formatter);
        process.exit(EXIT_CODES.success);
      }

      // --cat <name|index>: print a specific result
      if (ctx.args.cat) {
        const ref = ctx.args.cat as string;
        let filepath: string | undefined;

        // Try as a 1-based index first
        const idx = parseInt(ref, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= files.length) {
          filepath = files[idx - 1].filepath;
        } else {
          // Try as a filename (with or without .json)
          const name = ref.endsWith('.json') ? ref : `${ref}.json`;
          const match = files.find((f) => f.name === name);
          if (match) filepath = match.filepath;
        }

        if (!filepath) {
          formatter.error(`Result not found: ${ref}`);
          process.exit(EXIT_CODES.source_error);
        }

        await catResult(filepath, formatter);
        process.exit(EXIT_CODES.success);
      }

      // Default: list results
      if (files.length === 0) {
        if (formatter instanceof HumanFormatter) {
          formatter.info('No saved results found.');
          formatter.log(`  Directory: ${dir}`);
          formatter.log('');
          formatter.log('  Results are saved automatically when you run:');
          formatter.log('    pictl run <log.xes>                       (discovery)');
          formatter.log('    pictl predict <task> --input <log.xes>    (prediction)');
        } else {
          (formatter as JSONFormatter).success('No saved results', { directory: dir, count: 0, results: [] });
        }
        process.exit(EXIT_CODES.success);
      }

      const displayed = files.slice(0, limit);

      if (formatter instanceof JSONFormatter) {
        (formatter as JSONFormatter).success('Saved results', {
          directory: dir,
          count: files.length,
          showing: displayed.length,
          results: displayed.map((f, i) => ({
            index: i + 1,
            name: f.name,
            filepath: f.filepath,
            savedAt: f.mtime.toISOString(),
          })),
        });
        process.exit(EXIT_CODES.success);
      }

      const humanFormatter = formatter as HumanFormatter;
      humanFormatter.info(`Saved results (${files.length} total — discovery + prediction)`);
      humanFormatter.log(`  Directory: ${dir}`);
      humanFormatter.log('');
      humanFormatter.log(`  #   Saved at              Task              File`);
      humanFormatter.log(`  ──  ────────────────────  ────────────────  ────────────────────────────────────`);

      for (let i = 0; i < displayed.length; i++) {
        const f = displayed[i];
        // Parse task from filename: <timestamp>-<task>.json
        const taskSlug = f.name.replace(/^\d{8}T\d{6}-/, '').replace(/\.json$/, '');
        const savedAt = f.mtime.toISOString().slice(0, 19).replace('T', ' ');
        const idx = String(i + 1).padStart(3);
        const task = taskSlug.padEnd(16);
        const at = savedAt.padEnd(20);
        humanFormatter.log(`  ${idx}  ${at}  ${task}  ${f.name}`);

        if (ctx.args.verbose) {
          try {
            const raw = await fs.readFile(f.filepath, 'utf-8');
            const parsed: SavedResult = JSON.parse(raw);
            humanFormatter.log(`       Input: ${parsed.input}`);
            humanFormatter.log(`       Activity key: ${parsed.activityKey}`);
          } catch {
            // skip unreadable files
          }
        }
      }

      if (files.length > limit) {
        humanFormatter.log('');
        humanFormatter.log(`  ... ${files.length - limit} more. Use --limit to show more.`);
      }

      humanFormatter.log('');
      humanFormatter.log('  Tip: pictl results --last          Print the most recent result');
      humanFormatter.log('  Tip: pictl results --cat 1         Print result #1 in full');
      humanFormatter.log('');

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        (formatter as JSONFormatter).error('Failed to list results', error);
      } else {
        formatter.error(
          `Failed to list results: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      process.exit(EXIT_CODES.system_error);
    }
  },
});

/**
 * Read and pretty-print a single saved result file.
 */
async function catResult(
  filepath: string,
  formatter: HumanFormatter | JSONFormatter,
): Promise<void> {
  const raw = await fs.readFile(filepath, 'utf-8');
  const parsed: SavedResult = JSON.parse(raw);

  if (formatter instanceof JSONFormatter) {
    (formatter as JSONFormatter).output(parsed as unknown as Record<string, unknown>);
    return;
  }

  const humanFormatter = formatter as HumanFormatter;
  humanFormatter.log('');
  humanFormatter.log(`  File:         ${path.basename(filepath)}`);
  humanFormatter.log(`  Task:         ${parsed.task}`);
  humanFormatter.log(`  Saved at:     ${parsed.savedAt}`);
  humanFormatter.log(`  Input:        ${parsed.input}`);
  humanFormatter.log(`  Activity key: ${parsed.activityKey}`);
  humanFormatter.log('');
  humanFormatter.log('  Result:');
  const lines = JSON.stringify(parsed.result, null, 2).split('\n');
  for (const line of lines) {
    humanFormatter.log(`    ${line}`);
  }
  humanFormatter.log('');
}
