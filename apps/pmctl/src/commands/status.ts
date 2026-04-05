import { defineCommand } from 'citty';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
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
      // Step 1: Retrieve engine status (placeholder - in real implementation, would call engine.status())
      const engineStatus = {
        state: 'ready',
        progress: 100,
        errors: [] as any[],
        metadata: {
          wasmLoaded: false,
          kernelReady: false,
          uptime: 0,
        },
      };

      // Step 2: Gather system information
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      const statusReport = {
        engine: {
          state: engineStatus.state,
          progress: engineStatus.progress,
        },
        system: {
          platform: process.platform,
          nodeVersion: process.version,
          uptime: Math.round(uptime),
          memory: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
          },
        },
        wasm: {
          loaded: engineStatus.metadata?.wasmLoaded || false,
          kernelReady: engineStatus.metadata?.kernelReady || false,
        },
        errors: engineStatus.errors.length,
      };

      // Step 3: Format and output status
      if (formatter instanceof JSONFormatter) {
        formatter.success('System status retrieved', statusReport);
      } else {
        formatter.info('System Status Report');
        formatter.log('');

        // Engine status section
        formatter.log('Engine Status:');
        formatter.log(`  State: ${engineStatus.state}`);
        formatter.log(`  Progress: ${engineStatus.progress}%`);

        // System section
        formatter.log('');
        formatter.log('System Information:');
        formatter.log(`  Platform: ${statusReport.system.platform}`);
        formatter.log(`  Node Version: ${statusReport.system.nodeVersion}`);
        formatter.log(`  Uptime: ${Math.floor(statusReport.system.uptime / 60)}m ${statusReport.system.uptime % 60}s`);

        // Memory section
        formatter.log('');
        formatter.log('Memory Usage:');
        formatter.log(`  Heap Used: ${statusReport.system.memory.heapUsed} MB`);
        formatter.log(`  Heap Total: ${statusReport.system.memory.heapTotal} MB`);
        formatter.log(`  External: ${statusReport.system.memory.external} MB`);

        // WASM section
        formatter.log('');
        formatter.log('WASM Module:');
        formatter.log(`  Loaded: ${statusReport.wasm.loaded ? 'Yes' : 'No'}`);
        formatter.log(`  Kernel Ready: ${statusReport.wasm.kernelReady ? 'Yes' : 'No'}`);

        // Errors section
        if (statusReport.errors > 0) {
          formatter.log('');
          formatter.log(`Errors: ${statusReport.errors}`);
          if (ctx.args.verbose) {
            engineStatus.errors.forEach((err: any, idx: number) => {
              formatter.log(`  ${idx + 1}. [${err.code}] ${err.message}`);
            });
          }
        }

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
