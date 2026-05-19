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
  'get-children',
  'node-info',
] as const;
type PowlSubcommand = (typeof POWL_SUBCOMMANDS)[number];

/**
 * Surface Q: read vs write classification.
 *
 * Write subs produce a derived/transformed model artifact and emit a BLAKE3
 * receipt. Read subs are pure analysis and emit only an OTEL span — saving a
 * receipt for them was a forgery (asymmetric proof) and has been removed.
 */
const POWL_WRITE_SUBS = new Set<PowlSubcommand>([
  'simplify',
  'convert',
  'import',
  'discover',
]);

const CONVERT_TARGETS = ['petri-net', 'process-tree', 'bpmn', 'svg'] as const;
type ConvertTarget = (typeof CONVERT_TARGETS)[number];

const IMPORT_SOURCES = ['process-tree', 'petri-net'] as const;
type ImportSource = (typeof IMPORT_SOURCES)[number];

export const powl = defineCommand({
  meta: {
    name: 'powl',
    description:
      'POWL model analysis — parse, convert, simplify, diff, complexity, footprints, conformance, import, discover, get-children, node-info',
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
    'ocel-variant': {
      type: 'string',
      description: 'OCEL discovery variant: flattening or oc_powl (default: flattening)',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const subcommand = ctx.args.subcommand as string;

    // Validate sub before opening a span — invalid sub is a usage error,
    // not a powl execution.
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
          const needsModel = !['discover'].includes(sub);
          if (needsModel && !modelInput) {
            const result = makeErrorResult(
              'powl',
              'Missing required argument: --model',
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
          const payload = await executePowlCommand(
            wasm,
            sub,
            modelStr,
            modelInput ?? '',
            ctx.args
          );

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

          const result = makeResult(`powl ${sub}`, payload, performance.now() - t0, EXIT_CODES.success);
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
          const result = makeErrorResult('powl', error, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
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
      if (!target || !CONVERT_TARGETS.includes(target as ConvertTarget)) {
        return await exitWithFlush(EXIT_CODES.source_error);
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
      }
      throw new Error(`Unhandled convert target: ${target}`);
    }

    case 'diff': {
      const model2Input = args.model2 as string;
      if (!model2Input) {
        return await exitWithFlush(EXIT_CODES.source_error);
      }
      const model2 = await resolveModelInput(model2Input);
      if (!model2) {
        return await exitWithFlush(EXIT_CODES.source_error);
      }
      const raw: string = wasm.diff_models(modelStr, model2);
      return normalizeResult(raw);
    }

    case 'complexity': {
      const raw: string = wasm.measure_complexity(modelStr);
      return JSON.parse(raw);
    }

    case 'footprints': {
      const raw: string = wasm.powl_footprints(modelStr);
      return JSON.parse(raw);
    }

    case 'conformance': {
      const logPath = args.log as string;
      if (!logPath) {
        return await exitWithFlush(EXIT_CODES.source_error);
      }
      let logContent: string;
      try {
        await fs.access(logPath);
        logContent = await fs.readFile(logPath, 'utf-8');
      } catch {
        return await exitWithFlush(EXIT_CODES.source_error);
      }
      const confActivityKey = (args['activity-key'] as string) || 'concept:name';
      const logHandle: string = wasm.load_eventlog_from_xes(logContent);
      const modelsLogJson: string = wasm.export_eventlog_to_json(logHandle);
      wasm.delete_object(logHandle);
      const logJson: string = convertModelsLogToPowlLog(modelsLogJson, confActivityKey);
      const raw: string = wasm.token_replay_fitness(modelStr, logJson);
      return JSON.parse(raw);
    }

    case 'import': {
      const source = args.from as string;
      if (!source || !IMPORT_SOURCES.includes(source as ImportSource)) {
        throw new Error(`Unknown source format: "${source}". Valid: ${IMPORT_SOURCES.join(', ')}`);
      }
      let fileContent: string;
      try {
        await fs.access(rawInput);
        fileContent = await fs.readFile(rawInput, 'utf-8');
      } catch {
        throw new Error(`Cannot read file: ${rawInput}`);
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
      }
      throw new Error(`Unhandled import source: ${source}`);
    }

    case 'get-children': {
      const index = args.index as string;
      const raw = wasm.get_children(modelStr, index);
      return normalizeResult(raw);
    }

    case 'node-info': {
      const index = args.index as string;
      const raw = wasm.node_info_json(modelStr, index);
      return JSON.parse(raw);
    }

    case 'discover': {
      const input = args.input as string;
      if (!input) {
        throw new Error('Input log required: use --input or -i');
      }
      const variant = (args.variant as string) || 'decision_graph_cyclic';
      const activityKey = (args['activity-key'] as string) || 'concept:name';
      const minTraceCount = (args['min-trace-count'] as number) || 1;
      const noiseThreshold = (args['noise-threshold'] as number) || 0.0;
      const inputFormat = (args['input-format'] as string) || '';
      const ocelVariant = (args['ocel-variant'] as string) || 'flattening';

      // Auto-detect format or use explicit --input-format
      let logJson: string;
      let isOcel = false;
      if (inputFormat === 'ocel' || input.endsWith('.json')) {
        isOcel = true;
        logJson = await fs.readFile(input, 'utf-8');
      } else if (inputFormat === 'xes' || input.endsWith('.xes')) {
        const xesContent = await fs.readFile(input, 'utf-8');
        const logHandle: string = wasm.load_eventlog_from_xes(xesContent);
        logJson = wasm.export_eventlog_to_json(logHandle);
        wasm.delete_object(logHandle);
      } else {
        // Default: try XES first, fallback to JSON
        try {
          const xesContent = await fs.readFile(input, 'utf-8');
          const logHandle: string = wasm.load_eventlog_from_xes(xesContent);
          logJson = wasm.export_eventlog_to_json(logHandle);
          wasm.delete_object(logHandle);
        } catch {
          // Fallback to JSON/OCEL
          logJson = await fs.readFile(input, 'utf-8');
          isOcel = true;
        }
      }

      let raw;
      if (isOcel && inputFormat !== 'xes') {
        // Use OCEL discovery if OCEL format detected
        raw = wasm.discover_ocel_powl(logJson, ocelVariant);
      } else if (Object.keys(args).some((k) => ['min-trace-count', 'noise-threshold'].includes(k))) {
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

      return normalizeResult(raw);
    }

    default:
      throw new Error(`Unhandled subcommand: ${subcommand}`);
  }
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
      projection.log(`  Severity: ${result.severity}`);
      projection.log(`  Behaviorally equivalent: ${result.behaviourally_equivalent}`);
      projection.log(`  Trace length delta: ${result.min_trace_length_delta}`);

      if (result.added_activities && (result.added_activities as string[]).length > 0) {
        projection.log(`  Added activities: ${(result.added_activities as string[]).join(', ')}`);
      }
      if (result.removed_activities && (result.removed_activities as string[]).length > 0) {
        projection.log(`  Removed activities: ${(result.removed_activities as string[]).join(', ')}`);
      }
      if (result.always_changes && (result.always_changes as Array<Record<string, unknown>>).length > 0) {
        projection.log(`  Always-changes:`);
        for (const ac of result.always_changes as Array<Record<string, unknown>>) {
          const type = Object.keys(ac)[0];
          projection.log(`    ${type}: ${ac[type]}`);
        }
      }
      if (result.order_changes && (result.order_changes as Array<Record<string, unknown>>).length > 0) {
        projection.log(`  Order changes: ${(result.order_changes as unknown[]).length}`);
      }
      if (result.structure_changes && (result.structure_changes as Array<Record<string, unknown>>).length > 0) {
        projection.log(`  Structure changes: ${(result.structure_changes as unknown[]).length}`);
      }
      projection.log('');
      break;
    }

    case 'complexity': {
      projection.log('');
      projection.log(`  Activities:      ${result.activity_count}`);
      projection.log(`  Cyclomatic:      ${result.cyclomatic}`);
      projection.log(`  CFC:             ${result.cfc}`);
      projection.log(`  Cognitive:       ${result.cognitive}`);
      if (result.halstead) {
        const h = result.halstead as Record<string, unknown>;
        projection.log(`  Halstead volume: ${h.volume}`);
        projection.log(`  Halstead effort: ${h.effort}`);
      }
      projection.log('');
      break;
    }

    case 'footprints': {
      projection.log('');
      projection.log(`  Activities: ${JSON.stringify(result.activities)}`);
      projection.log(`  Start activities: ${JSON.stringify(result.start_activities)}`);
      projection.log(`  End activities:   ${JSON.stringify(result.end_activities)}`);
      projection.log(`  Always happening: ${JSON.stringify(result.activities_always_happening)}`);
      projection.log(`  Sequences: ${(result.sequence as unknown[])?.length ?? 0}`);
      projection.log(`  Parallels:  ${(result.parallel as unknown[])?.length ?? 0}`);
      projection.log(`  Min trace length: ${result.min_trace_length}`);
      projection.log('');
      break;
    }

    case 'conformance': {
      projection.log('');
      projection.log(
        `  Fitness:                    ${((result.percentage as number) * 100).toFixed(1)}%`
      );
      projection.log(
        `  Avg trace fitness:          ${((result.avg_trace_fitness as number) * 100).toFixed(1)}%`
      );
      projection.log(
        `  Perfectly fitting traces:    ${result.perfectly_fitting_traces} / ${result.total_traces}`
      );
      if (result.trace_results && (result.trace_results as Array<Record<string, unknown>>).length > 0) {
        projection.log('  Per-trace results:');
        for (const tr of result.trace_results as Array<Record<string, unknown>>) {
          const caseId = String(tr.case_id ?? '?');
          const fit = ((tr.fitness as number) * 100).toFixed(1);
          const missing = tr.missing_tokens ?? 0;
          const remaining = tr.remaining_tokens ?? 0;
          const marker = tr.missing_tokens === 0 && tr.remaining_tokens === 0 ? '✓' : '✗';
          projection.log(
            `    ${marker} ${caseId.padEnd(20)} fitness=${fit}%  missing=${missing} remaining=${remaining}`
          );
        }
      }
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
      projection.log(`  Root index:       ${result.root}`);
      projection.log(`  Node count:       ${result.node_count}`);
      projection.log(`  Variant:           ${result.variant}`);
      projection.log(`  Representation:     ${result.repr}`);
      if (result.config) {
        const config = result.config as Record<string, unknown>;
        projection.log(`  Config:`);
        projection.log(`    Activity key:     ${config.activity_key}`);
        projection.log(`    Min trace count:  ${config.min_trace_count}`);
        projection.log(`    Noise threshold: ${config.noise_threshold}`);
      }
      projection.log('');
      break;
    }
  }
}
