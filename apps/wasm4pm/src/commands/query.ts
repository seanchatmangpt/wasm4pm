import { defineCommand } from 'citty';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

// ── command ───────────────────────────────────────────────────────────────────

export const queryCommand = defineCommand({
  meta: {
    name: 'query',
    description:
      'Evaluate an OCPQ (Object-Centric Process Query) against an OCEL event log.\n\n' +
      'Loads an OCEL 2.0 JSON file and evaluates a declarative OCPQ query string\n' +
      'using the WASM kernel. Returns the verdict as structured JSON.\n\n' +
      'EXAMPLES:\n' +
      '  wpm query --ocel log.json --query query.json   # Read query from file\n' +
      '  wpm query --ocel log.json --query \'{"..."}\'    # Inline query JSON\n\n' +
      STANDARD_EXIT_CODE_DOCS,
  },
  args: {
    ocel: {
      type: 'string',
      description: 'Path to the OCEL 2.0 JSON event log file',
      required: true,
    },
    query: {
      type: 'string',
      description: 'OCPQ query: inline JSON string (starts with \'{\') or path to a JSON file',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Output result as JSON',
      default: false,
    },
  },
  async run({ args }) {
    const t0 = performance.now();

    await withSpan(
      'query',
      { 'ocel.file': args.ocel, 'query.source': args.query.startsWith('{') ? 'inline' : 'file' },
      async () => {
        const outputOptions = args.json ? { format: 'json' as const } : {};

        // -- Resolve OCEL file --
        const ocelPath = resolve(args.ocel);
        if (!existsSync(ocelPath)) {
          emitResult(
            makeErrorResult(
              'query',
              `OCEL file not found: ${ocelPath}`,
              EXIT_CODES.source_error,
              'SOURCE_OCEL_NOT_FOUND',
              'Provide a valid path to an OCEL 2.0 JSON file via --ocel.',
            ),
            outputOptions,
          );
          await exitWithFlush(EXIT_CODES.source_error);
          return;
        }

        let ocelContent: string;
        try {
          ocelContent = readFileSync(ocelPath, 'utf-8');
        } catch (err) {
          emitResult(
            makeErrorResult('query', err, EXIT_CODES.source_error, 'SOURCE_OCEL_READ_ERROR'),
            outputOptions,
          );
          await exitWithFlush(EXIT_CODES.source_error);
          return;
        }

        // -- Resolve query string (inline JSON or file path) --
        let queryStr: string;
        if (args.query.trimStart().startsWith('{')) {
          queryStr = args.query;
        } else {
          const queryPath = resolve(args.query);
          if (!existsSync(queryPath)) {
            emitResult(
              makeErrorResult(
                'query',
                `Query file not found: ${queryPath}`,
                EXIT_CODES.source_error,
                'SOURCE_QUERY_NOT_FOUND',
                'Provide a valid path to a JSON query file, or pass inline JSON starting with \'{\'.',
              ),
              outputOptions,
            );
            await exitWithFlush(EXIT_CODES.source_error);
            return;
          }
          try {
            queryStr = readFileSync(queryPath, 'utf-8');
          } catch (err) {
            emitResult(
              makeErrorResult('query', err, EXIT_CODES.source_error, 'SOURCE_QUERY_READ_ERROR'),
              outputOptions,
            );
            await exitWithFlush(EXIT_CODES.source_error);
            return;
          }
        }

        // -- Load WASM and evaluate --
        let verdictRaw: string;
        try {
          const wasm = await import('wasm4pm');
          if (typeof wasm.default === 'function') {
            await (wasm.default as unknown as () => Promise<void>)();
          }

          const evaluateFn = (wasm as Record<string, unknown>)['evaluate_ocpq'] as
            | ((ocelJson: string, queryStr: string) => string)
            | undefined;

          if (typeof evaluateFn !== 'function') {
            throw new Error(
              'WASM export evaluate_ocpq not found — rebuild WASM core with the "ocel" feature enabled',
            );
          }

          verdictRaw = evaluateFn(ocelContent, queryStr);
        } catch (err) {
          emitResult(
            makeErrorResult('query', err, EXIT_CODES.execution_error, 'EXEC_WASM_FAILURE'),
            outputOptions,
          );
          await exitWithFlush(EXIT_CODES.execution_error);
          return;
        }

        // -- Parse verdict --
        let verdict: unknown;
        try {
          verdict = JSON.parse(verdictRaw);
        } catch {
          verdict = verdictRaw;
        }

        const durationMs = performance.now() - t0;

        emitResult(
          makeResult(
            'query',
            { ocel_file: ocelPath, verdict },
            durationMs,
            EXIT_CODES.success,
            'OCPQ query evaluated successfully',
          ),
          outputOptions,
        );
        await exitWithFlush(EXIT_CODES.success);
      },
    );
  },
});
