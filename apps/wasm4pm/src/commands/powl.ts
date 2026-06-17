/**
 * POWL (Partially Ordered Workflow Language) command group
 *
 * Process model analysis following van der Aalst's framework:
 *   - Parse/serialize POWL models
 *   - Simplify (XOR/LOOP merging, SPO inlining)
 *   - Convert to Petri Net, Process Tree, BPMN
 *   - Structural + behavioral diff
 *   - Complexity metrics (cyclomatic, CFC, cognitive, Halstead)
 *   - Behavioral footprints
 *   - Token replay conformance checking
 */

import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { withSpanRaw } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

/** User argument is invalid — maps to config_error (exit 1). */
class PowlConfigError extends Error {
  readonly code: string;
  constructor(message: string, code = 'POWL_CONFIG_ERROR') {
    super(message);
    this.name = 'PowlConfigError';
    this.code = code;
  }
}

/** Source file is missing or unreadable — maps to source_error (exit 2). */
class PowlSourceError extends Error {
  readonly code: string;
  constructor(message: string, code = 'POWL_SOURCE_ERROR') {
    super(message);
    this.name = 'PowlSourceError';
    this.code = code;
  }
}

const POWL_SUBCOMMANDS = [
  'parse',
  'simplify',
  'convert',
  'diff',
  'complexity',
  'footprints',
  'conformance',
  'import',
  'discover',
  'validate',
  'get-children',
  'node-info',
  'freq-analysis',
  'load',
] as const;
type PowlSubcommand = (typeof POWL_SUBCOMMANDS)[number];

/**
 * Surface Q: read vs write classification.
 *
 * Write subs produce a derived/transformed model artifact and emit a BLAKE3
 * receipt. Read subs are pure analysis and emit only an OTEL span — saving a
 * receipt for them was a forgery (asymmetric proof) and has been removed.
 */
const POWL_WRITE_SUBS = new Set<PowlSubcommand>(['simplify', 'convert', 'import', 'discover']);

const CONVERT_TARGETS = ['petri-net', 'process-tree', 'bpmn', 'svg'] as const;
type ConvertTarget = (typeof CONVERT_TARGETS)[number];

const IMPORT_SOURCES = ['process-tree', 'petri-net'] as const;
type ImportSource = (typeof IMPORT_SOURCES)[number];

export const powl = defineCommand({
  meta: {
    name: 'powl',
    description:
      'POWL model analysis — parse, convert, simplify, diff, complexity, footprints, conformance, import, discover, validate, get-children, node-info, freq-analysis. Example: wpm powl parse \"*( A , B )\"',
  },
  args: {
    subcommand: {
      type: 'positional',
      description: `Operation: ${POWL_SUBCOMMANDS.join(', ')}`,
    },
    model: {
      type: 'string',
      description: 'POWL model string, .powl file, or file to import (for import subcommand)',
    },
    model2: {
      type: 'string',
      description: 'Second POWL model (for diff)',
    },
    log: {
      type: 'string',
      description: 'Path to XES event log (for conformance)',
      alias: 'l',
    },
    to: {
      type: 'string',
      description: 'Target format for convert: petri-net, process-tree, bpmn',
    },
    from: {
      type: 'string',
      description: 'Source format for import: process-tree, petri-net',
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
    'no-save': {
      type: 'boolean',
      description: 'Do not persist the result to .wasm4pm/results/',
    },
    index: {
      type: 'string',
      description: 'Arena node index (for get-children, node-info)',
    },
    input: {
      type: 'string',
      description: 'Path to XES event log (for discover)',
      alias: 'i',
    },
    variant: {
      type: 'string',
      description:
        'POWL discovery variant: decision_graph_cyclic (default), decision_graph_cyclic_strict, decision_graph_max, decision_graph_clustering, dynamic_clustering, maximal, tree',
    },
    'activity-key': {
      type: 'string',
      description: 'Event attribute key for activity names (default: concept:name)',
    },
    'min-trace-count': {
      type: 'string',
      description: 'Minimum trace count for a cut (default: 1)',
    },
    'noise-threshold': {
      type: 'string',
      description: 'Noise threshold for fall-through (default: 0.0)',
    },
    'input-format': {
      type: 'string',
      description: 'Input log format: xes or ocel (for discover; default: auto-detect)',
    },
    v2: {
      type: 'boolean',
      description: 'Parse as POWL v2 DSL format (for load subcommand)',
      default: false,
    },
    'ocel-variant': {
      type: 'string',
      description: 'OCEL discovery variant: flattening or oc_powl (default: flattening)',
    },
    'with-quality': {
      type: 'boolean',
      description:
        'Compute fitness/precision quality metrics after discover (requires --input XES log)',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const subcommand = ctx.args.subcommand as string;

    // Validate sub before opening a span — invalid sub is a usage error (config_error),
    // not a source_error. Passing an unknown subcommand is equivalent to passing an
    // unknown flag — exit 1.
    if (!POWL_SUBCOMMANDS.includes(subcommand as PowlSubcommand)) {
      const result = makeErrorResult(
        'powl',
        `Unknown operation: "${subcommand}". Valid: ${POWL_SUBCOMMANDS.join(', ')}`,
        EXIT_CODES.source_error,
        'INVALID_SUBCOMMAND'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    const sub = subcommand as PowlSubcommand;
    const isWriteSub = POWL_WRITE_SUBS.has(sub);
    const modelInput = (ctx.args.model as string) ?? '';

    return withSpanRaw(
      `wasm4pm.command.powl.${sub}`,
      {
        command: 'powl',
        subcommand: sub,
        kind: isWriteSub ? 'write' : 'read',
        model_source: modelInput ? (modelInput.includes('/') ? 'file' : 'inline') : 'none',
        ...(ctx.args.input ? { input: String(ctx.args.input) } : {}),
        ...(ctx.args.to ? { target: String(ctx.args.to) } : {}),
        ...(ctx.args.from ? { source: String(ctx.args.from) } : {}),
        ...(ctx.args.log ? { log: String(ctx.args.log) } : {}),
      },
      async () => {
        try {
          // Resolve model input (inline string or file)
          const needsModel = !['discover', 'load'].includes(sub);
          if (needsModel && !modelInput) {
            const modelSubcmds = POWL_SUBCOMMANDS.filter(s => s !== 'discover').join(', ');
            const result = makeErrorResult(
              'powl',
              `Missing required argument --model for 'wpm powl ${sub}'.\n\n` +
                `  --model accepts an inline POWL JSON string or a path to a .powl.json file.\n\n` +
                `  Examples:\n` +
                `    wpm powl ${sub} --model routes/my-route.powl.json\n` +
                `    wpm powl ${sub} --model '{"type":"sequence","children":[]}'\n\n` +
                `  Subcommands that require --model: ${modelSubcmds}\n` +
                `  Subcommand 'discover' auto-generates the model from a log (no --model needed):\n` +
                `    wpm powl discover -i process.xes`,
              EXIT_CODES.source_error,
              'MISSING_MODEL'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }
          const modelStr = needsModel ? ((await resolveModelInput(modelInput)) ?? '') : '';
          if (needsModel && !modelStr) {
            return await exitWithFlush(EXIT_CODES.source_error);
          }

          // Load WASM — reset singleton to respect quiet flag for each command
          WasmLoader.reset();
          const loader = WasmLoader.getInstance({ quiet: ctx.args.quiet as boolean } as any);
          await loader.init();
          const wasm = loader.get();

          // Execute subcommand
          const payload = await executePowlCommand(wasm, sub, modelStr, modelInput ?? '', ctx.args);

          // Persist — receipts only for WRITE subs (Surface Q).
          // Read subs (parse/diff/complexity/footprints/conformance/get-children/node-info)
          // emit a span only; saving a receipt for them would be forgery.
          if (isWriteSub && !ctx.args['no-save']) {
            const inputForHash = modelStr || (ctx.args.input ? String(ctx.args.input) : '');
            const savedPath = saveCommandReceipt({
              ...newReceipt(`powl ${sub}`),
              command: `powl ${sub}`,
              input_hash: blake3Hex(inputForHash),
              output_hash: blake3Hex(JSON.stringify(payload)),
              status: 'success',
              summary: {
                subcommand: sub,
                ...(payload.root !== undefined ? { root: payload.root } : {}),
                ...(payload.node_count !== undefined ? { node_count: payload.node_count } : {}),
                ...(payload.target !== undefined ? { target: payload.target } : {}),
              },
            });
            if (savedPath && format === 'human' && verbose) {
              (payload as Record<string, unknown>)['_savedPath'] = savedPath;
            }
          }

          const result = makeResult(
            `powl ${sub}`,
            payload,
            performance.now() - t0,
            EXIT_CODES.success
          );
          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            const data = res.payload as typeof payload;
            projection.success(`POWL ${sub} complete`);
            formatHumanOutput(projection, sub, data);
            if (verbose && (data as Record<string, unknown>)['_savedPath']) {
              projection.debug(`Receipt saved: ${(data as Record<string, unknown>)['_savedPath']}`);
            }
          });
          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const exitCode =
            error instanceof PowlConfigError
              ? EXIT_CODES.config_error
              : error instanceof PowlSourceError
                ? EXIT_CODES.source_error
                : EXIT_CODES.execution_error;
          // Forward the typed error code when the error carries one (PowlConfigError, PowlSourceError).
          const errorCode =
            error instanceof PowlConfigError || error instanceof PowlSourceError
              ? (error as PowlConfigError | PowlSourceError).code
              : 'COMMAND_ERROR';
          const result = makeErrorResult('powl', error, exitCode, errorCode);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Normalize WASM return value to a plain object.
 */
function normalizeResult(raw: unknown): Record<string, unknown> {
  if (raw instanceof Map) {
    return Object.fromEntries(raw);
  }
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  return raw as Record<string, unknown>;
}

/**
 * Convert models::EventLog JSON to powl_event_log::EventLog JSON.
 */
function convertModelsLogToPowlLog(modelsJson: string, activityKey: string): string {
  const models = JSON.parse(modelsJson) as {
    traces: Array<{
      attributes?: Record<string, Record<string, unknown>>;
      events: Array<{
        attributes?: Record<string, Record<string, unknown>>;
      }>;
    }>;
  };
  const powlLog = {
    traces: models.traces.map((t) => {
      const traceAttrs = t.attributes ?? {};
      const caseIdAttr = traceAttrs[activityKey];
      const caseId = extractTaggedString(caseIdAttr) ?? '';
      return {
        case_id: caseId,
        events: (t.events ?? []).map((e) => {
          const eventAttrs = e.attributes ?? {};
          const nameAttr = eventAttrs[activityKey];
          const tsAttr = eventAttrs['time:timestamp'];
          return {
            name: extractTaggedString(nameAttr) ?? '',
            timestamp: extractTaggedString(tsAttr) ?? null,
            lifecycle: null,
            attributes: {},
          };
        }),
      };
    }),
  };
  return JSON.stringify(powlLog);
}

function extractTaggedString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && 'tag' in (value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)['value'];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

async function resolveModelInput(input: string): Promise<string | null> {
  if (input.includes('/') || input.includes('\\') || input.endsWith('.powl')) {
    try {
      await fs.access(input);
      return fs.readFile(input, 'utf-8');
    } catch {
      return input;
    }
  }
  return input;
}

async function executePowlCommand(
  wasm: Record<string, any>,
  subcommand: PowlSubcommand,
  modelStr: string,
  rawInput: string,
  args: Record<string, any>
): Promise<Record<string, unknown>> {
  switch (subcommand) {
    case 'parse': {
      const raw = wasm.parse_powl(modelStr);
      return normalizeResult(raw);
    }

    case 'simplify': {
      const raw = wasm.simplify_powl(modelStr);
      return normalizeResult(raw);
    }

    case 'convert': {
      const target = args.to as string;
      if (!target) {
        throw new PowlConfigError(
          `Missing required argument: --to. Valid targets: ${CONVERT_TARGETS.join(', ')}`
        );
      }
      if (!CONVERT_TARGETS.includes(target as ConvertTarget)) {
        throw new PowlConfigError(
          `Unknown convert target: "${target}". Valid targets: ${CONVERT_TARGETS.join(', ')}`
        );
      }
      switch (target as ConvertTarget) {
        case 'petri-net': {
          const raw: string = wasm.powl_to_petri_net(modelStr);
          return { target, output: raw };
        }
        case 'process-tree': {
          const raw: string = wasm.powl_to_process_tree(modelStr);
          return { target, output: raw };
        }
        case 'bpmn': {
          const raw: string = wasm.powl_to_bpmn(modelStr);
          return { target, output: raw };
        }
        case 'svg': {
          const raw: string = wasm.powl_to_svg(modelStr);
          return { target, output: raw };
        }
        default:
          throw new PowlConfigError(`Unhandled convert target: ${target}`);
      }
    }

    case 'diff': {
      const model2Input = args.model2 as string;
      if (!model2Input) {
        throw new PowlSourceError(
          'Missing required argument: --model2 (second POWL model for diff)',
          'MISSING_MODEL2'
        );
      }
      const model2 = await resolveModelInput(model2Input);
      if (!model2) {
        throw new PowlSourceError(
          `Cannot resolve second model: ${model2Input}`,
          'MISSING_MODEL2'
        );
      }
      const raw: string = wasm.diff_models(modelStr, model2);
      const diffResult = normalizeResult(raw);

      // Enrich diff with complexity comparison between the two models.
      try {
        const [c1Raw, c2Raw] = await Promise.all([
          Promise.resolve(wasm.measure_complexity(modelStr) as string),
          Promise.resolve(wasm.measure_complexity(model2) as string),
        ]);
        const c1 = JSON.parse(c1Raw) as {
          cyclomatic: number;
          node_count: number;
          activity_count: number;
        };
        const c2 = JSON.parse(c2Raw) as {
          cyclomatic: number;
          node_count: number;
          activity_count: number;
        };
        diffResult['complexity_delta'] = {
          model_a: {
            node_count: c1.node_count,
            activity_count: c1.activity_count,
            cyclomatic: c1.cyclomatic,
          },
          model_b: {
            node_count: c2.node_count,
            activity_count: c2.activity_count,
            cyclomatic: c2.cyclomatic,
          },
          node_count_delta: c2.node_count - c1.node_count,
          activity_count_delta: c2.activity_count - c1.activity_count,
          cyclomatic_delta: c2.cyclomatic - c1.cyclomatic,
          cyclomatic_pct_change:
            c1.cyclomatic > 0
              ? Math.round(((c2.cyclomatic - c1.cyclomatic) / c1.cyclomatic) * 100)
              : null,
        };
      } catch {
        // Non-fatal: complexity delta is additional enrichment
      }

      return diffResult;
    }

    case 'complexity': {
      const raw: string = wasm.measure_complexity(modelStr);
      const result = JSON.parse(raw) as Record<string, unknown>;

      // Enrich with operator breakdown derived from POWL repr string.
      // We count operator keywords in the canonical representation produced
      // by arena.to_repr(): X(...) = XOR, +(...) = PARALLEL, *(...) = LOOP,
      // ->(...) or sequences = SEQUENCE, PO{...} = PARTIAL_ORDER.
      try {
        const reprRaw: string = wasm.powl_to_string(modelStr);
        const opBreakdown = countOperators(reprRaw);
        result['operator_breakdown'] = opBreakdown;
        // Concurrent activity pairs from footprints
        const fpRaw: string = wasm.powl_footprints(modelStr);
        const fp = JSON.parse(fpRaw) as { parallel?: Array<[string, string]> };
        const parPairs = fp.parallel ?? [];
        // Deduplicate bidirectional pairs
        const seen = new Set<string>();
        const concurrentPairs: Array<[string, string]> = [];
        for (const p of parPairs) {
          if (!Array.isArray(p) || p.length !== 2) continue;
          const [a, b] = p as [string, string];
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          if (!seen.has(key)) {
            seen.add(key);
            concurrentPairs.push(a < b ? [a, b] : [b, a]);
          }
        }
        result['concurrent_pairs'] = concurrentPairs;
        result['concurrent_pair_count'] = concurrentPairs.length;
      } catch {
        // Non-fatal: operator breakdown is additional enrichment
      }

      return result;
    }

    case 'footprints': {
      const raw: string = wasm.powl_footprints(modelStr);
      const fp = JSON.parse(raw) as Record<string, unknown>;

      // Build ordering matrix from the footprints data
      try {
        const matrix = buildOrderingMatrix(fp);
        fp['ordering_matrix'] = matrix;
      } catch {
        // Non-fatal: ordering matrix is additional enrichment
      }

      return fp;
    }

    case 'conformance': {
      const logPath = args.log as string;
      if (!logPath) {
        throw new PowlSourceError('Missing required argument: --log (path to XES event log)');
      }
      let logContent: string;
      try {
        await fs.access(logPath);
        logContent = await fs.readFile(logPath, 'utf-8');
      } catch {
        throw new PowlSourceError(`Cannot read XES log file: "${logPath}"`);
      }
      const confActivityKey = (args['activity-key'] as string) || 'concept:name';
      let logHandle: string;
      try {
        logHandle = wasm.load_eventlog_from_xes(logContent);
      } catch (e) {
        throw new PowlSourceError(
          `Cannot parse XES log "${logPath}": ${e instanceof Error ? e.message : String(e)}`
        );
      }
      const modelsLogJson: string = wasm.export_eventlog_to_json(logHandle);
      wasm.delete_object(logHandle);
      const logJson: string = convertModelsLogToPowlLog(modelsLogJson, confActivityKey);
      const raw: string = wasm.token_replay_fitness(modelStr, logJson);
      // token_replay_fitness returns FitnessResult:
      //   { percentage, avg_trace_fitness, avg_trace_precision, perfectly_fitting_traces,
      //     total_traces, trace_results: [{ case_id, fitness, precision, ... }] }
      return JSON.parse(raw);
    }

    case 'import': {
      const source = args.from as string;
      if (!source || !IMPORT_SOURCES.includes(source as ImportSource)) {
        throw new PowlConfigError(
          `Unknown source format: "${source}". Valid: ${IMPORT_SOURCES.join(', ')}`
        );
      }
      let fileContent: string;
      try {
        await fs.access(rawInput);
        fileContent = await fs.readFile(rawInput, 'utf-8');
      } catch {
        throw new PowlSourceError(`Cannot read file: ${rawInput}`);
      }
      switch (source as ImportSource) {
        case 'process-tree': {
          const raw = wasm.process_tree_to_powl(fileContent);
          return normalizeResult(raw);
        }
        case 'petri-net': {
          const raw = wasm.petri_net_to_powl(fileContent);
          return normalizeResult(raw);
        }
        default:
          throw new PowlConfigError(`Unhandled import source: ${source}`);
      }
    }

    case 'get-children': {
      const index = Number(args.index ?? 0);
      const raw = wasm.get_children(modelStr, index);
      return normalizeResult(raw);
    }

    case 'node-info': {
      const index = Number(args.index ?? 0);
      const raw = wasm.node_info_json(modelStr, index);
      return JSON.parse(raw);
    }

    case 'discover': {
      const input = args.input as string;
      if (!input) {
        throw new PowlSourceError('Input log required: use --input or -i');
      }
      const variant = (args.variant as string) || 'decision_graph_cyclic';
      const activityKey = (args['activity-key'] as string) || 'concept:name';
      const minTraceCount = (args['min-trace-count'] as number) || 1;
      const noiseThreshold = (args['noise-threshold'] as number) || 0.0;
      // inputFormat and ocelVariant reserved for future multi-format OCEL dispatch

      // Auto-detect format or use explicit --input-format
      let logJson: string;
      if (input.endsWith('.xes')) {
        let xesContent: string;
        try {
          xesContent = await fs.readFile(input, 'utf-8');
        } catch (e) {
          throw new PowlSourceError(
            `Cannot read XES log file: "${input}": ${e instanceof Error ? e.message : String(e)}`,
            'DISCOVER_INPUT_NOT_FOUND'
          );
        }
        const logHandle: string = wasm.load_eventlog_from_xes(xesContent);
        logJson = wasm.export_eventlog_to_json(logHandle);
        wasm.delete_object(logHandle);
      } else {
        try {
          logJson = await fs.readFile(input, 'utf-8');
        } catch (e) {
          throw new PowlSourceError(
            `Cannot read log file: "${input}": ${e instanceof Error ? e.message : String(e)}`,
            'DISCOVER_INPUT_NOT_FOUND'
          );
        }
      }

      // Extract log statistics before discovery (trace_count, activity_count)
      let logStats: { trace_count: number; activity_count: number } | null = null;
      try {
        const parsedLog = JSON.parse(logJson) as {
          traces?: Array<{ events?: Array<{ attributes?: Record<string, unknown> }> }>;
        };
        const traces = parsedLog.traces ?? [];
        const activitySet = new Set<string>();
        for (const t of traces) {
          for (const e of t.events ?? []) {
            const nameAttr = (e.attributes ?? {})[activityKey];
            const name = extractTaggedString(nameAttr);
            if (name) activitySet.add(name);
          }
        }
        logStats = { trace_count: traces.length, activity_count: activitySet.size };
      } catch {
        // Non-fatal: log stats are informational only
      }

      // Use config path when any non-default option was explicitly provided.
      // Note: citsy always populates all declared args (they are never absent from
      // Object.keys(args)), so we test actual *values* rather than key presence.
      const useConfig =
        activityKey !== 'concept:name' || minTraceCount !== 1 || noiseThreshold !== 0.0;
      let raw;
      if (useConfig) {
        raw = wasm.discover_powl_from_log_config(
          logJson,
          activityKey,
          variant,
          minTraceCount,
          noiseThreshold
        );
      } else {
        raw = wasm.discover_powl_from_log(logJson, variant);
      }

      const discoveryResult = normalizeResult(raw);

      // Optionally compute quality metrics (--with-quality flag)
      if (args['with-quality']) {
        try {
          // Convert logJson to powl event log format for token replay
          const powlLogJson = convertModelsLogToPowlLog(logJson, activityKey);
          const modelStr = String(discoveryResult['repr'] ?? '');
          if (modelStr) {
            // Token replay fitness
            const fitnessRaw: string = wasm.token_replay_fitness(modelStr, powlLogJson);
            const fitness = JSON.parse(fitnessRaw) as {
              percentage: number;
              avg_trace_precision: number;
              perfectly_fitting_traces: number;
              total_traces: number;
            };

            // Footprints-based conformance (precision proxy)
            let footprintsPrecision: number | null = null;
            try {
              const fpRaw: string = wasm.footprints_conformance(modelStr, powlLogJson);
              const fp = JSON.parse(fpRaw) as { precision?: number; f1?: number };
              footprintsPrecision = typeof fp.precision === 'number' ? fp.precision : null;
            } catch {
              // Non-fatal: footprints conformance is optional
            }

            // Complexity-based simplicity score: higher complexity → lower simplicity
            let simplicity: number | null = null;
            try {
              const cplxRaw: string = wasm.measure_complexity(modelStr);
              const cplx = JSON.parse(cplxRaw) as {
                cyclomatic?: number;
                node_count?: number;
                activity_count?: number;
              };
              // Simplicity: inversely proportional to cyclomatic complexity
              // Normalised to [0,1]: 1 = minimal complexity, 0 = very complex
              const cyc = cplx.cyclomatic ?? 0;
              simplicity = Math.max(0, 1 - cyc / Math.max(cyc + 10, 20));
            } catch {
              // Non-fatal
            }

            discoveryResult['quality'] = {
              fitness: fitness.percentage,
              avg_trace_fitness: fitness.percentage,
              precision:
                footprintsPrecision !== null ? footprintsPrecision : fitness.avg_trace_precision,
              simplicity,
              perfectly_fitting_traces: fitness.perfectly_fitting_traces,
              total_traces: fitness.total_traces,
            };
          }
        } catch {
          // Non-fatal: quality computation errors don't block discover
          discoveryResult['quality_error'] =
            'Quality metrics unavailable (model may not support token replay)';
        }
      }

      if (logStats) {
        discoveryResult['log_stats'] = logStats;
      }

      return discoveryResult;
    }

    case 'freq-analysis': {
      const raw: string = wasm.powl_freq_analysis(modelStr);
      return JSON.parse(raw);
    }

    case 'validate': {
      const checks: Array<{ name: string; pass: boolean; warning?: string }> = [];
      const warnings: string[] = [];

      // Check 1: well-formed JSON / parseable POWL
      let parsed: Record<string, unknown> | null = null;
      try {
        const raw = wasm.parse_powl(modelStr);
        parsed = normalizeResult(raw);
        checks.push({ name: 'Well-formed POWL (parseable)', pass: true });
      } catch (e) {
        checks.push({ name: 'Well-formed POWL (parseable)', pass: false });
        // Cannot continue further checks if parse fails
        return {
          valid: false,
          checks,
          warnings,
          error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      // Check 2: root node present
      const hasRoot = parsed !== null && parsed['root'] !== undefined;
      checks.push({ name: 'Root node present', pass: hasRoot });

      // Check 3: node_count > 0
      const nodeCount = (parsed?.['node_count'] as number) ?? 0;
      checks.push({ name: 'Non-empty model (node_count > 0)', pass: nodeCount > 0 });

      // Check 4: validate partial orders (no cycles in partial-order nodes)
      try {
        wasm.validate_partial_orders(modelStr);
        checks.push({ name: 'Partial-order nodes acyclic', pass: true });
      } catch (e) {
        checks.push({ name: 'Partial-order nodes acyclic', pass: false });
        warnings.push(`Partial-order violation: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Check 5: structural soundness via Petri net conversion
      let sound = false;
      try {
        const soundnessRaw: string = wasm.check_powl_soundness(modelStr);
        const soundness = JSON.parse(soundnessRaw) as {
          sound: boolean;
          deadlock_free: boolean;
          bounded: boolean;
          liveness: boolean;
        };
        sound = soundness.sound;
        checks.push({ name: 'Structurally sound (deadlock-free, bounded, live)', pass: sound });
        if (!sound) {
          if (!soundness.deadlock_free)
            warnings.push('Model has deadlock paths — some traces cannot complete.');
          if (!soundness.bounded) warnings.push('Model is unbounded — token accumulation possible.');
          if (!soundness.liveness)
            warnings.push('Model has dead transitions — some activities are unreachable.');
        }
      } catch {
        checks.push({ name: 'Structurally sound (deadlock-free, bounded, live)', pass: false });
        warnings.push('Soundness check failed — model may have structural defects.');
      }

      // Check 6: activity labels non-empty (scan repr string for empty labels)
      const repr = (parsed?.['repr'] as string) ?? '';
      const hasEmptyLabel = /\(\s*,|\,\s*,|\(\s*\)/.test(repr);
      if (hasEmptyLabel) {
        checks.push({ name: 'All activities have non-empty labels', pass: false });
        warnings.push('Empty activity labels detected in model representation.');
      } else {
        checks.push({ name: 'All activities have non-empty labels', pass: true });
      }

      const allPass = checks.every((c) => c.pass);
      const verdict = allPass && warnings.length === 0 ? 'VALID' : allPass ? 'VALID (with warnings)' : 'INVALID';

      return {
        valid: allPass,
        verdict,
        node_count: nodeCount,
        checks,
        warnings,
      };
    }

    case 'load': {
      // Load a POWL model from a .powl or .powl2 file (or inline string via --model).
      // Delegates to load_powl_from_string (v1) or load_powl_v2_from_string (v2 DSL).
      const fileArg = (args.input as string) || rawInput;
      if (!fileArg) {
        throw new PowlSourceError(
          'Missing required argument: --input or --model (path to .powl file or inline POWL string)',
          'LOAD_MISSING_INPUT'
        );
      }
      let content: string;
      try {
        await fs.access(fileArg);
        content = await fs.readFile(fileArg, 'utf-8');
      } catch {
        // Not a file path — treat as inline POWL string
        content = fileArg;
      }
      const useV2 = Boolean(args.v2);
      let raw: unknown;
      if (useV2) {
        raw = wasm.load_powl_v2_from_string(content);
      } else {
        raw = wasm.load_powl_from_string(content);
      }
      const loadResult = normalizeResult(raw);
      loadResult['_v2'] = useV2;
      return loadResult;
    }

    default:
      throw new Error(`Unhandled subcommand: ${subcommand}`);
  }
}

/**
 * Count POWL operator types in a canonical repr string.
 *
 * POWL notation: X(...)=XOR, +(...)=PARALLEL, *(...)=LOOP,
 * PO{...}=PARTIAL_ORDER, ->(...)=SEQUENCE (or bare sequences).
 * The repr uses these prefix characters before '(' or '{'.
 */
function countOperators(repr: string): {
  xor: number;
  parallel: number;
  loop: number;
  sequence: number;
  partial_order: number;
  total_operators: number;
} {
  // Count occurrences of operator prefixes in the repr
  const xor = (repr.match(/\bX\s*\(/g) ?? []).length;
  const parallel = (repr.match(/\+\s*\(/g) ?? []).length;
  const loop = (repr.match(/\*\s*\(/g) ?? []).length;
  const sequence = (repr.match(/->\s*\(/g) ?? []).length;
  const partial_order = (repr.match(/\bPO\s*\{/g) ?? []).length;
  return {
    xor,
    parallel,
    loop,
    sequence,
    partial_order,
    total_operators: xor + parallel + loop + sequence + partial_order,
  };
}

/**
 * Build a compact ordering matrix from POWL footprints data.
 *
 * Each cell contains one of:
 *   '→' directly follows (in sequence)
 *   '‖' parallel (can co-occur concurrently)
 *   '#' never together (neither sequence nor parallel)
 *   '◆' self
 */
function buildOrderingMatrix(fp: Record<string, unknown>): {
  activities: string[];
  matrix: string[][];
  legend: Record<string, string>;
} {
  const toSorted = (v: unknown): string[] => {
    if (Array.isArray(v)) return (v as string[]).slice().sort();
    if (v !== null && typeof v === 'object') return Object.keys(v as object).sort();
    return [];
  };
  const toPairSet = (v: unknown): Set<string> => {
    const s = new Set<string>();
    if (!Array.isArray(v)) return s;
    for (const p of v as unknown[]) {
      if (Array.isArray(p) && p.length === 2) {
        s.add(`${p[0]}|${p[1]}`);
      }
    }
    return s;
  };

  const acts = toSorted(fp['activities']);
  const seqSet = toPairSet(fp['sequence']);
  const parSet = toPairSet(fp['parallel']);

  const matrix: string[][] = acts.map((a) =>
    acts.map((b) => {
      if (a === b) return '◆';
      if (seqSet.has(`${a}|${b}`)) return '→';
      if (parSet.has(`${a}|${b}`) || parSet.has(`${b}|${a}`)) return '‖';
      return '#';
    })
  );

  return {
    activities: acts,
    matrix,
    legend: {
      '→': 'directly follows (sequence)',
      '‖': 'parallel (concurrent)',
      '#': 'never together',
      '◆': 'self',
    },
  };
}

function formatHumanOutput(
  projection: import('../output.js').ConsoleProjection,
  subcommand: PowlSubcommand,
  result: Record<string, unknown>
): void {
  switch (subcommand) {
    case 'parse':
    case 'simplify':
    case 'import': {
      projection.log('');
      projection.log(`  Root index:   ${result.root}`);
      projection.log(`  Node count:   ${result.node_count}`);
      projection.log(`  Representation: ${result.repr}`);
      projection.log('');
      break;
    }

    case 'convert': {
      const target = result.target as string;
      projection.log('');
      projection.log(`  Target: ${target}`);
      projection.log(`  Output length: ${String(result.output).length} chars`);
      const output = result.output as string;
      const lines = output.split('\n').slice(0, 5);
      if (lines.length > 1) {
        projection.log('  Preview:');
        for (const line of lines) {
          projection.log(`    ${line}`);
        }
        if (output.split('\n').length > 5) {
          projection.log(`    ... (${output.split('\n').length - 5} more lines)`);
        }
      }
      projection.log('');
      break;
    }

    case 'diff': {
      projection.log('');
      const sevGlyph: Record<string, string> = {
        None: '[=]',
        Minor: '[~]',
        Moderate: '[!]',
        Breaking: '[X]',
      };
      const sev = String(result.severity ?? 'None');
      projection.log(`  Severity: ${sevGlyph[sev] ?? '[?]'} ${sev}`);
      projection.log(`  Behaviorally equivalent: ${result.behaviourally_equivalent}`);
      if ((result.min_trace_length_delta as number) !== 0) {
        projection.log(`  Trace length delta: ${result.min_trace_length_delta}`);
      }
      if (result.added_activities && (result.added_activities as string[]).length > 0) {
        projection.log(
          `  Added activities:    ${(result.added_activities as string[]).join(', ')}`
        );
      }
      if (result.removed_activities && (result.removed_activities as string[]).length > 0) {
        projection.log(
          `  Removed activities:  ${(result.removed_activities as string[]).join(', ')}`
        );
      }
      if (
        result.always_changes &&
        (result.always_changes as Array<Record<string, unknown>>).length > 0
      ) {
        projection.log('  Mandatory/optional changes:');
        for (const ac of result.always_changes as Array<Record<string, unknown>>) {
          const chType = Object.keys(ac)[0] as string;
          const chAct = ac[chType] as string;
          if (chType === 'BecameMandatory') {
            projection.log(`    + mandatory: ${chAct}`);
          } else if (chType === 'BecameOptional') {
            projection.log(`    - optional:  ${chAct}`);
          } else {
            projection.log(`    ${chType}: ${chAct}`);
          }
        }
      }
      if (
        result.order_changes &&
        (result.order_changes as Array<Record<string, unknown>>).length > 0
      ) {
        projection.log('  Ordering constraint changes:');
        for (const oc of result.order_changes as Array<Record<string, unknown>>) {
          const chType = Object.keys(oc)[0] as string;
          const val = oc[chType];
          if (chType === 'SequenceAdded') {
            const p = val as [string, string];
            projection.log(`    + sequence:  ${p[0]} --> ${p[1]}`);
          } else if (chType === 'SequenceRemoved') {
            const p = val as [string, string];
            projection.log(`    - sequence:  ${p[0]} --> ${p[1]}`);
          } else if (chType === 'ParallelAdded') {
            const p = val as [string, string];
            projection.log(`    + parallel:  ${p[0]} || ${p[1]}`);
          } else if (chType === 'ParallelRemoved') {
            const p = val as [string, string];
            projection.log(`    - parallel:  ${p[0]} || ${p[1]}`);
          } else if (chType === 'StartAdded') {
            projection.log(`    + start:     ${val}`);
          } else if (chType === 'StartRemoved') {
            projection.log(`    - start:     ${val}`);
          } else if (chType === 'EndAdded') {
            projection.log(`    + end:       ${val}`);
          } else if (chType === 'EndRemoved') {
            projection.log(`    - end:       ${val}`);
          } else {
            projection.log(`    ${chType}: ${JSON.stringify(val)}`);
          }
        }
      }
      if (
        result.structure_changes &&
        (result.structure_changes as Array<Record<string, unknown>>).length > 0
      ) {
        projection.log('  Structure changes:');
        for (const sc of result.structure_changes as Array<Record<string, unknown>>) {
          projection.log(`    @ ${sc['location']}: ${sc['from']} => ${sc['to']}`);
        }
      }

      // Complexity delta summary (enriched by TypeScript post-processing)
      if (result.complexity_delta) {
        const cd = result.complexity_delta as {
          model_a: { node_count: number; activity_count: number; cyclomatic: number };
          model_b: { node_count: number; activity_count: number; cyclomatic: number };
          node_count_delta: number;
          activity_count_delta: number;
          cyclomatic_delta: number;
          cyclomatic_pct_change: number | null;
        };
        projection.log('');
        projection.log('  Complexity summary:');
        const fmtDelta = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '=');
        projection.log(
          `    Model A: ${cd.model_a.node_count} nodes, ${cd.model_a.activity_count} activities, cyclomatic=${cd.model_a.cyclomatic}`
        );
        projection.log(
          `    Model B: ${cd.model_b.node_count} nodes, ${cd.model_b.activity_count} activities, cyclomatic=${cd.model_b.cyclomatic}`
        );
        const pctStr =
          cd.cyclomatic_pct_change !== null ? ` (${fmtDelta(cd.cyclomatic_pct_change)}%)` : '';
        projection.log(
          `    Delta:   nodes ${fmtDelta(cd.node_count_delta)}, activities ${fmtDelta(cd.activity_count_delta)}, cyclomatic ${fmtDelta(cd.cyclomatic_delta)}${pctStr}`
        );
      }
      projection.log('');
      break;
    }

    case 'complexity': {
      // Van der Aalst maintainability thresholds:
      //   cyclomatic: simple <5, moderate 5-10, complex >10
      //   cognitive:  simple <10, moderate 10-25, complex >25
      const cyc = result.cyclomatic as number;
      const cog = result.cognitive as number;
      const cfc = result.cfc as number;
      const cycBand = cyc < 5 ? 'simple' : cyc <= 10 ? 'moderate' : 'complex';
      const cogBand = cog < 10 ? 'simple' : cog <= 25 ? 'moderate' : 'complex';
      const cycBar =
        '[' +
        '#'.repeat(Math.min(5, Math.floor(cyc / 2))) +
        '.'.repeat(Math.max(0, 5 - Math.floor(cyc / 2))) +
        ']';
      projection.log('');
      projection.log(`  Activities:      ${result.activity_count}`);
      projection.log(`  Node count:      ${result.node_count}`);
      projection.log(`  Nesting depth:   ${result.nesting_depth}`);
      projection.log(
        `  Branching factor:${typeof result.branching_factor === 'number' ? ` ${(result.branching_factor as number).toFixed(2)}` : ' n/a'}`
      );
      projection.log('');
      projection.log(
        `  Cyclomatic:      ${cyc.toString().padStart(3)}  ${cycBar}  ${cycBand}  (simple<5, moderate<=10, complex>10)`
      );
      // Process-mining interpretation: cyclomatic complexity N means there are
      // N independent control-flow paths through the model. Each additional
      // independent path is a potential new trace variant in the event log.
      // High cyclomatic complexity is a leading indicator of variant explosion —
      // a log with many variants is harder to replay conformantly and harder
      // for stakeholders to understand (Van der Aalst, 2016, §6.2).
      if (cyc > 1) {
        const variantRisk = cyc < 5 ? 'low' : cyc <= 10 ? 'moderate' : 'high';
        projection.log(
          `    ^ ${cyc} independent control-flow path${cyc === 1 ? '' : 's'} — ${variantRisk} variant-explosion risk.` +
            (cyc > 10
              ? ` With ${cyc} paths, conformance checking cost grows exponentially;` +
                ` consider simplifying before running token replay.`
              : '')
        );
      }
      projection.log(`  CFC:             ${cfc.toString().padStart(3)}`);
      projection.log(
        `  Cognitive:       ${cog.toString().padStart(3)}  ${cogBand}  (simple<10, moderate<=25, complex>25)`
      );
      if (result.halstead) {
        const h = result.halstead as Record<string, unknown>;
        projection.log('');
        projection.log(
          `  Halstead volume: ${typeof h.volume === 'number' ? (h.volume as number).toFixed(1) : h.volume}`
        );
        projection.log(
          `  Halstead effort: ${typeof h.effort === 'number' ? (h.effort as number).toFixed(1) : h.effort}`
        );
        projection.log(
          `  Halstead vocab:  ${h.vocabulary}  (${h.n1} operators + ${h.n2} operands)`
        );
      }

      // Operator breakdown (enriched by TypeScript post-processing)
      if (result.operator_breakdown) {
        const ob = result.operator_breakdown as {
          xor: number;
          parallel: number;
          loop: number;
          sequence: number;
          partial_order: number;
          total_operators: number;
        };
        if (ob.total_operators > 0) {
          projection.log('');
          projection.log('  Operator breakdown:');
          if (ob.sequence > 0) projection.log(`    SEQUENCE:       ${ob.sequence}`);
          if (ob.xor > 0) projection.log(`    XOR:            ${ob.xor}  (choice points)`);
          if (ob.parallel > 0) projection.log(`    PARALLEL:       ${ob.parallel}  (concurrency)`);
          if (ob.loop > 0) projection.log(`    LOOP:           ${ob.loop}  (rework potential)`);
          if (ob.partial_order > 0)
            projection.log(`    PARTIAL_ORDER:  ${ob.partial_order}  (partial ordering)`);
        }
      }

      // Concurrent activity pairs
      if (result.concurrent_pairs) {
        const pairs = result.concurrent_pairs as Array<[string, string]>;
        if (pairs.length > 0) {
          projection.log('');
          projection.log(`  Concurrent activity pairs (${pairs.length}):`);
          for (const [a, b] of pairs) {
            projection.log(`    ${a}  ‖  ${b}`);
          }
        }
      }

      projection.log('');
      break;
    }

    case 'footprints': {
      // Normalize set fields — WASM may serialize a HashSet as array or object keys
      const toSorted = (v: unknown): string[] => {
        if (Array.isArray(v)) return (v as string[]).slice().sort();
        if (v !== null && typeof v === 'object') return Object.keys(v as object).sort();
        return [];
      };
      // Pairs: HashSet<(String,String)> serializes as [[a,b],...] array of 2-tuples
      const toPairs = (v: unknown): Array<[string, string]> => {
        if (!Array.isArray(v)) return [];
        return (v as unknown[]).filter(
          (p): p is [string, string] =>
            Array.isArray(p) &&
            p.length === 2 &&
            typeof p[0] === 'string' &&
            typeof p[1] === 'string'
        );
      };
      const acts = toSorted(result.activities);
      const startActs = toSorted(result.start_activities);
      const endActs = toSorted(result.end_activities);
      const alwaysActs = toSorted(result.activities_always_happening);
      const seqPairs = toPairs(result.sequence);
      const parPairs = toPairs(result.parallel);
      projection.log('');
      projection.log(`  Activities (${acts.length}):        ${acts.join(', ')}`);
      projection.log(`  Start activities (${startActs.length}):   ${startActs.join(', ')}`);
      projection.log(`  End activities (${endActs.length}):       ${endActs.join(', ')}`);
      if (alwaysActs.length > 0) {
        projection.log(`  Always happening (${alwaysActs.length}):   ${alwaysActs.join(', ')}`);
      }
      projection.log(`  Min trace length:           ${result.min_trace_length}`);
      projection.log('');
      if (seqPairs.length > 0) {
        projection.log(`  Sequence ordering (${seqPairs.length} pairs):`);
        const sorted = seqPairs
          .slice()
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
        for (const [a, b] of sorted) {
          projection.log(`    ${a.padEnd(30)} -->  ${b}`);
        }
        projection.log('');
      }
      if (parPairs.length > 0) {
        // Parallel pairs are bidirectional — deduplicate: show only a < b
        const seen = new Set<string>();
        const deduped: Array<[string, string]> = [];
        for (const [a, b] of parPairs) {
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(a < b ? [a, b] : [b, a]);
          }
        }
        deduped.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
        projection.log(`  Parallel (concurrent) (${deduped.length} pairs):`);
        for (const [a, b] of deduped) {
          projection.log(`    ${a.padEnd(30)} ||   ${b}`);
        }
        projection.log('');
      }

      // Ordering matrix (ASCII binary relation matrix) — only show for small models
      if (result.ordering_matrix) {
        const om = result.ordering_matrix as {
          activities: string[];
          matrix: string[][];
          legend: Record<string, string>;
        };
        if (om.activities.length > 0 && om.activities.length <= 12) {
          const colW = Math.min(10, Math.max(...om.activities.map((a) => a.length), 4));
          const shortName = (s: string) =>
            s.length > colW ? s.slice(0, colW - 1) + '…' : s.padEnd(colW);
          projection.log('  Ordering matrix (→=sequence, ‖=parallel, #=never, ◆=self):');
          // Header row
          const headerCols = om.activities.map((a) => shortName(a)).join('  ');
          const rowLabelW = colW + 2;
          projection.log(`    ${' '.repeat(rowLabelW)}  ${headerCols}`);
          for (let i = 0; i < om.activities.length; i++) {
            const rowLabel = shortName(om.activities[i]);
            const cells = om.matrix[i].map((c) => c.padEnd(colW)).join('  ');
            projection.log(`    ${rowLabel.padEnd(rowLabelW)}  ${cells}`);
          }
          projection.log('');
        }
      }
      break;
    }

    case 'conformance': {
      // Van der Aalst: fitness AND precision must both be shown together —
      // presenting fitness alone misleads the practitioner (flower model trap).
      const fitPct = ((result.percentage as number) * 100).toFixed(1);
      const precPct =
        typeof result.avg_trace_precision === 'number'
          ? ((result.avg_trace_precision as number) * 100).toFixed(1)
          : 'n/a';
      // ASCII proportion glyph: ▓ = fitted, ░ = missing
      const barWidth = 20;
      const fitFilled = Math.round((result.percentage as number) * barWidth);
      const fitBar = '▓'.repeat(fitFilled) + '░'.repeat(barWidth - fitFilled);
      const precVal =
        typeof result.avg_trace_precision === 'number' ? (result.avg_trace_precision as number) : 0;
      const precFilled = Math.round(precVal * barWidth);
      const precBar = '▓'.repeat(precFilled) + '░'.repeat(barWidth - precFilled);
      projection.log('');
      projection.log(`  Fitness:             ${fitPct.padStart(6)}%  [${fitBar}]  (token replay)`);
      projection.log(
        `  Precision:           ${precPct.padStart(6)}%  [${precBar}]  (token replay)`
      );
      projection.log(
        `  Avg trace fitness:   ${((result.avg_trace_fitness as number) * 100).toFixed(1).padStart(6)}%`
      );
      projection.log(
        `  Perfectly fitting:   ${result.perfectly_fitting_traces} / ${result.total_traces} traces`
      );
      // Deviation summary — show count before the per-trace list so the
      // practitioner immediately sees scope without scrolling through all rows.
      const traceResults = (result.trace_results as Array<Record<string, unknown>>) ?? [];
      if (traceResults.length > 0) {
        const deviatingTraces = traceResults.filter(
          (tr) => tr.missing_tokens !== 0 || tr.remaining_tokens !== 0
        );
        const deviatingCount = deviatingTraces.length;
        const totalCount = traceResults.length;
        if (deviatingCount === 0) {
          projection.log(
            '  Deviation summary:   all traces conform — no missing or remaining tokens.'
          );
        } else {
          const pct = ((deviatingCount / totalCount) * 100).toFixed(0);
          projection.log(
            `  Deviation summary:   ${deviatingCount} / ${totalCount} traces deviate (${pct}%).` +
              (deviatingCount === totalCount
                ? ' All traces deviate — model may be too restrictive or log has systematic rework.'
                : deviatingCount / totalCount > 0.5
                  ? ' Majority deviating — check for missing activities or model under-fit.'
                  : '')
          );
        }
        projection.log('');
        projection.log('  Per-trace results:');
        for (const tr of traceResults) {
          const caseId = String(tr.case_id ?? '?');
          const fit = ((tr.fitness as number) * 100).toFixed(1);
          const prec =
            typeof tr.precision === 'number' ? ((tr.precision as number) * 100).toFixed(1) : 'n/a';
          const missing = tr.missing_tokens ?? 0;
          const remaining = tr.remaining_tokens ?? 0;
          const marker = tr.missing_tokens === 0 && tr.remaining_tokens === 0 ? '✓' : '✗';
          projection.log(
            `    ${marker} ${caseId.padEnd(20)} fitness=${fit}%  prec=${prec}%  missing=${missing} remaining=${remaining}`
          );
        }
      }
      projection.log('');
      break;
    }

    case 'validate': {
      projection.log('');
      const checks = (result.checks as Array<{ name: string; pass: boolean }>) ?? [];
      for (const chk of checks) {
        const glyph = chk.pass ? '✔' : '✘';
        projection.log(`  ${glyph} ${chk.name}`);
      }
      const warnings = (result.warnings as string[]) ?? [];
      if (warnings.length > 0) {
        projection.log('');
        for (const w of warnings) {
          projection.log(`  ⚠  ${w}`);
        }
      }
      projection.log('');
      const verdict = String(result.verdict ?? (result.valid ? 'VALID' : 'INVALID'));
      const warningCount = warnings.length;
      projection.log(
        `  Validation: ${verdict}${warningCount > 0 ? ` (${warningCount} warning${warningCount === 1 ? '' : 's'})` : ''}`
      );
      projection.log('');
      break;
    }

    case 'get-children': {
      projection.log('');
      projection.log(`  Children: ${(result.children as number[]).join(', ')}`);
      projection.log('');
      break;
    }

    case 'node-info': {
      projection.log('');
      projection.log(`  Type: ${result.type}`);
      if (result.label !== undefined) projection.log(`  Label: ${result.label}`);
      projection.log(`  Children: ${(result.children as number[]).join(', ')}`);
      if (result.edges) projection.log(`  Edges: ${(result.edges as unknown[]).length}`);
      if (result.start_nodes !== undefined)
        projection.log(`  Start nodes: ${(result.start_nodes as number[]).join(', ')}`);
      if (result.end_nodes !== undefined)
        projection.log(`  End nodes: ${(result.end_nodes as number[]).join(', ')}`);
      if (result.empty_path !== undefined) projection.log(`  Empty path: ${result.empty_path}`);
      projection.log('');
      break;
    }

    case 'discover': {
      projection.log('');
      // Log stats header
      if (result.log_stats) {
        const ls = result.log_stats as { trace_count: number; activity_count: number };
        projection.log(`  Algorithm: POWL Discovery (variant: ${result.variant})`);
        projection.log(`  Log: ${ls.trace_count} traces, ${ls.activity_count} activities`);
        projection.log('');
      }
      projection.log(`  Discovered model:`);
      projection.log(`    Root index:   ${result.root}`);
      projection.log(`    Node count:   ${result.node_count}`);
      projection.log(`    Representation:`);
      const reprLines = String(result.repr ?? '').split(',');
      if (reprLines.length > 1) {
        for (const line of reprLines) {
          projection.log(`      ${line.trim()}`);
        }
      } else {
        projection.log(`      ${result.repr}`);
      }
      if (result.config) {
        const config = result.config as Record<string, unknown>;
        projection.log('');
        projection.log(`  Config:`);
        projection.log(`    Activity key:     ${config.activity_key}`);
        projection.log(`    Min trace count:  ${config.min_trace_count}`);
        projection.log(`    Noise threshold:  ${config.noise_threshold}`);
      }
      // Quality metrics (shown when --with-quality was passed)
      if (result.quality) {
        const q = result.quality as {
          fitness: number;
          precision: number;
          simplicity: number | null;
          perfectly_fitting_traces: number;
          total_traces: number;
        };
        const barW = 12;
        const bar = (v: number) =>
          '█'.repeat(Math.round(v * barW)) + '░'.repeat(barW - Math.round(v * barW));
        projection.log('');
        projection.log('  Quality:');
        projection.log(
          `    Fitness:    ${(q.fitness * 100).toFixed(1).padStart(5)}%  [${bar(q.fitness)}]`
        );
        projection.log(
          `    Precision:  ${(q.precision * 100).toFixed(1).padStart(5)}%  [${bar(q.precision)}]`
        );
        if (q.simplicity !== null) {
          projection.log(
            `    Simplicity: ${(q.simplicity * 100).toFixed(1).padStart(5)}%  [${bar(q.simplicity)}]`
          );
        }
        projection.log(
          `    Perfectly fitting: ${q.perfectly_fitting_traces} / ${q.total_traces} traces`
        );
      } else if (result.quality_error) {
        projection.log('');
        projection.log(`  Quality: ${result.quality_error}`);
      }
      projection.log('');
      break;
    }

    case 'load': {
      const dsl = result._v2 ? 'v2 DSL' : 'v1';
      const handle = (result.handle as string) ?? (result.root !== undefined ? String(result.root) : 'n/a');
      const nodeCount = result.node_count ?? result.nodes ?? 'n/a';
      const repr = result.repr ?? result.representation ?? '';
      projection.log('');
      projection.log(`  Loaded POWL model (${dsl}):`);
      projection.log(`    handle=${handle}, nodes=${nodeCount}`);
      if (repr) projection.log(`    repr=${repr}`);
      projection.log('');
      break;
    }

    case 'freq-analysis': {
      // Van der Aalst: frequency semantics are a first-class quality dimension
      // for TaggedPOWL. Showing min/max together avoids the "skippable bool only"
      // trap that hides the exact repetition contract.
      const total = result.total_frequent_transitions as number;
      const skippable = result.skippable_count as number;
      const repeatable = result.repeatable_count as number;
      const unbounded = result.unbounded_count as number;
      const freqMinMin = result.freq_min_min;
      const freqMaxMax = result.freq_max_max;
      const nodes = (result.nodes as Array<Record<string, unknown>>) ?? [];

      const fmtRange = (min: unknown, max: unknown): string => {
        const maxStr = max === null || max === undefined ? '∞' : String(max);
        return `[${min}, ${maxStr}]`;
      };

      projection.log('');
      projection.log(`  Frequent transitions:  ${total}`);
      if (total === 0) {
        projection.log('  (No FrequentTransition nodes — all activities have fixed freq [1,1])');
        projection.log('');
        break;
      }

      // Summary bar: proportion glyph for skippable / repeatable / unbounded
      const barW = 10;
      const skipBar =
        '▓'.repeat(Math.round((skippable / total) * barW)) +
        '░'.repeat(barW - Math.round((skippable / total) * barW));
      const repBar =
        '▓'.repeat(Math.round((repeatable / total) * barW)) +
        '░'.repeat(barW - Math.round((repeatable / total) * barW));

      projection.log(`  Skippable (min=0):     ${skippable} / ${total}  [${skipBar}]`);
      projection.log(`  Repeatable (max>1|∞):  ${repeatable} / ${total}  [${repBar}]`);
      projection.log(`  Unbounded (max=∞):     ${unbounded} / ${total}`);
      projection.log(
        `  Overall freq range:    ${fmtRange(freqMinMin, freqMaxMax)}  (min of mins, max of maxes)`
      );
      projection.log('');

      // Per-node table — reference: TaggedPOWL.pretty() format
      projection.log(`  Per-node frequency ranges:`);
      const colW = Math.max(...nodes.map((n) => String(n.activity).length), 8) + 2;
      for (const node of nodes) {
        const act = String(node.activity).padEnd(colW);
        const range = fmtRange(node.min_freq, node.max_freq);
        const flags: string[] = [];
        if (node.is_skippable) flags.push('skippable');
        if (node.is_repeatable) flags.push('repeatable');
        if (node.is_unbounded) flags.push('unbounded');
        const flagStr = flags.length > 0 ? `  (${flags.join(', ')})` : '';
        projection.log(`    ${act}  freq=${range}${flagStr}`);
      }
      projection.log('');
      break;
    }
  }
}

/** Named alias used by the task-spec-defined import pattern. */
export { powl as powlCommand };
