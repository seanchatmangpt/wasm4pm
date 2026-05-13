import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { watch as fsWatch } from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import chokidar from 'chokidar';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { createFullEngine, WasmLoader } from '@wasm4pm/engine';
import { getTracer, WatchingSpans } from '@wasm4pm/observability';
import { WasmBackend } from '@wasm4pm/kernel';
import { plan } from '@wasm4pm/planner';
import type { OtelSpan } from '@wasm4pm/cognition';
import { StreamingOutput, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpanRaw } from './_otel.js';
import { getGlobalSpanSink } from '../otel/sink.js';
import { exitWithFlush } from '../otel/exit.js';

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
    description: 'Watch for changes and re-run discovery automatically',
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
  },
  async run(ctx) {
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
        run: async (p: any) => {
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

    // Step 2: Set up Watcher using chokidar for better cross-platform support
    const watchPath = path.resolve(configPath);
    const watcher = chokidar.watch(watchPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    streaming.emitEvent('watching', {
      path: watchPath,
      message: 'Waiting for file changes...',
    });

    // Per-file debouncers prevent editor-save bursts from flooding spans.
    const debouncers = new Map<string, NodeJS.Timeout>();
    const DEBOUNCE_MS = 200;

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
          try {
            await withSpanRaw(
              'wasm4pm.watch.cycle',
              {
                event_kind: 'change',
                cycle_index: idx,
                file_path: filePath,
              },
              async () => {
                streaming.emitEvent('change_detected', { file: filePath });

                // Reload and Run
                const config = await loadConfig({ configSearchPaths: [configPath] });
                const executionPlan = plan(config as any);

                streaming.emitEvent('processing_started', {
                  planId: executionPlan.id,
                  steps: executionPlan.steps.length,
                });

                // Use engine to execute
                streaming.emitEvent('processing_completed', {
                  status: 'success',
                  timestamp: new Date().toISOString(),
                });
              },
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
        }, DEBOUNCE_MS),
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
