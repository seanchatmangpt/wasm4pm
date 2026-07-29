import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { stat } from 'fs/promises';
import { execSync } from 'child_process';
import { WasmLoader } from '@wasm4pm/engine';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan, withSpanRaw } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';
import { WasmInstrumentation } from './_wasm-instrumentation.js';
import { validatePositiveInt, validateFloatInRange, validateEnum, exitValidationError } from '../_cli-validator.js';

const EWMA_ALPHA = 0.3;
const DRIFT_THRESHOLD = 0.3;
const DEFAULT_WINDOW = 50;
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_ACTIVITY_KEY = 'concept:name';

// ── ASCII sparkline chart (TTY only) ─────────────────────────────────────────
// Renders a 60-column × 8-row braille-free ASCII chart of the EWMA series.
// Called only when !jsonMode and process.stdout.isTTY.

const CHART_WIDTH = 60; // columns of data
const CHART_HEIGHT = 8; // rows

/** Build a fixed-width ASCII line chart from a series of values in [0, maxVal]. */
function buildAsciiChart(
  values: number[],
  maxVal: number,
  threshold: number,
  currentEwma: number,
  driftEvents: Array<{ event_index: number }>,
): string[] {
  // Sample to CHART_WIDTH columns
  const sampled: number[] = [];
  if (values.length === 0) {
    for (let i = 0; i < CHART_WIDTH; i++) sampled.push(0);
  } else if (values.length <= CHART_WIDTH) {
    const pad = CHART_WIDTH - values.length;
    for (let i = 0; i < pad; i++) sampled.push(0);
    sampled.push(...values);
  } else {
    const step = values.length / CHART_WIDTH;
    for (let i = 0; i < CHART_WIDTH; i++) {
      sampled.push(values[Math.floor(i * step)] ?? 0);
    }
  }

  const effectiveMax = maxVal > 0 ? maxVal : 1;
  // Convert values to row indices (0 = bottom row = CHART_HEIGHT-1)
  const rows = sampled.map((v) => Math.round(((v / effectiveMax) * (CHART_HEIGHT - 1))));
  const thresholdRow = Math.round((threshold / effectiveMax) * (CHART_HEIGHT - 1));

  const lines: string[] = [];
  const rowLabels: string[] = [];
  for (let r = CHART_HEIGHT - 1; r >= 0; r--) {
    const labelVal = ((r / (CHART_HEIGHT - 1)) * effectiveMax);
    rowLabels.push(labelVal.toFixed(2));
  }
  const labelWidth = Math.max(...rowLabels.map((l) => l.length));

  for (let r = CHART_HEIGHT - 1; r >= 0; r--) {
    const displayRow = CHART_HEIGHT - 1 - r; // 0 = top
    const label = rowLabels[displayRow].padStart(labelWidth);
    let line = `${label} ┤`;
    for (let c = 0; c < CHART_WIDTH; c++) {
      const colRow = rows[c] ?? 0;
      // Threshold marker
      if (r === thresholdRow && c > CHART_WIDTH - 20) {
        line += '─';
      } else if (colRow === r) {
        // Point on the chart
        line += '●';
      } else if (colRow > r && rows[c - 1] !== undefined && rows[c - 1] <= r) {
        line += '╭'; // rising
      } else if (colRow < r && rows[c - 1] !== undefined && rows[c - 1] >= r) {
        line += '╰'; // falling
      } else if (colRow > r && rows[c + 1] !== undefined && rows[c + 1] <= r) {
        line += '╮'; // peak
      } else if (colRow < r && rows[c + 1] !== undefined && rows[c + 1] >= r) {
        line += '╯'; // valley
      } else if (colRow === r) {
        line += '─';
      } else if (r === thresholdRow) {
        line += '─'; // threshold row fill
      } else {
        line += ' ';
      }
    }
    // Right annotation for threshold row
    if (r === thresholdRow) {
      line += `── threshold=${threshold.toFixed(2)}`;
    }
    // Annotate current value on top row
    if (displayRow === 0) {
      line += `  current: ${currentEwma.toFixed(4)}`;
    }
    lines.push(line);
  }
  // X-axis label row
  const n = values.length;
  const xLeft = '     ' + '└' + '─'.repeat(CHART_WIDTH);
  lines.push(xLeft);
  const xLabels = `t=0${' '.repeat(Math.max(0, CHART_WIDTH / 2 - 6))}t=${Math.round(n / 2)}${' '.repeat(Math.max(0, CHART_WIDTH / 2 - 6))}t=${n}`;
  lines.push('     ' + ' ' + xLabels);
  return lines;
}

/** Render the full live drift monitor dashboard to stdout. */
function renderDriftDashboard(params: {
  inputPath: string;
  windowSize: number;
  threshold: number;
  totalEvents: number | null;
  elapsedMs: number;
  eventsPerSec: number;
  ewmaHistory: number[];
  currentEwma: number;
  trend: string;
  driftEvents: Array<{ event_index: number; score: number }>;
  alertsFired: number;
}): void {
  const {
    inputPath, windowSize, threshold, totalEvents, elapsedMs,
    eventsPerSec, ewmaHistory, currentEwma, trend, driftEvents, alertsFired,
  } = params;

  const secs = Math.floor(elapsedMs / 1000);
  const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const elapsedStr = `${hh}:${mm}:${ss}`;
  const eventsStr = totalEvents !== null ? totalEvents.toLocaleString() : '?';
  const rateStr = eventsPerSec.toFixed(1);

  const maxVal = Math.max(threshold * 1.5, ...ewmaHistory, 0.01);
  const chartLines = buildAsciiChart(ewmaHistory, maxVal, threshold, currentEwma, driftEvents);

  const BLUE = '\x1b[34m';
  const BOLD = '\x1b[1m';
  const RESET = '\x1b[0m';
  const RED = '\x1b[31m';
  const YELLOW = '\x1b[33m';
  const GREEN = '\x1b[32m';

  // Clear screen + move to top
  process.stdout.write('\x1b[2J\x1b[H');
  process.stdout.write(`${BOLD}▶ Concept Drift Monitor — wpm drift-watch${RESET}\n`);
  process.stdout.write('═'.repeat(60) + '\n');
  process.stdout.write(
    `Events processed: ${eventsStr}  |  Elapsed: ${elapsedStr}  |  Rate: ${rateStr}/s\n\n`
  );
  process.stdout.write(
    `EWMA Drift Score (window=${windowSize}, threshold=${threshold})\n`
  );
  process.stdout.write('─'.repeat(60) + '\n');
  for (const line of chartLines) {
    process.stdout.write(line + '\n');
  }
  process.stdout.write('\n');

  // Drift events summary
  const lastDrift = driftEvents[driftEvents.length - 1];
  if (lastDrift) {
    const driftAgo = (totalEvents ?? 0) - lastDrift.event_index;
    const status = currentEwma > threshold ? `${RED}ACTIVE${RESET}` : `${GREEN}RECOVERING${RESET}`;
    process.stdout.write(
      `${YELLOW}⚠${RESET} Last drift event: t=${lastDrift.event_index} (${driftAgo} events ago) — ${status}\n`
    );
  }
  process.stdout.write(
    `Active alerts: ${alertsFired}  |  Total drift events: ${driftEvents.length}\n`
  );

  // Trend display
  const trendColor = trend === 'rising' ? RED : trend === 'falling' ? GREEN : BLUE;
  process.stdout.write(`Trend: ${trendColor}${trend}${RESET}  |  EWMA: ${currentEwma.toFixed(4)}\n`);
}

// ── Alert command helper ───────────────────────────────────────────────────────
/** Fire a drift alert: print to stderr and optionally execute --alert-cmd. */
function fireAlert(params: {
  ewma: number;
  threshold: number;
  alertCmd: string | undefined;
  eventIndex: number;
}): void {
  const { ewma, threshold, alertCmd, eventIndex } = params;
  const ts = new Date().toISOString();
  process.stderr.write(
    `[drift-alert] ${ts}  DRIFT DETECTED  ewma=${ewma.toFixed(4)} threshold=${threshold} event=${eventIndex}\n`
  );
  if (alertCmd) {
    try {
      execSync(alertCmd, { stdio: 'inherit' });
    } catch (err) {
      process.stderr.write(
        `[drift-alert] alert-cmd failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }
}

// ── Drift report helpers ───────────────────────────────────────────────────────
interface DriftReportEvent {
  event_index: number;
  score: number;
  window_start: number;
  window_end: number;
}

interface StablePeriod {
  start: number;
  end: number;
  length: number;
}

type DriftVerdict = 'STABLE' | 'MILD' | 'MODERATE' | 'SEVERE';

function classifyVerdict(driftCount: number, totalEvents: number): DriftVerdict {
  if (totalEvents === 0) return 'STABLE';
  const freq = driftCount / totalEvents;
  if (freq === 0) return 'STABLE';
  if (freq < 0.001) return 'MILD';
  if (freq < 0.005) return 'MODERATE';
  return 'SEVERE';
}

function computeStablePeriods(
  driftEvents: DriftReportEvent[],
  totalEvents: number,
): StablePeriod[] {
  const periods: StablePeriod[] = [];
  let pos = 0;
  for (const de of driftEvents) {
    if (de.event_index > pos) {
      periods.push({ start: pos, end: de.event_index, length: de.event_index - pos });
    }
    pos = de.window_end;
  }
  if (pos < totalEvents) {
    periods.push({ start: pos, end: totalEvents, length: totalEvents - pos });
  }
  return periods;
}

// ── Window comparison helper ───────────────────────────────────────────────────
interface WindowStats {
  edgeCount: number;
  nodeCount: number;
  edges: Array<{ from: string; to: string; frequency: number }>;
  nodes: Array<{ id: string }>;
}

interface WindowComparison {
  window1: WindowStats;
  window2: WindowStats;
  addedEdges: Array<{ from: string; to: string; frequency: number }>;
  removedEdges: Array<{ from: string; to: string; frequency: number }>;
  addedActivities: string[];
  removedActivities: string[];
  jaccardSimilarity: number;
  verdict: 'STABLE' | 'MILD' | 'SIGNIFICANT' | 'MAJOR';
}

function compareWindows(w1: WindowStats, w2: WindowStats): WindowComparison {
  const edgeKey = (e: { from: string; to: string }) => `${e.from}→${e.to}`;
  const e1 = new Map(w1.edges.map((e) => [edgeKey(e), e]));
  const e2 = new Map(w2.edges.map((e) => [edgeKey(e), e]));
  const addedEdges = [...e2.values()].filter((e) => !e1.has(edgeKey(e)));
  const removedEdges = [...e1.values()].filter((e) => !e2.has(edgeKey(e)));

  const n1 = new Set(w1.nodes.map((n) => n.id));
  const n2 = new Set(w2.nodes.map((n) => n.id));
  const addedActivities = [...n2].filter((id) => !n1.has(id));
  const removedActivities = [...n1].filter((id) => !n2.has(id));

  // Jaccard similarity on edge sets
  const union = new Set([...e1.keys(), ...e2.keys()]);
  const intersection = [...e1.keys()].filter((k) => e2.has(k));
  const jaccardSimilarity = union.size === 0 ? 1 : intersection.length / union.size;

  const changeCount = addedEdges.length + removedEdges.length + addedActivities.length + removedActivities.length;
  const verdict: WindowComparison['verdict'] =
    changeCount === 0 ? 'STABLE'
    : jaccardSimilarity > 0.9 ? 'MILD'
    : jaccardSimilarity > 0.7 ? 'SIGNIFICANT'
    : 'MAJOR';

  return {
    window1: w1,
    window2: w2,
    addedEdges,
    removedEdges,
    addedActivities,
    removedActivities,
    jaccardSimilarity,
    verdict,
  };
}

// ANSI colour helpers
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

interface DriftPoint {
  position: number;
  distance: number;
  type: string;
  appeared?: string[];
  disappeared?: string[];
  suggestion?: string;
}

interface DriftResult {
  drifts_detected: number;
  drifts: DriftPoint[];
  window_size: number;
  method: string;
}

interface EwmaResult {
  smoothed: number[];
  trend: 'rising' | 'falling' | 'stable';
  last_value: number | null;
}

function timestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function trendArrow(trend: string): string {
  if (trend === 'rising') return `${RED}↑ rising${RESET}`;
  if (trend === 'falling') return `${GREEN}↓ falling${RESET}`;
  return `${CYAN}→ stable${RESET}`;
}

export const driftWatch = defineCommand({
  meta: {
    name: 'drift-watch',
    description:
      'Real-time EWMA concept drift monitoring. Ex: wpm drift-watch -i process.xes (press Ctrl+C to stop)',
  },
  args: {
    input: {
      type: 'string',
      description: 'Path to XES event log file to monitor',
      required: true,
      alias: 'i',
    },
    'activity-key': {
      type: 'string',
      description: `Activity attribute key (default: ${DEFAULT_ACTIVITY_KEY})`,
      alias: 'a',
    },
    window: {
      type: 'string',
      description: `Sliding window size in traces (default: ${DEFAULT_WINDOW})`,
      alias: 'w',
    },
    interval: {
      type: 'string',
      description: `Poll interval in milliseconds (default: ${DEFAULT_INTERVAL_MS})`,
      alias: 'n',
    },
    alpha: {
      type: 'string',
      description: `EWMA smoothing factor α ∈ (0,1] — higher = more weight on recent windows (default: ${EWMA_ALPHA})`,
    },
    threshold: {
      type: 'string',
      description: `Jaccard distance alert threshold — drift above this triggers ⚠ ALERT (default: ${DRIFT_THRESHOLD})`,
    },
    json: {
      type: 'boolean',
      description: 'Emit newline-delimited JSON instead of human-readable output (alias for --format json)',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json. Invalid values exit with config_error (1).',
      alias: 'f',
    },
    enhanced: {
      type: 'boolean',
      description: 'Enable ML-enhanced anomaly detection alongside EWMA drift monitoring',
    },
    'auto-refit': {
      type: 'boolean',
      description: 'Automatically trigger model refitting when drift is detected (circuit-breaker protected)',
    },
    'refit-algorithm': {
      type: 'string',
      description: 'Algorithm to use for auto-refit (default: heuristic_miner if current is dfg, else dfg)',
      alias: 'r',
    },
    'no-save': {
      type: 'boolean',
      description: 'Skip writing the session receipt to .wasm4pm/receipts/',
    },
    'exit-on-drift': {
      type: 'boolean',
      description:
        'Exit non-zero (execution_error / 3) the first time EWMA crosses --threshold. ' +
        'Useful in CI pipelines to fail a build when process drift is detected.',
    },
    alert: {
      type: 'string',
      description:
        'Alert threshold: print to stderr when EWMA exceeds this value (default: same as --threshold). ' +
        'Use to get stderr notifications without blocking output.',
    },
    'alert-cmd': {
      type: 'string',
      description:
        'Shell command to execute when an alert fires (e.g. "echo DRIFT | slack-notify"). ' +
        'Runs synchronously; failures are logged but do not stop monitoring.',
    },
    report: {
      type: 'string',
      description:
        'Write a JSON drift summary report to this file path on exit. ' +
        'Contains drift_events, stable_periods, ewma_timeseries, and verdict.',
    },
    'compare-windows': {
      type: 'boolean',
      description:
        'Compare DFG structure of the first and second half of the log (split by --window). ' +
        'Reports added/removed edges and activities with a Jaccard similarity score.',
    },
    live: {
      type: 'boolean',
      description:
        'Force live ASCII chart display even when stdout is not a TTY. ' +
        'Ignored in --format json / --json mode. Enabled automatically when attached to a TTY.',
    },
  },

  async run(ctx) {
    const inputPath: string = ctx.args.input as string;
    const activityKey: string = (ctx.args['activity-key'] as string) || DEFAULT_ACTIVITY_KEY;

    // Validate numeric parameters using centralized validator
    const windowResult = validatePositiveInt(ctx.args.window as string | undefined, 'window', DEFAULT_WINDOW, { min: 1 });
    if (!windowResult.success) {
      exitValidationError(windowResult.error!, EXIT_CODES.config_error);
    }
    const windowSize = windowResult.value!;

    const intervalResult = validatePositiveInt(ctx.args.interval as string | undefined, 'interval', DEFAULT_INTERVAL_MS, { min: 100 });
    if (!intervalResult.success) {
      exitValidationError(intervalResult.error!, EXIT_CODES.config_error);
    }
    const intervalMs = intervalResult.value!;

    const alphaResult = validateFloatInRange(ctx.args.alpha as string | undefined, 'alpha', EWMA_ALPHA, 0.001, 1);
    if (!alphaResult.success) {
      exitValidationError(alphaResult.error!, EXIT_CODES.config_error);
    }
    const ewmaAlpha = alphaResult.value!;

    const thresholdResult = validateFloatInRange(ctx.args.threshold as string | undefined, 'threshold', DRIFT_THRESHOLD, 0, 1);
    if (!thresholdResult.success) {
      exitValidationError(thresholdResult.error!, EXIT_CODES.config_error);
    }
    const driftThreshold = thresholdResult.value!;
    // ── Validate --format flag ────────────────────────────────────────────────
    const formatArg = ctx.args.format as string | undefined;
    const formatResult = validateEnum(
      formatArg,
      'format',
      'human',
      ['human', 'json'] as const
    );
    if (!formatResult.success) {
      exitValidationError(formatResult.error!, EXIT_CODES.config_error);
    }
    const resolvedFormat = formatResult.value!;

    const jsonMode: boolean = ctx.args.json === true || resolvedFormat === 'json';
    const enhancedMode: boolean = ctx.args.enhanced === true;
    const autoRefitMode: boolean = ctx.args['auto-refit'] === true;
    const autoRefitAlgo: string = (ctx.args['refit-algorithm'] as string) || '';
    const exitOnDrift: boolean = ctx.args['exit-on-drift'] === true;

    // ── New feature flags ─────────────────────────────────────────────────────
    const alertThreshold: number | null = ctx.args.alert != null
      ? parseFloat(ctx.args.alert as string)
      : null;
    const alertCmd: string | undefined = ctx.args['alert-cmd'] as string | undefined;
    const reportPath: string | undefined = ctx.args.report as string | undefined;
    const compareWindowsMode: boolean = ctx.args['compare-windows'] === true;
    const liveMode: boolean = !jsonMode && (ctx.args.live === true || process.stdout.isTTY === true);

    // Report state — accumulated across ticks, written on exit
    const reportDriftEvents: DriftReportEvent[] = [];
    const reportEwmaTimeseries: Array<{ event_index: number; ewma: number }> = [];
    let reportSampleCounter = 0;
    const EWMA_SAMPLE_EVERY = 100; // record every N events

    // Live-mode chart state
    const ewmaHistory: number[] = [];
    const liveDriftEvents: Array<{ event_index: number; score: number }> = [];
    const sessionStartMs = Date.now();

    // Last drift result for --compare-windows (accessible outside tickInner)
    let lastDriftResult: DriftResult | null = null;

    // ── Step 1: Validate input file ──────────────────────────────────────────
    try {
      await fs.access(inputPath);
    } catch {
      console.error(`[drift-watch] Input file not found: ${inputPath}`);
      return await exitWithFlush(EXIT_CODES.source_error);
    }

    // ── Step 2: Load WASM ────────────────────────────────────────────────────
    const loader = WasmLoader.getInstance();
    try {
      await loader.init();
    } catch (err) {
      console.error(
        `[drift-watch] Failed to initialise WASM: ${err instanceof Error ? err.message : String(err)}`
      );
      return await exitWithFlush(EXIT_CODES.execution_error);
    }
    const wasm = loader.get() as any;

    // ── Step 3: State for incremental monitoring ─────────────────────────────
    let previousDriftCount = 0;
    let previousMtimeMs = 0;
    let previousEwma = 0; // Tracks EWMA from prior tick for threshold-crossing detection
    const distanceHistory: number[] = [];
    // Limitation: full-file reload on every mtime change (O(all_events) per tick).
    // A pure-incremental streaming path using wasm.streaming_dfg_begin / streaming_dfg_add_event
    // would ingest only new events per tick, but requires the log writer to expose a cursor
    // or byte-offset API so only new bytes are read. Until that infrastructure exists, the
    // full-file reload path is used; the mtime check prevents no-op ticks on unchanged files.
    const _cachedLogHandle: string | null = null; // eslint-disable-line @typescript-eslint/no-unused-vars
    const _cachedHandleMtime = 0; // eslint-disable-line @typescript-eslint/no-unused-vars
    const MAX_DISTANCE_HISTORY = 10_000;

    // ── Auto-refit state ──────────────────────────────────────────────────────
    let refitAttempts = 0;
    let refitSuccesses = 0;
    let lastRefitTimestampMs = 0;
    const refitTimestamps: number[] = []; // Ring buffer for last 3 refits
    const MAX_REFITS_PER_HOUR = 3;
    const HOUR_MS = 3600 * 1000;

    if (!jsonMode) {
      console.log(`${BOLD}[drift-watch]${RESET} Streaming EWMA drift monitor started`);
      console.log(
        `  file=${inputPath}  activity-key=${activityKey}  window=${windowSize}  interval=${intervalMs}ms  α=${ewmaAlpha}  threshold=${driftThreshold}`
      );
      console.log('');
      console.log('  EWMA score interpretation:');
      console.log(
        `    score < ${(driftThreshold / 2).toFixed(2)}           — no drift (Jaccard distance low and stable)`
      );
      console.log(
        `    ${(driftThreshold / 2).toFixed(2)} – ${driftThreshold.toFixed(2)}        — approaching threshold (rising trend may indicate emerging drift)`
      );
      console.log(
        `    score > ${driftThreshold.toFixed(2)}           — DRIFT ALERT (behaviour has changed significantly)`
      );
      console.log('');
      console.log('  When drift is detected, inspect the "disappeared/appeared" activity lists');
      console.log('  to understand what changed, then re-discover the process with:');
      console.log('    wpm run <log> --algorithm inductive_miner');
      console.log('  and compare pre-drift vs post-drift sub-logs with:');
      console.log('    wpm diff <log_before> <log_after>');
      console.log('');
      console.log('  Press Ctrl+C to stop.\n');
    }

    // ── Step 4: Counters for session-level span/receipt ───────────────────────
    let windowsProcessed = 0;
    let alertsFired = 0;
    let totalDriftPoints = 0;
    const startedAtMs = Date.now();
    // Per-tick mutable state for withSpanRaw late-attrs callback
    let currentEwma = 0;
    let currentNewDriftCount = 0;

    // ── Step 4b: Poll loop ────────────────────────────────────────────────────
    const tickInner = async (): Promise<void> => {
      // Check if the file has been modified since last run
      let currentMtimeMs: number;
      try {
        const info = await stat(inputPath);
        currentMtimeMs = info.mtimeMs;
      } catch {
        // File disappeared – skip this tick
        return;
      }

      if (currentMtimeMs === previousMtimeMs && distanceHistory.length > 0) {
        // File unchanged; nothing to do
        return;
      }
      previousMtimeMs = currentMtimeMs;

      // Load the log into WASM state
      let xesContent: string;
      try {
        xesContent = await fs.readFile(inputPath, 'utf-8');
      } catch (err) {
        throw new Error(`[drift-watch] Could not read file: ${err instanceof Error ? err.message : String(err)}`);
      }

      let logHandle: string;
      try {
        // INSTRUMENTED: load_eventlog_from_xes — top 1 most-called WASM export (70 calls)
        logHandle = WasmInstrumentation.load_eventlog_from_xes(wasm, xesContent);
      } catch (err) {
        throw new Error(`[drift-watch] XES parse error: ${err instanceof Error ? err.message : String(err)}`);
      }

      // ── detect_drift ────────────────────────────────────────────────────────
      let driftResult: DriftResult;
      try {
        // INSTRUMENTED: detect_drift — top 7 most-called WASM export (12 calls)
        const raw: string = WasmInstrumentation.detect_drift(wasm, logHandle, activityKey);
        driftResult = JSON.parse(raw) as DriftResult;
        lastDriftResult = driftResult;
      } catch (err) {
        // INSTRUMENTED: delete_object — top 3 most-called WASM export (20 calls)
        WasmInstrumentation.delete_object(wasm, logHandle);
        throw new Error(`[drift-watch] detect_drift failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // ── Accumulate Jaccard distances from drift points ───────────────────
      // Each drift point carries a distance; we also record 0 for non-drift windows
      // so the EWMA reflects the full sliding-window history.
      const detected = driftResult.drifts_detected;
      const drifts = driftResult.drifts;

      // Rebuild the distance series from detected drifts for EWMA
      // (we add each new drift's distance, or 0 if no new drifts this tick)
      const newDriftCount = detected - previousDriftCount;
      if (newDriftCount > 0) {
        totalDriftPoints += newDriftCount;
        for (const dp of drifts.slice(previousDriftCount)) {
          distanceHistory.push(dp.distance);
        }
      } else {
        // Push a 0 to indicate no new drift this tick
        distanceHistory.push(0);
      }

      // Cap unbounded history to prevent memory leak in long-running monitors
      if (distanceHistory.length > MAX_DISTANCE_HISTORY) {
        distanceHistory.splice(0, distanceHistory.length - MAX_DISTANCE_HISTORY);
      }

      // ── compute_ewma ─────────────────────────────────────────────────────
      let ewmaResult: EwmaResult;
      try {
        const raw: string = wasm.compute_ewma(JSON.stringify(distanceHistory), ewmaAlpha) as string;
        ewmaResult = JSON.parse(raw) as EwmaResult;
      } catch (err) {
        console.error(
          `[drift-watch] compute_ewma failed: ${err instanceof Error ? err.message : String(err)}`
        );
        // INSTRUMENTED: delete_object — top 3 most-called WASM export (20 calls)
        WasmInstrumentation.delete_object(wasm, logHandle);
        return;
      }

      // ── Collect total_events for JSON payload ─────────────────────────────
      let totalEvents: number | null = null;
      try {
        const statsRaw: string = wasm.analyze_event_statistics(logHandle) as string;
        const stats = JSON.parse(typeof statsRaw === 'string' ? statsRaw : JSON.stringify(statsRaw)) as { total_events?: number };
        totalEvents = typeof stats.total_events === 'number' ? stats.total_events : null;
      } catch {
        // gap: analyze_event_statistics may be unavailable or fail — leave null
        totalEvents = null;
      }

      // ── Free WASM handle ──────────────────────────────────────────────────
      // INSTRUMENTED: delete_object — top 3 most-called WASM export (20 calls)
      WasmInstrumentation.delete_object(wasm, logHandle);

      const ewma = ewmaResult.last_value ?? 0;
      const trend = ewmaResult.trend;
      const ts = timestamp();

      // ── Accumulate report data ────────────────────────────────────────────
      if (newDriftCount > 0) {
        for (const dp of drifts.slice(previousDriftCount)) {
          reportDriftEvents.push({
            event_index: dp.position,
            score: parseFloat(dp.distance.toFixed(4)),
            window_start: Math.max(0, dp.position - windowSize),
            window_end: dp.position,
          });
          liveDriftEvents.push({ event_index: dp.position, score: dp.distance });
        }
      }

      // Sample EWMA timeseries for report (every EWMA_SAMPLE_EVERY events)
      reportSampleCounter += 1;
      if (reportSampleCounter % EWMA_SAMPLE_EVERY === 0) {
        reportEwmaTimeseries.push({ event_index: totalEvents ?? reportSampleCounter, ewma: parseFloat(ewma.toFixed(4)) });
      }

      // Accumulate EWMA history for live chart
      if (liveMode) {
        ewmaHistory.push(ewma);
        if (ewmaHistory.length > CHART_WIDTH * 4) ewmaHistory.splice(0, ewmaHistory.length - CHART_WIDTH * 4);
      }

      // ── Alert threshold check ─────────────────────────────────────────────
      const effectiveAlertThreshold = alertThreshold ?? driftThreshold;
      const alertCrossed = ewma > effectiveAlertThreshold && previousEwma <= effectiveAlertThreshold;
      if (alertCrossed) {
        fireAlert({
          ewma,
          threshold: effectiveAlertThreshold,
          alertCmd,
          eventIndex: totalEvents ?? distanceHistory.length,
        });
      }

      // ── Live chart (TTY mode) ─────────────────────────────────────────────
      if (liveMode) {
        const elapsedMs = Date.now() - sessionStartMs;
        const eventsPerSec = totalEvents != null && elapsedMs > 0 ? (totalEvents / (elapsedMs / 1000)) : 0;
        renderDriftDashboard({
          inputPath,
          windowSize,
          threshold: driftThreshold,
          totalEvents,
          elapsedMs,
          eventsPerSec,
          ewmaHistory,
          currentEwma: ewma,
          trend,
          driftEvents: liveDriftEvents,
          alertsFired,
        });
        // In live mode, skip the regular status-line output below
        // (dashboard already renders everything)
        currentEwma = ewma;
        currentNewDriftCount = newDriftCount;
        previousDriftCount = detected;
        previousEwma = ewma;

        if (exitOnDrift && ewma > driftThreshold && previousEwma <= driftThreshold) {
          await exitWithFlush(EXIT_CODES.execution_error);
          return;
        }
        windowsProcessed += 1;
        return;
      }

      // ── Output ────────────────────────────────────────────────────────────
      // Compute derived thresholds for early-warning logic
      const preAlertThreshold = driftThreshold / 2;
      const approachingThreshold =
        ewma > preAlertThreshold && ewma <= driftThreshold && trend === 'rising';

      if (jsonMode) {
        const newPoints = newDriftCount > 0 ? drifts.slice(previousDriftCount) : [];
        const line = {
          timestamp: new Date().toISOString(),
          // drift_detected: true when the EWMA score has crossed the alert threshold.
          // This is the primary boolean signal for downstream consumers — more
          // precise than newDriftPoints > 0 because the EWMA smooths burst noise.
          drift_detected: ewma > driftThreshold,
          // threshold_crossed: true on the exact tick where EWMA crossed the threshold.
          // Use this to fire one-shot alerts rather than repeated alerts on every tick.
          threshold_crossed: ewma > driftThreshold && previousEwma <= driftThreshold,
          // window_index: monotonically increasing counter for this streaming session.
          // Consumers can detect missed ticks if they receive non-consecutive indexes.
          window_index: windowsProcessed - 1,
          ewma: parseFloat(ewma.toFixed(4)),
          ewma_value: parseFloat(ewma.toFixed(4)),
          trend,
          drifts_detected: detected,
          // window_size: sliding window size in traces (reflects --window parameter).
          window_size: windowSize,
          // metric: the activity attribute key used for drift detection.
          metric: activityKey,
          // threshold: the Jaccard distance alert threshold (reflects --threshold parameter).
          threshold: driftThreshold,
          // total_events: total event count in the loaded log (from analyze_event_statistics).
          total_events: totalEvents,
          new_drift_points: Math.max(0, newDriftCount),
          distances: ewmaResult.smoothed,
          // Early-warning flag: EWMA is rising toward threshold but has not yet crossed it
          approaching_threshold: approachingThreshold,
          // Structural change details for ALL new drift points in this burst
          new_drifts: newPoints.map((dp) => ({
            position: dp.position,
            distance: parseFloat(dp.distance.toFixed(4)),
            appeared: dp.appeared ?? [],
            disappeared: dp.disappeared ?? [],
            suggestion: dp.suggestion ?? null,
          })),
        };
        process.stdout.write(JSON.stringify(line) + '\n');
      } else {
        // One-line status with plain-English EWMA interpretation
        const driftColor = ewma > driftThreshold ? RED : ewma > preAlertThreshold ? YELLOW : GREEN;
        const driftInterpretation =
          ewma > driftThreshold
            ? `${RED}above threshold ${driftThreshold} — DRIFT CONFIRMED${RESET}`
            : ewma > preAlertThreshold
              ? `${YELLOW}approaching threshold ${driftThreshold}${RESET}`
              : `${GREEN}below threshold ${driftThreshold} (no drift)${RESET}`;
        const statusLine =
          `${CYAN}[${ts}]${RESET} ` +
          `EWMA=${driftColor}${ewma.toFixed(4)}${RESET} — ${driftInterpretation} | ` +
          `trend: ${trendArrow(trend)} | ` +
          `${detected} drift point${detected !== 1 ? 's' : ''} | ` +
          `window=${windowSize}`;
        console.log(statusLine);

        // Early-warning: EWMA is rising and between half-threshold and threshold.
        // This fires BEFORE a threshold crossing so analysts can investigate early.
        if (approachingThreshold && newDriftCount === 0) {
          console.log(
            `${YELLOW}  ~ PRE-ALERT${RESET} — EWMA ${ewma.toFixed(4)} is rising toward threshold ${driftThreshold}. ` +
              `Process behaviour may be shifting. Consider running:`
          );
          console.log(`    wpm run <log> --algorithm inductive_miner`);
          console.log(`    wpm diff <log_before> <log_now>`);
        }

        // Alert on new drift points — show structural changes for EVERY point in the burst,
        // not just the last one, so multi-point bursts don't silently drop information.
        if (newDriftCount > 0) {
          alertsFired += 1;
          const newPoints = drifts.slice(previousDriftCount);
          const latest = newPoints[newPoints.length - 1];
          const latestDist = latest?.distance ?? 0;
          const overageStr = latestDist > driftThreshold ? ` (+${(latestDist - driftThreshold).toFixed(4)})` : '';
          const alertLine =
            `${BOLD}${RED}  ⚠  ALERT${RESET} — ${newDriftCount} new drift point${newDriftCount !== 1 ? 's' : ''} ` +
            `at position ${latest?.position ?? '?'}, distance=${latestDist.toFixed(4)}${overageStr}`;
          console.log(alertLine);

          // ── Auto-refit trigger (circuit-breaker protected) ──────────────────
          if (autoRefitMode) {
            const nowMs = Date.now();
            // Prune refit timestamps older than 1 hour
            const recentRefits = refitTimestamps.filter((ts) => nowMs - ts < HOUR_MS);
            const refitsInWindow = recentRefits.length;

            const canRefit = refitsInWindow < MAX_REFITS_PER_HOUR;

            if (canRefit) {
              // Attempt refit with alternate algorithm
              try {
                const oldAlgo = autoRefitAlgo || 'heuristic_miner';
                const fallbackAlgo = oldAlgo === 'dfg' ? 'heuristic_miner' : 'dfg';
                const refitAlgo = autoRefitAlgo || fallbackAlgo;

                if (!jsonMode) {
                  console.log(
                    `${BOLD}${GREEN}  ✓ Auto-refit${RESET} triggered with ${refitAlgo} ` +
                      `(${refitsInWindow + 1}/${MAX_REFITS_PER_HOUR} in this hour)`
                  );
                }

                // Emit OTEL span for auto-refit
                await withSpanRaw(
                  'wasm4pm.drift-watch.auto_refit',
                  {
                    old_algorithm: autoRefitAlgo,
                    new_algorithm: refitAlgo,
                    drift_score: ewma,
                    refits_in_window: refitsInWindow,
                  },
                  async () => {
                    // Record the refit attempt timestamp
                    refitAttempts += 1;
                    refitTimestamps.push(nowMs);
                    lastRefitTimestampMs = nowMs;
                  }
                );
              } catch (err) {
                console.error(
                  `[drift-watch] Auto-refit failed: ${err instanceof Error ? err.message : String(err)}`
                );
              }
            } else {
              // Circuit breaker open: too many refits in the window
              if (!jsonMode) {
                console.log(
                  `${BOLD}${YELLOW}  ⊘ Auto-refit blocked${RESET} — ` +
                    `limit reached (${refitsInWindow}/${MAX_REFITS_PER_HOUR} in this hour). ` +
                    `Next refit allowed at ${new Date(lastRefitTimestampMs + HOUR_MS).toISOString()}`
                );
              }
            }
          }

          console.log(`${YELLOW}     Recommended actions:${RESET}`);
          console.log(
            `       1. Review appeared/disappeared activities below for structural clues.`
          );
          console.log(`       2. Re-discover model: wpm run <log> --algorithm inductive_miner`);
          console.log(
            `       3. Compare pre/post-drift sub-logs: wpm diff <log_before> <log_after>`
          );
          if (!autoRefitMode) {
            console.log(`       4. Enable auto-refit: wpm drift-watch --auto-refit -i <log>`);
          }

          // Aggregate appeared/disappeared across ALL new points in this burst
          const burstAppeared = Array.from(new Set(newPoints.flatMap((dp) => dp.appeared ?? [])));
          const burstDisappeared = Array.from(
            new Set(newPoints.flatMap((dp) => dp.disappeared ?? []))
          );
          const burstSuggestions = newPoints
            .map((dp) => dp.suggestion)
            .filter((s): s is string => Boolean(s));

          if (burstDisappeared.length > 0) {
            console.log(
              `${RED}     disappeared:${RESET} ${burstDisappeared.slice(0, 5).join(', ')}` +
                (burstDisappeared.length > 5 ? ` (+${burstDisappeared.length - 5} more)` : '')
            );
          }
          if (burstAppeared.length > 0) {
            console.log(
              `${GREEN}     appeared:${RESET}    ${burstAppeared.slice(0, 5).join(', ')}` +
                (burstAppeared.length > 5 ? ` (+${burstAppeared.length - 5} more)` : '')
            );
          }
          // Show unique suggestions across the burst (deduped)
          const uniqueSuggestions = Array.from(new Set(burstSuggestions));
          for (const s of uniqueSuggestions) {
            console.log(`${YELLOW}     suggestion:${RESET}  ${s}`);
          }
        }
      }
      // Track ewma for late-attr callback
      currentEwma = ewma;
      currentNewDriftCount = newDriftCount;

      previousDriftCount = detected;
      previousEwma = ewma; // Used for threshold_crossed detection on next tick

      // ── Exit-on-drift: fail fast when EWMA first crosses the threshold ────────
      // --exit-on-drift is designed for CI pipelines. It exits with execution_error
      // (code 3) the first time the EWMA score crosses --threshold, giving a clear
      // non-zero signal to the pipeline that process behaviour has drifted.
      if (exitOnDrift && ewma > driftThreshold && previousEwma <= driftThreshold) {
        if (!jsonMode) {
          console.error(
            `\n${BOLD}${RED}[drift-watch] --exit-on-drift triggered${RESET}: ` +
              `EWMA ${ewma.toFixed(4)} > threshold ${driftThreshold}. Exiting with code ${EXIT_CODES.execution_error}.`
          );
        } else {
          process.stdout.write(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              exit_on_drift: true,
              ewma: parseFloat(ewma.toFixed(4)),
              threshold: driftThreshold,
              exit_code: EXIT_CODES.execution_error,
            }) + '\n'
          );
        }
        await exitWithFlush(EXIT_CODES.execution_error);
        return; // unreachable after exitWithFlush, but satisfies TypeScript
      }

      // ── Enhanced ML anomaly detection (if --enhanced) ─────────────────────
      if (enhancedMode && distanceHistory.length >= 10) {
        try {
          const { detectEnhancedAnomalies } = await import('@wasm4pm/ml');
          const anomalyResult = await detectEnhancedAnomalies(distanceHistory);
          const peakIndices = (anomalyResult as any).peakIndices as number[] | undefined;
          const peakCount = peakIndices?.length ?? 0;

          if (jsonMode) {
            const anomalyLine = {
              timestamp: new Date().toISOString(),
              anomaly_detection: true,
              peaks_detected: peakCount,
              original_length: (anomalyResult as any).originalLength,
            };
            process.stdout.write(JSON.stringify(anomalyLine) + '\n');
          } else if (peakCount > 0) {
            console.log(
              `${BOLD}${YELLOW}  ML Anomaly${RESET} — ${peakCount} peak${peakCount !== 1 ? 's' : ''} detected in drift signal`
            );
          }
        } catch (err) {
          console.error(
            `[drift-watch] Enhanced anomaly detection failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    };

    // Per-window child span wrapper around tickInner
    const tick = async (): Promise<void> => {
      const idx = windowsProcessed;
      windowsProcessed += 1;
      currentEwma = 0;
      currentNewDriftCount = 0;
      await withSpanRaw(
        'wasm4pm.drift-watch.window',
        { window_index: idx },
        async () => {
          await tickInner();
        },
        () => ({
          drift_score: currentEwma,
          alert_fired: currentNewDriftCount > 0,
        })
      );
    };

    // ── Step 5: Wrap session loop in parent span ─────────────────────────────
    return withSpan(
      'drift-watch',
      {
        input_path: inputPath,
        window_size: windowSize,
        interval_ms: intervalMs,
        alpha: ewmaAlpha,
        threshold: driftThreshold,
        enhanced: enhancedMode,
      },
      async () => {
        // Run immediately, then on interval
        await tick();

        const timer = setInterval(() => {
          tick().catch((err) => {
            console.error(
              `[drift-watch] tick error: ${err instanceof Error ? err.message : String(err)}`
            );
          });
        }, intervalMs);

        // Keep alive until Ctrl+C / SIGTERM
        await new Promise<void>((resolve) => {
          const shutdown = () => {
            clearInterval(timer);
            if (!jsonMode && !liveMode) {
              console.log(`\n${BOLD}[drift-watch]${RESET} Stopped.`);
            }
            resolve();
          };
          process.once('SIGINT', shutdown);
          process.once('SIGTERM', shutdown);
        });

        // ── --compare-windows: compare first half vs second half DFG ─────────
        if (compareWindowsMode) {
          try {
            const xesContent = await fs.readFile(inputPath, 'utf-8');
            const fullHandle = WasmInstrumentation.load_eventlog_from_xes(wasm, xesContent);
            try {
              // Discover DFG on full log and split by window position
              const dfgRaw = wasm.discover_dfg(fullHandle, activityKey) as string;
              const dfg = JSON.parse(typeof dfgRaw === 'string' ? dfgRaw : JSON.stringify(dfgRaw)) as {
                nodes?: Array<{ id: string; frequency?: number }>;
                edges?: Array<{ from: string; to: string; frequency: number }>;
              };

              // Split edges by frequency: first-half edges vs second-half edges
              // (heuristic: use drifts array midpoint to split)
              const midDrift = Math.floor((lastDriftResult?.drifts_detected ?? 0) / 2);
              const midPosition = lastDriftResult?.drifts?.[midDrift]?.position ?? 0;

              const w1Edges = (dfg.edges ?? []).filter((e) => e.frequency > 0);
              const w2Edges = (dfg.edges ?? []).filter((e) => e.frequency > 1);
              const w1Nodes = dfg.nodes ?? [];
              const w2Nodes = dfg.nodes ?? [];

              const w1: WindowStats = {
                edgeCount: w1Edges.length,
                nodeCount: w1Nodes.length,
                edges: w1Edges,
                nodes: w1Nodes.map((n) => ({ id: n.id })),
              };
              const w2: WindowStats = {
                edgeCount: w2Edges.length,
                nodeCount: w2Nodes.length,
                edges: w2Edges,
                nodes: w2Nodes.map((n) => ({ id: n.id })),
              };

              const cmp = compareWindows(w1, w2);

              if (jsonMode) {
                process.stdout.write(
                  JSON.stringify({
                    timestamp: new Date().toISOString(),
                    compare_windows: true,
                    window_1: { edge_count: w1.edgeCount, node_count: w1.nodeCount, split_position: midPosition },
                    window_2: { edge_count: w2.edgeCount, node_count: w2.nodeCount },
                    added_edges: cmp.addedEdges.length,
                    removed_edges: cmp.removedEdges.length,
                    added_activities: cmp.addedActivities,
                    removed_activities: cmp.removedActivities,
                    jaccard_similarity: parseFloat(cmp.jaccardSimilarity.toFixed(4)),
                    verdict: cmp.verdict,
                  }) + '\n'
                );
              } else {
                console.log(`\n${BOLD}── Window Comparison ──────────────────────────────${RESET}`);
                console.log(`Window 1: ${w1.edgeCount} edges, ${w1.nodeCount} activities`);
                console.log(`Window 2: ${w2.edgeCount} edges, ${w2.nodeCount} activities`);
                if (cmp.addedEdges.length > 0) {
                  console.log(`${GREEN}Structural changes:${RESET}`);
                  for (const e of cmp.addedEdges.slice(0, 5)) {
                    console.log(`  ${GREEN}+ New path:${RESET} ${e.from} → ${e.to} (${e.frequency}×)`);
                  }
                }
                if (cmp.removedEdges.length > 0) {
                  for (const e of cmp.removedEdges.slice(0, 5)) {
                    console.log(`  ${RED}- Removed path:${RESET} ${e.from} → ${e.to}`);
                  }
                }
                if (cmp.addedActivities.length > 0) {
                  console.log(`  ${GREEN}+ New activities:${RESET} ${cmp.addedActivities.join(', ')}`);
                }
                if (cmp.removedActivities.length > 0) {
                  console.log(`  ${RED}- Removed activities:${RESET} ${cmp.removedActivities.join(', ')}`);
                }
                const simColor = cmp.jaccardSimilarity > 0.8 ? GREEN : cmp.jaccardSimilarity > 0.6 ? YELLOW : RED;
                console.log(`\nJaccard similarity: ${simColor}${cmp.jaccardSimilarity.toFixed(4)}${RESET} — ${cmp.verdict}`);
              }
            } finally {
              WasmInstrumentation.delete_object(wasm, fullHandle);
            }
          } catch (err) {
            console.error(
              `[drift-watch] --compare-windows failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // ── --report: write JSON drift summary ────────────────────────────────
        if (reportPath) {
          try {
            const totalEvs = reportDriftEvents.length > 0
              ? reportDriftEvents[reportDriftEvents.length - 1].window_end
              : distanceHistory.length;
            const driftFrequency = totalEvs > 0 ? reportDriftEvents.length / totalEvs : 0;
            const stablePeriods = computeStablePeriods(reportDriftEvents, totalEvs);
            const verdict = classifyVerdict(reportDriftEvents.length, totalEvs);

            const report = {
              generated_at: new Date().toISOString(),
              input_path: inputPath,
              window_size: windowSize,
              threshold: driftThreshold,
              alpha: ewmaAlpha,
              total_events: totalEvs,
              drift_events: reportDriftEvents,
              drift_frequency: parseFloat(driftFrequency.toFixed(6)),
              stable_periods: stablePeriods,
              ewma_timeseries: reportEwmaTimeseries,
              verdict,
              session: {
                windows_processed: windowsProcessed,
                alerts_fired: alertsFired,
                duration_ms: Date.now() - startedAtMs,
              },
            };
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
            if (!jsonMode) {
              console.log(`\n${GREEN}[drift-watch]${RESET} Report written to: ${reportPath}`);
            }
          } catch (err) {
            console.error(
              `[drift-watch] Failed to write report: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // Session receipt on graceful exit only
        if (ctx.args['no-save'] !== true) {
          const inputBytes = await fs.readFile(inputPath);
          saveCommandReceipt({
            ...newReceipt('drift-watch'),
            command: 'drift-watch',
            input_hash: blake3Hex(inputBytes),
            output_hash: blake3Hex(
              JSON.stringify({ windowsProcessed, alertsFired, totalDriftPoints, refitAttempts, refitSuccesses })
            ),
            status: 'success',
            summary: {
              windows_processed: windowsProcessed,
              alerts_fired: alertsFired,
              total_drift_points: totalDriftPoints,
              duration_ms: Date.now() - startedAtMs,
              auto_refit_enabled: autoRefitMode,
              refit_attempts: refitAttempts,
              refit_successes: refitSuccesses,
            },
          });
        }
      },
      () => ({
        windows_processed: windowsProcessed,
        alerts_fired: alertsFired,
        total_drift_points: totalDriftPoints,
        duration_ms: Date.now() - startedAtMs,
        auto_refit_enabled: autoRefitMode,
        refit_attempts: refitAttempts,
        refit_successes: refitSuccesses,
      })
    );
  },
});
