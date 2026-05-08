import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar from 'chokidar';
import { getFormatter, HumanFormatter, JSONFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { emitCognitionSpan } from './_shared.js';

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
  try {
    return await (import(COGNITION_PKG) as Promise<CognitionModule>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

/**
 * Run a cognition contract against the JSON content of an input file.
 * Returns a receipt and optional inference trace from a single execution.
 *
 * The heavy lifting is delegated to @wasm4pm/cognition when that package
 * exists on the module graph; if it is not installed the function throws
 * so that the watcher can log the error and keep running.
 */
async function runContract(
  inputPath: string,
  contractName: string
): Promise<{ receipt: WatchReceipt; inferenceTrace?: unknown }> {
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
    receipt: {
      decision: result.decision === 'Allow' ? 'Allow' : 'Deny',
      hash: typeof result.hash === 'string' ? result.hash.slice(0, 8) : '00000000',
      findings: Array.isArray(result.findings) ? result.findings.length : 0,
      contract: contractName,
      elapsedMs: Math.round(elapsedMs),
    },
    inferenceTrace: result.inference_trace,
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

    async function handleChange(): Promise<void> {
      // Confirm the file is still accessible before running
      try {
        await fs.access(inputPath);
      } catch {
        formatter.warn(`Input file deleted or inaccessible: ${inputPath} — waiting for it to return`);
        return;
      }

      const cycleStartNs = Date.now() * 1_000_000;
      const cycleStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let cycleStatus: 'OK' | 'ERROR' = 'OK';
      let cycleErrMsg: string | undefined;

      try {
        const contractResult = await runContract(inputPath, contractName);

        if (formatter instanceof JSONFormatter) {
          formatter.output({
            status: 'ok',
            message: 'contract evaluated',
            receipt: contractResult.receipt,
          });
        } else if (isQuiet) {
          console.log(contractResult.receipt.hash);
        } else if (isVerbose) {
          // Print summary line then inference_trace from the same execution
          console.log(formatReceiptLine(contractResult.receipt));
          if (contractResult.inferenceTrace) {
            console.log(JSON.stringify(contractResult.inferenceTrace, null, 2));
          }
        } else {
          console.log(formatReceiptLine(contractResult.receipt));
        }
      } catch (err) {
        cycleStatus = 'ERROR';
        cycleErrMsg = err instanceof Error ? err.message : String(err);
        formatter.error(`Contract run failed: ${cycleErrMsg}`);
        // Do NOT exit — the watcher continues watching
      } finally {
        emitCognitionSpan(
          'watch.cycle',
          cycleStartNs,
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - cycleStartMs,
          cycleStatus,
          cycleErrMsg,
        );
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
      handleChange().catch((err) => {
        formatter.error(
          `Unhandled error in change handler: ${err instanceof Error ? err.message : String(err)}`
        );
      });
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
