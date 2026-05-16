import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { createInterface } from 'node:readline/promises';
import { WasmLoader } from '@wasm4pm/engine';
import { getRegistry } from '@wasm4pm/kernel';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { runDiscovery, ALGORITHMS, type Algorithm } from './run.js';

const BANNER = `
  wpm repl — Interactive Process Mining  (WASM loaded once, commands run in milliseconds)

  Commands:
    load <file.xes>      Load an event log
    run [algo]           Discover process model (uses current algorithm if omitted)
    predict <task>       Run prediction (next-activity | remaining-time | outcome | drift)
    quality              Token-replay fitness + precision on last discovered model
    algos [--tier <t>]   List registered algorithms (tier: fast|balanced|quality|stream)
    set algo <id>        Change default algorithm
    set key <attr>       Change activity key (default: concept:name)
    stats                Log statistics for currently loaded log
    history              Show last 10 commands
    help                 Show this help
    :quit  or  Ctrl+D    Exit

`;

type ReplState = {
  handle: string | null;
  logPath: string | null;
  algo: Algorithm;
  activityKey: string;
  lastModel: unknown;
  history: string[];
};

function out(msg: string): void {
  process.stdout.write(msg + '\n');
}
function err(msg: string): void {
  process.stderr.write('\x1b[31m' + msg + '\x1b[0m\n');
}
function dim(msg: string): string {
  return '\x1b[2m' + msg + '\x1b[0m';
}
function bold(msg: string): string {
  return '\x1b[1m' + msg + '\x1b[0m';
}

function summarizeModel(raw: unknown): string {
  const m = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m?.nodes === 'number' || Array.isArray(m?.nodes))
    parts.push(`nodes=${Array.isArray(m.nodes) ? (m.nodes as unknown[]).length : m.nodes}`);
  if (typeof m?.edges === 'number' || Array.isArray(m?.edges))
    parts.push(`edges=${Array.isArray(m.edges) ? (m.edges as unknown[]).length : m.edges}`);
  if (typeof m?.places === 'number' || Array.isArray(m?.places))
    parts.push(`places=${Array.isArray(m.places) ? (m.places as unknown[]).length : m.places}`);
  if (typeof m?.transitions === 'number' || Array.isArray(m?.transitions))
    parts.push(`transitions=${Array.isArray(m.transitions) ? (m.transitions as unknown[]).length : m.transitions}`);
  if (typeof m?.arcs === 'number' || Array.isArray(m?.arcs))
    parts.push(`arcs=${Array.isArray(m.arcs) ? (m.arcs as unknown[]).length : m.arcs}`);
  return parts.length > 0 ? parts.join('  ') : JSON.stringify(m).slice(0, 120);
}

async function handleCommand(
  line: string,
  state: ReplState,
  wasm: Record<string, (...args: unknown[]) => unknown>
): Promise<boolean> {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case ':quit':
    case 'quit':
    case 'exit':
      return false; // signal to exit loop

    case 'load': {
      const filePath = args.join(' ');
      if (!filePath) { err('Usage: load <file.xes>'); break; }
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const t0 = Date.now();
        state.handle = wasm.load_eventlog_from_xes(content) as string;
        state.logPath = filePath;
        state.lastModel = null;
        const elapsed = Date.now() - t0;
        // Show quick stats using available WASM functions
        try {
          const traceCount = wasm.get_trace_count(state.handle) as number;
          const statsRaw = wasm.analyze_event_statistics(state.handle, state.activityKey);
          const stats = (typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw) as Record<string, unknown>;
          out(`  loaded ${filePath} in ${elapsed}ms`);
          out(`  ${dim(`traces=${traceCount}  events=${stats.total_events ?? '?'}  avg_events/trace=${Number(stats.avg_events_per_case ?? 0).toFixed(1)}`)}`);
        } catch {
          out(`  loaded ${filePath} in ${elapsed}ms`);
        }
      } catch (e) {
        err(`  load failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'run': {
      if (!state.handle) { err('  no log loaded — run: load <file.xes>'); break; }
      const algo = (args[0] as Algorithm | undefined) ?? state.algo;
      if (args[0] && !(ALGORITHMS as readonly string[]).includes(args[0])) {
        err(`  unknown algorithm: ${args[0]}`);
        out(`  available: ${ALGORITHMS.join(', ')}`);
        break;
      }
      try {
        const { raw, elapsedMs } = runDiscovery(wasm, algo, state.handle, state.activityKey);
        state.lastModel = raw;
        out(`  ${bold(algo)} → ${summarizeModel(raw)}  ${dim(`(${elapsedMs.toFixed(1)}ms)`)}`);
      } catch (e) {
        err(`  discovery failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'predict': {
      if (!state.handle) { err('  no log loaded — run: load <file.xes>'); break; }
      const task = args[0];
      if (!task) { err('Usage: predict <next-activity|remaining-time|outcome|drift>'); break; }
      try {
        const t0 = Date.now();
        let result: unknown;
        if (task === 'next-activity' && typeof wasm.predict_next_activity === 'function') {
          result = wasm.predict_next_activity(state.handle, state.activityKey, 3);
        } else if (task === 'remaining-time' && typeof wasm.predict_remaining_time === 'function') {
          result = wasm.predict_remaining_time(state.handle, state.activityKey);
        } else if (task === 'outcome' && typeof wasm.predict_case_outcome === 'function') {
          result = wasm.predict_case_outcome(state.handle, state.activityKey);
        } else if (task === 'drift' && typeof wasm.detect_concept_drift === 'function') {
          result = wasm.detect_concept_drift(state.handle, state.activityKey);
        } else {
          err(`  prediction task not available: ${task}`);
          break;
        }
        const elapsed = Date.now() - t0;
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        out(`  predict ${task} → ${JSON.stringify(parsed).slice(0, 200)}  ${dim(`(${elapsed}ms)`)}`);
      } catch (e) {
        err(`  prediction failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'quality': {
      if (!state.handle) { err('  no log loaded'); break; }
      try {
        let fitness = 1.0;
        if (typeof wasm.simd_token_replay === 'function') {
          const replayRaw = wasm.simd_token_replay(state.handle, state.activityKey);
          const replay = (typeof replayRaw === 'string' ? JSON.parse(replayRaw) : replayRaw) as Record<string, unknown>;
          if (typeof replay.overall_fitness === 'number') fitness = replay.overall_fitness;
        }
        out(`  fitness:   ${(fitness * 100).toFixed(1)}%`);
      } catch (e) {
        err(`  quality failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'stats': {
      if (!state.handle) { err('  no log loaded'); break; }
      try {
        const traceCount = wasm.get_trace_count(state.handle) as number;
        const statsRaw = wasm.analyze_event_statistics(state.handle, state.activityKey);
        const stats = (typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw) as Record<string, unknown>;
        const variantsRaw = wasm.analyze_trace_variants(state.handle, state.activityKey);
        const variants = (typeof variantsRaw === 'string' ? JSON.parse(variantsRaw) : variantsRaw) as Record<string, unknown>;
        const variantCount = Array.isArray(variants?.top_variants) ? (variants.top_variants as unknown[]).length : '?';
        out(`  traces=${traceCount}  events=${stats.total_events ?? '?'}  avg_events/trace=${Number(stats.avg_events_per_case ?? 0).toFixed(1)}  variants≥${variantCount}`);
      } catch (e) {
        err(`  stats failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'algos':
    case 'algorithms': {
      const tierFilter = args.indexOf('--tier') >= 0 ? args[args.indexOf('--tier') + 1] : null;
      const registry = getRegistry();
      const all = registry.list();
      const classified = all.map((a) => ({
        ...a,
        tier: a.speedTier <= 10 ? 'stream' : a.speedTier <= 30 ? 'fast' : a.speedTier <= 55 ? 'balanced' : 'quality',
      }));
      const filtered = tierFilter ? classified.filter((a) => a.tier === tierFilter) : classified;
      out('');
      out(`  ${'ID'.padEnd(28)} ${'Speed'.padStart(6)} ${'Quality'.padStart(8)}  Tier`);
      out('  ' + '─'.repeat(60));
      for (const a of filtered) {
        out(`  ${a.id.padEnd(28)} ${String(a.speedTier).padStart(6)} ${String(a.qualityTier).padStart(8)}  ${a.tier}`);
      }
      out('');
      break;
    }

    case 'set': {
      const prop = args[0];
      const val = args.slice(1).join(' ');
      if (prop === 'algo') {
        if (!(ALGORITHMS as readonly string[]).includes(val)) {
          err(`  unknown algorithm: ${val}`);
        } else {
          state.algo = val as Algorithm;
          out(`  algorithm → ${val}`);
        }
      } else if (prop === 'key') {
        state.activityKey = val;
        out(`  activity key → ${val}`);
      } else {
        err(`  unknown property: ${prop}  (use: algo | key)`);
      }
      break;
    }

    case 'history': {
      const last10 = state.history.slice(-10);
      last10.forEach((h, i) => out(`  ${String(i + 1).padStart(3)}  ${h}`));
      break;
    }

    case 'help':
    case '?':
      out(BANNER);
      break;

    case '':
      break;

    default:
      err(`  unknown command: ${cmd}  (type 'help' for command list)`);
  }
  return true; // continue loop
}

export const repl = defineCommand({
  meta: {
    name: 'repl',
    description: 'Interactive process mining session — WASM loads once, all commands run in milliseconds',
  },
  args: {
    load: {
      type: 'string',
      description: 'XES event log to load immediately on startup',
      alias: 'i',
    },
    algorithm: {
      type: 'string',
      description: 'Default discovery algorithm (default: heuristic)',
      alias: 'a',
    },
    key: {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
    },
  },
  async run(ctx) {
    // Init WASM once — all subsequent commands reuse the loaded module
    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, (...args: unknown[]) => unknown>;

    const state: ReplState = {
      handle: null,
      logPath: null,
      algo: ((ctx.args.algorithm as Algorithm | undefined) ?? 'heuristic'),
      activityKey: (ctx.args.key as string | undefined) ?? 'concept:name',
      lastModel: null,
      history: [],
    };

    // Pre-load log if --load was provided
    if (ctx.args.load) {
      await handleCommand(`load ${ctx.args.load}`, state, wasm);
    }

    process.stdout.write(BANNER);
    out(`  ${dim(`algorithm: ${state.algo}  |  key: ${state.activityKey}  |  type 'help' for commands`)}`);
    out('');

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });

    const prompt = (): void => {
      const logLabel = state.logPath ? dim(` [${state.logPath.split('/').pop()}]`) : '';
      process.stdout.write(`wpm${logLabel}> `);
    };

    prompt();

    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed) state.history.push(trimmed);

      const cont = await handleCommand(trimmed, state, wasm);
      if (!cont) break;

      prompt();
    }

    rl.close();
    out('\n  goodbye');
    return await exitWithFlush(EXIT_CODES.success);
  },
});
