import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { watch as fsWatch } from 'fs';
import * as path from 'path';
import { resolveConfig as loadConfig } from '@pictl/config';
import { StreamingOutput, HumanFormatter } from '../output.js';
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

    let watcher: ReturnType<typeof fsWatch> | undefined;
    let debounceTimer: NodeJS.Timeout | undefined;
    let isProcessing = false;

    try {
      const intervalMs = ctx.args.interval ? parseInt(ctx.args.interval, 10) : 1000;
      const configPath = ctx.args.config || process.cwd();

      // Step 1: Load configuration
      let config;
      try {
        config = await loadConfig({
          configSearchPaths: [configPath],
        });
      } catch (error) {
        streaming.emitEvent('error', {
          message: `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
          code: 'CONFIG_ERROR',
        });
        process.exit(EXIT_CODES.config_error);
      }

      streaming.startStream();

      // Step 2: Emit initialization event
      streaming.emitEvent('initialized', {
        config: configPath,
        interval: intervalMs,
        timestamp: new Date().toISOString(),
      });

      // Step 3: Watch for file changes — fail fast if path is invalid
      const watchPath = path.resolve(configPath);
      const isFile = await isPathFile(watchPath);
      const dirToWatch = isFile ? path.dirname(watchPath) : watchPath;

      streaming.emitEvent('watching', {
        path: dirToWatch,
        message: 'Waiting for file changes...',
        timestamp: new Date().toISOString(),
      });

      // Step 4: Set up file watcher
      watcher = fsWatch(dirToWatch, { recursive: true }, async (eventType, filename) => {
        // Debounce rapid successive changes
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(async () => {
          if (isProcessing) {
            return;
          }

          try {
            isProcessing = true;

            streaming.emitEvent('change_detected', {
              file: filename,
              eventType,
              timestamp: new Date().toISOString(),
            });

            // Step 5: Reload configuration — fail fast if config reload fails
            config = await loadConfig({
              configSearchPaths: [configPath],
            });

            streaming.emitEvent('config_reloaded', {
              timestamp: new Date().toISOString(),
              configHash: config.metadata.hash,
            });

            // Step 6: Trigger execution (placeholder - would call engine.watch())
            streaming.emitEvent('processing_started', {
              timestamp: new Date().toISOString(),
              config: config.execution.profile,
            });

            // Step 7: Simulate processing (in real implementation, would await engine.watch())
            await new Promise((resolve) => setTimeout(resolve, 100));

            streaming.emitEvent('processing_completed', {
              timestamp: new Date().toISOString(),
              status: 'success',
            });

            // Step 8: Emit ready event
            streaming.emitEvent('ready', {
              message: 'Watching for changes...',
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            streaming.emitEvent('error', {
              message: error instanceof Error ? error.message : String(error),
              code: 'EXECUTION_ERROR',
              timestamp: new Date().toISOString(),
            });
          } finally {
            isProcessing = false;
          }
        }, intervalMs);
      });

      // Keep process alive until interrupted
      await new Promise(() => {
        // Never resolves - watch mode runs until manually stopped (Ctrl+C)
      });
    } catch (error) {
      streaming.emitEvent('error', {
        message: error instanceof Error ? error.message : String(error),
        code: 'WATCH_ERROR',
      });

      // Clean up watchers
      if (watcher) {
        watcher.close();
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      process.exit(EXIT_CODES.execution_error);
    }
  },
});

/**
 * Check if a path is a file
 */
async function isPathFile(filepath: string): Promise<boolean> {
  const stats = await fs.stat(filepath);
  return stats.isFile();
}
