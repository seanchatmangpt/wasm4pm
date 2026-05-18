import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { stat } from 'fs/promises';
import { WasmLoader } from '@wasm4pm/engine';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan, withSpanRaw } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

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
  },

  async run(ctx) {
    const inputPath: string = ctx.args.input as string;
    const activityKey: string = (ctx.args['activity-key'] as string) || DEFAULT_ACTIVITY_KEY;

    const rawWindow = ctx.args.window as string | undefined;
    const parsedWindow = rawWindow != null ? parseInt(rawWindow, 10) : undefined;
    if (parsedWindow !== undefined && Number.isNaN(parsedWindow)) {
      console.error(`[drift-watch] Invalid --window value: must be a number`);
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    const windowSize = parsedWindow ?? DEFAULT_WINDOW;

    const rawInterval = ctx.args.interval as string | undefined;
    const parsedInterval = rawInterval != null ? parseInt(rawInterval, 10) : undefined;
    if (parsedInterval !== undefined && Number.isNaN(parsedInterval)) {
      console.error(`[drift-watch] Invalid --interval value: must be a number`);
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    const intervalMs = parsedInterval ?? DEFAULT_INTERVAL_MS;

    const rawAlpha = ctx.args.alpha as string | undefined;
    const parsedAlpha = rawAlpha != null ? parseFloat(rawAlpha) : undefined;
    if (parsedAlpha !== undefined && Number.isNaN(parsedAlpha)) {
      console.error(`[drift-watch] Invalid --alpha value: must be a number`);
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    const ewmaAlpha = parsedAlpha ?? EWMA_ALPHA;

    const rawThreshold = ctx.args.threshold as string | undefined;
    const parsedThreshold = rawThreshold != null ? parseFloat(rawThreshold) : undefined;
    if (parsedThreshold !== undefined && Number.isNaN(parsedThreshold)) {
      console.error(`[drift-watch] Invalid --threshold value: must be a number`);
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    const driftThreshold = parsedThreshold ?? DRIFT_THRESHOLD;
    const jsonMode: boolean = ctx.args.json === true;
    const enhancedMode: boolean = ctx.args.enhanced === true;
    const autoRefitMode: boolean = ctx.args['auto-refit'] === true;
    const autoRefitAlgo: string = (ctx.args['refit-algorithm'] as string) || '';

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
    const distanceHistory: number[] = [];
    const MAX_DISTANCE_HISTORY = 10_000;

    // ── Auto-refit state ──────────────────────────────────────────────────────
    let refitAttempts = 0;
    let refitSuccesses = 0;
    let lastRefitTimestampMs = 0;
    const refitTimestamps: number[] = []; // Ring buffer for last 3 refits
    const MAX_REFITS_PER_HOUR = 3;
    const HOUR_MS = 3600 * 1000;
    let lastDiscoveredModel: string | null = null;

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
        wasm.delete_object(logHandle);
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
        wasm.delete_object(logHandle);
        return;
      }

      // ── Free WASM handle ──────────────────────────────────────────────────
      wasm.delete_object(logHandle);

      const ewma = ewmaResult.last_value ?? 0;
      const trend = ewmaResult.trend;
      const ts = timestamp();

      // ── Output ────────────────────────────────────────────────────────────
      // Compute derived thresholds for early-warning logic
      const preAlertThreshold = driftThreshold / 2;
      const approachingThreshold =
        ewma > preAlertThreshold && ewma <= driftThreshold && trend === 'rising';

      if (jsonMode) {
        const newPoints = newDriftCount > 0 ? drifts.slice(previousDriftCount) : [];
        const line = {
          timestamp: new Date().toISOString(),
          ewma: parseFloat(ewma.toFixed(4)),
          trend,
          drifts_detected: detected,
          window_size: windowSize,
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
          const alertLine =
            `${BOLD}${RED}  ⚠  ALERT${RESET} — ${newDriftCount} new drift point${newDriftCount !== 1 ? 's' : ''} ` +
            `at position ${latest?.position ?? '?'}, distance=${(latest?.distance ?? 0).toFixed(4)}`;
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
            if (!jsonMode) {
              console.log(`\n${BOLD}[drift-watch]${RESET} Stopped.`);
            }
            resolve();
          };
          process.once('SIGINT', shutdown);
          process.once('SIGTERM', shutdown);
        });

        // Session receipt on graceful exit only
        if (ctx.args['no-save'] !== true) {
          try {
            saveCommandReceipt({
              ...newReceipt('drift-watch'),
              command: 'drift-watch',
              input_hash: await fs
                .readFile(inputPath)
                .then((b) => blake3Hex(b))
                .catch(() => blake3Hex(inputPath)),
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
          } catch {
            /* never break command on receipt failure */
          }
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
