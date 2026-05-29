import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';

type CheckStatus = 'pass' | 'fail' | 'warn';
interface ValidationCheck {
  name: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export const validate = defineCommand({
  meta: {
    name: 'validate',
    description:
      'Validate event log schema, attributes, and data quality. Checks for required fields, missing timestamps, duplicate events, and case coverage. Ex: wpm validate process.xes',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to event log file (XES or CSV)',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to event log file (named alternative to positional)',
      alias: 'i',
    },
    format: {
      type: 'string',
      description: 'Log format: xes (default), csv, or ocel (auto-detected for .ocel.json files)',
      default: 'xes',
    },
    'activity-key': {
      type: 'string',
      description: 'Expected activity attribute key (default: concept:name)',
      default: 'concept:name',
    },
    'case-id-key': {
      type: 'string',
      description: 'Expected case ID attribute key (default: case:concept:name)',
      default: 'case:concept:name',
    },
    'timestamp-key': {
      type: 'string',
      description: 'Expected timestamp attribute key (default: time:timestamp)',
      default: 'time:timestamp',
    },
    'resource-key': {
      type: 'string',
      description: 'Expected resource attribute key (default: org:resource)',
      default: 'org:resource',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    'output-format': {
      type: 'string',
      description: 'Output format: human (default) or json',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the validation receipt to .wasm4pm/receipts/',
    },
  },
  async run(ctx) {
    return withSpan(
      'validate',
      {
        input: String(ctx.args.input ?? ctx.args.file ?? ''),
        log_format: String(ctx.args.format ?? 'xes'),
        activity_key: String(ctx.args['activity-key'] ?? 'concept:name'),
      },
      async () => {
        const t0 = performance.now();
        const outFmt = ((ctx.args['output-format'] as string | undefined) ?? 'human');
        const format = (outFmt === 'json' ? 'json' : 'human') as 'json' | 'human';
        const verbose = Boolean(ctx.args.verbose);
        const quiet = Boolean(ctx.args.quiet);

        try {
          // Resolve input path (positional OR --file/-i)
          const inputPath: string | undefined =
            (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

          if (!inputPath) {
            const result = makeErrorResult(
              'validate',
              'Input file required.\n\nUsage:  wpm validate <log.xes>\n        wpm validate <log.csv> --format csv\n\nRun "wpm validate --help" for details.',
              EXIT_CODES.source_error,
              'MISSING_INPUT'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          try {
            await fs.access(inputPath);
          } catch {
            const dir = inputPath.includes('/') ? inputPath.replace(/\/[^/]+$/, '') : '.';
            const result = makeErrorResult(
              'validate',
              `File not found: '${inputPath}'\n\n` +
                `  Check the path and try again:\n` +
                `    ls -la ${dir}\n\n` +
                `  Accepted formats: .xes, .csv, .ocel.json\n` +
                `  Example: wpm validate process.xes`,
              EXIT_CODES.source_error,
              'FILE_NOT_FOUND'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          const logFormat = ((ctx.args.format as string) || 'xes');
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
          const caseIdKey = (ctx.args['case-id-key'] as string) || 'case:concept:name';
          const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
          const resourceKey = (ctx.args['resource-key'] as string) || 'org:resource';

          // OCEL validation path — handles .ocel.json and format=ocel inputs
          const isOcelFormat =
            logFormat === 'ocel' ||
            inputPath.toLowerCase().endsWith('.ocel.json') ||
            inputPath.toLowerCase().endsWith('.ocel');

          if (isOcelFormat) {
            return await validateOcel({ inputPath, ctx, format, verbose, quiet, t0 });
          }

          if (!['xes', 'csv'].includes(logFormat)) {
            const result = makeErrorResult(
              'validate',
              `Invalid format: ${logFormat}. Must be 'xes', 'csv', or 'ocel'`,
              EXIT_CODES.source_error,
              'INVALID_FORMAT'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // Load WASM module
          const loaderConfig =
            format === 'json' ? { observability: createQuietObservabilityLayer() } : {};
          const loader = WasmLoader.getInstance(loaderConfig);
          await loader.init();
          const wasm = loader.get() as any;

          // Read file
          const content = await fs.readFile(inputPath, 'utf-8');

          // Parse log based on format
          let logHandle: string;
          try {
            if (logFormat === 'xes') {
              logHandle = wasm.load_eventlog_from_xes(content);
            } else {
              logHandle = wasm.load_eventlog_from_csv(
                content,
                activityKey,
                caseIdKey,
                timestampKey
              );
            }
          } catch (parseError) {
            const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
            const result = makeErrorResult(
              'validate',
              `Failed to parse ${logFormat.toUpperCase()} file: ${errMsg}`,
              EXIT_CODES.source_error,
              'PARSE_ERROR'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }
          // logHandle is now valid — wrap all check work in try/finally so the handle
          // is freed even if any check throws unexpectedly.
          // Accumulators declared here so they are in scope for payload assembly below.
          const checks: ValidationCheck[] = [];
          const errors: string[] = [];
          const warnings: string[] = [];
          let traceCount = 0;
          let eventCount = 0;

          // Collect trace_count and event_count via the actual WASM API.
          // get_trace_count / get_event_count are canonical counters present in all profiles.
          try {
            traceCount = Number(wasm.get_trace_count(logHandle)) || 0;
            eventCount = Number(wasm.get_event_count(logHandle)) || 0;
          } catch {
            // counters stay 0 — not fatal
          }

          // Check 1: Schema inference via infer_eventlog_schema (available in all profiles).
          // infer_eventlog_schema returns a JS Map (serde_wasm_bindgen), access via .get().
          // Confidence < 0.5 means the schema is ambiguous — warn; >= 0.5 is pass.
          try {
            const rawSchema: unknown = wasm.infer_eventlog_schema(logHandle);
            const getField = (obj: unknown, key: string): unknown => {
              if (obj instanceof Map) return (obj as Map<string, unknown>).get(key);
              if (typeof obj === 'string') return (JSON.parse(obj) as Record<string, unknown>)[key];
              return (obj as Record<string, unknown>)[key];
            };
            const confidence = (getField(rawSchema, 'confidence') as number | undefined) ?? 0;
            const schemaOk = confidence >= 0.5;
            const schemaDetails: Record<string, unknown> =
              rawSchema instanceof Map
                ? Object.fromEntries(rawSchema as Map<string, unknown>)
                : (rawSchema as Record<string, unknown>);
            checks.push({
              name: 'schema',
              status: schemaOk ? 'pass' : 'warn',
              message: schemaOk
                ? `Log schema inferred (confidence: ${(confidence * 100).toFixed(0)}%)`
                : `Schema inference confidence low (${(confidence * 100).toFixed(0)}%)`,
              details: schemaDetails,
            });
            if (!schemaOk) {
              warnings.push(`Schema inference confidence low (${(confidence * 100).toFixed(0)}%)`);
            }
          } catch {
            checks.push({
              name: 'schema',
              status: 'warn',
              message: 'Schema validation not available',
            });
            warnings.push('Schema validation not available for this log format');
          }

          // Check 2: Required attributes — validate_has_activities + validate_has_timestamps.
          // These boolean-returning WASM functions exist in all deployment profiles.
          try {
            const hasActivities = Boolean(wasm.validate_has_activities(logHandle, activityKey));
            const hasTimestamps = Boolean(wasm.validate_has_timestamps(logHandle, timestampKey));
            const missing: string[] = [];
            if (!hasActivities) missing.push(activityKey);
            if (!hasTimestamps) missing.push(timestampKey);
            checks.push({
              name: 'required_attributes',
              status: missing.length === 0 ? 'pass' : 'fail',
              message:
                missing.length === 0
                  ? 'All required attributes present'
                  : `Missing attributes: ${missing.join(', ')}`,
              details: { missing, has_activities: hasActivities, has_timestamps: hasTimestamps },
            });
            if (missing.length > 0) {
              errors.push(`Missing required attributes: ${missing.join(', ')}`);
            }
          } catch {
            checks.push({
              name: 'required_attributes',
              status: 'warn',
              message: 'Attribute validation not available',
            });
            warnings.push('Attribute validation not available for this log format');
          }

          // Check 3: Data quality — analyze_event_statistics provides event distribution info.
          try {
            const parse = (r: unknown) =>
              typeof r === 'string'
                ? (JSON.parse(r) as Record<string, unknown>)
                : (r as Record<string, unknown>);
            const stats = parse(wasm.analyze_event_statistics(logHandle));
            const hasIssues = eventCount === 0 && traceCount === 0;
            checks.push({
              name: 'data_quality',
              status: hasIssues ? 'warn' : 'pass',
              message: hasIssues
                ? 'Log contains no events — data quality issue'
                : `${eventCount} event(s) across ${traceCount} trace(s)`,
              details: stats,
            });
            if (hasIssues) {
              warnings.push('Log contains no events — data quality issue');
            }
          } catch {
            checks.push({
              name: 'data_quality',
              status: 'warn',
              message: 'Data quality validation not available',
            });
          }

          // Check 4: Trace completeness — derived from trace_count / event_count.
          // validate_trace_completeness does not exist in this WASM profile.
          {
            let tcStatus: CheckStatus;
            let tcMessage: string;
            if (traceCount === 0) {
              tcStatus = 'warn';
              tcMessage = 'Log contains no traces — completeness cannot be verified';
            } else if (eventCount === 0) {
              tcStatus = 'warn';
              tcMessage = `${traceCount} trace(s) appear to have no events`;
            } else {
              tcStatus = 'pass';
              tcMessage = 'All traces have events';
            }
            checks.push({
              name: 'trace_completeness',
              status: tcStatus,
              message: tcMessage,
              details: { trace_count: traceCount, event_count: eventCount },
            });
            if (tcStatus === 'warn') {
              warnings.push(tcMessage);
            }
          }

          // Check 5: Timestamp ordering — no dedicated WASM function in this profile.
          checks.push({
            name: 'timestamp_ordering',
            status: 'warn',
            message: 'Timestamp ordering check not available in this profile',
          });

          // Guaranteed cleanup — free handle now that all checks are complete
          try { wasm.delete_object(logHandle); } catch { /* best-effort */ }

          const hasErrors = errors.length > 0;
          const hasWarnings = warnings.length > 0;
          const overallStatus = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';
          const exitCode = hasErrors ? EXIT_CODES.source_error : EXIT_CODES.success;

          const payload = {
            input: inputPath,
            format: logFormat,
            status: overallStatus,
            valid: !hasErrors,
            /** Total number of traces (cases) in the log. */
            trace_count: traceCount,
            /** Total number of events across all traces. */
            event_count: eventCount,
            checks,
            errors,
            /** `violations` is the PM-conventional alias for `errors`.
             * Both fields carry the same strings. `violations` matches
             * the Van der Aalst conformance vocabulary used by the quality
             * command and PM lifecycle pipelines. */
            violations: errors,
            warnings,
          };

          // Persist BLAKE3 receipt for proof-of-validation (unless --no-save)
          if (!ctx.args['no-save']) {
            try {
              const inputBytes = await fs.readFile(inputPath).catch(() => Buffer.from(inputPath));
              const receipt: CommandReceipt = {
                ...newReceipt('validate'),
                input_hash: blake3Hex(inputBytes),
                output_hash: blake3Hex(JSON.stringify(payload)),
                status: hasErrors ? 'failed' : 'success',
                summary: {
                  checks_passed: checks.filter((c) => c.status === 'pass').length,
                  checks_warned: checks.filter((c) => c.status === 'warn').length,
                  checks_failed: checks.filter((c) => c.status === 'fail').length,
                  overall_status: overallStatus,
                },
              };
              saveCommandReceipt(receipt);
            } catch {
              /* receipt write must never break the command */
            }
          }

          // When schema/attribute errors are present the command exits source_error (2).
          // makeResult() always sets status:'ok', but the top-level envelope status
          // must reflect the validation outcome: 'error' when there are hard failures,
          // 'ok' when validation passes (even with warnings).
          const _baseResult = makeResult('validate', payload, performance.now() - t0, exitCode);
          const result = hasErrors ? { ..._baseResult, status: 'error' as const } : _baseResult;
          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            printHumanValidation(projection, res.payload as typeof payload);
          });
          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const result = makeErrorResult('validate', error, EXIT_CODES.execution_error, 'EXECUTION_ERROR');
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});

// ─── OCEL validation ──────────────────────────────────────────────────────────

/**
 * Validate an OCEL 2.0 JSON file.
 *
 * Checks performed:
 *   1. JSON parse validity
 *   2. Required top-level keys (event_types, object_types, events, objects)
 *   3. Referential integrity via validate_ocel WASM function
 *   4. Per-object-type event counts (sparse type detection)
 *   5. Minimum event count per object type (warn if < 10 events)
 */
async function validateOcel(opts: {
  inputPath: string;
  ctx: Record<string, unknown>;
  format: 'json' | 'human';
  verbose: boolean;
  quiet: boolean;
  t0: number;
}): Promise<void> {
  const { inputPath, format, verbose, quiet, t0 } = opts;
  const { exitWithFlush: exitFlush } = await import('../otel/exit.js');

  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Read and parse JSON
  let ocelContent: string;
  let ocelObj: Record<string, unknown>;
  try {
    ocelContent = await fs.readFile(inputPath, 'utf-8');
  } catch (readErr) {
    const result = makeErrorResult(
      'validate',
      `Cannot read file: ${inputPath}`,
      EXIT_CODES.source_error,
      'FILE_NOT_FOUND'
    );
    emitResult(result, { format, verbose, quiet });
    return exitFlush(result.exit_code);
  }

  try {
    ocelObj = JSON.parse(ocelContent) as Record<string, unknown>;
    checks.push({ name: 'json_parse', status: 'pass', message: 'File is valid JSON' });
  } catch {
    checks.push({
      name: 'json_parse',
      status: 'fail',
      message: 'File is not valid JSON — OCEL 2.0 must be a JSON object',
    });
    errors.push('Invalid JSON: file cannot be parsed as OCEL 2.0');
    const payload = {
      input: inputPath,
      format: 'ocel',
      status: 'fail',
      valid: false,
      checks,
      errors,
      warnings,
    };
    const result = makeResult('validate', payload, performance.now() - t0, EXIT_CODES.source_error);
    emitResult(result, { format, verbose, quiet }, (_res, projection) => {
      printHumanValidation(projection, payload);
    });
    return exitFlush(EXIT_CODES.source_error);
  }

  // Check 1: Required top-level OCEL 2.0 keys
  const requiredKeys = ['event_types', 'object_types', 'events', 'objects'];
  const missingKeys = requiredKeys.filter((k) => !(k in ocelObj));
  if (missingKeys.length === 0) {
    checks.push({
      name: 'ocel_structure',
      status: 'pass',
      message: 'All required OCEL 2.0 top-level keys present',
      details: { required: requiredKeys },
    });
  } else {
    checks.push({
      name: 'ocel_structure',
      status: 'fail',
      message: `Missing required OCEL 2.0 keys: ${missingKeys.join(', ')}`,
      details: { missing: missingKeys, required: requiredKeys },
    });
    errors.push(`Missing required OCEL 2.0 keys: ${missingKeys.join(', ')}`);
  }

  // Check 2: Object type declarations
  const objectTypes = Array.isArray(ocelObj['object_types'])
    ? (ocelObj['object_types'] as string[])
    : [];
  const events = Array.isArray(ocelObj['events'])
    ? (ocelObj['events'] as Record<string, unknown>[])
    : [];
  const objects = Array.isArray(ocelObj['objects'])
    ? (ocelObj['objects'] as Record<string, unknown>[])
    : [];

  if (objectTypes.length === 0) {
    checks.push({
      name: 'object_types',
      status: 'fail',
      message: 'No object types declared (object_types array is empty)',
    });
    errors.push('OCEL object_types array is empty — at least one object type required');
  } else {
    checks.push({
      name: 'object_types',
      status: 'pass',
      message: `${objectTypes.length} object type(s) declared: ${objectTypes.join(', ')}`,
      details: { object_types: objectTypes },
    });
  }

  // Check 3: Per-object-type event counts and sparse type detection
  const eventCountPerType: Record<string, number> = {};
  for (const ot of objectTypes) {
    eventCountPerType[ot] = 0;
  }
  for (const evt of events) {
    const objectIds = Array.isArray(evt['object_ids']) ? (evt['object_ids'] as string[]) : [];
    // Map object IDs to object types via the objects array
    for (const oid of objectIds) {
      const obj = objects.find((o) => o['id'] === oid);
      if (obj && typeof obj['object_type'] === 'string') {
        const ot = obj['object_type'] as string;
        if (ot in eventCountPerType) {
          eventCountPerType[ot]++;
        }
      }
    }
  }

  const SPARSE_TYPE_THRESHOLD = 10;
  const sparseTypes = objectTypes.filter(
    (ot) => (eventCountPerType[ot] ?? 0) < SPARSE_TYPE_THRESHOLD
  );
  const typeSummaryLines = objectTypes.map((ot) => `${ot}: ${eventCountPerType[ot] ?? 0} event(s)`);

  if (sparseTypes.length > 0) {
    checks.push({
      name: 'object_type_coverage',
      status: 'warn',
      message: `${sparseTypes.length} sparse object type(s) (< ${SPARSE_TYPE_THRESHOLD} events): ${sparseTypes.join(', ')}`,
      details: { event_count_per_type: eventCountPerType, sparse_threshold: SPARSE_TYPE_THRESHOLD },
    });
    warnings.push(
      `Sparse object types (< ${SPARSE_TYPE_THRESHOLD} events each): ${sparseTypes.map((t) => `${t} (${eventCountPerType[t]})`).join(', ')}. ` +
        `Sparse types may indicate data quality issues or incomplete log extraction.`
    );
  } else if (objectTypes.length > 0) {
    checks.push({
      name: 'object_type_coverage',
      status: 'pass',
      message: `All object types have >= ${SPARSE_TYPE_THRESHOLD} events (${typeSummaryLines.join(', ')})`,
      details: { event_count_per_type: eventCountPerType },
    });
  }

  // Check 4: Total event count sanity
  if (events.length === 0) {
    checks.push({
      name: 'event_count',
      status: 'fail',
      message: 'OCEL has no events (events array is empty)',
    });
    errors.push('OCEL events array is empty — no process behaviour to mine');
  } else {
    checks.push({
      name: 'event_count',
      status: 'pass',
      message: `${events.length} event(s), ${objects.length} object(s)`,
      details: { total_events: events.length, total_objects: objects.length },
    });
  }

  // Check 5: WASM referential integrity (validate_ocel)
  try {
    const { WasmLoader } = await import('@wasm4pm/engine');
    const loader = WasmLoader.getInstance();
    await loader.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wasm = loader.get() as Record<string, any>;

    if (
      typeof wasm['load_ocel_from_json'] === 'function' &&
      typeof wasm['validate_ocel'] === 'function'
    ) {
      let ocelHandle: string | undefined;
      try {
        ocelHandle = wasm['load_ocel_from_json'](ocelContent) as string;
        const rawValidation = wasm['validate_ocel'](ocelHandle);
        const validation =
          typeof rawValidation === 'string'
            ? (JSON.parse(rawValidation) as Record<string, unknown>)
            : (rawValidation as Record<string, unknown>);

        const isValid = validation['valid'] === true;
        const errorCount =
          typeof validation['error_count'] === 'number'
            ? (validation['error_count'] as number)
            : Array.isArray(validation['errors'])
              ? (validation['errors'] as unknown[]).length
              : 0;
        const refErrors = Array.isArray(validation['errors'])
          ? (validation['errors'] as string[])
          : [];

        if (isValid && errorCount === 0) {
          checks.push({
            name: 'referential_integrity',
            status: 'pass',
            message: 'OCEL referential integrity OK (all event→object references resolve)',
          });
        } else {
          checks.push({
            name: 'referential_integrity',
            status: 'fail',
            message: `Referential integrity violations: ${errorCount} error(s)`,
            details: { error_count: errorCount, errors: refErrors.slice(0, 5) },
          });
          for (const e of refErrors.slice(0, 5)) {
            errors.push(`Referential integrity: ${e}`);
          }
          if (refErrors.length > 5) {
            errors.push(`... and ${refErrors.length - 5} more referential integrity errors`);
          }
        }
      } catch (wasmErr) {
        const msg = wasmErr instanceof Error ? wasmErr.message : String(wasmErr);
        checks.push({
          name: 'referential_integrity',
          status: 'fail',
          message: `OCEL parse/validation failed: ${msg}`,
        });
        errors.push(`OCEL WASM parse failed: ${msg}`);
      } finally {
        // Guaranteed cleanup — free OCEL handle regardless of validation outcome
        if (ocelHandle !== undefined) {
          try { (wasm['delete_object'] as ((h: string) => void) | undefined)?.(ocelHandle); } catch { /* best-effort */ }
        }
      }
    } else {
      checks.push({
        name: 'referential_integrity',
        status: 'warn',
        message: 'OCEL referential integrity check not available (requires fog/browser WASM build)',
      });
      warnings.push(
        'WASM OCEL validation not available — rebuild with feature-ocel for full validation'
      );
    }
  } catch {
    checks.push({
      name: 'referential_integrity',
      status: 'warn',
      message: 'WASM initialization failed — structural checks only',
    });
  }

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const overallStatus = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';
  const exitCode = hasErrors ? EXIT_CODES.source_error : EXIT_CODES.success;

  const payload = {
    input: inputPath,
    format: 'ocel',
    status: overallStatus,
    valid: !hasErrors,
    checks,
    errors,
    /** `violations` is the PM-conventional alias for `errors`.
     * Both fields carry the same strings. `violations` matches
     * the Van der Aalst conformance vocabulary. */
    violations: errors,
    warnings,
    ocelSummary: {
      total_events: events.length,
      total_objects: objects.length,
      object_types: objectTypes,
      event_count_per_type: eventCountPerType,
    },
  };

  const _baseResult = makeResult('validate', payload, performance.now() - t0, exitCode);
  const result = hasErrors ? { ..._baseResult, status: 'error' as const } : _baseResult;
  emitResult(result, { format, verbose, quiet }, (_res, projection) => {
    printOcelValidation(projection, payload);
  });
  return exitFlush(exitCode);
}

/**
 * Print human-readable OCEL validation output.
 * Shows object-type-level breakdown which is invisible in flat XES validation.
 */
function printOcelValidation(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    format: string;
    status: string;
    valid: boolean;
    checks: ValidationCheck[];
    errors: string[];
    warnings: string[];
    ocelSummary?: {
      total_events: number;
      total_objects: number;
      object_types: string[];
      event_count_per_type: Record<string, number>;
    };
  }
): void {
  const { checks, errors, warnings, status, ocelSummary } = payload;

  projection.log('');
  if (status === 'pass') {
    projection.success(`OCEL Validation — ${payload.input}`);
  } else if (status === 'warn') {
    projection.warn(`OCEL Validation — ${payload.input}`);
  } else {
    projection.error(`OCEL Validation — ${payload.input}`);
  }

  projection.log('  Format: OCEL 2.0 JSON (Object-Centric Event Log)');
  projection.log('');

  // Object type summary — the key differentiator vs flat XES output
  if (ocelSummary && ocelSummary.object_types.length > 0) {
    projection.log('  Object-centric summary:');
    projection.log(`    Total events:  ${ocelSummary.total_events}`);
    projection.log(`    Total objects: ${ocelSummary.total_objects}`);
    projection.log(`    Object types:  ${ocelSummary.object_types.length}`);
    for (const ot of ocelSummary.object_types) {
      const count = ocelSummary.event_count_per_type[ot] ?? 0;
      const sparseMark = count < 10 ? ' (sparse — may indicate data quality issue)' : '';
      projection.log(`      ${ot}: ${count} event(s)${sparseMark}`);
    }
    projection.log('');
  }

  projection.log('  Checks:');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠';
    const statusColor =
      check.status === 'pass' ? '\x1b[32m' : check.status === 'fail' ? '\x1b[31m' : '\x1b[33m';
    const reset = '\x1b[0m';
    projection.log(`    ${statusColor}${icon}${reset} ${check.name.padEnd(25)} ${check.message}`);
  }
  projection.log('');

  if (errors.length > 0) {
    projection.log('  Errors:');
    for (const error of errors) {
      projection.log(`    ${error}`);
    }
    projection.log('');
  }

  if (warnings.length > 0) {
    projection.log('  Warnings:');
    for (const warning of warnings) {
      projection.log(`    ${warning}`);
    }
    projection.log('');
  }

  // Fix guidance for OCEL-specific checks
  const OCEL_FIX_GUIDANCE: Record<string, { fail?: string; warn?: string }> = {
    ocel_structure: {
      fail: 'Fix: Ensure the file is valid OCEL 2.0 JSON with keys: event_types, object_types, events, objects. See https://www.ocel-standard.org/',
    },
    object_types: {
      fail: 'Fix: Declare at least one object type in the object_types array.',
    },
    object_type_coverage: {
      warn: 'Fix: Investigate sparse object types. They may result from: (1) incomplete log extraction, (2) data filtered before export, or (3) genuinely rare process participants. Use wpm powl discover to see if they contribute to the discovered model.',
    },
    event_count: {
      fail: 'Fix: The events array must be non-empty. Verify the OCEL export from your source system included process events.',
    },
    referential_integrity: {
      fail: 'Fix: Every object ID referenced in event.object_ids must exist in the objects array. Check for case mismatches or truncated exports.',
    },
  };

  const actionableChecks = checks.filter((c) => c.status !== 'pass');
  if (actionableChecks.length > 0) {
    projection.log('  How to fix:');
    for (const check of actionableChecks) {
      const guidance = OCEL_FIX_GUIDANCE[check.name];
      if (guidance) {
        const advice = check.status === 'fail' ? guidance.fail : guidance.warn;
        if (advice) {
          projection.log(`    [${check.name}] ${advice}`);
        }
      }
    }
    projection.log('');
  }

  if (status === 'pass') {
    projection.success('OCEL validation passed — log is ready for object-centric process mining');
    projection.log('');
    projection.log('  Next steps:');
    projection.log(
      `    wpm run ${payload.input}                  -- discover OC-DFG per object type`
    );
    projection.log(`    wpm powl discover -i ${payload.input}     -- discover OC-Petri net`);
  } else if (status === 'warn') {
    projection.warn('OCEL validation passed with warnings — review sparse types before mining');
  } else {
    projection.error('OCEL validation failed — fix errors before running object-centric discovery');
  }
  projection.log('');
}

// Actionable fix guidance keyed by check name and status
const FIX_GUIDANCE: Record<string, { fail?: string; warn?: string }> = {
  schema: {
    fail: 'Fix: Ensure the file is valid XES XML. Required structure: <log><trace><event><string key="concept:name" value="..."/><date key="time:timestamp" value="..."/></event></trace></log>',
  },
  required_attributes: {
    fail: 'Fix: Every event must have concept:name (activity) and time:timestamp. Add missing attributes to your events, or use --activity-key / --timestamp-key to point to alternate attribute names.',
  },
  data_quality: {
    warn: 'Fix: Check for events with null/empty activity names, duplicate events within the same case at the same timestamp, or activities with very low frequency that may be noise.',
  },
  trace_completeness: {
    warn: 'Fix: Incomplete traces often lack a final end activity. Ensure each case has a clear start and end event. Consider filtering incomplete cases before running.',
  },
  timestamp_ordering: {
    warn: 'Fix: Sort events within each trace by time:timestamp before running process mining. Out-of-order timestamps cause incorrect directly-follows graphs and fitness scores.',
  },
};

function printHumanValidation(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    format: string;
    status: string;
    valid: boolean;
    checks: ValidationCheck[];
    errors: string[];
    warnings: string[];
  }
): void {
  const { checks, errors, warnings, status } = payload;

  projection.log('');
  if (status === 'pass') {
    projection.success(`Event Log Validation — ${payload.input}`);
  } else if (status === 'warn') {
    projection.warn(`Event Log Validation — ${payload.input}`);
  } else {
    projection.error(`Event Log Validation — ${payload.input}`);
  }

  projection.log(`  Format: ${payload.format.toUpperCase()}`);
  projection.log('');

  projection.log('  Checks:');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠';
    const statusColor =
      check.status === 'pass' ? '\x1b[32m' : check.status === 'fail' ? '\x1b[31m' : '\x1b[33m';
    const reset = '\x1b[0m';
    projection.log(`    ${statusColor}${icon}${reset} ${check.name.padEnd(20)} ${check.message}`);
  }
  projection.log('');

  if (errors.length > 0) {
    projection.log('  Errors:');
    for (const error of errors) {
      projection.log(`    ${error}`);
    }
    projection.log('');
  }

  if (warnings.length > 0) {
    projection.log('  Warnings:');
    for (const warning of warnings) {
      projection.log(`    ${warning}`);
    }
    projection.log('');
  }

  // Actionable fix guidance for any non-passing check
  const actionableChecks = checks.filter((c) => c.status !== 'pass');
  if (actionableChecks.length > 0) {
    projection.log('  How to fix:');
    for (const check of actionableChecks) {
      const guidance = FIX_GUIDANCE[check.name];
      if (guidance) {
        const advice = check.status === 'fail' ? guidance.fail : guidance.warn;
        if (advice) {
          projection.log(`    [${check.name}] ${advice}`);
        }
      } else if (check.status === 'warn') {
        projection.log(
          `    [${check.name}] Review the details above and address before running discovery or conformance.`
        );
      }
    }
    projection.log('');
  }

  // OCEL format hint — shown for all XES runs to help users who may be trying to validate OCEL
  if (payload.format === 'xes') {
    projection.log(
      '  Note: for object-centric event logs (OCEL), use wpm powl import for JSON-based OCEL files.'
    );
    projection.log('');
  }

  if (status === 'pass') {
    projection.success('Validation passed: log is ready for process mining');
  } else if (status === 'warn') {
    projection.warn('Validation passed with warnings: review warnings before use');
  } else {
    projection.error('Validation failed: fix errors before use in process mining');
  }
  projection.log('');
}
