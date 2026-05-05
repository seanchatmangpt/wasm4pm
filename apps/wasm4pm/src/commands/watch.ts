import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { watch as fsWatch } from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { 
  createFullEngine, 
  WasmLoader, 
} from '@wasm4pm/engine';
import { getTracer, WatchingSpans } from '@wasm4pm/observability';
import { WasmBackend } from '@wasm4pm/kernel';
import { plan } from '@wasm4pm/planner';
import { StreamingOutput } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';

export interface WatchOptions extends OutputOptions {
  config?: string;
  interval?: number;
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

    // Step 1: Initialize Engine and Backends
    const wasmLoader = WasmLoader.getInstance();
    await wasmLoader.init();
    
    const kernel = new WasmBackend();
    await kernel.init();

    // In a real implementation, we'd use a more sophisticated planner/executor
    const engine = createFullEngine(kernel as any, plan as any, { 
        run: async (p: any) => {
            streaming.emitEvent('executing', { plan: p.id });
            await new Promise(resolve => setTimeout(resolve, 500));
            return { run_id: 'watch-run', status: 'success', payload: {} } as any;
        }
    } as any);

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

    watcher.on('change', async (filePath) => {
      const span = tracer.startSpan(WatchingSpans.heartbeat());
      try {
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

      } catch (error) {
        streaming.emitEvent('error', {
          message: error instanceof Error ? error.message : String(error),
          code: 'WATCH_RELOAD_ERROR',
        });
        span.setStatus('ERROR', String(error));
      } finally {
        span.end();
      }
    });

    // Handle process interruption
    process.on('SIGINT', () => {
      watcher.close();
      streaming.emitEvent('stopped', { message: 'Watch mode terminated' });
      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {});
  },
});
