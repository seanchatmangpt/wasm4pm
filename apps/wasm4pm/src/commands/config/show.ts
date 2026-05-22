import { defineCommand } from 'citty';
import { resolveConfig } from '@wasm4pm/config';
import { checkConfigWarnings } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

/**
 * Mapping of environment variable names to config path (dot notation)
 */
const ENV_VAR_FIELD_MAP: Record<string, string> = {
  WASM4PM_PROFILE: 'execution.profile',
  WASM4PM_ALGORITHM: 'algorithm.name',
  WASM4PM_OUTPUT_FORMAT: 'output.format',
  WASM4PM_OUTPUT_DESTINATION: 'output.destination',
  WASM4PM_LOG_LEVEL: 'observability.logLevel',
  WASM4PM_WATCH: 'watch.enabled',
  WASM4PM_SOURCE_KIND: 'source.kind',
  WASM4PM_SOURCE_PATH: 'source.path',
  WASM4PM_SOURCE_URL: 'source.url',
  WASM4PM_SINK_KIND: 'sink.kind',
  WASM4PM_SINK_PATH: 'sink.path',
  WASM4PM_SINK_URL: 'sink.url',
  WASM4PM_OTEL_ENABLED: 'observability.otel.enabled',
  WASM4PM_OTEL_ENDPOINT: 'observability.otel.endpoint',
  WASM4PM_PREDICTION_ENABLED: 'prediction.enabled',
  WASM4PM_PREDICTION_TASKS: 'prediction.tasks',
  WASM4PM_PREDICTION_ACTIVITY_KEY: 'prediction.activityKey',
  WASM4PM_PREDICTION_NGRAM_ORDER: 'prediction.ngramOrder',
  WASM4PM_PREDICTION_DRIFT_WINDOW: 'prediction.driftWindowSize',
  WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: 'prediction.driftEwmaAlpha',
  WASM4PM_PREDICTION_DRIFT_THRESHOLD: 'prediction.driftThreshold',
  WASM4PM_ML_ENABLED: 'ml.enabled',
  WASM4PM_RL_ENABLED: 'rl.enabled',
};

/**
 * Field constraints for display (avoids runtime Zod introspection)
 */
const FIELD_CONSTRAINTS: Record<string, string> = {
  'execution.profile': 'fast | balanced | quality | stream',
  'algorithm.name': 'valid algorithm ID (see "wpm doctor")',
  'output.format': 'human | json',
  'observability.logLevel': 'silent | fatal | error | warn | info | debug | trace',
  'prediction.ngramOrder': 'integer in [2, 5]',
  'prediction.driftWindowSize': 'positive integer',
  'prediction.driftEwmaAlpha': 'number in (0, 1]',
  'prediction.driftThreshold': 'number in (0, 1]',
  'rl.learningRate': 'number in (0, 1]',
  'rl.discountFactor': 'number in [0, 1]',
  'rl.epsilon': 'number in [0, 1]',
};

function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

function renderConfigShow(
  payload: { config: Record<string, any>; provenance: Record<string, any>; warnings: any[] },
  projection: ConsoleProjection,
  detailed: boolean
): void {
  const lines: string[] = [];
  lines.push('wasm4pm configuration');
  lines.push('─'.repeat(80));

  const displayFields: Array<[string, string]> = [
    ['source.kind', 'source kind'],
    ['algorithm.name', 'algorithm'],
    ['execution.profile', 'execution profile'],
    ['output.format', 'output format'],
    ['observability.logLevel', 'log level'],
    ['watch.enabled', 'file watching'],
    ['prediction.enabled', 'prediction'],
    ['ml.enabled', 'ML analysis'],
    ['rl.enabled', 'RL system'],
  ];

  const maxFieldLen = Math.max(...displayFields.map((f) => f[0].length));

  for (const [field] of displayFields) {
    const value = getValueByPath(payload.config, field);
    const source = payload.provenance?.[field]?.source ?? 'unknown';
    const sourceTag = `[${source.toUpperCase()}]`;
    const envVar = Object.entries(ENV_VAR_FIELD_MAP).find((e) => e[1] === field)?.[0];
    const envNote = envVar ? `  ${envVar}` : '';
    lines.push(
      `  ${field.padEnd(maxFieldLen)}  ${String(value ?? 'undefined').padEnd(15)}  ${sourceTag}${envNote}`
    );
  }

  if (payload.warnings.length > 0) {
    lines.push('');
    lines.push('⚠ Warnings:');
    for (const w of payload.warnings) lines.push(`  ${JSON.stringify(w)}`);
  }

  if (detailed) {
    lines.push('');
    lines.push('Available environment variables:');
    lines.push('─'.repeat(80));
    for (const [envVar, field] of Object.entries(ENV_VAR_FIELD_MAP)) {
      const value = getValueByPath(payload.config, field);
      const constraint = FIELD_CONSTRAINTS[field] ?? 'any';
      lines.push(`  ${envVar.padEnd(35)}  (${constraint})`);
      lines.push(`    → config.${field} = ${JSON.stringify(value)}`);
    }
  }

  projection.log(lines.join('\n'));
}

export const configShow = defineCommand({
  meta: {
    name: 'show',
    description:
      'Display resolved configuration with sources (CLI args > TOML > JSON > ENV vars > defaults).\n' +
      'Examples: wpm config show  |  wpm config show --detailed  |  WASM4PM_ALGORITHM=dfg wpm config show',
  },
  args: {
    detailed: {
      type: 'boolean',
      default: false,
      description: 'Show all 24+ ENV variables and Zod constraints',
    },
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
    const detailed = Boolean(ctx.args.detailed);
    const quiet = Boolean(ctx.args.quiet);

    let warningCount = 0;
    return withSpanRaw(
      'config.show',
      { 'config.format': format, 'config.detailed': detailed },
      async () => {
        try {
          const config = await resolveConfig({});
          const warnings = checkConfigWarnings(config);
          warningCount = warnings.length;

          const payload = {
            config: {
              source: config.source,
              sink: config.sink,
              algorithm: config.algorithm,
              execution: config.execution,
              observability: config.observability,
              watch: config.watch,
              output: config.output,
              prediction: (config as any).prediction,
              ml: (config as any).ml,
              rl: (config as any).rl,
            },
            provenance: config.metadata.provenance,
            warnings,
          };

          const result = makeResult('config show', payload, performance.now() - t0);

          emitResult(result, { format, quiet }, (res, projection) => {
            renderConfigShow(res.payload, projection, detailed);
          });

          return await exitWithFlush(EXIT_CODES.success);
        } catch (error) {
          const result = makeErrorResult(
            'config show',
            error,
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format, quiet });
          return await exitWithFlush(EXIT_CODES.config_error);
        }
      },
      () => ({ 'config.warning_count': warningCount })
    );
  },
});
