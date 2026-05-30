/**
 * `wpm receipt show` — BLAKE3 receipt chain visualization
 *
 * Displays the most recent receipt (or a specified one) with a hash chain
 * diagram, status, and instructions for verification.
 *
 *   wpm receipt show              — show most recent receipt from .wasm4pm/receipts/
 *   wpm receipt show --latest     — same as above (explicit)
 *   wpm receipt show <file>       — show a specific receipt file
 *   wpm receipt show --format json — machine-readable output
 */

import { defineCommand } from 'citty';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpan } from '../_otel.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ReceiptShape {
  run_id?: string;
  command?: string;
  timestamp?: string;
  input_hash?: string;
  output_hash?: string;
  config_hash?: string;
  plan_hash?: string;
  status?: string;
  summary?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Find the latest receipt file in .wasm4pm/receipts/.
 * Returns the path to latest.json if it exists, otherwise the most recently
 * modified *.json file in the directory.
 */
function findLatestReceipt(cwd: string): string | null {
  const receiptsDir = path.join(cwd, '.wasm4pm', 'receipts');
  if (!fs.existsSync(receiptsDir)) return null;

  // Prefer the canonical latest.json symlink/file
  const latestPath = path.join(receiptsDir, 'latest.json');
  if (fs.existsSync(latestPath)) return latestPath;

  // Fallback: find most recently modified .json file
  let mostRecent: { name: string; mtime: number } | null = null;
  try {
    for (const entry of fs.readdirSync(receiptsDir)) {
      if (!entry.endsWith('.json')) continue;
      const fullPath = path.join(receiptsDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (!mostRecent || stat.mtimeMs > mostRecent.mtime) {
          mostRecent = { name: fullPath, mtime: stat.mtimeMs };
        }
      } catch { /* skip */ }
    }
  } catch { /* ignore readdir errors */ }

  return mostRecent?.name ?? null;
}

/**
 * Truncate a hex hash for display: first 8 + '...' + last 4 chars.
 */
function shortHash(hash: string | undefined): string {
  if (!hash) return '(none)';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

/**
 * Render a BLAKE3 hash chain diagram for human output.
 * Shows config/input/plan/output hashes flowing into a combined hash.
 */
function renderHashChain(receipt: ReceiptShape): string[] {
  const lines: string[] = [];
  lines.push('BLAKE3 Hash Chain:');

  const hashes: Array<{ label: string; key: keyof ReceiptShape }> = [
    { label: 'config ', key: 'config_hash' },
    { label: 'input  ', key: 'input_hash' },
    { label: 'plan   ', key: 'plan_hash' },
    { label: 'output ', key: 'output_hash' },
  ];

  // Only show hashes that are present in the receipt
  const presentHashes = hashes.filter((h) => receipt[h.key] !== undefined);

  if (presentHashes.length === 0) {
    // Minimal receipt (just input_hash / output_hash)
    const ih = receipt['input_hash'] as string | undefined;
    const oh = receipt['output_hash'] as string | undefined;
    if (ih) lines.push(`  input  → [${shortHash(ih)}]`);
    if (oh) lines.push(`  output → [${shortHash(oh)}]`);
  } else if (presentHashes.length === 1) {
    const h = presentHashes[0]!;
    lines.push(`  ${h.label} → [${shortHash(receipt[h.key] as string)}]`);
  } else {
    // Multi-hash chain: first N-1 flow into a combined, then output stands alone
    const chainHashes = presentHashes.filter((h) => h.key !== 'output_hash');
    const outputHash = presentHashes.find((h) => h.key === 'output_hash');

    if (chainHashes.length > 0) {
      for (let i = 0; i < chainHashes.length; i++) {
        const h = chainHashes[i]!;
        const connector =
          i < chainHashes.length - 1
            ? '─┐'
            : chainHashes.length === 1
              ? '──'
              : '─┘';
        const prefix = i === 0 ? '  ' : i < chainHashes.length - 1 ? '  ' : '  ';
        const suffix =
          i === Math.floor(chainHashes.length / 2) && chainHashes.length > 1
            ? ` ─┤ combined: [${shortHash(
                // Combined is a conceptual hash — use output as proxy if available
                (receipt['output_hash'] as string | undefined) ??
                (receipt['input_hash'] as string | undefined)
              )}]`
            : '';
        lines.push(`${prefix}${h.label} → [${shortHash(receipt[h.key] as string)}] ${connector}${suffix}`);
      }
    }

    if (outputHash) {
      lines.push(`  ${outputHash.label} → [${shortHash(receipt[outputHash.key] as string)}]`);
    }
  }

  return lines;
}

/**
 * Render a summary line showing the algorithm and fitness if available.
 */
function renderSummaryLines(receipt: ReceiptShape): string[] {
  const lines: string[] = [];
  const summary = receipt['summary'] as Record<string, unknown> | undefined;
  if (!summary) return lines;

  if (summary['algorithm']) {
    lines.push(`Algorithm: ${summary['algorithm']}`);
  }
  if (summary['fitness'] !== undefined && summary['fitness'] !== null) {
    lines.push(`Fitness:   ${summary['fitness']}`);
  }
  const eventCount =
    summary['event_count'] ?? summary['events'] ?? summary['events_analyzed'];
  if (eventCount !== undefined && eventCount !== null) {
    lines.push(`Events:    ${Number(eventCount).toLocaleString()}`);
  }
  const elapsedMs = summary['elapsedMs'] ?? summary['elapsed_ms'];
  if (elapsedMs !== undefined) {
    lines.push(`Duration:  ${Number(elapsedMs).toFixed(0)}ms`);
  }

  return lines;
}

// ── Command ───────────────────────────────────────────────────────────────────

export const show = defineCommand({
  meta: {
    name: 'show',
    description: 'Visualize a BLAKE3 receipt chain with hash diagram and status',
  },
  args: {
    file: {
      type: 'positional',
      required: false,
      description: 'Path to receipt JSON file (default: .wasm4pm/receipts/latest.json)',
    },
    latest: {
      type: 'boolean',
      description: 'Show the most recent receipt from .wasm4pm/receipts/ (default behavior)',
    },
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const filePath = ctx.args.file as string | undefined;

    return withSpan('receipt.show', {}, async () => {
      const t0 = performance.now();

      // Resolve which receipt to show
      let resolvedPath: string;
      if (filePath) {
        resolvedPath = path.resolve(filePath);
      } else {
        const latest = findLatestReceipt(process.cwd());
        if (!latest) {
          const result = makeErrorResult(
            'receipt show',
            'No receipts found. Run a command (e.g., wpm run <log.xes>) first to generate receipts.',
            EXIT_CODES.source_error,
            'NO_RECEIPTS_FOUND'
          );
          emitResult(result, { format: fmt, verbose, quiet });
          return exitWithFlush(EXIT_CODES.source_error);
        }
        resolvedPath = latest;
      }

      // Read the receipt
      let receipt: ReceiptShape;
      try {
        const raw = fs.readFileSync(resolvedPath, 'utf-8');
        receipt = JSON.parse(raw) as ReceiptShape;
      } catch (err) {
        const fsErr = err as NodeJS.ErrnoException;
        const code = fsErr.code ?? 'UNKNOWN';
        const hint =
          code === 'ENOENT'
            ? `\n\n  File not found: ${resolvedPath}\n  Run: wpm run <log.xes>  to generate a receipt`
            : '';
        const result = makeErrorResult(
          'receipt show',
          `Cannot read receipt '${resolvedPath}' (${code}): ${fsErr.message}${hint}`,
          EXIT_CODES.source_error,
          'source_error'
        );
        emitResult(result, { format: fmt, verbose, quiet });
        return exitWithFlush(EXIT_CODES.source_error);
      }

      // Determine status
      const status = (receipt['status'] as string | undefined) ?? 'unknown';
      const isValid =
        typeof receipt['run_id'] === 'string' &&
        (typeof receipt['input_hash'] === 'string' ||
          typeof receipt['output_hash'] === 'string');
      const statusIcon = isValid
        ? status === 'success'
          ? '✔ VALID'
          : status === 'partial'
            ? '⚠ PARTIAL'
            : '✔ PRESENT'
        : '✗ INVALID STRUCTURE';

      const hashChainLines = renderHashChain(receipt);
      const summaryLines = renderSummaryLines(receipt);
      const verifyCmd = `wpm results --verify ${path.basename(resolvedPath)}`;

      const result = makeResult(
        'receipt show',
        {
          file: resolvedPath,
          run_id: receipt['run_id'],
          command: receipt['command'],
          timestamp: receipt['timestamp'],
          status,
          is_valid: isValid,
          input_hash: receipt['input_hash'],
          output_hash: receipt['output_hash'],
          config_hash: receipt['config_hash'],
          plan_hash: receipt['plan_hash'],
          summary: receipt['summary'],
        },
        performance.now() - t0,
        EXIT_CODES.success
      );

      emitResult(result, { format: fmt, verbose, quiet }, (_res, p) => {
        p.log('');
        p.log('Receipt Chain Visualization');
        p.log('============================');
        p.log(`run_id:    ${receipt['run_id'] ?? '(none)'}`);
        if (receipt['command']) p.log(`command:   ${receipt['command']}`);
        if (receipt['timestamp']) p.log(`timestamp: ${receipt['timestamp']}`);
        p.log('');

        for (const line of hashChainLines) {
          p.log(line);
        }
        p.log('');

        if (summaryLines.length > 0) {
          for (const line of summaryLines) {
            p.log(line);
          }
          p.log('');
        }

        p.log(`Status:    ${statusIcon}`);
        p.log('');
        p.log(`Verify with: ${verifyCmd}`);
        p.log('');
      });

      return exitWithFlush(EXIT_CODES.success);
    });
  },
});
