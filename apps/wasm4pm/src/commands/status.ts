import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';

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
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const start = Date.now();

    return withSpan(
      'status',
      { format, verbose, quiet },
      async () => {
        try {
          // Step 1: Gather system information
          const memoryUsage = process.memoryUsage();
          const uptime = process.uptime();

          // Step 2: Check WASM module status — fail fast if WASM unavailable
          const loader = WasmLoader.getInstance();
          await loader.init();
          const wasm = loader.get();
          const wasmLoaded = true;
          let wasmVersion: string | null = null;
          const kernelReady = true;

          // Try to get the version from the WASM module
          if (typeof wasm.get_version === 'function') {
            wasmVersion = String(wasm.get_version());
          }

          // Step 3: Build status report
          const statusReport = {
            engine: {
              state: 'ready',
              wasmLoaded,
              kernelReady,
              version: wasmVersion,
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

          const result = makeResult('status', statusReport, Date.now() - start);
          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const r = res.payload;
            p.info('System Status Report');
            p.log('');

            // Engine status section
            p.log('Engine Status:');
            p.log(`  State: ${r.engine.state}`);
            p.log(`  WASM Loaded: Yes`);
            if (r.engine.version) {
              p.log(`  WASM Version: ${r.engine.version}`);
            }
            p.log(`  Kernel Ready: Yes`);

            // System section
            p.log('');
            p.log('System Information:');
            p.log(`  Platform: ${r.system.platform}/${r.system.arch}`);
            p.log(`  Node Version: ${r.system.nodeVersion}`);
            p.log(
              `  Uptime: ${Math.floor(r.system.uptime / 60)}m ${r.system.uptime % 60}s`
            );

            // Memory section
            p.log('');
            p.log('Memory Usage:');
            p.log(`  Heap Used: ${r.memory.heapUsed} MB`);
            p.log(`  Heap Total: ${r.memory.heapTotal} MB`);
            p.log(`  RSS: ${r.memory.rss} MB`);
            p.log(`  External: ${r.memory.external} MB`);

            p.log('');
          });
          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const result = makeErrorResult('status', error, EXIT_CODES.system_error, 'STATUS_ERROR');
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
    );
  },
});
