import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import chokidar from 'chokidar';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { createFullEngine, WasmLoader } from '@wasm4pm/engine';
import type { ExecutionPlan } from "@wasm4pm/planner";
import { getTracer, WatchingSpans } from '@wasm4pm/observability';
import { WasmBackend } from 'wasm4pm';
import { plan } from '@wasm4pm/planner';
import type { OtelSpan } from '@wasm4pm/cognition';
import { StreamingOutput } from '../output.js';
import { withSpanRaw } from './_otel.js';
import { getGlobalSpanSink } from '../otel/sink.js';
import { exitWithFlush } from '../otel/exit.js';
import { runDiscovery, type Algorithm } from './run.js';
import { WasmInstrumentation } from './_wasm-instrumentation.js';
import { selectAutopilotAlgorithm, type LogStats } from './watch-autopilot.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

/**
 * Config snapshot helpers for what-changed display
 */

// ─── Model diff helpers ────────────────────────────────────────────────────────
//
// After each autopilot discovery run, we compare the current DFG against the
// previous run to show edge-level changes. This helps practitioners understand
// what actually changed in the process model between two cycles.

interface DfgEdge {
  from: string;
  to: string;
  frequency: number;
}

interface DfgModel {
  nodes?: Array<{ id: string; frequency?: number }>;
  edges?: DfgEdge[];
}

interface ModelDiff {
  addedEdges: DfgEdge[];
  removedEdges: DfgEdge[];
  changedEdges: Array<{ from: string; to: string; freqBefore: number; freqAfter: number }>;
  addedNodes: string[];
  removedNodes: string[];
}

/**
 * Compute the structural diff between two DFG models.
 * Returns sets of added/removed/changed edges and nodes.
 */
function diffDfgModels(prev: DfgModel, next: DfgModel): ModelDiff {
  const edgeKey = (e: DfgEdge) => `${e.from}→${e.to}`;

  const prevEdges = new Map<string, DfgEdge>();
  for (const e of prev.edges ?? []) prevEdges.set(edgeKey(e), e);

  const nextEdges = new Map<string, DfgEdge>();
  for (const e of next.edges ?? []) nextEdges.set(edgeKey(e), e);

  const addedEdges: DfgEdge[] = [];
  const removedEdges: DfgEdge[] = [];
  const changedEdges: ModelDiff['changedEdges'] = [];

  for (const [k, e] of nextEdges) {
    const p = prevEdges.get(k);
    if (!p) {
      addedEdges.push(e);
    } else if (p.frequency !== e.frequency) {
      changedEdges.push({ from: e.from, to: e.to, freqBefore: p.frequency, freqAfter: e.frequency });
    }
  }
  for (const [k, e] of prevEdges) {
    if (!nextEdges.has(k)) removedEdges.push(e);
  }

  const prevNodeIds = new Set((prev.nodes ?? []).map((n) => n.id));
  const nextNodeIds = new Set((next.nodes ?? []).map((n) => n.id));
  const addedNodes = [...nextNodeIds].filter((id) => !prevNodeIds.has(id));
  const removedNodes = [...prevNodeIds].filter((id) => !nextNodeIds.has(id));

  return { addedEdges, removedEdges, changedEdges, addedNodes, removedNodes };
}

/**
 * Extract a comparable snapshot from a resolved config object.
 * Only captures the fields a practitioner cares about (algorithm, source, profile, log level).
 */
function snapshotConfig(cfg: Record<string, unknown>): Record<string, unknown> {
  const alg = cfg['algorithm'] as Record<string, unknown> | undefined;
  const src = cfg['source'] as Record<string, unknown> | undefined;
  const exec = cfg['execution'] as Record<string, unknown> | undefined;
  const obs = cfg['observability'] as Record<string, unknown> | undefined;
  return {
    algorithm: alg?.['name'] ?? null,
    algorithmParams: JSON.stringify(alg?.['parameters'] ?? {}),
    sourceKind: src?.['kind'] ?? null,
    sourcePath: src?.['path'] ?? null,
    profile: exec?.['profile'] ?? null,
    logLevel: obs?.['logLevel'] ?? null,
  };
}

/**
 * Produce a human-readable list of changed fields between two config snapshots.
 * Returns an empty array when the effective config is unchanged.
 */
function diffConfigSnapshots(
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      changes.push({ field: key, from: prev[key], to: next[key] });
    }
  }
  return changes;
}

export interface WatchOptions {
  config?: string;
  format?: 'human' | 'json';
  interval?: number;
  verbose?: boolean;
  quiet?: boolean;
}

export const watch = defineCommand({
  meta: {
    name: 'watch',
    description: `Watch config file for changes, auto-discover. Ex: wpm watch

${STANDARD_EXIT_CODE_DOCS}`,
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to configuration file (JSON/YAML)',
    },
    interval: {
      type: 'string',
      description: 'Polling interval in milliseconds',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose logging',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
    },
    autopilot: {
      type: 'boolean',
      description: 'Auto-select algorithm based on log size and complexity each cycle',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
    },
  },
  async run(ctx) {
    // Validate --interval when provided: must be a positive integer.
    // An invalid value is a config_error (exit 1) — fail fast before starting the watcher.
    const rawInterval = ctx.args.interval as string | undefined;
    let pollIntervalMs: number | undefined;
    if (rawInterval !== undefined) {
      const parsed = parseInt(rawInterval, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        process.stderr.write(
          `wpm watch: invalid --interval value "${rawInterval}". Must be a positive integer (milliseconds).\n`
        );
        process.exit(1);
      }
      pollIntervalMs = parsed;
    }

    const streaming = new StreamingOutput({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    const tracer = getTracer();
    const configPath = ctx.args.config || process.cwd();

    // Manual parent span skeleton (long-running command — emit on shutdown).
    const parentTraceId = randomBytes(16).toString('hex');
    const parentSpanId = randomBytes(8).toString('hex');
    const parentStartNs = Date.now() * 1_000_000;
    let cyclesObserved = 0;
    let parentStatus: 'OK' | 'ERROR' = 'OK';

    const emitParentSpan = (): void => {
      try {
        const parentSpan: OtelSpan = {
          trace_id: parentTraceId,
          span_id: parentSpanId,
          name: 'wasm4pm.command.watch',
          kind: 'INTERNAL',
          start_time: parentStartNs,
          end_time: Date.now() * 1_000_000,
          status: { code: parentStatus },
          attributes: {
            'service.name': 'wasm4pm',
            command: 'watch',
            config_path: configPath,
            cycles_observed: cyclesObserved,
          },
        };
        getGlobalSpanSink()(parentSpan);
      } catch {
        /* never block on OTEL */
      }
    };

    // Step 1: Initialize Engine and Backends
    const wasmLoader = WasmLoader.getInstance();
    await wasmLoader.init();

    const kernel = new WasmBackend();
    await kernel.init();

    // In a real implementation, we'd use a more sophisticated planner/executor
    const engine = createFullEngine(
      kernel as any,
      plan as any,
      {
        run: async (p: ExecutionPlan) => {
          streaming.emitEvent('executing', { plan: p.id });
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { run_id: 'watch-run', status: 'success', payload: {} } as any;
        },
      } as any
    );

    streaming.startStream();
    streaming.emitEvent('initialized', {
      config: configPath,
      timestamp: new Date().toISOString(),
    });

    // Load initial config snapshot so the first change cycle always has a baseline to diff against.
    // If this fails (e.g. no config file yet), the first cycle emits no diff — non-fatal.
    let prevConfigSnapshot: Record<string, unknown> | null = null;
    try {
      const initialConfig = await loadConfig({ configSearchPaths: [configPath] });
      prevConfigSnapshot = snapshotConfig(initialConfig as unknown as Record<string, unknown>);
    } catch {
      /* initial config load failure is non-fatal — watch proceeds without a baseline */
    }

    // Track the DFG model from the previous autopilot run so we can emit a
    // model-level diff event on each cycle (e.g. "3 new edges, 1 removed").
    let prevDfgModel: DfgModel | null = null;

    // Step 2: Set up Watcher using chokidar for better cross-platform support
    const watchPath = path.resolve(configPath);
    const watcher = chokidar.watch(watchPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      // Use --interval as polling interval when provided (usePolling required for interval to take effect)
      ...(pollIntervalMs !== undefined ? { usePolling: true, interval: pollIntervalMs } : {}),
    });

    // Count watched paths for the startup status line.
    // chokidar resolves globs lazily — use a small delay so the watcher has time to
    // enumerate the initial file set before we report the count.
    let watchedCount = 1; // at minimum the root path itself
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const watched = watcher.getWatched();
      watchedCount = Object.values(watched).reduce((sum, files) => sum + files.length, 0) || 1;
    } catch {
      /* getWatched() failure is non-fatal */
    }

    streaming.emitEvent('watching', {
      path: watchPath,
      files_count: watchedCount,
      message: `Watching ${watchedCount} file(s) in ${watchPath} — press Ctrl+C to stop`,
    });

    // Per-file debouncers prevent editor-save bursts from flooding spans.
    // --interval wires directly to the debounce window so practitioners can
    // tune for fast-feedback (low ms) vs. noisy-editor (high ms) workflows.
    const debouncers = new Map<string, NodeJS.Timeout>();
    const rawIntervalStr = ctx.args.interval as string | undefined;
    const parsedInterval = rawIntervalStr !== undefined ? parseInt(rawIntervalStr, 10) : NaN;
    const DEBOUNCE_MS = !Number.isNaN(parsedInterval) && parsedInterval > 0 ? parsedInterval : 200;

    // Handle file deletion gracefully: emit a warning event and continue watching.
    // The watcher keeps running so that if the file is recreated it will resume.
    watcher.on('unlink', (filePath: string) => {
      streaming.emitEvent('file_deleted', {
        file: filePath,
        message: `Watched file deleted: ${filePath} — watching for recreation`,
      });
      // Reset the previous config snapshot and DFG model so the next change cycle
      // detects the new file as a fresh baseline rather than diffing against stale state.
      prevConfigSnapshot = null;
      prevDfgModel = null;
    });

    watcher.on('change', (filePath: string) => {
      const existing = debouncers.get(filePath);
      if (existing) clearTimeout(existing);
      debouncers.set(
        filePath,
        setTimeout(async () => {
          debouncers.delete(filePath);
          const idx = cyclesObserved;
          cyclesObserved += 1;
          const span = tracer.startSpan(WatchingSpans.heartbeat());

          // Capture modification time before entering the async span so the
          // practitioner sees exactly when the file was written, not when
          // Node.js scheduled the debounced callback.
          let mtime: string | null = null;
          try {
            const stat = await fs.stat(filePath);
            mtime = stat.mtime.toISOString();
          } catch {
            /* stat failure is non-fatal — mtime stays null */
          }

          try {
            await withSpanRaw(
              'wasm4pm.watch.cycle',
              {
                event_kind: 'change',
                cycle_index: idx,
                file_path: filePath,
                mtime: mtime ?? 'unknown',
              },
              async () => {
                streaming.emitEvent('change_detected', {
                  file: filePath,
                  mtime: mtime ?? 'unknown',
                  cycle: idx + 1,
                });

                // Reload config
                const config = await loadConfig({ configSearchPaths: [configPath] });

                // What-changed display: diff the new config against the last snapshot.
                // This tells the practitioner which config field triggered the re-run.
                const nextSnapshot = snapshotConfig(config as unknown as Record<string, unknown>);
                if (prevConfigSnapshot !== null) {
                  const changes = diffConfigSnapshots(prevConfigSnapshot, nextSnapshot);
                  if (changes.length > 0) {
                    streaming.emitEvent('config_changed', {
                      file: filePath,
                      changes: changes.map((c) => ({
                        field: c.field,
                        from: c.from,
                        to: c.to,
                        summary: `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`,
                      })),
                    });
                  } else {
                    // File changed but effective config values are identical (e.g., whitespace edit).
                    streaming.emitEvent('config_unchanged', {
                      file: filePath,
                      message: 'File changed but effective config is unchanged — re-running anyway',
                    });
                  }
                }
                prevConfigSnapshot = nextSnapshot;

                const executionPlan = plan(config as any);

                streaming.emitEvent('processing_started', {
                  planId: executionPlan.id,
                  steps: executionPlan.steps.length,
                });

                // Autopilot: run real WASM discovery when --autopilot is set
                // and the changed file is an XES log (not a config file).
                if (ctx.args.autopilot && filePath.endsWith('.xes')) {
                  try {
                    const wasm = wasmLoader.get() as Record<
                      string,
                      (...args: unknown[]) => unknown
                    >;
                    const activityKey =
                      (ctx.args['activity-key'] as string | undefined) ?? 'concept:name';
                    const xesContent = await fs.readFile(filePath, 'utf8');
                    const t0 = Date.now();
                    // INSTRUMENTED: load_eventlog_from_xes — one of the top 10 most-called WASM exports
                    const handle = WasmInstrumentation.load_eventlog_from_xes(wasm, xesContent);

                    try {
                      // INSTRUMENTED: analyze_event_statistics — bonus instrumentation related to load
                      const statsRaw = WasmInstrumentation.analyze_event_statistics(wasm, handle, activityKey);
                      const stats = (
                        typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw
                      ) as LogStats;
                      const { algo, rationale } = selectAutopilotAlgorithm(stats);

                      streaming.emitEvent('autopilot_selected', {
                        algorithm: algo,
                        rationale,
                        stats,
                      });

                      const result = await runDiscovery(wasm, algo, handle, activityKey);
                      let { raw, elapsedMs } = result;
                      const model = typeof raw === 'string' ? JSON.parse(raw) : raw;
                      const elapsed = Date.now() - t0;

                      // Write autopilot.json for tooling and dashboards
                      const autopilotRecord = {
                        cycle: cyclesObserved,
                        timestamp: new Date().toISOString(),
                        log: filePath,
                        stats,
                        selected: algo,
                        rationale,
                        elapsedMs: elapsed,
                      };
                      const autopilotPath = path.join(process.cwd(), '.wasm4pm', 'autopilot.json');
                      await fs.mkdir(path.dirname(autopilotPath), { recursive: true });
                      await fs.writeFile(autopilotPath, JSON.stringify(autopilotRecord, null, 2));

                      // Model-level diff: compare current DFG against previous run.
                      // Only DFG-output algorithms produce edges/nodes; skip for other output types.
                      const currentDfg = model as DfgModel;
                      if (
                        prevDfgModel !== null &&
                        typeof currentDfg === 'object' &&
                        Array.isArray(currentDfg.edges)
                      ) {
                        const diff = diffDfgModels(prevDfgModel, currentDfg);
                        const totalChanges =
                          diff.addedEdges.length +
                          diff.removedEdges.length +
                          diff.changedEdges.length +
                          diff.addedNodes.length +
                          diff.removedNodes.length;
                        if (totalChanges > 0) {
                          streaming.emitEvent('model_diff', {
                            added_edges: diff.addedEdges.length,
                            removed_edges: diff.removedEdges.length,
                            changed_edges: diff.changedEdges.length,
                            added_nodes: diff.addedNodes.length,
                            removed_nodes: diff.removedNodes.length,
                            summary: `+${diff.addedEdges.length} edges  -${diff.removedEdges.length} edges  ~${diff.changedEdges.length} changed  +${diff.addedNodes.length} nodes  -${diff.removedNodes.length} nodes`,
                            // Top-5 added edges for human inspection
                            added_edge_samples: diff.addedEdges.slice(0, 5).map((e) => `${e.from}→${e.to} (×${e.frequency})`),
                            removed_edge_samples: diff.removedEdges.slice(0, 5).map((e) => `${e.from}→${e.to}`),
                          });
                        } else {
                          streaming.emitEvent('model_unchanged', {
                            message: 'DFG model is structurally identical to previous run',
                            edges: currentDfg.edges?.length ?? 0,
                            nodes: currentDfg.nodes?.length ?? 0,
                          });
                        }
                      }
                      prevDfgModel = currentDfg;

                      streaming.emitEvent('autopilot_completed', {
                        algorithm: algo,
                        elapsedMs,
                        modelKeys:
                          typeof model === 'object' && model ? Object.keys(model as object) : [],
                      });
                    } finally {
                      // Always free the WASM handle to prevent memory leaks across watch cycles
                      try { WasmInstrumentation.delete_object(wasm, handle); } catch { /* best-effort */ }
                    }
                  } catch (autopilotErr) {
                    streaming.emitEvent('autopilot_error', {
                      message:
                        autopilotErr instanceof Error ? autopilotErr.message : String(autopilotErr),
                    });
                  }
                }

                // Use engine to execute (existing planner-based path)
                streaming.emitEvent('processing_completed', {
                  status: 'success',
                  timestamp: new Date().toISOString(),
                });
              }
            );
          } catch (error) {
            parentStatus = 'ERROR';
            streaming.emitEvent('error', {
              message: error instanceof Error ? error.message : String(error),
              code: 'WATCH_RELOAD_ERROR',
            });
            span.setStatus('ERROR', String(error));
          } finally {
            span.end();
          }
        }, DEBOUNCE_MS)
      );
    });

    // Handle process interruption — emit parent span before exit.
    const shutdown = async (): Promise<void> => {
      watcher.close();
      streaming.emitEvent('stopped', { message: 'Watch mode terminated' });
      emitParentSpan();
      return await exitWithFlush(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep alive
    await new Promise(() => {});
  },
});
