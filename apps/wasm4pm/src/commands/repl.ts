import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { createInterface } from 'node:readline/promises';
import { WasmLoader } from '@wasm4pm/engine';
import { getRegistry } from 'wasm4pm';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { emitResult, makeErrorResult } from '../output.js';
import { runDiscovery, ALGORITHMS, type Algorithm } from './run.js';
import { withSpan, withSpanRaw } from './_otel.js';

// ─── Help text ────────────────────────────────────────────────────────────────

const BANNER = `
  wpm repl — Interactive Process Mining  (WASM loaded once, commands run in milliseconds)
`;

const HELP_TEXT = `
  Available commands:
  ═══════════════════════════════════════════════════════════════════

  LOADING
    load <file.xes>          Load an event log (XES format)
    load <file.xes> --ocel   Load as OCEL format
    info                     Show current log statistics

  DISCOVERY
    run <algorithm>          Run discovery algorithm
    run --all                Run all fast algorithms and compare
    algorithms               List available algorithms with tier info

  ANALYSIS
    quality                  Quality metrics of last result (fitness, precision)
    compare [n]              Compare last N results (default: last 2)
    conformance              Conformance check of last result against log
    temporal                 Temporal analysis of current log
    social                   Social network of current log

  FILTERING
    filter --min-length <n>  Remove traces shorter than n events
    filter --activity <name> Keep only traces containing this activity
    filter --reset           Remove all filters and restore original log

  NAVIGATION
    history                  Show command history for this session
    results                  List all discovery results this session
    save [filename]          Save last result to file (JSON)

  SYSTEM
    stats                    Event log statistics (traces, events, activities)
    set algo <id>            Change default discovery algorithm
    set key <attr>           Change activity attribute key
    algos [--tier <t>]       List registered algorithms (tier: fast|balanced|quality|stream)
    help [command]           Show help (for specific command)
    clear                    Clear screen
    quit / exit / :quit      Exit REPL

  ═══════════════════════════════════════════════════════════════════
`;

// ─── State types ──────────────────────────────────────────────────────────────

type FilterState = {
  minLength: number | null;
  activityFilter: string | null;
};

type DiscoveryResult = {
  algorithm: string;
  elapsedMs: number;
  raw: unknown;
  fitness: number | null;
  summary: string;
};

/** Cached log statistics — populated once on load, avoids re-querying WASM. */
type LogMeta = {
  traceCount: number;
  totalEvents: number;
  uniqueActivities: number;
  avgEventsPerTrace: number;
};

type ReplState = {
  handle: string | null;
  logPath: string | null;
  algo: Algorithm;
  activityKey: string;
  lastModel: unknown;
  resultHistory: DiscoveryResult[];
  history: string[];
  filterState: FilterState;
  /** Cached log metadata — set by handleLoad, cleared on load/filter --reset. */
  logMeta: LogMeta | null;
  startTime: number;
  commandCount: number;
  /** True when running in --script mode; triggers early-exit on fatal errors. */
  scriptMode: boolean;
};

// ─── Output helpers ───────────────────────────────────────────────────────────

function out(msg: string): void {
  process.stdout.write(msg + '\n');
}
function warn(msg: string): void {
  process.stderr.write('\x1b[33m' + msg + '\x1b[0m\n');
}
function dim(msg: string): string {
  return '\x1b[2m' + msg + '\x1b[0m';
}
function bold(msg: string): string {
  return '\x1b[1m' + msg + '\x1b[0m';
}
function green(msg: string): string {
  return '\x1b[32m' + msg + '\x1b[0m';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatElapsed(startMs: number): string {
  const totalSec = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Model summarization ──────────────────────────────────────────────────────

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

// ─── Fitness extraction ───────────────────────────────────────────────────────

function extractFitnessFromModel(raw: unknown): number | null {
  try {
    const m = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (typeof m?.fitness === 'number') return m.fitness;
    if (typeof m?.overall_fitness === 'number') return m.overall_fitness;
    if (typeof m?.fitness_score === 'number') return m.fitness_score;
    return null;
  } catch {
    return null;
  }
}

// ─── Context-aware error messages ─────────────────────────────────────────────

function requireLog(state: ReplState): boolean {
  if (!state.handle) {
    warn("  ⚠ No log loaded. Use 'load <file.xes>' first.");
    return false;
  }
  return true;
}

function requireResult(state: ReplState): boolean {
  if (state.resultHistory.length === 0) {
    warn("  ⚠ No discovery result yet. Run 'run <algorithm>' first.");
    out(`  ${dim("Suggestion: run dfg")}`);
    return false;
  }
  return true;
}

function requireNResults(state: ReplState, n: number): boolean {
  if (state.resultHistory.length < n) {
    warn(`  ⚠ Only ${state.resultHistory.length} result(s) available. Need at least ${n} to compare.`);
    if (state.resultHistory.length === 1) {
      out(`  ${dim("Suggestion: run another algorithm first, e.g. 'run inductive_miner'")}`);
    } else {
      out(`  ${dim("Suggestion: run dfg")}`);
    }
    return false;
  }
  return true;
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleLoad(
  args: string[],
  state: ReplState,
  wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  const isOcel = args.includes('--ocel');
  const filePath = args.filter(a => a !== '--ocel').join(' ');
  if (!filePath) { warn('  Usage: load <file.xes>'); return; }

  const content = await fs.readFile(filePath, 'utf8');
  const t0 = Date.now();

  // Free the previous handle before overwriting
  if (state.handle && typeof wasm.delete_object === 'function') {
    try { (wasm.delete_object as (h: string) => void)(state.handle); } catch { /* best-effort */ }
  }

  if (isOcel && typeof wasm.load_ocel === 'function') {
    state.handle = (wasm.load_ocel as (c: string) => string)(content);
  } else {
    state.handle = (wasm.load_eventlog_from_xes as (c: string) => string)(content);
  }
  state.logPath = filePath;
  state.lastModel = null;
  state.resultHistory = [];
  state.logMeta = null;
  state.filterState = { minLength: null, activityFilter: null };

  const elapsed = Date.now() - t0;
  const fileName = filePath.split('/').pop() ?? filePath;

  try {
    const traceCount = wasm.get_trace_count(state.handle) as number;
    const statsRaw = wasm.analyze_event_statistics(state.handle, state.activityKey);
    const stats = (typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw) as Record<string, unknown>;
    const totalEvents = (stats.total_events as number) ?? 0;
    const uniqueActs = (stats.unique_activities as number) ?? 0;
    const avgEvents = Number(stats.avg_events_per_case ?? 0);

    // Cache log metadata in state for cheap re-use by info/stats commands
    state.logMeta = { traceCount, totalEvents, uniqueActivities: uniqueActs, avgEventsPerTrace: avgEvents };

    out(`  ${green('✔')} Loaded: ${bold(fileName)} ${dim(`(${totalEvents} events, ${traceCount} traces, ${uniqueActs} activities)`)}`);
    out(`  ${dim(`Parsed in ${formatDuration(elapsed)}`)}`);
  } catch {
    out(`  ${green('✔')} Loaded: ${bold(fileName)} in ${formatDuration(elapsed)}`);
  }
}

async function handleRun(
  args: string[],
  state: ReplState,
  wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  if (!requireLog(state)) return;

  const runAll = args[0] === '--all';

  if (runAll) {
    // Run dfg, heuristic_miner, inductive_miner as fast trio
    const fastAlgos = ['dfg', 'heuristic_miner', 'inductive_miner'];
    const trioStartCount = state.resultHistory.length;
    out(`  ${dim('Running fast algorithm trio...')}`);
    for (const algo of fastAlgos) {
      try {
        const result = await runDiscovery(wasm, algo, state.handle!, state.activityKey);
        const fitness = extractFitnessFromModel(result.raw);
        const summary = summarizeModel(result.raw);
        const dr: DiscoveryResult = {
          algorithm: algo,
          elapsedMs: result.elapsedMs,
          raw: result.raw,
          fitness,
          summary,
        };
        state.resultHistory.push(dr);
        state.lastModel = result.raw;
        const fitnessStr = fitness !== null ? `fitness: ${fitness.toFixed(2)}` : '';
        out(`  ${green('✔')} ${bold(algo.padEnd(20))} ${dim(`(${formatDuration(result.elapsedMs)})`)}  ${dim(fitnessStr)}`);
      } catch (e) {
        warn(`  ✗ ${algo} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Show comparison of the trio results just added
    const trioResults = state.resultHistory.slice(trioStartCount);
    if (trioResults.length >= 2) {
      handleCompare([String(trioResults.length)], state, wasm);
    } else if (trioResults.length === 1) {
      // Only one succeeded — set it as last model
      out('');
    }
    return;
  }

  const algo = (args[0] as Algorithm | undefined) ?? state.algo;
  if (args[0] && !(ALGORITHMS as readonly string[]).includes(args[0])) {
    warn(`  ✗ Unknown algorithm: ${args[0]}`);
    out(`  ${dim(`Available: ${ALGORITHMS.slice(0, 8).join(', ')}...`)}`);
    out(`  ${dim("Run 'algorithms' to see full list")}`);
    return;
  }

  const result = await runDiscovery(wasm, algo, state.handle!, state.activityKey);
  const fitness = extractFitnessFromModel(result.raw);
  const summary = summarizeModel(result.raw);

  const dr: DiscoveryResult = {
    algorithm: algo,
    elapsedMs: result.elapsedMs,
    raw: result.raw,
    fitness,
    summary,
  };
  state.resultHistory.push(dr);
  state.lastModel = result.raw;

  const fitnessStr = fitness !== null ? ` | fitness: ${fitness.toFixed(2)}` : '';
  out(`  ${green('✔')} Discovery complete ${dim(`(${algo}, ${formatDuration(result.elapsedMs)})${fitnessStr}`)}`);
  out(`  ${dim(summary)}`);
}

function handleCompare(
  args: string[],
  state: ReplState,
  _wasm: Record<string, (...a: unknown[]) => unknown>
): void {
  const n = args[0] ? parseInt(args[0], 10) : 2;
  if (!requireNResults(state, n > 1 ? n : 2)) return;

  const recent = state.resultHistory.slice(-Math.max(n, 2));
  out('');
  out(`  ${bold('Comparing last ' + recent.length + ' runs:')}`);
  out('  ' + dim('─'.repeat(60)));

  // Find overall best for summary line
  let bestAlgo = recent[0].algorithm;
  let bestFitness = recent[0].fitness ?? -Infinity;

  recent.forEach((r, i) => {
    const fitnessStr = r.fitness !== null ? `fitness=${r.fitness.toFixed(2)}` : 'fitness=?';
    const timeStr = formatDuration(r.elapsedMs);
    out(`  ${String(i + 1).padStart(2)}. ${bold(r.algorithm.padEnd(24))} ${dim(`${fitnessStr}  (${timeStr})`)}`);
    if (r.fitness !== null && r.fitness > bestFitness) {
      bestFitness = r.fitness;
      bestAlgo = r.algorithm;
    }
  });

  out('');

  // For exactly 2 results: show A vs B with explicit delta
  if (recent.length === 2) {
    const [a, b] = recent;
    if (a.fitness !== null && b.fitness !== null) {
      const delta = b.fitness - a.fitness;
      if (Math.abs(delta) < 0.001) {
        out(`  ${dim(`Tie: ${bold(a.algorithm)} and ${bold(b.algorithm)} have equal fitness (${a.fitness.toFixed(2)})`)}`);
      } else {
        const winner = delta > 0 ? b : a;
        const loser = delta > 0 ? a : b;
        const deltaStr = Math.abs(delta).toFixed(2);
        out(`  ${dim(`${bold(winner.algorithm)} is better (+${deltaStr} fitness vs ${loser.algorithm})`)}`);
      }
    } else if (bestFitness > -Infinity) {
      out(`  ${dim(`Best: ${bold(bestAlgo)} (fitness=${bestFitness.toFixed(2)})`)}`);
    }
  } else {
    // For N > 2: show overall winner
    if (bestFitness > -Infinity) {
      out(`  ${dim(`Best: ${bold(bestAlgo)} (fitness=${bestFitness.toFixed(2)})`)}`);
    }
  }
  out('');
}

async function handleQuality(
  _args: string[],
  state: ReplState,
  wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  if (!requireLog(state)) return;
  if (!requireResult(state)) return;

  const last = state.resultHistory[state.resultHistory.length - 1];
  out('');
  out(`  ${bold('Quality of last result')} ${dim(`(${last.algorithm})`)}`);
  out('  ' + dim('─'.repeat(50)));

  // Try SIMD token replay for fitness
  let fitness = last.fitness;
  let precision: number | null = null;

  try {
    if (typeof wasm.simd_token_replay === 'function') {
      const replayRaw = wasm.simd_token_replay(state.handle!, state.activityKey);
      const replay = (typeof replayRaw === 'string' ? JSON.parse(replayRaw) : replayRaw) as Record<string, unknown>;
      if (typeof replay.overall_fitness === 'number') fitness = replay.overall_fitness;
      if (typeof replay.precision === 'number') precision = replay.precision;
    }
  } catch { /* best-effort */ }

  const fitnessStr = fitness !== null ? `${(fitness * 100).toFixed(1)}%` : '?';
  const precisionStr = precision !== null ? `${(precision * 100).toFixed(1)}%` : '?';
  const simplicity = last.summary.includes('nodes') ? dim('see model structure') : '?';

  out(`  Fitness:     ${bold(fitnessStr)}`);
  out(`  Precision:   ${bold(precisionStr)}`);
  out(`  Simplicity:  ${bold(simplicity)}`);
  out(`  Algorithm:   ${dim(last.algorithm)}`);
  out(`  Time:        ${dim(formatDuration(last.elapsedMs))}`);
  out('');
}

async function handleInfo(
  _args: string[],
  state: ReplState,
  wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  if (!requireLog(state)) return;

  // Use cached metadata if available (fast path — no WASM re-query needed)
  let meta = state.logMeta;
  if (!meta) {
    try {
      const traceCount = wasm.get_trace_count(state.handle!) as number;
      const statsRaw = wasm.analyze_event_statistics(state.handle!, state.activityKey);
      const stats = (typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw) as Record<string, unknown>;
      meta = {
        traceCount,
        totalEvents: (stats.total_events as number) ?? 0,
        uniqueActivities: (stats.unique_activities as number) ?? 0,
        avgEventsPerTrace: Number(stats.avg_events_per_case ?? 0),
      };
      state.logMeta = meta; // cache for next time
    } catch {
      out(`  ${dim('Could not retrieve log statistics')}`);
      return;
    }
  }

  out('');
  out(`  ${bold('Log Information')}`);
  out('  ' + dim('─'.repeat(50)));
  out(`  File:       ${dim(state.logPath ?? 'unknown')}`);
  out(`  Traces:     ${bold(String(meta.traceCount))}`);
  out(`  Events:     ${bold(String(meta.totalEvents))}`);
  out(`  Activities: ${bold(String(meta.uniqueActivities))}`);
  out(`  Avg events/trace: ${dim(meta.avgEventsPerTrace.toFixed(1))}`);
  if (state.filterState.minLength !== null) {
    out(`  Filter:     min-length=${state.filterState.minLength}`);
  }
  if (state.filterState.activityFilter !== null) {
    out(`  Filter:     activity=${state.filterState.activityFilter}`);
  }
  out('');
}

async function handleFilter(
  args: string[],
  state: ReplState,
  wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  if (!requireLog(state)) return;

  if (args[0] === '--reset') {
    state.filterState = { minLength: null, activityFilter: null };
    out(`  ${green('✔')} Filters reset`);
    return;
  }

  const minLenIdx = args.indexOf('--min-length');
  const actIdx = args.indexOf('--activity');

  if (minLenIdx >= 0) {
    const n = parseInt(args[minLenIdx + 1] ?? '0', 10);
    if (isNaN(n) || n < 1) { warn('  Usage: filter --min-length <n>'); return; }
    state.filterState.minLength = n;

    // Apply filter by calling WASM filter if available, otherwise just track it
    try {
      const tracesBefore = wasm.get_trace_count(state.handle!) as number;
      if (typeof wasm.filter_traces_by_length === 'function') {
        const newHandle = (wasm.filter_traces_by_length as (h: string, n: number) => string)(state.handle!, n);
        if (state.handle && typeof wasm.delete_object === 'function') {
          try { (wasm.delete_object as (h: string) => void)(state.handle); } catch { /* best-effort */ }
        }
        state.handle = newHandle;
        const tracesAfter = wasm.get_trace_count(state.handle) as number;
        out(`  ${green('✔')} Filtered: ${tracesBefore} → ${tracesAfter} traces (removed ${tracesBefore - tracesAfter} short traces)`);
      } else {
        out(`  ${green('✔')} Filter recorded: min-length=${n} ${dim('(applied on next operation)')}`);
      }
    } catch {
      out(`  ${green('✔')} Filter recorded: min-length=${n}`);
    }
    return;
  }

  if (actIdx >= 0) {
    const actName = args[actIdx + 1];
    if (!actName) { warn('  Usage: filter --activity <name>'); return; }
    state.filterState.activityFilter = actName;
    out(`  ${green('✔')} Filter recorded: activity=${actName}`);
    return;
  }

  warn("  Usage: filter --min-length <n> | filter --activity <name> | filter --reset");
}

async function handleResults(
  _args: string[],
  state: ReplState,
  _wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  if (state.resultHistory.length === 0) {
    out(`  ${dim('No results yet. Run an algorithm with: run dfg')}`);
    return;
  }
  out('');
  out(`  ${bold('Session Results')} ${dim(`(${state.resultHistory.length} total)`)}`);
  out('  ' + dim('─'.repeat(60)));
  state.resultHistory.forEach((r, i) => {
    const fitnessStr = r.fitness !== null ? `fitness=${r.fitness.toFixed(2)}` : '';
    out(`  ${String(i + 1).padStart(3)}. ${r.algorithm.padEnd(24)} ${dim(`${fitnessStr}  (${formatDuration(r.elapsedMs)})`)}`);
  });
  out('');
}

async function handleSave(
  args: string[],
  state: ReplState,
  _wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  if (!requireResult(state)) return;

  const last = state.resultHistory[state.resultHistory.length - 1];
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultName = `${ts}-${last.algorithm}.json`;
  const outPath = args[0] ?? defaultName;

  const payload = {
    algorithm: last.algorithm,
    elapsedMs: last.elapsedMs,
    fitness: last.fitness,
    logPath: state.logPath,
    result: last.raw,
    savedAt: new Date().toISOString(),
  };

  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
  out(`  ${green('✔')} Saved: ${bold(outPath)}`);
}

function handleHistory(state: ReplState): void {
  if (state.history.length === 0) { out(`  ${dim('No commands yet.')}`); return; }
  out('');
  state.history.forEach((h, i) => out(`  ${String(i + 1).padStart(3)}  ${h}`));
  out('');
}

async function handleStats(
  state: ReplState,
  wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<void> {
  if (!requireLog(state)) return;
  try {
    // Use cached metadata if available
    const meta = state.logMeta;
    let traceCount: number;
    let totalEvents: number | string;
    let avgPerTrace: string;

    if (meta) {
      traceCount = meta.traceCount;
      totalEvents = meta.totalEvents;
      avgPerTrace = meta.avgEventsPerTrace.toFixed(1);
    } else {
      traceCount = wasm.get_trace_count(state.handle!) as number;
      const statsRaw = wasm.analyze_event_statistics(state.handle!, state.activityKey);
      const stats = (typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw) as Record<string, unknown>;
      totalEvents = (stats.total_events as number | undefined) ?? '?';
      avgPerTrace = Number(stats.avg_events_per_case ?? 0).toFixed(1);
    }

    const variantsRaw = wasm.analyze_trace_variants(state.handle!, state.activityKey);
    const variants = (typeof variantsRaw === 'string' ? JSON.parse(variantsRaw) : variantsRaw) as Record<string, unknown>;
    const variantCount = Array.isArray(variants?.top_variants) ? (variants.top_variants as unknown[]).length : '?';
    out(`  traces=${traceCount}  events=${totalEvents}  avg_events/trace=${avgPerTrace}  variants≥${variantCount}`);
  } catch (e) {
    warn(`  Stats failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Main command dispatcher ──────────────────────────────────────────────────

/**
 * Dispatch a single REPL command line.
 * Returns false to signal the REPL loop should exit.
 */
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
      return false;

    case 'load':
      try {
        await handleLoad(args, state, wasm);
      } catch (e) {
        const result = makeErrorResult(
          'repl load',
          e instanceof Error ? e : new Error(String(e)),
          EXIT_CODES.source_error,
          'LOAD_FAILED'
        );
        emitResult(result, { format: 'human' });
        // Script mode: non-fatal — warn-and-continue so subsequent commands still execute.
        // Interactive mode: non-fatal — user can try again.
      }
      break;

    case 'run':
      try {
        await handleRun(args, state, wasm);
      } catch (e) {
        const result = makeErrorResult(
          'repl run',
          e instanceof Error ? e : new Error(String(e)),
          EXIT_CODES.execution_error,
          'DISCOVERY_FAILED'
        );
        emitResult(result, { format: 'human' });
        // Non-fatal in both interactive and script mode — user can retry.
      }
      break;

    case 'compare':
      handleCompare(args, state, wasm);
      break;

    case 'quality':
      try {
        await handleQuality(args, state, wasm);
      } catch (e) {
        warn(`  Quality check failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;

    case 'info':
      try {
        await handleInfo(args, state, wasm);
      } catch (e) {
        warn(`  Info failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;

    case 'filter':
      try {
        await handleFilter(args, state, wasm);
      } catch (e) {
        warn(`  Filter failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;

    case 'results':
      await handleResults(args, state, wasm);
      break;

    case 'save':
      try {
        await handleSave(args, state, wasm);
      } catch (e) {
        warn(`  Save failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;

    case 'history':
      handleHistory(state);
      break;

    case 'stats':
      await handleStats(state, wasm);
      break;

    case 'conformance':
      if (!requireLog(state)) break;
      if (!requireResult(state)) break;
      out(`  ${dim('Conformance check — use: wpm conformance -i <file.xes> for detailed output')}`);
      break;

    case 'temporal':
      if (!requireLog(state)) break;
      out(`  ${dim('Temporal analysis — use: wpm temporal -i <file.xes> for detailed output')}`);
      break;

    case 'social':
      if (!requireLog(state)) break;
      out(`  ${dim('Social network — use: wpm social -i <file.xes> for detailed output')}`);
      break;

    case 'predict': {
      if (!requireLog(state)) break;
      const task = args[0];
      if (!task) { warn('Usage: predict <next-activity|remaining-time|outcome|drift>'); break; }
      try {
        const t0 = Date.now();
        let predResult: unknown;
        if (task === 'next-activity' && typeof wasm.predict_next_activity === 'function') {
          predResult = wasm.predict_next_activity(state.handle!, state.activityKey, 3);
        } else if (task === 'remaining-time' && typeof wasm.predict_remaining_time === 'function') {
          predResult = wasm.predict_remaining_time(state.handle!, state.activityKey);
        } else if (task === 'outcome' && typeof wasm.predict_case_outcome === 'function') {
          predResult = wasm.predict_case_outcome(state.handle!, state.activityKey);
        } else if (task === 'drift' && typeof wasm.detect_concept_drift === 'function') {
          predResult = wasm.detect_concept_drift(state.handle!, state.activityKey);
        } else {
          warn(`  Prediction task not available: ${task}`);
          break;
        }
        const elapsed = Date.now() - t0;
        const parsed = typeof predResult === 'string' ? JSON.parse(predResult) : predResult;
        out(`  predict ${task} → ${JSON.stringify(parsed).slice(0, 200)}  ${dim(`(${elapsed}ms)`)}`);
      } catch (e) {
        warn(`  Prediction failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case 'algos':
    case 'algorithms': {
      const tierFilter = args.indexOf('--tier') >= 0 ? args[args.indexOf('--tier') + 1] : null;
      const registry = getRegistry();
      const all = registry.list();
      const classified = all.map((algo) => ({
        ...algo,
        tier: algo.speedTier <= 10 ? 'stream' : algo.speedTier <= 30 ? 'fast' : algo.speedTier <= 55 ? 'balanced' : 'quality',
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
          warn(`  Unknown algorithm: ${val}`);
        } else {
          state.algo = val as Algorithm;
          out(`  algorithm → ${val}`);
        }
      } else if (prop === 'key') {
        state.activityKey = val;
        out(`  activity key → ${val}`);
      } else {
        warn(`  Unknown property: ${prop}  (use: algo | key)`);
      }
      break;
    }

    case 'clear':
      process.stdout.write('\x1b[2J\x1b[H');
      break;

    case 'help':
    case '?':
      out(HELP_TEXT);
      break;

    case '':
      break;

    default:
      warn(`  ✗ Unknown command: ${cmd}  (type 'help' for command list)`);
  }

  return true;
}

// ─── Script mode ──────────────────────────────────────────────────────────────

/**
 * Execute a REPL script file, running each non-blank non-comment line as a command.
 * Returns exit code 0 if all commands succeed, non-zero otherwise.
 */
async function runScript(
  scriptPath: string,
  state: ReplState,
  wasm: Record<string, (...a: unknown[]) => unknown>
): Promise<number> {
  const scriptContent = await fs.readFile(scriptPath, 'utf8');
  const lines = scriptContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  out(`\n  [Script mode] Executing ${lines.length} commands from ${scriptPath}...\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stepNum = `[${i + 1}/${lines.length}]`;
    process.stdout.write(`  ${stepNum} ${line} ... `);

    try {
      const cont = await handleCommand(line, state, wasm);
      if (!cont) {
        // quit/exit encountered
        out('');
        break;
      }
      out(green('✔'));
      succeeded++;
    } catch (e) {
      out(`\x1b[31m✗\x1b[0m`);
      warn(`  Error: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
      // Unknown-command errors are non-fatal; other errors (load, run) continue
    }
  }

  out('');
  if (failed === 0) {
    out(`  ${green('Script complete.')} ${succeeded}/${lines.length} commands succeeded.\n`);
    return EXIT_CODES.success;
  } else {
    out(`  Script complete. ${succeeded}/${lines.length} succeeded, ${failed} failed.\n`);
    return EXIT_CODES.execution_error;
  }
}

// ─── citty command definition ─────────────────────────────────────────────────

export const repl = defineCommand({
  meta: {
    name: 'repl',
    description:
      'Interactive process mining session — WASM loads once, all commands run in milliseconds. ' +
      'Maintains stateful log context between commands: load once, run many algorithms, compare, filter.\n\n' +
      'Example: wpm repl -i log.xes\n' +
      'Script:  wpm repl --script discovery.repl',
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
    script: {
      type: 'string',
      description: 'Path to a .repl script file for batch execution',
      alias: 's',
    },
  },
  async run(ctx) {
    return withSpan('repl', {
      algorithm: (ctx.args.algorithm as string | undefined) ?? 'heuristic',
      'activity.key': (ctx.args.key as string | undefined) ?? 'concept:name',
      'script.mode': Boolean(ctx.args.script),
    }, async () => {
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
        resultHistory: [],
        history: [],
        filterState: { minLength: null, activityFilter: null },
        logMeta: null,
        startTime: Date.now(),
        commandCount: 0,
        scriptMode: false,
      };

      // ── Script mode ────────────────────────────────────────────────────────
      const scriptPath = ctx.args.script as string | undefined;
      if (scriptPath) {
        state.scriptMode = true;
        try {
          const exitCode = await runScript(scriptPath, state, wasm);
          return await exitWithFlush(exitCode);
        } catch (e) {
          const result = makeErrorResult(
            'repl script',
            e instanceof Error ? e : new Error(String(e)),
            EXIT_CODES.source_error,
            'SCRIPT_FAILED'
          );
          emitResult(result, { format: 'human' });
          return await exitWithFlush(EXIT_CODES.source_error);
        }
      }

      // ── Interactive mode ───────────────────────────────────────────────────

      // Pre-load log if --load was provided
      if (ctx.args.load) {
        await withSpanRaw('repl.command', { 'repl.cmd': 'load' }, async () => {
          await handleCommand(`load ${ctx.args.load}`, state, wasm);
        });
      }

      out(BANNER);
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

        const cmd = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
        let cont = true;
        if (trimmed) {
          state.commandCount++;
          cont = await withSpanRaw('repl.command', { 'repl.cmd': cmd, 'repl.seq': state.commandCount }, async () => {
            return handleCommand(trimmed, state, wasm);
          });
        } else {
          cont = await handleCommand(trimmed, state, wasm);
        }
        if (!cont) break;

        prompt();
      }

      rl.close();

      const duration = formatElapsed(state.startTime);
      out(`\n  Goodbye. Session lasted ${duration}, ${state.commandCount} commands executed.\n`);
      return await exitWithFlush(EXIT_CODES.success);
    });
  },
});
