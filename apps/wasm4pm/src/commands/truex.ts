import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EXIT_CODES } from '../exit-codes.js';
import { emitResult, makeErrorResult, makeResult } from '../output.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

export const truex = defineCommand({
  meta: {
    name: 'truex',
    description: 'Truex OCEL 2.0 Trust Layer (Verify Receipts)',
  },
  args: {
    action: {
      type: 'positional',
      description: 'Action to perform (e.g. verify)',
      required: true,
    },
    payload: {
      type: 'positional',
      description: 'Path to the Truex Envelope JSON payload',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format: human or json (default: human)',
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
    ingest: {
      type: 'boolean',
      description: 'After WASM verify, ingest admitted envelope into Supabase',
      default: false,
    },
    config: {
      type: 'string',
      description: 'Path to wasm4pm.toml (for Supabase credentials when --ingest)',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const action = ctx.args.action as string;
    const targetPath = ctx.args.payload as string;

    if (action !== 'verify') {
      const result = makeErrorResult(
        'truex',
        `Unknown action: ${action}. Supported: verify`,
        EXIT_CODES.config_error,
        'INVALID_ACTION',
        'Use: wpm truex verify <envelope.json>'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    return withSpan('truex', { targetPath, action }, async () => {
      const t0 = performance.now();
      try {
        const { WasmLoader } = await import('@wasm4pm/engine');
        const loader = WasmLoader.getInstance();
        await loader.init();
        const wasm = loader.get() as Record<string, (payload: string) => string>;

        const fullPath = path.resolve(process.cwd(), targetPath);
        const payload = await fs.readFile(fullPath, 'utf8');

        const verifyStart = performance.now();
        const resultJson = wasm.truex_verify_receipt(payload);
        const parsed = JSON.parse(resultJson) as Record<string, unknown>;
        const status = parsed.status as string;
        const elapsedMs = Math.round(performance.now() - verifyStart);

        if (status === 'ReceiptAdmitted') {
          let ingestPayload: Record<string, unknown> | undefined;
          if (Boolean(ctx.args.ingest)) {
            const { resolveConfig } = await import('@wasm4pm/config');
            const {
              resolveSupabaseConfig,
              ingestTruexEnvelope,
              parseTruexEnvelope,
              SupabaseIntegrationError,
            } = await import('@wasm4pm/supabase');
            let fileConfig: import('@wasm4pm/supabase').SupabaseIntegrationConfig | undefined;
            try {
              const resolved = await resolveConfig(
                ctx.args.config
                  ? {
                      cliOverrides: { configPath: ctx.args.config as string },
                      configSearchPaths: [process.cwd()],
                    }
                  : {}
              );
              fileConfig = resolved.integrations?.supabase;
            } catch {
              /* env-only Supabase config is sufficient for --ingest */
            }
            try {
              const supabaseConfig = resolveSupabaseConfig({ fileConfig });
              const envelope = parseTruexEnvelope(JSON.parse(payload) as Record<string, unknown>);
              const ingestResult = await ingestTruexEnvelope({ config: supabaseConfig, envelope });
              ingestPayload = { ...ingestResult };
            } catch (ingestErr: unknown) {
              // Map Supabase-specific errors to the correct exit code and error code
              // rather than falling through to the outer generic VERIFIER_ERROR catch.
              const supabaseExit =
                ingestErr instanceof SupabaseIntegrationError
                  ? ingestErr.code === 'SUPABASE_CREDENTIALS_MISSING' ||
                    ingestErr.code === 'SUPABASE_SERVICE_ROLE_MISSING'
                    ? EXIT_CODES.config_error
                    : ingestErr.code === 'RECEIPT_REFUSED'
                      ? EXIT_CODES.execution_error
                      : EXIT_CODES.system_error
                  : EXIT_CODES.system_error;
              const supabaseCode =
                ingestErr instanceof SupabaseIntegrationError
                  ? ingestErr.code
                  : 'SUPABASE_INGEST_ERROR';
              const supabaseMsg =
                ingestErr instanceof Error ? ingestErr.message : String(ingestErr);
              const errResult = makeErrorResult(
                'truex',
                `Supabase ingest failed: ${supabaseMsg}`,
                supabaseExit,
                supabaseCode
              );
              emitResult(errResult, { format, verbose, quiet });
              return await exitWithFlush(supabaseExit);
            }
          }

          const result = makeResult(
            'truex',
            {
              status,
              equivalence_class: parsed.equivalence_class,
              elapsed_ms: elapsedMs,
              envelope_path: fullPath,
              ...(ingestPayload ? { supabase: ingestPayload } : {}),
            },
            Math.round(performance.now() - t0),
            EXIT_CODES.success
          );
          emitResult(result, { format, verbose, quiet }, (_res, p) => {
            p.success('Receipt verified (WASM)');
            p.log(`  Status:            ${status}`);
            p.log(`  Equivalence Class: ${String(parsed.equivalence_class ?? '')}`);
            p.log(`  Time:              ${elapsedMs}ms`);
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        const result = makeErrorResult(
          'truex',
          `Receipt refused: ${status}` +
            (parsed.equivalence_class ? ` (${String(parsed.equivalence_class)})` : ''),
          EXIT_CODES.execution_error,
          'RECEIPT_REFUSED',
          'Inspect envelope integrity and canonical OCEL 2.0 profile compliance.'
        );
        emitResult(result, { format, verbose, quiet }, (_res, p) => {
          p.error('Receipt forged or refused (integrity compromised)');
          p.log(`  Status: ${status}`);
        });
        return await exitWithFlush(EXIT_CODES.execution_error);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const result = makeErrorResult(
          'truex',
          `Failed to process envelope: ${message}`,
          EXIT_CODES.execution_error,
          'VERIFIER_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
    });
  },
});
