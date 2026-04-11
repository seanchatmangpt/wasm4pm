import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@pictl/engine';

export interface ValidateOptions extends OutputOptions {
  input?: string;
  activityKey?: string;
  'case-id-key'?: string;
  'timestamp-key'?: string;
  'resource-key'?: string;
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
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        formatter.error(
          'Input file required.\n\nUsage:  pictl validate <log.xes>\n        pictl validate <log.csv> --format csv\n\nRun "pictl validate --help" for details.'
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Validate input file exists
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const logFormat = (ctx.args.format as string) || 'xes';
      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const caseIdKey = (ctx.args['case-id-key'] as string) || 'case:concept:name';
      const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
      const resourceKey = (ctx.args['resource-key'] as string) || 'org:resource';

      if (!['xes', 'csv'].includes(logFormat)) {
        formatter.error(`Invalid format: ${logFormat}. Must be 'xes' or 'csv'`);
        process.exit(EXIT_CODES.config_error);
      }

      // For validate, we use a custom formatter that can show detailed validation results
      const useJson = ctx.args.format === 'json' || ctx.args.quiet;
      const humanFormatter = getFormatter({
        format: useJson ? 'json' : 'human',
        verbose: ctx.args.verbose,
        quiet: ctx.args.quiet,
      });

      if (humanFormatter instanceof HumanFormatter) {
        humanFormatter.info(`Validating event log: ${inputPath}`);
        humanFormatter.debug(`Format: ${logFormat}`);
      }

      // Load WASM module
      const loader = WasmLoader.getInstance();
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
        const error = parseError instanceof Error ? parseError.message : String(parseError);
        if (humanFormatter instanceof JSONFormatter) {
          humanFormatter.error('Validation failed', {
            input: inputPath,
            format: logFormat,
            error: `Failed to parse ${logFormat.toUpperCase()} file: ${error}`,
            valid: false,
          });
        } else {
          (humanFormatter as HumanFormatter).error(`Parse error: ${error}`);
        }
        process.exit(EXIT_CODES.source_error);
      }

      // Run validation checks
      const validationResults: Record<string, unknown> = {
        input: inputPath,
        format: logFormat,
        checks: [] as Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string; details?: Record<string, unknown> }>,
        errors: [] as string[],
        warnings: [] as string[],
      };

      const checks = validationResults.checks as Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string; details?: Record<string, unknown> }>;
      const errors = validationResults.errors as string[];
      const warnings = validationResults.warnings as string[];

      // Check 1: Schema validation
      try {
        const rawSchema = wasm.validate_log_schema(logHandle, logFormat);
        const schemaResult = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : rawSchema;
        checks.push({
          name: 'schema',
          status: (schemaResult.valid as boolean) ? 'pass' : 'fail',
          message: (schemaResult.valid as boolean) ? 'Log schema is valid' : 'Log schema validation failed',
          details: schemaResult,
        });
        if (!(schemaResult.valid as boolean)) {
          errors.push(`Schema validation failed: ${schemaResult.message as string}`);
        }
      } catch {
        checks.push({
          name: 'schema',
          status: 'warn',
          message: 'Schema validation not available',
        });
        warnings.push('Schema validation not available for this log format');
      }

      // Check 2: Required attributes
      try {
        const rawAttrs = wasm.validate_required_attributes(logHandle, activityKey, caseIdKey, timestampKey, resourceKey);
        const attrsResult = typeof rawAttrs === 'string' ? JSON.parse(rawAttrs) : rawAttrs;
        const missing = (attrsResult.missing as string[]) ?? [];
        checks.push({
          name: 'required_attributes',
          status: missing.length === 0 ? 'pass' : 'fail',
          message: missing.length === 0 ? 'All required attributes present' : `Missing attributes: ${missing.join(', ')}`,
          details: attrsResult,
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

      // Check 3: Data quality
      try {
        const rawQuality = wasm.validate_data_quality(logHandle);
        const qualityResult = typeof rawQuality === 'string' ? JSON.parse(rawQuality) : rawQuality;
        const hasIssues = (qualityResult.issues as number) > 0;
        checks.push({
          name: 'data_quality',
          status: hasIssues ? 'warn' : 'pass',
          message: hasIssues ? `Found ${qualityResult.issues} data quality issue(s)` : 'No data quality issues',
          details: qualityResult,
        });
        if (hasIssues) {
          warnings.push(`Data quality: ${qualityResult.issues} issue(s) found`);
        }
      } catch {
        checks.push({
          name: 'data_quality',
          status: 'warn',
          message: 'Data quality validation not available',
        });
      }

      // Check 4: Trace completeness
      try {
        const rawTraces = wasm.validate_trace_completeness(logHandle);
        const tracesResult = typeof rawTraces === 'string' ? JSON.parse(rawTraces) : rawTraces;
        const incompleteTraces = (tracesResult.incomplete as number) ?? 0;
        checks.push({
          name: 'trace_completeness',
          status: incompleteTraces === 0 ? 'pass' : 'warn',
          message: incompleteTraces === 0 ? 'All traces are complete' : `${incompleteTraces} incomplete trace(s) found`,
          details: tracesResult,
        });
        if (incompleteTraces > 0) {
          warnings.push(`${incompleteTraces} incomplete trace(s) found`);
        }
      } catch {
        checks.push({
          name: 'trace_completeness',
          status: 'warn',
          message: 'Trace completeness validation not available',
        });
      }

      // Check 5: Timestamp ordering
      try {
        const rawOrdering = wasm.validate_timestamp_ordering(logHandle);
        const orderingResult = typeof rawOrdering === 'string' ? JSON.parse(rawOrdering) : rawOrdering;
        const outOfOrder = (orderingResult.out_of_order as number) ?? 0;
        checks.push({
          name: 'timestamp_ordering',
          status: outOfOrder === 0 ? 'pass' : 'warn',
          message: outOfOrder === 0 ? 'All timestamps are correctly ordered' : `${outOfOrder} event(s) with out-of-order timestamps`,
          details: orderingResult,
        });
        if (outOfOrder > 0) {
          warnings.push(`${outOfOrder} event(s) with out-of-order timestamps`);
        }
      } catch {
        checks.push({
          name: 'timestamp_ordering',
          status: 'warn',
          message: 'Timestamp ordering validation not available',
        });
      }

      // Free log handle
      try {
        wasm.delete_object(logHandle);
      } catch {
        /* best-effort */
      }

      // Determine overall status
      const hasErrors = errors.length > 0;
      const hasWarnings = warnings.length > 0;
      const overallStatus = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';

      validationResults.status = overallStatus;
      validationResults.valid = !hasErrors;

      // Output results
      if (humanFormatter instanceof JSONFormatter) {
        humanFormatter.success('Validation complete', validationResults);
      } else {
        printHumanValidation(humanFormatter as HumanFormatter, validationResults);
      }

      // Exit with appropriate code
      process.exit(hasErrors ? EXIT_CODES.source_error : EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Validation failed', error);
      } else {
        formatter.error(
          `Validation failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

function printHumanValidation(formatter: HumanFormatter, result: Record<string, unknown>): void {
  const checks = result.checks as Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string }>;
  const errors = result.errors as string[];
  const warnings = result.warnings as string[];
  const status = result.status as string;

  formatter.log('');
  if (status === 'pass') {
    formatter.success(`Event Log Validation — ${result.input as string}`);
  } else if (status === 'warn') {
    formatter.warn(`Event Log Validation — ${result.input as string}`);
  } else {
    formatter.error(`Event Log Validation — ${result.input as string}`);
  }

  formatter.log(`  Format: ${(result.format as string).toUpperCase()}`);
  formatter.log('');

  // Print check results
  formatter.log('  Checks:');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠';
    const statusColor = check.status === 'pass' ? '\x1b[32m' : check.status === 'fail' ? '\x1b[31m' : '\x1b[33m';
    const reset = '\x1b[0m';
    formatter.log(`    ${statusColor}${icon}${reset} ${check.name.padEnd(20)} ${check.message}`);
  }
  formatter.log('');

  // Print errors
  if (errors.length > 0) {
    formatter.log('  Errors:');
    for (const error of errors) {
      formatter.log(`    ${error}`);
    }
    formatter.log('');
  }

  // Print warnings
  if (warnings.length > 0) {
    formatter.log('  Warnings:');
    for (const warning of warnings) {
      formatter.log(`    ${warning}`);
    }
    formatter.log('');
  }

  // Overall verdict
  if (status === 'pass') {
    formatter.success('Validation passed: log is ready for process mining');
  } else if (status === 'warn') {
    formatter.warn('Validation passed with warnings: review warnings before use');
  } else {
    formatter.error('Validation failed: fix errors before use in process mining');
  }
  formatter.log('');
}
