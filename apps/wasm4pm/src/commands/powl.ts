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
  'get-children',
  'node-info',
  'freq-analysis',
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

const CONVERT_TARGETS = ['petri-net', 'process-tree', 'bpmn'] as const;
type ConvertTarget = (typeof CONVERT_TARGETS)[number];

const IMPORT_SOURCES = ['process-tree', 'petri-net'] as const;
type ImportSource = (typeof IMPORT_SOURCES)[number];

export const powl = defineCommand({
  meta: {
    name: 'powl',
    description:
      'POWL model analysis — parse, convert, simplify, diff, complexity, footprints, conformance, import, discover, get-children, node-info, freq-analysis',
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
        EXIT_CODES.config_error,
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
      }
      throw new PowlConfigError(`Unhandled convert target: ${target}`);
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
      }
      throw new PowlConfigError(`Unhandled import source: ${source}`);
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

      return normalizeResult(raw);
    }

    case 'freq-analysis': {
      const raw: string = wasm.powl_freq_analysis(modelStr);
      return JSON.parse(raw);
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
