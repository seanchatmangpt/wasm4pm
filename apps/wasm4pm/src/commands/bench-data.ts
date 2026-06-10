/**
 * wpm bench-data — Benchmark corpus management and leaderboard runner.
 *
 * Subcommands:
 *   wpm bench-data list              List available corpus files
 *   wpm bench-data run <name>        Run algorithms against a corpus, print leaderboard
 */

import { defineCommand } from 'citty';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { withSpanRaw } from './_otel.js';
import {
  blake3Hex,
  newReceipt,
  saveCommandReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';

// ─── Corpus catalogue ─────────────────────────────────────────────────────────

const KNOWN_CORPUS: Array<{ name: string; format: string; approxSize: string }> = [
  { name: 'sepsis',               format: 'XES',      approxSize: '~1.4 MB' },
  { name: 'bpi2020_travel',       format: 'XES',      approxSize: '~3.2 MB' },
  { name: 'roadtraffic100traces', format: 'XES',      approxSize: '~120 KB' },
  { name: 'ocel20_example',       format: 'JSONOCEL',  approxSize: '~40 KB'  },
];

// ─── bench_data resolution ───────────────────────────────────────────────────

function findBenchDataDir(): string | null {
  const candidates = [path.join(process.cwd(), 'bench_data')];
  let cur = path.dirname(process.argv[1] ?? process.cwd());
  for (let i = 0; i < 5; i++) {
    candidates.push(path.join(cur, 'bench_data'));
    cur = path.dirname(cur);
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ─── CLI entry-point helper (mirrors pipeline.ts pattern) ────────────────────

function getCliEntryPoint(): string {
  const url = new URL(import.meta.url);
  const commandsDir = path.dirname(url.pathname);
  const srcDir = path.dirname(commandsDir);
  const appDir = path.dirname(srcDir);
  return path.join(appDir, 'dist', 'cli.js');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlgoMetrics {
  fitness?: number;
  precision?: number;
  generalization?: number;
  simplicity?: number;
}

interface LeaderboardEntry {
  rank: number;
  algorithm: string;
  fitness: number;
  precision: number;
  generalization: number;
  simplicity: number;
  duration_ms: number;
}

interface BenchDataRunPayload {
  corpus: string;
  leaderboard: LeaderboardEntry[];
}

interface BenchDataListPayload {
  bench_data_dir: string | null;
  corpus: Array<{ name: string; format: string; approx_size: string }>;
}

// ─── Subcommand: list ─────────────────────────────────────────────────────────

const benchDataList = defineCommand({
  meta: {
    name: 'list',
    description: 'List available benchmark corpus files',
  },
  args: {
    format: { type: 'string', description: 'Output format: human (default) or json' },
  },
  async run(ctx) {
    return withSpanRaw('bench-data.list', { command: 'bench-data', subcommand: 'list' }, async () => {
      const t0 = performance.now();
      const fmt = ctx.args.format ?? 'human';
      const benchDir = findBenchDataDir();

      // Build corpus list: merge known catalogue with what's actually on disk
      const corpus = KNOWN_CORPUS.map(c => ({
        name: c.name,
        format: c.format,
        approx_size: c.approxSize,
      }));

      const payload: BenchDataListPayload = {
        bench_data_dir: benchDir,
        corpus,
      };

      const result = makeResult<BenchDataListPayload>(
        'bench-data list',
        payload,
        performance.now() - t0,
        EXIT_CODES.success,
        benchDir
          ? `Found bench_data at ${benchDir} (${corpus.length} known corpus files)`
          : 'bench_data directory not found on this machine',
      );

      emitResult(result, { format: fmt as 'human' | 'json' }, (r, proj) => {
        const dir = r.payload.bench_data_dir ?? '(not found)';
        proj.log(`bench_data directory: ${dir}\n`);
        proj.log(
          `${'Name'.padEnd(28)} ${'Format'.padEnd(10)} Approx Size`,
        );
        proj.log('-'.repeat(54));
        for (const c of r.payload.corpus) {
          proj.log(
            `${c.name.padEnd(28)} ${c.format.padEnd(10)} ${c.approx_size}`,
          );
        }
      });

      exitWithFlush(result.exit_code);
    });
  },
});

// ─── Subcommand: run ──────────────────────────────────────────────────────────

const benchDataRun = defineCommand({
  meta: {
    name: 'run',
    description: 'Run algorithms against a benchmark corpus and print a leaderboard',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Corpus name (without extension), e.g. sepsis',
      required: true,
    },
    algorithm: {
      type: 'string',
      description: 'Comma-separated algorithm list (default: heuristic_miner,inductive_miner,dfg)',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
    },
  },
  async run(ctx) {
    return withSpanRaw('bench-data.run', { command: 'bench-data', subcommand: 'run' }, async () => {
      const t0 = performance.now();
      const fmt = ctx.args.format ?? 'human';
      const corpusName = ctx.args.name as string;
      const algorithmsCsv = (ctx.args.algorithm as string | undefined)
        ?? 'heuristic_miner,inductive_miner,dfg';
      const algorithms = algorithmsCsv.split(',').map(s => s.trim()).filter(Boolean);

      // Resolve corpus path
      const benchDir = findBenchDataDir();
      if (!benchDir) {
        const result = makeErrorResult(
          'bench-data run',
          new Error('bench_data directory not found. Expected at repo root or within 5 levels of the CLI binary.'),
          EXIT_CODES.source_error,
          'SOURCE_ERROR',
          'Clone the wasm4pm repository and ensure bench_data/ is present at the repo root.',
        );
        emitResult(result, { format: fmt as 'human' | 'json' });
        exitWithFlush(result.exit_code);
        return;
      }

      const corpusPath = path.join(benchDir, `${corpusName}.xes`);
      if (!fs.existsSync(corpusPath)) {
        const result = makeErrorResult(
          'bench-data run',
          new Error(`Corpus not found: ${corpusPath}`),
          EXIT_CODES.source_error,
          'SOURCE_ERROR',
          `Available corpus files: ${KNOWN_CORPUS.map(c => c.name).join(', ')}`,
        );
        emitResult(result, { format: fmt as 'human' | 'json' });
        exitWithFlush(result.exit_code);
        return;
      }

      const cliEntry = getCliEntryPoint();
      const entries: LeaderboardEntry[] = [];

      for (const algo of algorithms) {
        const algoT0 = performance.now();
        const spawnResult = spawnSync(
          process.execPath,
          [cliEntry, 'run', corpusPath, '--algorithm', algo, '--format', 'json', '--no-save'],
          {
            encoding: 'utf-8',
            timeout: 180_000,
            env: { ...process.env, NO_COLOR: '1' },
          },
        );
        const duration_ms = Math.round(performance.now() - algoT0);

        let metrics: AlgoMetrics = {};
        if (spawnResult.stdout) {
          try {
            const parsed = JSON.parse(spawnResult.stdout) as { payload?: AlgoMetrics };
            if (parsed.payload) metrics = parsed.payload;
          } catch {
            // leave metrics empty
          }
        }

        entries.push({
          rank: 0, // assigned after sort
          algorithm: algo,
          fitness:       typeof metrics.fitness       === 'number' ? metrics.fitness       : 0,
          precision:     typeof metrics.precision     === 'number' ? metrics.precision     : 0,
          generalization: typeof metrics.generalization === 'number' ? metrics.generalization : 0,
          simplicity:    typeof metrics.simplicity    === 'number' ? metrics.simplicity    : 0,
          duration_ms,
        });
      }

      // Sort by fitness descending, then assign ranks
      entries.sort((a, b) => b.fitness - a.fitness);
      for (let i = 0; i < entries.length; i++) entries[i].rank = i + 1;

      const payload: BenchDataRunPayload = { corpus: corpusName, leaderboard: entries };

      // Receipt
      const { run_id, command, timestamp } = newReceipt('bench-data run');
      const inputHash  = blake3Hex(corpusPath);
      const outputHash = blake3Hex(JSON.stringify(payload));
      const receipt: CommandReceipt = {
        run_id,
        command,
        input_hash: inputHash,
        output_hash: outputHash,
        status: 'success',
        timestamp,
        summary: { corpus: corpusName, algorithms },
      };
      saveCommandReceipt(receipt);

      const result = makeResult<BenchDataRunPayload>(
        'bench-data run',
        payload,
        performance.now() - t0,
        EXIT_CODES.success,
        `Leaderboard for '${corpusName}': ${entries.length} algorithm(s) evaluated`,
      );

      emitResult(result, { format: fmt as 'human' | 'json' }, (r, proj) => {
        proj.log(`\nBenchmark leaderboard — corpus: ${r.payload.corpus}\n`);
        proj.log(
          `${'Rank'.padEnd(6)} ${'Algorithm'.padEnd(24)} ${'Fitness'.padEnd(9)} ${'Precision'.padEnd(11)} ${'General.'.padEnd(10)} ${'Simplicity'.padEnd(11)} Duration`,
        );
        proj.log('-'.repeat(82));
        for (const e of r.payload.leaderboard) {
          proj.log(
            `${String(e.rank).padEnd(6)} ${e.algorithm.padEnd(24)} ` +
            `${e.fitness.toFixed(3).padEnd(9)} ${e.precision.toFixed(3).padEnd(11)} ` +
            `${e.generalization.toFixed(3).padEnd(10)} ${e.simplicity.toFixed(3).padEnd(11)} ` +
            `${e.duration_ms} ms`,
          );
        }
        proj.log('');
      });

      exitWithFlush(result.exit_code);
    });
  },
});

// ─── Root command ─────────────────────────────────────────────────────────────

export const benchDataCommand = defineCommand({
  meta: {
    name: 'bench-data',
    description: 'Manage and run benchmark corpus files (sepsis, bpi2020_travel, …)',
  },
  subCommands: {
    list: benchDataList,
    run:  benchDataRun,
  },
});
