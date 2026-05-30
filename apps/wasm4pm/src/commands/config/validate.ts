import { defineCommand } from 'citty';
import * as fss from 'node:fs';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { ALGORITHM_IDS } from '@wasm4pm/contracts';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

interface ValidationItem {
  field: string;
  status: 'pass' | 'warn' | 'fail';
  value: unknown;
  message: string;
}

const VALID_PROFILES = ['fast', 'balanced', 'quality', 'stream'] as const;
const VALID_FORMATS = ['human', 'json'] as const;
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent', 'fatal', 'trace'] as const;
const VALID_SOURCE_KINDS = ['file', 'stream', 'http'] as const;

/**
 * Run detailed validation on the resolved config.
 * Goes beyond Zod schema validation to check semantic correctness:
 * - File paths exist
 * - Algorithm is known
 * - Timeout is a positive number
 * - Profile is valid
 * - OTEL endpoint is reachable (format check only)
 */
function runValidation(config: ReturnType<typeof Object.create>, warnings: unknown[]): ValidationItem[] {
  const items: ValidationItem[] = [];

  // algorithm.name
  const algoName = config.algorithm?.name as string | undefined;
  if (!algoName) {
    items.push({ field: 'algorithm.name', status: 'fail', value: algoName, message: 'algorithm.name is required' });
  } else if (!(ALGORITHM_IDS as readonly string[]).includes(algoName)) {
    const suggestions = (ALGORITHM_IDS as readonly string[]).filter(a => a.startsWith(algoName.slice(0, 3))).slice(0, 3);
    const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ` Valid algorithms: ${(ALGORITHM_IDS as readonly string[]).join(', ')}`;
    items.push({ field: 'algorithm.name', status: 'fail', value: algoName, message: `"${algoName}" is not a known algorithm.${hint}` });
  } else {
    items.push({ field: 'algorithm.name', status: 'pass', value: algoName, message: `"${algoName}" is a valid algorithm` });
  }

  // execution.profile
  const profile = config.execution?.profile as string | undefined;
  if (!profile) {
    items.push({ field: 'execution.profile', status: 'warn', value: profile, message: `not set (will use default: balanced)` });
  } else if (!(VALID_PROFILES as readonly string[]).includes(profile)) {
    items.push({ field: 'execution.profile', status: 'fail', value: profile, message: `"${profile}" is invalid. Valid profiles: ${VALID_PROFILES.join(', ')}` });
  } else {
    const profileNote = profile === 'quality' ? ' (expect slow runs on large logs)' : '';
    items.push({ field: 'execution.profile', status: 'pass', value: profile, message: `"${profile}" is valid${profileNote}` });
  }

  // execution.timeout
  const timeout = config.execution?.timeout as number | undefined;
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || timeout <= 0 || !Number.isFinite(timeout)) {
      items.push({ field: 'execution.timeout', status: 'fail', value: timeout, message: `must be a positive number in milliseconds (got: ${timeout})` });
    } else {
      items.push({ field: 'execution.timeout', status: 'pass', value: timeout, message: `${timeout}ms` });
    }
  } else {
    items.push({ field: 'execution.timeout', status: 'warn', value: timeout, message: 'not set (will use default: 30000ms)' });
  }

  // output.format
  const outputFormat = config.output?.format as string | undefined;
  if (!outputFormat) {
    items.push({ field: 'output.format', status: 'warn', value: outputFormat, message: 'not set (will use default: human)' });
  } else if (!(VALID_FORMATS as readonly string[]).includes(outputFormat)) {
    items.push({ field: 'output.format', status: 'fail', value: outputFormat, message: `"${outputFormat}" is invalid. Valid formats: ${VALID_FORMATS.join(', ')}` });
  } else {
    items.push({ field: 'output.format', status: 'pass', value: outputFormat, message: `"${outputFormat}" is valid` });
  }

  // observability.logLevel
  const logLevel = config.observability?.logLevel as string | undefined;
  if (!logLevel) {
    items.push({ field: 'observability.logLevel', status: 'warn', value: logLevel, message: 'not set (will use default: info)' });
  } else if (!(VALID_LOG_LEVELS as readonly string[]).includes(logLevel)) {
    items.push({ field: 'observability.logLevel', status: 'fail', value: logLevel, message: `"${logLevel}" is invalid. Valid levels: ${VALID_LOG_LEVELS.join(', ')}` });
  } else {
    items.push({ field: 'observability.logLevel', status: 'pass', value: logLevel, message: `"${logLevel}" is valid` });
  }

  // source.path (if source.kind is 'file')
  const sourceKind = config.source?.kind as string | undefined;
  const sourcePath = config.source?.path as string | undefined;
  if (sourceKind && !(VALID_SOURCE_KINDS as readonly string[]).includes(sourceKind)) {
    items.push({ field: 'source.kind', status: 'fail', value: sourceKind, message: `invalid kind: "${sourceKind}". Valid: ${VALID_SOURCE_KINDS.join(', ')}` });
  } else if (sourceKind === 'file') {
    if (!sourcePath) {
      items.push({ field: 'source.path', status: 'warn', value: sourcePath, message: 'not set — will require --input flag at runtime' });
    } else if (!fss.existsSync(sourcePath)) {
      items.push({ field: 'source.path', status: 'fail', value: sourcePath, message: `"${sourcePath}" does not exist` });
    } else {
      items.push({ field: 'source.path', status: 'pass', value: sourcePath, message: `"${sourcePath}" exists` });
    }
  }

  // observability.otel
  const otelEnabled = config.observability?.otel?.enabled as boolean | undefined;
  const otelEndpoint = config.observability?.otel?.endpoint as string | undefined;
  if (!otelEnabled) {
    items.push({ field: 'observability.otel', status: 'warn', value: otelEnabled, message: 'OTEL disabled — no endpoint configured' });
  } else if (otelEnabled && !otelEndpoint) {
    items.push({ field: 'observability.otel.endpoint', status: 'fail', value: otelEndpoint, message: 'OTEL is enabled but no endpoint is configured' });
  } else if (otelEnabled && otelEndpoint) {
    items.push({ field: 'observability.otel', status: 'pass', value: otelEndpoint, message: `endpoint: ${otelEndpoint}` });
  }

  // Convert warnings from checkConfigWarnings
  for (const w of warnings as Array<{ field: string; warning: string }>) {
    items.push({ field: w.field, status: 'warn', value: undefined, message: w.warning });
  }

  return items;
}

export const configValidate = defineCommand({
  meta: {
    name: 'validate',
    description:
      'Validate the resolved config with detailed semantic checks.\n' +
      'Examples: wpm config validate  |  wpm config validate --format json',
  },
  args: {
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress non-error output',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = Boolean(ctx.args.quiet);

    let errorCount = 0;
    let warnCount = 0;

    return withSpanRaw(
      'config.validate',
      {},
      async () => {
        try {
          const config = await resolveConfig({});
          const warnings = checkConfigWarnings(config);
          const items = runValidation(config as unknown as Record<string, unknown>, warnings);

          errorCount = items.filter(i => i.status === 'fail').length;
          warnCount = items.filter(i => i.status === 'warn').length;

          const overall = errorCount > 0 ? 'INVALID' : warnCount > 0 ? 'VALID (with warnings)' : 'VALID';
          const payload = { items, overall, error_count: errorCount, warning_count: warnCount };
          const exitCode = errorCount > 0 ? EXIT_CODES.config_error : EXIT_CODES.success;
          const result = makeResult('config validate', payload, performance.now() - t0, exitCode);

          emitResult(result, { format, quiet }, (res, projection) => {
            projection.log('Config Validation');
            projection.log('='.repeat(50));
            for (const item of res.payload.items) {
              const icon = item.status === 'pass' ? '✔' : item.status === 'warn' ? '⚠' : '✗';
              const fieldLabel = item.field.padEnd(30);
              projection.log(`${icon} ${fieldLabel} ${item.message}`);
            }
            projection.log('');
            const summary = `Validation: ${res.payload.overall}` +
              (errorCount > 0 || warnCount > 0 ? ` (${errorCount} error${errorCount === 1 ? '' : 's'}, ${warnCount} warning${warnCount === 1 ? '' : 's'})` : '');
            if (errorCount > 0) projection.error(summary);
            else if (warnCount > 0) projection.warn(summary);
            else projection.success(summary);
          });

          return await exitWithFlush(exitCode);
        } catch (error) {
          // Schema validation failure — show it clearly
          const result = makeErrorResult(
            'config validate',
            error,
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format, quiet }, (_res, projection) => {
            projection.log('Config Validation');
            projection.log('='.repeat(50));
            projection.error(`✗ schema validation   ${error instanceof Error ? error.message : String(error)}`);
            projection.log('');
            projection.error('Validation: INVALID (schema error)');
          });
          return await exitWithFlush(EXIT_CODES.config_error);
        }
      },
      () => ({ 'config.error_count': errorCount, 'config.warning_count': warnCount })
    );
  },
});
