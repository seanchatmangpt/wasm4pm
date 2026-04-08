import { defineCommand } from 'citty';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@pictl/engine';
import type { OutputOptions } from '../output.js';

export interface StatusOptions extends OutputOptions {
  verbose?: boolean;
}

export const status = defineCommand({
  meta: {
    name: 'status',
    description: 'Show status of discovery operations and system health',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Step 1: Gather system information
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      // Step 2: Check WASM module status
      let wasmLoaded = false;
      let wasmVersion: string | null = null;
      let kernelReady = false;
      let wasmError: string | null = null;

      try {
        const loader = WasmLoader.getInstance();
        await loader.init();
        const wasm = loader.get();
        wasmLoaded = true;

        // Try to get the version from the WASM module
        if (typeof wasm.get_version === 'function') {
          wasmVersion = String(wasm.get_version());
        }
        kernelReady = wasmLoaded; // kernel is ready if WASM loaded successfully
      } catch (err) {
        wasmError = err instanceof Error ? err.message : String(err);
      }

      // Step 3: Build status report
      const statusReport = {
        engine: {
          state: wasmLoaded ? 'ready' : 'unavailable',
          wasmLoaded,
          kernelReady,
          version: wasmVersion,
          error: wasmError,
        },
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          uptime: Math.round(uptime),
        },
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
        },
      };

      // Step 4: Format and output status
      if (formatter instanceof JSONFormatter) {
        formatter.success('System status retrieved', statusReport);
      } else {
        formatter.info('System Status Report');
        formatter.log('');

        // Engine status section
        formatter.log('Engine Status:');
        formatter.log(`  State: ${statusReport.engine.state}`);
        formatter.log(`  WASM Loaded: ${wasmLoaded ? 'Yes' : 'No'}`);
        if (wasmVersion) {
          formatter.log(`  WASM Version: ${wasmVersion}`);
        }
        if (wasmError && ctx.args.verbose) {
          formatter.log(`  WASM Error: ${wasmError}`);
        }
        formatter.log(`  Kernel Ready: ${kernelReady ? 'Yes' : 'No'}`);

        // System section
        formatter.log('');
        formatter.log('System Information:');
        formatter.log(`  Platform: ${statusReport.system.platform}/${statusReport.system.arch}`);
        formatter.log(`  Node Version: ${statusReport.system.nodeVersion}`);
        formatter.log(`  Uptime: ${Math.floor(statusReport.system.uptime / 60)}m ${statusReport.system.uptime % 60}s`);

        // Memory section
        formatter.log('');
        formatter.log('Memory Usage:');
        formatter.log(`  Heap Used: ${statusReport.memory.heapUsed} MB`);
        formatter.log(`  Heap Total: ${statusReport.memory.heapTotal} MB`);
        formatter.log(`  RSS: ${statusReport.memory.rss} MB`);
        formatter.log(`  External: ${statusReport.memory.external} MB`);

        formatter.log('');
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Failed to retrieve status', error);
      } else {
        formatter.error(
          `Failed to retrieve status: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.system_error);
    }
  },
});
