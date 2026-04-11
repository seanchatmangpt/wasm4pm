import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { stat } from 'fs/promises';
import { WasmLoader } from '@pictl/engine';
import { EXIT_CODES } from '../exit-codes.js';

const EWMA_ALPHA = 0.3;
const DRIFT_THRESHOLD = 0.3;
const DEFAULT_WINDOW = 50;
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_ACTIVITY_KEY = 'concept:name';

// ANSI colour helpers
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

interface DriftResult {
  drifts_detected: number;
  drifts: Array<{ position: number; distance: number; type: string }>;
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
      'Stream EWMA drift monitoring — watches an XES file for concept drift in real-time',
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
      description: 'Emit newline-delimited JSON instead of human-readable output',
    },
    enhanced: {
      type: 'boolean',
      description: 'Enable ML-enhanced anomaly detection alongside EWMA drift monitoring',
    },
  },

  async run(ctx) {
    const inputPath: string = ctx.args.input as string;
    const activityKey: string = (ctx.args['activity-key'] as string) || DEFAULT_ACTIVITY_KEY;

    const rawWindow = ctx.args.window as string | undefined;
    const parsedWindow = rawWindow != null ? parseInt(rawWindow, 10) : undefined;
    if (parsedWindow !== undefined && Number.isNaN(parsedWindow)) {
      console.error(`[drift-watch] Invalid --window value: must be a number`);
      process.exit(EXIT_CODES.config_error);
    }
    const windowSize = parsedWindow ?? DEFAULT_WINDOW;

    const rawInterval = ctx.args.interval as string | undefined;
    const parsedInterval = rawInterval != null ? parseInt(rawInterval, 10) : undefined;
    if (parsedInterval !== undefined && Number.isNaN(parsedInterval)) {
      console.error(`[drift-watch] Invalid --interval value: must be a number`);
      process.exit(EXIT_CODES.config_error);
    }
    const intervalMs = parsedInterval ?? DEFAULT_INTERVAL_MS;

    const rawAlpha = ctx.args.alpha as string | undefined;
    const parsedAlpha = rawAlpha != null ? parseFloat(rawAlpha) : undefined;
    if (parsedAlpha !== undefined && Number.isNaN(parsedAlpha)) {
      console.error(`[drift-watch] Invalid --alpha value: must be a number`);
      process.exit(EXIT_CODES.config_error);
    }
    const ewmaAlpha = parsedAlpha ?? EWMA_ALPHA;

    const rawThreshold = ctx.args.threshold as string | undefined;
    const parsedThreshold = rawThreshold != null ? parseFloat(rawThreshold) : undefined;
    if (parsedThreshold !== undefined && Number.isNaN(parsedThreshold)) {
      console.error(`[drift-watch] Invalid --threshold value: must be a number`);
      process.exit(EXIT_CODES.config_error);
    }
    const driftThreshold = parsedThreshold ?? DRIFT_THRESHOLD;
    const jsonMode: boolean = ctx.args.json === true;
    const enhancedMode: boolean = ctx.args.enhanced === true;

    // ── Step 1: Validate input file ──────────────────────────────────────────
    try {
      await fs.access(inputPath);
    } catch {
      console.error(`[drift-watch] Input file not found: ${inputPath}`);
      process.exit(EXIT_CODES.source_error);
    }

    // ── Step 2: Load WASM ────────────────────────────────────────────────────
    const loader = WasmLoader.getInstance();
    try {
      await loader.init();
    } catch (err) {
      console.error(
        `[drift-watch] Failed to initialise WASM: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(EXIT_CODES.execution_error);
    }
    const wasm = loader.get();

    // ── Step 3: State for incremental monitoring ─────────────────────────────
    let previousDriftCount = 0;
    let previousMtimeMs = 0;
    const distanceHistory: number[] = [];
    const MAX_DISTANCE_HISTORY = 10_000;

    if (!jsonMode) {
      console.log(`${BOLD}[drift-watch]${RESET} Streaming EWMA drift monitor started`);
      console.log(
        `  file=${inputPath}  activity-key=${activityKey}  window=${windowSize}  interval=${intervalMs}ms  α=${ewmaAlpha}  threshold=${driftThreshold}`
      );
      console.log('  Press Ctrl+C to stop.\n');
    }

    // ── Step 4: Poll loop ─────────────────────────────────────────────────────
    const tick = async (): Promise<void> => {
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
        console.error(
          `[drift-watch] Could not read file: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      let logHandle: string;
      try {
        logHandle = wasm.load_eventlog_from_xes(xesContent) as string;
      } catch (err) {
        console.error(
          `[drift-watch] XES parse error: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      // ── detect_drift ────────────────────────────────────────────────────────
      let driftResult: DriftResult;
      try {
        const raw: string = wasm.detect_drift(logHandle, activityKey, windowSize) as string;
        driftResult = JSON.parse(raw) as DriftResult;
      } catch (err) {
        console.error(
          `[drift-watch] detect_drift failed: ${err instanceof Error ? err.message : String(err)}`
        );
        try {
          wasm.delete_object(logHandle);
        } catch {
          /* best-effort */
        }
        return;
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
        try {
          wasm.delete_object(logHandle);
        } catch {
          /* best-effort */
        }
        return;
      }

      // ── Free WASM handle ──────────────────────────────────────────────────
      try {
        wasm.delete_object(logHandle);
      } catch {
        /* best-effort */
      }

      const ewma = ewmaResult.last_value ?? 0;
      const trend = ewmaResult.trend;
      const ts = timestamp();

      // ── Output ────────────────────────────────────────────────────────────
      if (jsonMode) {
        const line = {
          timestamp: new Date().toISOString(),
          ewma: parseFloat(ewma.toFixed(4)),
          trend,
          drifts_detected: detected,
          window_size: windowSize,
          new_drift_points: Math.max(0, newDriftCount),
          distances: ewmaResult.smoothed,
        };
        process.stdout.write(JSON.stringify(line) + '\n');
      } else {
        // One-line status
        const driftColor = ewma > driftThreshold ? RED : ewma > driftThreshold / 2 ? YELLOW : GREEN;
        const statusLine =
          `${CYAN}[${ts}]${RESET} ` +
          `drift=${driftColor}${ewma.toFixed(4)}${RESET} (${trendArrow(trend)}) | ` +
          `${detected} drift point${detected !== 1 ? 's' : ''} detected | ` +
          `window=${windowSize}`;
        console.log(statusLine);

        // Alert on new drift points
        if (newDriftCount > 0) {
          const latest = drifts[drifts.length - 1];
          const alertLine =
            `${BOLD}${RED}  ⚠  ALERT${RESET} — ${newDriftCount} new drift point${newDriftCount !== 1 ? 's' : ''} ` +
            `at position ${latest?.position ?? '?'}, distance=${(latest?.distance ?? 0).toFixed(4)}`;
          console.log(alertLine);
        }
      }

      previousDriftCount = detected;

      // ── Enhanced ML anomaly detection (if --enhanced) ─────────────────────
      if (enhancedMode && distanceHistory.length >= 10) {
        try {
          const { detectEnhancedAnomalies } = await import('@pictl/ml');
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

    // Run immediately, then on interval
    await tick();

    const timer = setInterval(() => {
      tick().catch((err) => {
        console.error(
          `[drift-watch] tick error: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, intervalMs);

    // ── Step 5: Keep alive until Ctrl+C ─────────────────────────────────────
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        clearInterval(timer);
        if (!jsonMode) {
          console.log(`\n${BOLD}[drift-watch]${RESET} Stopped.`);
        }
        resolve();
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });
  },
});
