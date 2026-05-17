import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';

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
    description: 'Validate event log schema, required attributes, and data quality',
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
      description: 'Log format: xes (default) or csv',
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
    return withSpan('validate', {
      input: String(ctx.args.input ?? ctx.args.file ?? ''),
      format: String(ctx.args.format ?? 'xes'),
      activity_key: String(ctx.args['activity-key'] ?? 'concept:name'),
    }, async () => {
    const t0 = performance.now();
    const outFmt = (ctx.args['output-format'] as string | undefined) ?? 'human';
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
        const result = makeErrorResult(
          'validate',
          `Input file not found: ${inputPath}`,
          EXIT_CODES.source_error,
          'FILE_NOT_FOUND'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      const logFormat = (ctx.args.format as string) || 'xes';
      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const caseIdKey = (ctx.args['case-id-key'] as string) || 'case:concept:name';
      const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
      const resourceKey = (ctx.args['resource-key'] as string) || 'org:resource';

      if (!['xes', 'csv'].includes(logFormat)) {
        const result = makeErrorResult(
          'validate',
          `Invalid format: ${logFormat}. Must be 'xes' or 'csv'`,
          EXIT_CODES.source_error,
          'INVALID_FORMAT'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      // Load WASM module
      const loaderConfig =
        (format === 'json') ? { observability: createQuietObservabilityLayer() } : {};
      const loader = WasmLoader.getInstance(loaderConfig);
      await loader.init();
      const wasm = loader.get();

      // Read file
      const content = await fs.readFile(inputPath, 'utf-8');

      // Parse log based on format
      let logHandle: string;
      try {
        if (logFormat === 'xes') {
          logHandle = wasm.load_eventlog_from_xes(content);
        } else {
          logHandle = wasm.load_eventlog_from_csv(content, activityKey, caseIdKey, timestampKey);
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

      const checks: ValidationCheck[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check 1: Schema validation
      try {
        const rawSchema = wasm.validate_log_schema(logHandle, logFormat);
        const schemaResult = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : rawSchema;
        checks.push({
          name: 'schema',
          status: (schemaResult.valid as boolean) ? 'pass' : 'fail',
          message: (schemaResult.valid as boolean)
            ? 'Log schema is valid'
            : 'Log schema validation failed',
          details: schemaResult,
        });
        if (!(schemaResult.valid as boolean)) {
          errors.push(`Schema validation failed: ${schemaResult.message as string}`);
        }
      } catch {
        checks.push({ name: 'schema', status: 'warn', message: 'Schema validation not available' });
        warnings.push('Schema validation not available for this log format');
      }

      // Check 2: Required attributes
      try {
        const rawAttrs = wasm.validate_required_attributes(
          logHandle,
          activityKey,
          caseIdKey,
          timestampKey,
          resourceKey
        );
        const attrsResult = typeof rawAttrs === 'string' ? JSON.parse(rawAttrs) : rawAttrs;
        const missing = (attrsResult.missing as string[]) ?? [];
        checks.push({
          name: 'required_attributes',
          status: missing.length === 0 ? 'pass' : 'fail',
          message:
            missing.length === 0
              ? 'All required attributes present'
              : `Missing attributes: ${missing.join(', ')}`,
          details: attrsResult,
        });
        if (missing.length > 0) {
          errors.push(`Missing required attributes: ${missing.join(', ')}`);
        }
      } catch {
        checks.push({ name: 'required_attributes', status: 'warn', message: 'Attribute validation not available' });
        warnings.push('Attribute validation not available for this log format');
      }

      // Check 3: Data quality
      try {
        const rawQuality = wasm.validate_data_quality(logHandle);
        const qualityResult = typeof rawQuality === 'string' ? JSON.parse(rawQuality) : rawQuality;
        const hasIssues = (qualityResult.issues as number) > 0;
        checks.push({
          name: 'data_quality',
          status: hasIssues ? 'warn' : 'pass',
          message: hasIssues
            ? `Found ${qualityResult.issues} data quality issue(s)`
            : 'No data quality issues',
          details: qualityResult,
        });
        if (hasIssues) {
          warnings.push(`Data quality: ${qualityResult.issues} issue(s) found`);
        }
      } catch {
        checks.push({ name: 'data_quality', status: 'warn', message: 'Data quality validation not available' });
      }

      // Check 4: Trace completeness
      try {
        const rawTraces = wasm.validate_trace_completeness(logHandle);
        const tracesResult = typeof rawTraces === 'string' ? JSON.parse(rawTraces) : rawTraces;
        const incompleteTraces = (tracesResult.incomplete as number) ?? 0;
        checks.push({
          name: 'trace_completeness',
          status: incompleteTraces === 0 ? 'pass' : 'warn',
          message:
            incompleteTraces === 0
              ? 'All traces are complete'
              : `${incompleteTraces} incomplete trace(s) found`,
          details: tracesResult,
        });
        if (incompleteTraces > 0) {
          warnings.push(`${incompleteTraces} incomplete trace(s) found`);
        }
      } catch {
        checks.push({ name: 'trace_completeness', status: 'warn', message: 'Trace completeness validation not available' });
      }

      // Check 5: Timestamp ordering
      try {
        const rawOrdering = wasm.validate_timestamp_ordering(logHandle);
        const orderingResult =
          typeof rawOrdering === 'string' ? JSON.parse(rawOrdering) : rawOrdering;
        const outOfOrder = (orderingResult.out_of_order as number) ?? 0;
        checks.push({
          name: 'timestamp_ordering',
          status: outOfOrder === 0 ? 'pass' : 'warn',
          message:
            outOfOrder === 0
              ? 'All timestamps are correctly ordered'
              : `${outOfOrder} event(s) with out-of-order timestamps`,
          details: orderingResult,
        });
        if (outOfOrder > 0) {
          warnings.push(`${outOfOrder} event(s) with out-of-order timestamps`);
        }
      } catch {
        checks.push({ name: 'timestamp_ordering', status: 'warn', message: 'Timestamp ordering validation not available' });
      }

      wasm.delete_object(logHandle);

      const hasErrors = errors.length > 0;
      const hasWarnings = warnings.length > 0;
      const overallStatus = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';
      const exitCode = hasErrors ? EXIT_CODES.source_error : EXIT_CODES.success;

      const payload = {
        input: inputPath,
        format: logFormat,
        status: overallStatus,
        valid: !hasErrors,
        checks,
        errors,
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

      const result = makeResult('validate', payload, performance.now() - t0, exitCode);
      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        printHumanValidation(projection, res.payload as typeof payload);
      });
      return await exitWithFlush(result.exit_code);
    } catch (error) {
      const result = makeErrorResult('validate', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
    });
  },
});

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
        projection.log(`    [${check.name}] Review the details above and address before running discovery or conformance.`);
      }
    }
    projection.log('');
  }

  // OCEL format hint — shown for all XES runs to help users who may be trying to validate OCEL
  if (payload.format === 'xes') {
    projection.log('  Note: for object-centric event logs (OCEL), use wpm powl import for JSON-based OCEL files.');
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
