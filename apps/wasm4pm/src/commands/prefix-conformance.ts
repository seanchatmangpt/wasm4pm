import { defineCommand } from 'citty';
import * as fs from 'node:fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';
import { WasmLoader } from '@wasm4pm/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';

export interface PrefixConformancePayload {
  schema: string;
  status: 'success' | 'failure';
  input?: string;
  prefix: string[];
  modelHandle: string;
  report: 'ALIVE' | 'FAKE-LIVE' | 'BLOCKED';
  andon_reason?: string;
  details: {
    completable: boolean;
    terminal_reachable: boolean;
    violating_activity?: string;
    violation_index?: number;
  };
}

export const prefixConformance = defineCommand({
  meta: {
    name: 'prefix-conformance',
    description:
      'Check if a trace prefix can reach a terminal state (ALIVE / FAKE-LIVE / BLOCKED).\n\n' +
      STANDARD_EXIT_CODE_DOCS,
  },
  args: {
    input: {
      type: 'string',
      alias: 'i',
      description: 'Path to XES or OCEL event log file containing the partial trace',
    },
    model: {
      type: 'string',
      alias: 'm',
      required: true,
      description: 'Process model handle or file path (e.g. POWL or Petri net JSON)',
    },
    prefix: {
      type: 'string',
      description: 'Comma-separated sequence of activities (overrides --input)',
      alias: 'p',
    },
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
    const modelHandle = ctx.args.model as string;

    return withSpan(
      'prefix-conformance',
      { model: modelHandle, format },
      async () => {
        let prefix: string[] = [];
        const prefixArg = ctx.args.prefix as string | undefined;
        const inputPath = ctx.args.input as string | undefined;

        if (prefixArg) {
          prefix = prefixArg.split(',').map((s) => s.trim()).filter(Boolean);
        } else if (inputPath) {
          // Placeholder for actual file parsing logic depending on the engine
          // e.g. parse OCEL or XES and extract the first trace as a prefix
          prefix = ['DiagnosticRaised', 'RouteSelected']; // stub
        } else {
          const result = makeErrorResult(
            'prefix-conformance',
            new Error('Must provide either --prefix or --input.'),
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }

        if (prefix.length === 0) {
          const result = makeErrorResult(
            'prefix-conformance',
            new Error('Prefix cannot be empty.'),
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }

        const t0 = Date.now();

        // Call the WASM backend for the real prefix conformance evaluation
        const loaderConfig = format === 'json' ? { observability: createQuietObservabilityLayer() } : {};
        const loader = WasmLoader.getInstance(loaderConfig);
        await loader.init();
        const wasm = loader.get() as any;
        
        let report: 'ALIVE' | 'FAKE-LIVE' | 'BLOCKED' = 'ALIVE';
        let completable = true;
        let terminal_reachable = true;
        let violating_activity: string | undefined;
        let violation_index: number | undefined;
        let andonReason: string | undefined;

        let resolvedModelHandle = modelHandle;
        try {
          const content = await fs.readFile(modelHandle, 'utf-8');
          if (content.includes('<pnml')) {
            const loadResJson = wasm.from_pnml_wasm(content);
            const loadRes = JSON.parse(loadResJson);
            if (loadRes.handle) {
              resolvedModelHandle = loadRes.handle;
            }
          }
        } catch {
          // Not a file, keep as is
        }

        try {
          const resultJson = wasm.check_prefix_conformance(resolvedModelHandle, JSON.stringify(prefix));
          const result = JSON.parse(resultJson);
          report = result.report;
          andonReason = result.andon_reason;
          completable = result.details.completable;
          terminal_reachable = result.details.terminal_reachable;
          violating_activity = result.details.violating_activity;
          violation_index = result.details.violation_index;
        } catch (e: any) {
          const err = e instanceof Error ? e : new Error(String(e));
          const result = makeErrorResult(
            'prefix-conformance',
            err,
            EXIT_CODES.execution_error,
            'KERNEL_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }

        const payload: PrefixConformancePayload = {
          schema: 'chatmangpt.wasm4pm.prefix-conformance.v1',
          status: report === 'ALIVE' ? 'success' : 'failure',
          input: inputPath,
          prefix,
          modelHandle,
          report,
          andon_reason: andonReason,
          details: {
            completable,
            terminal_reachable,
            violating_activity,
            violation_index,
          },
        };

        const elapsedMs = Date.now() - t0;
        const exitCode = report === 'ALIVE' ? EXIT_CODES.success : EXIT_CODES.conformance_fail;
        
        const result = makeResult('prefix-conformance', payload, elapsedMs, exitCode);

        emitResult(result, { format, verbose, quiet }, (res, p) => {
          const d = res.payload as PrefixConformancePayload;
          p.log('');
          p.log(`wpm prefix-conformance — Prefix Adjudication`);
          p.log(`  Model:     ${d.modelHandle}`);
          p.log(`  Prefix:    [${d.prefix.join(' → ')}]`);
          p.log(`  Report:    ${d.report}`);
          if (d.andon_reason) {
            p.log(`  Reason:    ${d.andon_reason}`);
          }
          p.log('');
          p.log(`  Valid so far?:       ${d.details.completable ? 'Yes' : 'No'}`);
          p.log(`  Can reach terminal?: ${d.details.terminal_reachable ? 'Yes' : 'No'}`);
          if (d.details.violating_activity) {
            p.log(`  Violation at:        ${d.details.violating_activity} (index ${d.details.violation_index})`);
          }
        });

        return await exitWithFlush(result.exit_code);
      }
    );
  },
});
