import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar from 'chokidar';
import { getFormatter, HumanFormatter, JSONFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';

/** Minimal receipt summary emitted on every re-run. */
export interface WatchReceipt {
  decision: 'Allow' | 'Deny';
  hash: string;
  findings: number;
  contract: string;
  elapsedMs: number;
}

// Module specifier for the optional @wasm4pm/cognition package.
// Using a variable prevents tsc from emitting TS2307 when the package
// is not installed — this is an intentionally optional runtime dependency.
const COGNITION_PKG = '@wasm4pm' + '/cognition';

type CognitionModule = {
  runContract: (
    input: Record<string, unknown>,
    contract: string
  ) => Promise<{
    decision?: string;
    hash?: string;
    findings?: unknown[];
    inference_trace?: unknown;
  }>;
};

/** Load @wasm4pm/cognition dynamically; returns null if not installed. */
async function loadCognitionModule(): Promise<CognitionModule | null> {
  return (import(COGNITION_PKG) as Promise<CognitionModule>).catch(() => null);
}

/**
 * Run a cognition contract against the JSON content of an input file.
 * Returns a WatchReceipt.
 *
 * The heavy lifting is delegated to @wasm4pm/cognition when that package
 * exists on the module graph; if it is not installed the function throws
 * so that the watcher can log the error and keep running.
 */
async function runContract(
  inputPath: string,
  contractName: string
): Promise<WatchReceipt> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const input = JSON.parse(raw) as Record<string, unknown>;

  const t0 = performance.now();
  const cognitionModule = await loadCognitionModule();

  if (!cognitionModule) {
    throw new Error(
      '@wasm4pm/cognition is not installed. Run `pnpm install` from the workspace root.'
    );
  }

  const result = await cognitionModule.runContract(input, contractName);
  const elapsedMs = performance.now() - t0;

  return {
    decision: result.decision === 'Allow' ? 'Allow' : 'Deny',
    hash: typeof result.hash === 'string' ? result.hash.slice(0, 8) : '00000000',
    findings: Array.isArray(result.findings) ? result.findings.length : 0,
    contract: contractName,
    elapsedMs: Math.round(elapsedMs),
  };
}

/** Format a receipt summary for human output. */
function formatReceiptLine(receipt: WatchReceipt): string {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `[${ts}] decision=${receipt.decision} hash=${receipt.hash} findings=${receipt.findings}`;
}

export const watch = defineCommand({
  meta: {
    name: 'watch',
    description: 'Watch an input file and re-run a cognition contract on every change',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to BreedInput JSON file to watch',
      required: true,
    },
    contract: {
      type: 'string',
      description: 'Contract name to evaluate (default: prolog)',
      default: 'prolog',
    },
    debounce: {
      type: 'string',
      description: 'Debounce interval in milliseconds (default: 200)',
      default: '200',
    },
    format: {
      type: 'string',
      description: 'Output format: human or json (default: human)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Print full inference_trace on each run',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Print only the hash on each run',
    },
  },
  async run(ctx) {
    const inputArg = ctx.args.input as string;
    const contractName = (ctx.args.contract as string) || 'prolog';
    const debounceMs = parseInt((ctx.args.debounce as string) || '200', 10);
    const formatArg = (ctx.args.format as string) || 'human';
    const isVerbose = ctx.args.verbose as boolean | undefined;
    const isQuiet = ctx.args.quiet as boolean | undefined;

    const formatter = getFormatter({
      format: formatArg as 'human' | 'json',
      verbose: isVerbose,
      quiet: isQuiet,
    });

    const inputPath = path.resolve(inputArg);

    // Validate that the input file exists before starting the watcher
    try {
      await fs.access(inputPath);
    } catch {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Input file not found', { path: inputPath } as Record<string, unknown>);
      } else {
        formatter.error(`Input file not found: ${inputPath}`);
      }
      process.exit(EXIT_CODES.source_error);
    }

    // ── Debounce state ────────────────────────────────────────────────────────
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    async function handleChange(): Promise<void> {
      // Confirm the file is still accessible before running
      try {
        await fs.access(inputPath);
      } catch {
        formatter.warn(`Input file deleted or inaccessible: ${inputPath} — waiting for it to return`);
        return;
      }

      try {
        const receipt = await runContract(inputPath, contractName);

        if (formatter instanceof JSONFormatter) {
          formatter.output({
            status: 'ok',
            message: 'contract evaluated',
            receipt,
          });
        } else if (isQuiet) {
          console.log(receipt.hash);
        } else if (isVerbose) {
          // Print summary line then full inference_trace
          console.log(formatReceiptLine(receipt));
          const rawAgain = await fs.readFile(inputPath, 'utf8');
          const inputAgain = JSON.parse(rawAgain) as Record<string, unknown>;
          try {
            type VerboseModule = {
              runContract: (
                inp: Record<string, unknown>,
                c: string
              ) => Promise<Record<string, unknown>>;
            };
            const verboseMod = await loadCognitionModule() as VerboseModule | null;
            if (verboseMod) {
              const fullResult = await verboseMod.runContract(inputAgain, contractName);
              if (fullResult && fullResult['inference_trace']) {
                console.log(JSON.stringify(fullResult['inference_trace'], null, 2));
              }
            }
          } catch {
            // Verbose trace unavailable — summary line was already printed
          }
        } else {
          console.log(formatReceiptLine(receipt));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        formatter.error(`Contract run failed: ${msg}`);
        // Do NOT exit — the watcher continues watching
      }
    }

    // ── Watcher setup ─────────────────────────────────────────────────────────
    const watcher = chokidar.watch(inputPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: debounceMs,
        pollInterval: 50,
      },
    });

    if (!(isQuiet ?? false)) {
      if (formatter instanceof HumanFormatter) {
        formatter.info(`Watching ${inputPath} (contract=${contractName}, debounce=${debounceMs}ms)`);
        formatter.info('Press Ctrl-C to stop');
      } else {
        formatter.warn(`Watching ${inputPath} (contract=${contractName}, debounce=${debounceMs}ms)`);
      }
    }

    watcher.on('change', () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        handleChange().catch((err) => {
          formatter.error(
            `Unhandled error in change handler: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      }, debounceMs);
    });

    watcher.on('unlink', () => {
      formatter.warn(`Input file deleted: ${inputPath} — waiting for it to return`);
    });

    watcher.on('add', () => {
      // File was re-created — treat as a change
      handleChange().catch((err) => {
        formatter.error(
          `Unhandled error after file re-create: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    });

    watcher.on('error', (err) => {
      formatter.error(`Watcher error: ${err instanceof Error ? err.message : String(err)}`);
      // Do NOT exit — keep watching
    });

    // ── SIGINT handling ───────────────────────────────────────────────────────
    process.on('SIGINT', () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      watcher
        .close()
        .then(() => {
          process.stderr.write('stopped\n');
          process.exit(EXIT_CODES.success);
        })
        .catch(() => {
          process.stderr.write('stopped\n');
          process.exit(EXIT_CODES.success);
        });
    });

    // Keep the process alive until SIGINT
    await new Promise<never>(() => {
      /* intentionally never resolves — lifecycle managed by SIGINT handler */
    });
  },
});
