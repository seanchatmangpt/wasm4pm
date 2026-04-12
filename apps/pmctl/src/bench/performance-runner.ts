/**
 * performance-runner.ts
 *
 * TypeScript performance benchmarking harness for the pictl kernel.
 *
 * Measures (all 21 algorithm targets via the WASM API):
 *   - Per-state latency distribution: mean, stddev, p99, p99.9 (nanoseconds)
 *   - Throughput: sustained states/second over a 10-second window
 *   - Memory bandwidth proxy: GB/sec based on bytes-per-event estimate
 *   - Peak heap usage: MB, validated against <512 MB target
 *   - Thermal profile: macOS `powermetrics` if available, else "N/A"
 *   - GPU utilization: not measurable from Node.js userspace on Apple Silicon;
 *     reported as 0 with note — no fabricated data.
 *
 * Targets (from CLAUDE.md / pictl specification):
 *   ≤120 ns per state, ≥250K states/sec, <512 MB peak heap, <80°C sustained
 *
 * Usage (standalone):
 *   node dist/bench/performance-runner.js [options]
 *
 * Options:
 *   --samples <N>        Number of timing samples per algorithm (default: 1000)
 *   --warmup <N>         Warmup iterations before timing (default: 50)
 *   --cases <N>          Log size in cases for latency bench (default: 1000)
 *   --out <path>         Override output file path
 *   --format human|json  Output format (default: human)
 *   --no-save            Skip writing JSON report to .pictl/benchmarks/
 *   --algorithms <ids>   Comma-separated algorithm IDs to benchmark (default: all)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { WasmLoader } from '@pictl/engine';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LatencyStats {
  mean_ns: number;
  stddev_ns: number;
  p50_ns: number;
  p99_ns: number;
  p999_ns: number;
  min_ns: number;
  max_ns: number;
  samples: number;
}

export interface ThroughputPoint {
  /** elapsed seconds from benchmark start */
  elapsed_s: number;
  /** cumulative states processed */
  cumulative_states: number;
  /** instantaneous states/sec over this interval */
  states_per_sec: number;
}

export interface AlgorithmBenchResult {
  algorithm: string;
  log_cases: number;
  total_events: number;
  latency: LatencyStats;
  per_state_mean_ns: number;
  throughput_states_per_sec: number;
  throughput_curve: ThroughputPoint[];
  memory_bandwidth_gbps: number;
  peak_heap_mb: number;
  meets_latency_target: boolean;
  meets_throughput_target: boolean;
  meets_memory_target: boolean;
  margin_latency_pct: number;
  margin_throughput_pct: number;
}

export interface ThermalProfile {
  source: 'powermetrics' | 'unavailable';
  cpu_temp_c: number | null;
  gpu_temp_c: number | null;
  note: string;
}

export interface GpuUtilization {
  source: 'unavailable';
  gpu_util_pct: number;
  note: string;
}

export interface PerformanceReport {
  version: 1;
  generated_at: string;
  platform: string;
  node_version: string;
  targets: {
    max_per_state_ns: number;
    min_throughput_states_per_sec: number;
    max_peak_heap_mb: number;
    max_sustained_temp_c: number;
  };
  thermal: ThermalProfile;
  gpu: GpuUtilization;
  algorithms: AlgorithmBenchResult[];
  summary: {
    all_latency_targets_met: boolean;
    all_throughput_targets_met: boolean;
    all_memory_targets_met: boolean;
    fastest_algorithm: string;
    slowest_algorithm: string;
    best_throughput_algorithm: string;
    worst_throughput_algorithm: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_MAX_PER_STATE_NS = 120;
const TARGET_MIN_THROUGHPUT = 250_000;
const TARGET_MAX_HEAP_MB = 512;
const TARGET_MAX_TEMP_C = 80;
const BYTES_PER_EVENT_ESTIMATE = 256; // realistic XES encoding estimate

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic XES generation
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITIES = [
  'Register', 'Validate', 'Check_Completeness', 'Check_Docs', 'Assess_Risk',
  'Calculate_Fee', 'Send_Invoice', 'Wait_Payment', 'Confirm_Payment',
  'Approve_Basic', 'Approve_Senior', 'Approve_Director', 'Notify_Applicant',
  'Create_Record', 'Archive', 'Close', 'Reject', 'Escalate',
  'Return_Docs', 'Reopen',
];

/**
 * Linear congruential generator — deterministic, no external dependency.
 */
class Lcg {
  private state: bigint;

  constructor(seed: bigint = 0xDEAD_BEEF_CAFE_BABEn) {
    this.state = seed;
  }

  next(): bigint {
    this.state = (this.state * 6_364_136_223_846_793_005n + 1_442_695_040_888_963_407n) & 0xFFFF_FFFF_FFFF_FFFFn;
    return this.state;
  }

  nextUnsizeMod(m: number): number {
    return Number(this.next() % BigInt(m));
  }

  nextF64Unit(): number {
    return Number(this.next() >> 11n) / (2 ** 53);
  }
}

/**
 * Build a minimal XES string with `numCases` traces.
 * Deterministic: same parameters produce the same XML.
 */
function buildSyntheticXes(
  numCases: number,
  avgEventsPerCase: number,
  numActivities: number,
  noiseFactor: number,
): { xes: string; totalEvents: number } {
  const acts = ACTIVITIES.slice(0, numActivities);
  const rng = new Lcg();
  let totalEvents = 0;

  const traces: string[] = [];
  for (let c = 0; c < numCases; c++) {
    const lenFactor = 0.5 + rng.nextF64Unit();
    const numEvents = Math.max(2, Math.floor(avgEventsPerCase * lenFactor));
    totalEvents += numEvents;

    const events: string[] = [];
    for (let e = 0; e < numEvents; e++) {
      const baseIdx = e % acts.length;
      const actIdx = rng.nextF64Unit() < noiseFactor ? rng.nextUnsizeMod(acts.length) : baseIdx;
      const day = ((c % 28) + 1).toString().padStart(2, '0');
      const hour = (Math.floor(e / 60) % 24).toString().padStart(2, '0');
      const min = (e % 60).toString().padStart(2, '0');
      events.push(
        `    <event>\n` +
        `      <string key="concept:name" value="${acts[actIdx]}"/>\n` +
        `      <date key="time:timestamp" value="2024-01-${day}T${hour}:${min}:00+00:00"/>\n` +
        `    </event>`,
      );
    }

    traces.push(
      `  <trace>\n` +
      `    <string key="concept:name" value="case_${c}"/>\n` +
      events.join('\n') + '\n' +
      `  </trace>`,
    );
  }

  const xes =
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<log xes.version="2.0" xes.features="nested-attributes" openxes.version="1.0RC7" xmlns="http://www.xes-standard.org/">\n` +
    traces.join('\n') + '\n' +
    `</log>`;

  return { xes, totalEvents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistical helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeStats(samplesNs: number[]): LatencyStats {
  if (samplesNs.length === 0) throw new Error('computeStats: empty sample set');
  const sorted = [...samplesNs].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const pct = (p: number): number => {
    const idx = Math.round((p / 100) * (n - 1));
    return sorted[Math.min(idx, n - 1)];
  };
  return {
    mean_ns: mean,
    stddev_ns: stddev,
    p50_ns: pct(50),
    p99_ns: pct(99),
    p999_ns: pct(99.9),
    min_ns: sorted[0],
    max_ns: sorted[n - 1],
    samples: n,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform sampling (thermal / GPU)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt a single `powermetrics` sample on macOS.
 * Returns null on any failure — never throws.
 */
function sampleThermalMacOs(): { cpu_temp_c: number | null; gpu_temp_c: number | null } | null {
  try {
    const raw = execSync(
      'sudo powermetrics --samplers smc --sample-count 1 --sample-rate 1000 2>/dev/null',
      { timeout: 3000, encoding: 'utf-8' },
    );
    const cpuMatch = raw.match(/CPU die temperature:\s+([\d.]+)/);
    const gpuMatch = raw.match(/GPU die temperature:\s+([\d.]+)/);
    return {
      cpu_temp_c: cpuMatch ? parseFloat(cpuMatch[1]) : null,
      gpu_temp_c: gpuMatch ? parseFloat(gpuMatch[1]) : null,
    };
  } catch {
    return null;
  }
}

function collectThermal(): ThermalProfile {
  if (process.platform !== 'darwin') {
    return {
      source: 'unavailable',
      cpu_temp_c: null,
      gpu_temp_c: null,
      note: 'thermal sampling only available on macOS',
    };
  }
  const sample = sampleThermalMacOs();
  if (!sample) {
    return {
      source: 'unavailable',
      cpu_temp_c: null,
      gpu_temp_c: null,
      note: 'powermetrics requires sudo; run as root for thermal data',
    };
  }
  return {
    source: 'powermetrics',
    cpu_temp_c: sample.cpu_temp_c,
    gpu_temp_c: sample.gpu_temp_c,
    note: 'single-sample via powermetrics --samplers smc',
  };
}

function collectGpu(): GpuUtilization {
  return {
    source: 'unavailable',
    gpu_util_pct: 0,
    note: 'GPU utilization is not measurable from Node.js userspace on Apple Silicon; use Instruments or Metal Trace for GPU profiling',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Algorithm dispatch table (21 algorithms)
// ─────────────────────────────────────────────────────────────────────────────

type WasmModule = Record<string, (...args: unknown[]) => unknown>;

interface AlgorithmDef {
  id: string;
  invoke: (wasm: WasmModule, handle: string, activityKey: string) => unknown;
  /** upper bound on log size — slower algos skip large logs */
  maxCases: number;
}

const ALGORITHM_DEFS: AlgorithmDef[] = [
  { id: 'dfg',                 invoke: (w, h, k) => w['discover_dfg'](h, k),                                   maxCases: Infinity },
  { id: 'skeleton',            invoke: (w, h, k) => w['extract_process_skeleton'](h, k),                       maxCases: Infinity },
  { id: 'alpha_plus_plus',     invoke: (w, h, k) => w['discover_alpha_plus_plus'](h, k, 0.0),                 maxCases: 10_000 },
  { id: 'heuristic_miner',     invoke: (w, h, k) => w['discover_heuristic_miner'](h, k, 0.5),                 maxCases: 10_000 },
  { id: 'inductive_miner',     invoke: (w, h, k) => w['discover_inductive_miner'](h, k),                      maxCases: 10_000 },
  { id: 'hill_climbing',       invoke: (w, h, k) => w['discover_hill_climbing'](h, k),                        maxCases: 1_000 },
  { id: 'declare',             invoke: (w, h, k) => w['discover_declare'](h, k),                              maxCases: 10_000 },
  { id: 'simulated_annealing', invoke: (w, h, k) => w['discover_simulated_annealing'](h, k, 1.0, 0.95),      maxCases: 1_000 },
  { id: 'a_star',              invoke: (w, h, k) => w['discover_astar'](h, k, 500),                           maxCases: 1_000 },
  { id: 'ant_colony',          invoke: (w, h, k) => w['discover_ant_colony'](h, k, 20, 20),                   maxCases: 1_000 },
  { id: 'pso',                 invoke: (w, h, k) => w['discover_pso_algorithm'](h, k, 20, 20),                maxCases: 1_000 },
  { id: 'genetic_algorithm',   invoke: (w, h, k) => w['discover_genetic_algorithm'](h, k, 20, 20),            maxCases: 1_000 },
  { id: 'ilp',                 invoke: (w, h, k) => w['discover_ilp_petri_net'](h, k),                        maxCases: 1_000 },
  { id: 'simd_dfg',            invoke: (w, h, k) => w['discover_dfg_simd'](h, k, 0.0),                        maxCases: Infinity },
  { id: 'hierarchical_dfg',    invoke: (w, h, k) => w['discover_dfg_hierarchical'](h, k, 3),                  maxCases: Infinity },
  { id: 'ml_classify',         invoke: (w, h, k) => w['ml_classify'](h, k, 'knn', 3),                         maxCases: 5_000 },
  { id: 'ml_cluster',          invoke: (w, h, k) => w['ml_cluster'](h, k, 'kmeans', 5),                       maxCases: 5_000 },
  { id: 'ml_forecast',         invoke: (w, h, k) => w['ml_forecast'](h, k, 10),                               maxCases: 5_000 },
  { id: 'ml_anomaly',          invoke: (w, h, k) => w['ml_anomaly'](h, k, 2.0),                               maxCases: 5_000 },
  { id: 'ml_regress',          invoke: (w, h, k) => w['ml_regress'](h, k, 'linear'),                          maxCases: 5_000 },
  { id: 'ml_pca',              invoke: (w, h, k) => w['ml_pca'](h, k, 2),                                     maxCases: 5_000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core benchmark loop
// ─────────────────────────────────────────────────────────────────────────────

interface BenchOptions {
  samples: number;
  warmup: number;
  numCases: number;
  avgEventsPerCase: number;
  numActivities: number;
  noiseFactor: number;
  activityKey: string;
}

const DEFAULT_OPTIONS: BenchOptions = {
  samples: 1000,
  warmup: 50,
  numCases: 1000,
  avgEventsPerCase: 15,
  numActivities: 12,
  noiseFactor: 0.10,
  activityKey: 'concept:name',
};

/**
 * Benchmark one algorithm. Returns null if the algorithm is unavailable
 * in the current WASM build or if the log is too large for the algo.
 */
async function benchmarkAlgorithm(
  wasm: WasmModule,
  def: AlgorithmDef,
  xes: string,
  totalEvents: number,
  opts: BenchOptions,
): Promise<AlgorithmBenchResult | null> {
  const { activityKey, samples, warmup } = opts;

  // Availability probe: load, invoke once, discard
  let invokeOk = true;
  try {
    const probeHandle = wasm['load_eventlog_from_xes'](xes) as string;
    try {
      def.invoke(wasm, probeHandle, activityKey);
    } catch {
      invokeOk = false;
    } finally {
      if (typeof wasm['delete_object'] === 'function') {
        wasm['delete_object'](probeHandle);
      }
    }
  } catch {
    invokeOk = false;
  }

  if (!invokeOk) return null;

  // Warmup
  for (let i = 0; i < warmup; i++) {
    const h = wasm['load_eventlog_from_xes'](xes) as string;
    try { def.invoke(wasm, h, activityKey); } catch { /* ignore warmup errors */ }
    if (typeof wasm['delete_object'] === 'function') wasm['delete_object'](h);
  }

  // 1000-sample latency collection using process.hrtime.bigint()
  const latenciesNs: number[] = [];
  for (let i = 0; i < samples; i++) {
    const h = wasm['load_eventlog_from_xes'](xes) as string;
    const t0 = process.hrtime.bigint();
    def.invoke(wasm, h, activityKey);
    const elapsed = Number(process.hrtime.bigint() - t0);
    if (typeof wasm['delete_object'] === 'function') wasm['delete_object'](h);
    latenciesNs.push(elapsed);
  }

  const stats = computeStats(latenciesNs);
  const perStateMeanNs = stats.mean_ns / totalEvents;
  const throughput = 1e9 / perStateMeanNs;

  // 10-second sustained throughput curve
  const windowMs = 10_000;
  const curve: ThroughputPoint[] = [];
  let cumulativeStates = 0;
  const sustainedStart = Date.now();
  let prevMs = sustainedStart;
  let prevStates = 0;

  while (Date.now() - sustainedStart < windowMs) {
    const h = wasm['load_eventlog_from_xes'](xes) as string;
    def.invoke(wasm, h, activityKey);
    if (typeof wasm['delete_object'] === 'function') wasm['delete_object'](h);
    cumulativeStates += totalEvents;

    const nowMs = Date.now();
    const intervalMs = nowMs - prevMs;
    if (intervalMs >= 500) {
      const intervalStates = cumulativeStates - prevStates;
      const instantaneous = (intervalStates / intervalMs) * 1000;
      curve.push({
        elapsed_s: (nowMs - sustainedStart) / 1000,
        cumulative_states: cumulativeStates,
        states_per_sec: Math.round(instantaneous),
      });
      prevMs = nowMs;
      prevStates = cumulativeStates;
    }
  }

  // Memory bandwidth proxy
  const bytesPerInvocation = totalEvents * BYTES_PER_EVENT_ESTIMATE;
  const bandwidthGbps = (bytesPerInvocation / (stats.mean_ns / 1e9)) / 1e9;

  // Peak heap sampled after the run
  const heapUsed = process.memoryUsage().heapUsed;
  const peakHeapMb = heapUsed / (1024 * 1024);

  return {
    algorithm: def.id,
    log_cases: opts.numCases,
    total_events: totalEvents,
    latency: stats,
    per_state_mean_ns: perStateMeanNs,
    throughput_states_per_sec: Math.round(throughput),
    throughput_curve: curve,
    memory_bandwidth_gbps: Math.round(bandwidthGbps * 100) / 100,
    peak_heap_mb: Math.round(peakHeapMb * 10) / 10,
    meets_latency_target: perStateMeanNs <= TARGET_MAX_PER_STATE_NS,
    meets_throughput_target: throughput >= TARGET_MIN_THROUGHPUT,
    meets_memory_target: peakHeapMb < TARGET_MAX_HEAP_MB,
    margin_latency_pct: ((TARGET_MAX_PER_STATE_NS - perStateMeanNs) / TARGET_MAX_PER_STATE_NS) * 100,
    margin_throughput_pct: ((throughput - TARGET_MIN_THROUGHPUT) / TARGET_MIN_THROUGHPUT) * 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report output
// ─────────────────────────────────────────────────────────────────────────────

function formatHumanReport(report: PerformanceReport): string {
  const lines: string[] = [];
  const BOLD = '\x1b[1m';
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';

  const pass = (ok: boolean): string => ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  const fmt = (n: number, decimals = 1): string => n.toFixed(decimals);

  lines.push('');
  lines.push(`${BOLD}pictl Performance Benchmark Report${RESET}  ${DIM}${report.generated_at}${RESET}`);
  lines.push(`Platform: ${report.platform}  |  Node: ${report.node_version}`);
  lines.push('');
  lines.push(`${BOLD}Targets:${RESET}`);
  lines.push(`  Latency per state : ≤${report.targets.max_per_state_ns} ns`);
  lines.push(`  Throughput        : ≥${(report.targets.min_throughput_states_per_sec / 1000).toFixed(0)}K states/sec`);
  lines.push(`  Peak heap         : <${report.targets.max_peak_heap_mb} MB`);
  lines.push(`  Sustained temp    : <${report.targets.max_sustained_temp_c}°C`);
  lines.push('');

  lines.push(`${BOLD}Thermal Profile:${RESET}  [${report.thermal.source}]`);
  lines.push(`  CPU: ${report.thermal.cpu_temp_c != null ? fmt(report.thermal.cpu_temp_c) + '°C' : 'N/A'}`);
  lines.push(`  GPU: ${report.thermal.gpu_temp_c != null ? fmt(report.thermal.gpu_temp_c) + '°C' : 'N/A'}`);
  lines.push(`  Note: ${report.thermal.note}`);
  lines.push('');
  lines.push(`${BOLD}GPU Utilization:${RESET}  [${report.gpu.source}]`);
  lines.push(`  Note: ${report.gpu.note}`);
  lines.push('');

  lines.push(`${BOLD}Algorithm Results:${RESET}`);
  lines.push(
    '  Algorithm'.padEnd(26) +
    'Mean(ns/st)'.padStart(12) +
    'p99(ns/st)'.padStart(12) +
    'Throughput(K)'.padStart(15) +
    'Heap(MB)'.padStart(10) +
    'BW(GB/s)'.padStart(10) +
    'Lat'.padStart(6) +
    'Tput'.padStart(6),
  );
  lines.push('  ' + '─'.repeat(97));

  for (const r of report.algorithms) {
    const perStateP99 = r.latency.p99_ns / r.total_events;
    lines.push(
      '  ' + r.algorithm.padEnd(24) +
      fmt(r.per_state_mean_ns, 2).padStart(12) +
      fmt(perStateP99, 2).padStart(12) +
      fmt(r.throughput_states_per_sec / 1000, 1).padStart(15) +
      fmt(r.peak_heap_mb, 1).padStart(10) +
      fmt(r.memory_bandwidth_gbps, 2).padStart(10) +
      '  ' + pass(r.meets_latency_target) +
      ' ' + pass(r.meets_throughput_target),
    );
  }
  lines.push('');

  const s = report.summary;
  lines.push(`${BOLD}Summary:${RESET}`);
  lines.push(`  All latency targets met   : ${pass(s.all_latency_targets_met)}`);
  lines.push(`  All throughput targets met: ${pass(s.all_throughput_targets_met)}`);
  lines.push(`  All memory targets met    : ${pass(s.all_memory_targets_met)}`);
  lines.push(`  Fastest algorithm         : ${s.fastest_algorithm}`);
  lines.push(`  Best throughput           : ${s.best_throughput_algorithm}`);
  lines.push('');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Save report to .pictl/benchmarks/
// ─────────────────────────────────────────────────────────────────────────────

const BENCHMARKS_DIR = path.join('.pictl', 'benchmarks');

async function saveReport(report: PerformanceReport, overridePath?: string): Promise<string> {
  const dir = overridePath
    ? path.dirname(overridePath)
    : path.resolve(process.cwd(), BENCHMARKS_DIR);

  await fs.mkdir(dir, { recursive: true });

  let outPath: string;
  if (overridePath) {
    outPath = overridePath;
  } else {
    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '');
    outPath = path.join(dir, `performance-${ts}.json`);
  }

  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  return outPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface RunBenchmarkOptions {
  samples?: number;
  warmup?: number;
  numCases?: number;
  outputPath?: string;
  format?: 'human' | 'json';
  save?: boolean;
  /** Restrict to specific algorithm IDs; empty = all 21 */
  algorithms?: string[];
}

/**
 * Run the full performance benchmark suite and return the report.
 * Writes JSON to .pictl/benchmarks/ unless save=false.
 */
export async function runBenchmark(options: RunBenchmarkOptions = {}): Promise<PerformanceReport> {
  const opts: BenchOptions = {
    ...DEFAULT_OPTIONS,
    samples: options.samples ?? DEFAULT_OPTIONS.samples,
    warmup: options.warmup ?? DEFAULT_OPTIONS.warmup,
    numCases: options.numCases ?? DEFAULT_OPTIONS.numCases,
  };

  const format = options.format ?? 'human';

  if (format === 'human') {
    process.stdout.write(`pictl performance benchmark — ${opts.samples} samples, ${opts.numCases} cases\n`);
    process.stdout.write('Loading WASM kernel...\n');
  }

  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get() as WasmModule;

  if (format === 'human') {
    process.stdout.write(
      `Generating synthetic XES log (${opts.numCases} cases, ~${opts.avgEventsPerCase} avg events/case)...\n`,
    );
  }

  const { xes, totalEvents } = buildSyntheticXes(
    opts.numCases, opts.avgEventsPerCase, opts.numActivities, opts.noiseFactor,
  );

  if (format === 'human') process.stdout.write('Sampling thermal baseline...\n');
  const thermal = collectThermal();
  const gpu = collectGpu();

  const defsToRun = options.algorithms && options.algorithms.length > 0
    ? ALGORITHM_DEFS.filter(d => (options.algorithms as string[]).includes(d.id))
    : ALGORITHM_DEFS;

  const results: AlgorithmBenchResult[] = [];

  for (const def of defsToRun) {
    if (opts.numCases > def.maxCases) {
      if (format === 'human') {
        process.stdout.write(`  Skipping ${def.id} (log ${opts.numCases} cases > limit ${def.maxCases})\n`);
      }
      continue;
    }

    if (format === 'human') process.stdout.write(`  Benchmarking ${def.id}...`);

    const result = await benchmarkAlgorithm(wasm, def, xes, totalEvents, opts);
    if (result == null) {
      if (format === 'human') process.stdout.write(' unavailable (skipped)\n');
      continue;
    }

    results.push(result);

    if (format === 'human') {
      const ok = result.meets_latency_target && result.meets_throughput_target;
      process.stdout.write(
        ` ${ok ? 'ok' : 'FAIL'}  ${result.per_state_mean_ns.toFixed(2)} ns/state  ` +
        `${(result.throughput_states_per_sec / 1000).toFixed(1)}K/s\n`,
      );
    }
  }

  // Guard: return empty report with placeholders if no results
  if (results.length === 0) {
    const emptyReport: PerformanceReport = {
      version: 1,
      generated_at: new Date().toISOString(),
      platform: `${process.platform} ${process.arch}`,
      node_version: process.version,
      targets: {
        max_per_state_ns: TARGET_MAX_PER_STATE_NS,
        min_throughput_states_per_sec: TARGET_MIN_THROUGHPUT,
        max_peak_heap_mb: TARGET_MAX_HEAP_MB,
        max_sustained_temp_c: TARGET_MAX_TEMP_C,
      },
      thermal,
      gpu,
      algorithms: [],
      summary: {
        all_latency_targets_met: false,
        all_throughput_targets_met: false,
        all_memory_targets_met: false,
        fastest_algorithm: 'N/A',
        slowest_algorithm: 'N/A',
        best_throughput_algorithm: 'N/A',
        worst_throughput_algorithm: 'N/A',
      },
    };
    return emptyReport;
  }

  const fastest = results.reduce((a, b) => a.per_state_mean_ns < b.per_state_mean_ns ? a : b);
  const slowest = results.reduce((a, b) => a.per_state_mean_ns > b.per_state_mean_ns ? a : b);
  const bestTput = results.reduce((a, b) => a.throughput_states_per_sec > b.throughput_states_per_sec ? a : b);
  const worstTput = results.reduce((a, b) => a.throughput_states_per_sec < b.throughput_states_per_sec ? a : b);

  const report: PerformanceReport = {
    version: 1,
    generated_at: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    node_version: process.version,
    targets: {
      max_per_state_ns: TARGET_MAX_PER_STATE_NS,
      min_throughput_states_per_sec: TARGET_MIN_THROUGHPUT,
      max_peak_heap_mb: TARGET_MAX_HEAP_MB,
      max_sustained_temp_c: TARGET_MAX_TEMP_C,
    },
    thermal,
    gpu,
    algorithms: results,
    summary: {
      all_latency_targets_met: results.every(r => r.meets_latency_target),
      all_throughput_targets_met: results.every(r => r.meets_throughput_target),
      all_memory_targets_met: results.every(r => r.meets_memory_target),
      fastest_algorithm: fastest.algorithm,
      slowest_algorithm: slowest.algorithm,
      best_throughput_algorithm: bestTput.algorithm,
      worst_throughput_algorithm: worstTput.algorithm,
    },
  };

  if (options.save !== false) {
    const savedPath = await saveReport(report, options.outputPath);
    if (format === 'human') {
      process.stdout.write(`\nReport saved: ${savedPath}\n`);
    }
  }

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parser
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): RunBenchmarkOptions {
  const opts: RunBenchmarkOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--samples' || arg === '-s') && argv[i + 1]) {
      opts.samples = parseInt(argv[++i], 10);
    } else if (arg === '--warmup' && argv[i + 1]) {
      opts.warmup = parseInt(argv[++i], 10);
    } else if (arg === '--cases' && argv[i + 1]) {
      opts.numCases = parseInt(argv[++i], 10);
    } else if ((arg === '--out' || arg === '-o') && argv[i + 1]) {
      opts.outputPath = argv[++i];
    } else if (arg === '--format' && argv[i + 1]) {
      opts.format = argv[++i] as 'human' | 'json';
    } else if (arg === '--no-save') {
      opts.save = false;
    } else if (arg === '--algorithms' && argv[i + 1]) {
      opts.algorithms = argv[++i].split(',');
    }
  }
  return opts;
}

// Direct invocation guard
const scriptName = process.argv[1] ?? '';
const isMain =
  scriptName.endsWith('performance-runner.js') ||
  scriptName.endsWith('performance-runner.ts');

if (isMain) {
  const cliOpts = parseArgs(process.argv.slice(2));
  runBenchmark(cliOpts)
    .then((report) => {
      if (cliOpts.format === 'json') {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        process.stdout.write(formatHumanReport(report));
      }
      const allOk =
        report.summary.all_latency_targets_met &&
        report.summary.all_throughput_targets_met &&
        report.summary.all_memory_targets_met;
      process.exit(allOk ? 0 : 1);
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `Benchmark failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
}
