import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { withLogSession } from '../with-log-session.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpanRaw } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';

export const cell = defineCommand({
  meta: {
    name: 'cell',
    description: 'Cell8 — manufacture, verify, and operate proof-carrying software parts',
  },
  subCommands: {
    build: defineCommand({
      meta: {
        name: 'build',
        description: 'Manufacture Cell8 artifact from ontology, embed receipts and replay fixtures',
      },
      args: {
        ontology: {
          type: 'positional',
          description: 'Path to Cell8 ontology file',
          required: true,
        },
        config: {
          type: 'string',
          description: 'Path to Cell8 config file',
        },
        'no-sign': {
          type: 'boolean',
          description: 'Skip Ed25519 signing of Receipt64',
        },
        format: {
          type: 'string',
          description: 'Output format: human (default) or json',
        },
      },
      async run(ctx) {
        return withSpanRaw('wasm4pm.command.cell.build', {
          command: 'cell', subcommand: 'build',
          ontology: String(ctx.args.ontology ?? ''),
        }, async () => {
        const ontologyPath = ctx.args.ontology as string;
        const format = (ctx.args.format as 'json' | 'human') ?? 'human';
        const emitOptions = { format };

        try {
          const ontologyContent = await fs.readFile(ontologyPath, 'utf-8');

          await withLogSession(
            { inputPath: ontologyPath, commandName: 'cell build', emitOptions },
            async (wasmBase) => {
              const wasm = wasmBase as Record<string, any>;

              const configPath = ctx.args.config as string | undefined;
              const configContent = configPath ? await fs.readFile(configPath, 'utf-8') : '{}';
              const noSign = Boolean(ctx.args['no-sign']);

              const result = wasm.cell_build?.(ontologyContent, JSON.stringify({ config: configContent, sign: !noSign }));

              if (!result) {
                const err = makeErrorResult('cell build', new Error('cell_build not available in WASM module'), EXIT_CODES.execution_error, 'WASM_FUNCTION_UNAVAILABLE');
                emitResult(err, emitOptions);
                await exitWithFlush(err.exit_code);
              }

              let parsed;
              try {
                parsed = typeof result === 'string' ? JSON.parse(result) : result;
              } catch (parseErr) {
                const err = makeErrorResult('cell build', new Error(`WASM returned invalid JSON: ${result}`), EXIT_CODES.execution_error, 'INVALID_WASM_OUTPUT');
                emitResult(err, emitOptions);
                await exitWithFlush(err.exit_code);
              }
              const cmdResult = makeResult('cell build', parsed, 0, EXIT_CODES.success);
              emitResult(cmdResult, emitOptions);
            },
          );
        } catch (err) {
          const result = makeErrorResult('cell build', err instanceof Error ? err : new Error(String(err)), EXIT_CODES.execution_error, 'CELL_BUILD_FAILED');
          emitResult(result, emitOptions);
          await exitWithFlush(result.exit_code);
        }
        });
      },
    }),

    verify: defineCommand({
      meta: {
        name: 'verify',
        description: 'Verify Receipt64 chain, CellCard signature, and SHACL conformance',
      },
      args: {
        'cell-id': {
          type: 'positional',
          description: 'Cell artifact ID (hash or handle)',
          required: true,
        },
        format: {
          type: 'string',
          description: 'Output format: human (default) or json',
        },
      },
      async run(ctx) {
        return withSpanRaw('wasm4pm.command.cell.verify', {
          command: 'cell', subcommand: 'verify',
          cell_id: String(ctx.args['cell-id'] ?? ''),
        }, async () => {
        const cellId = ctx.args['cell-id'] as string;
        const format = (ctx.args.format as 'json' | 'human') ?? 'human';
        const emitOptions = { format };

        try {
          await withLogSession(
            { inputPath: '.wasm4pm/cells', commandName: 'cell verify', emitOptions },
            async (wasmBase) => {
              const wasm = wasmBase as Record<string, any>;
              const result = wasm.cell_verify?.(cellId);

              if (!result) {
                const err = makeErrorResult('cell verify', new Error('cell_verify not available'), EXIT_CODES.execution_error, 'WASM_FUNCTION_UNAVAILABLE');
                emitResult(err, emitOptions);
                await exitWithFlush(err.exit_code);
              }

              const parsed = typeof result === 'string' ? JSON.parse(result) : result;
              const cmdResult = makeResult('cell verify', parsed, 0, EXIT_CODES.success);
              emitResult(cmdResult, emitOptions);
            },
          );
        } catch (err) {
          const result = makeErrorResult('cell verify', err instanceof Error ? err : new Error(String(err)), EXIT_CODES.execution_error, 'CELL_VERIFY_FAILED');
          emitResult(result, emitOptions);
          await exitWithFlush(result.exit_code);
        }
        });
      },
    }),

    replay: defineCommand({
      meta: {
        name: 'replay',
        description: 'Execute embedded replay fixtures and verify deterministic behavior',
      },
      args: {
        'cell-id': {
          type: 'positional',
          description: 'Cell artifact ID',
          required: true,
        },
        'fixture-id': {
          type: 'string',
          description: 'Specific fixture ID or "all" (default: all)',
        },
        format: {
          type: 'string',
          description: 'Output format: human (default) or json',
        },
      },
      async run(ctx) {
        return withSpanRaw('wasm4pm.command.cell.replay', {
          command: 'cell', subcommand: 'replay',
          cell_id: String(ctx.args['cell-id'] ?? ''),
          fixture_id: String(ctx.args['fixture-id'] ?? 'all'),
        }, async () => {
        const cellId = ctx.args['cell-id'] as string;
        const fixtureId = (ctx.args['fixture-id'] as string | undefined) ?? 'all';
        const format = (ctx.args.format as 'json' | 'human') ?? 'human';
        const emitOptions = { format };

        try {
          await withLogSession(
            { inputPath: '.wasm4pm/cells', commandName: 'cell replay', emitOptions },
            async (wasmBase) => {
              const wasm = wasmBase as Record<string, any>;
              const result = wasm.cell_replay?.(cellId, fixtureId);

              if (!result) {
                const err = makeErrorResult('cell replay', new Error('cell_replay not available'), EXIT_CODES.execution_error, 'WASM_FUNCTION_UNAVAILABLE');
                emitResult(err, emitOptions);
                await exitWithFlush(err.exit_code);
              }

              const parsed = typeof result === 'string' ? JSON.parse(result) : result;
              const cmdResult = makeResult('cell replay', parsed, 0, EXIT_CODES.success);
              emitResult(cmdResult, emitOptions);
            },
          );
        } catch (err) {
          const result = makeErrorResult('cell replay', err instanceof Error ? err : new Error(String(err)), EXIT_CODES.execution_error, 'CELL_REPLAY_FAILED');
          emitResult(result, emitOptions);
          await exitWithFlush(result.exit_code);
        }
        });
      },
    }),

    export: defineCommand({
      meta: {
        name: 'export',
        description: 'Render host-language projections (json, typescript, python, markdown, openapi)',
      },
      args: {
        'cell-id': {
          type: 'positional',
          description: 'Cell artifact ID',
          required: true,
        },
        projection: {
          type: 'positional',
          description: 'Target: json|typescript|python|markdown|openapi',
          required: true,
        },
        format: {
          type: 'string',
          description: 'Output format: human (default) or json',
        },
      },
      async run(ctx) {
        return withSpanRaw('wasm4pm.command.cell.export', {
          command: 'cell', subcommand: 'export',
          cell_id: String(ctx.args['cell-id'] ?? ''),
          projection: String(ctx.args.projection ?? ''),
        }, async () => {
        const cellId = ctx.args['cell-id'] as string;
        const projection = ctx.args.projection as string;
        const format = (ctx.args.format as 'json' | 'human') ?? 'human';
        const emitOptions = { format };

        try {
          await withLogSession(
            { inputPath: '.wasm4pm/cells', commandName: 'cell export', emitOptions },
            async (wasmBase) => {
              const wasm = wasmBase as Record<string, any>;
              const result = wasm.cell_export?.(cellId, projection);

              if (!result) {
                const err = makeErrorResult('cell export', new Error('cell_export not available'), EXIT_CODES.execution_error, 'WASM_FUNCTION_UNAVAILABLE');
                emitResult(err, emitOptions);
                await exitWithFlush(err.exit_code);
              }

              const cmdResult = makeResult('cell export', result, 0, EXIT_CODES.success);
              emitResult(cmdResult, emitOptions);
            },
          );
        } catch (err) {
          const result = makeErrorResult('cell export', err instanceof Error ? err : new Error(String(err)), EXIT_CODES.execution_error, 'CELL_EXPORT_FAILED');
          emitResult(result, emitOptions);
          await exitWithFlush(result.exit_code);
        }
        });
      },
    }),

    doctor: defineCommand({
      meta: {
        name: 'doctor',
        description: '8-point readiness diagnostic (one check per CellReady conjunct)',
      },
      args: {
        'cell-id': {
          type: 'positional',
          description: 'Cell artifact ID',
          required: true,
        },
        strict: {
          type: 'boolean',
          description: 'Fail if any conjunct is not satisfied',
        },
        format: {
          type: 'string',
          description: 'Output format: human (default) or json',
        },
      },
      async run(ctx) {
        return withSpanRaw('wasm4pm.command.cell.doctor', {
          command: 'cell', subcommand: 'doctor',
          cell_id: String(ctx.args['cell-id'] ?? ''),
          strict: Boolean(ctx.args.strict),
        }, async () => {
        const cellId = ctx.args['cell-id'] as string;
        const strict = Boolean(ctx.args.strict);
        const format = (ctx.args.format as 'json' | 'human') ?? 'human';
        const emitOptions = { format };

        try {
          await withLogSession(
            { inputPath: '.wasm4pm/cells', commandName: 'cell doctor', emitOptions },
            async (wasmBase) => {
              const wasm = wasmBase as Record<string, any>;
              const result = wasm.cell_doctor?.(cellId);

              if (!result) {
                const err = makeErrorResult('cell doctor', new Error('cell_doctor not available'), EXIT_CODES.execution_error, 'WASM_FUNCTION_UNAVAILABLE');
                emitResult(err, emitOptions);
                await exitWithFlush(err.exit_code);
              }

              const parsed = typeof result === 'string' ? JSON.parse(result) : result;

              if (strict && !parsed.ready) {
                const err = makeErrorResult('cell doctor', new Error(`Not ready: ${parsed.summary}`), EXIT_CODES.execution_error, 'CELL_NOT_READY');
                emitResult(err, emitOptions);
                await exitWithFlush(err.exit_code);
              }

              const cmdResult = makeResult('cell doctor', parsed, 0, EXIT_CODES.success);
              emitResult(cmdResult, emitOptions);
            },
          );
        } catch (err) {
          const result = makeErrorResult('cell doctor', err instanceof Error ? err : new Error(String(err)), EXIT_CODES.execution_error, 'CELL_DOCTOR_FAILED');
          emitResult(result, emitOptions);
          await exitWithFlush(result.exit_code);
        }
        });
      },
    }),
  },
});

export const cellCommand = cell;
