import { defineCommand } from 'citty';
import { resolveConfig } from '@wasm4pm/config';
import { emitResult, makeResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

/**
 * Complete catalog of recognized WASM4PM_ environment variables.
 * Each entry includes the env var name, the config field it maps to,
 * the expected type, the default value, and a short description.
 */
const ENV_VAR_CATALOG: Array<{
  name: string;
  field: string;
  type: string;
  default: string;
  description: string;
}> = [
  {
    name: 'WASM4PM_ALGORITHM',
    field: 'algorithm.name',
    type: 'string',
    default: 'dfg',
    description: 'Discovery algorithm ID (e.g. dfg, inductive_miner, ilp)',
  },
  {
    name: 'WASM4PM_PROFILE',
    field: 'execution.profile',
    type: 'fast|balanced|quality|stream',
    default: 'balanced',
    description: 'Execution profile controlling speed vs quality',
  },
  {
    name: 'WASM4PM_OUTPUT_FORMAT',
    field: 'output.format',
    type: 'human|json',
    default: 'human',
    description: 'CLI output format',
  },
  {
    name: 'WASM4PM_OUTPUT_DESTINATION',
    field: 'output.destination',
    type: 'string',
    default: 'stdout',
    description: 'Output destination path (stdout or file path)',
  },
  {
    name: 'WASM4PM_LOG_LEVEL',
    field: 'observability.logLevel',
    type: 'debug|info|warn|error',
    default: 'info',
    description: 'Console log verbosity',
  },
  {
    name: 'WASM4PM_WATCH',
    field: 'watch.enabled',
    type: 'boolean',
    default: 'false',
    description: 'Enable config-file watcher (re-runs discovery on change)',
  },
  {
    name: 'WASM4PM_SOURCE_KIND',
    field: 'source.kind',
    type: 'file|stream|http',
    default: 'file',
    description: 'Event log source type',
  },
  {
    name: 'WASM4PM_SOURCE_PATH',
    field: 'source.path',
    type: 'string',
    default: '',
    description: 'Path to event log file (when source.kind=file)',
  },
  {
    name: 'WASM4PM_SOURCE_URL',
    field: 'source.url',
    type: 'string',
    default: '',
    description: 'URL to fetch event log (when source.kind=http)',
  },
  {
    name: 'WASM4PM_SINK_KIND',
    field: 'sink.kind',
    type: 'stdout|file|http',
    default: 'stdout',
    description: 'Output sink type',
  },
  {
    name: 'WASM4PM_SINK_PATH',
    field: 'sink.path',
    type: 'string',
    default: '',
    description: 'Path to output file (when sink.kind=file)',
  },
  {
    name: 'WASM4PM_SINK_URL',
    field: 'sink.url',
    type: 'string',
    default: '',
    description: 'Sink URL (when sink.kind=http, must be https://)',
  },
  {
    name: 'WASM4PM_OTEL_ENABLED',
    field: 'observability.otel.enabled',
    type: 'boolean',
    default: 'false',
    description: 'Enable OpenTelemetry span export',
  },
  {
    name: 'WASM4PM_OTEL_ENDPOINT',
    field: 'observability.otel.endpoint',
    type: 'string',
    default: '',
    description: 'OTLP endpoint URL (e.g. http://localhost:4318/v1/traces)',
  },
  {
    name: 'WASM4PM_PREDICTION_ENABLED',
    field: 'prediction.enabled',
    type: 'boolean',
    default: 'false',
    description: 'Enable predictive mining tasks',
  },
  {
    name: 'WASM4PM_PREDICTION_TASKS',
    field: 'prediction.tasks',
    type: 'comma-separated',
    default: '',
    description: 'Prediction tasks: next_activity,remaining_time,outcome,drift,features,resource',
  },
  {
    name: 'WASM4PM_PREDICTION_ACTIVITY_KEY',
    field: 'prediction.activityKey',
    type: 'string',
    default: 'concept:name',
    description: 'XES attribute name for activity labels',
  },
  {
    name: 'WASM4PM_PREDICTION_NGRAM_ORDER',
    field: 'prediction.ngramOrder',
    type: 'integer 2-5',
    default: '2',
    description: 'N-gram order for next-activity prediction',
  },
  {
    name: 'WASM4PM_PREDICTION_DRIFT_WINDOW',
    field: 'prediction.driftWindowSize',
    type: 'positive integer',
    default: '10',
    description: 'Number of traces per drift detection window',
  },
  {
    name: 'WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA',
    field: 'prediction.driftEwmaAlpha',
    type: 'float 0-1',
    default: '0.3',
    description: 'EWMA smoothing factor for drift detection',
  },
  {
    name: 'WASM4PM_PREDICTION_DRIFT_THRESHOLD',
    field: 'prediction.driftThreshold',
    type: 'float 0-1',
    default: '0.3',
    description: 'Jaccard distance threshold that triggers a drift event',
  },
  {
    name: 'WASM4PM_ML_ENABLED',
    field: 'ml.enabled',
    type: 'boolean',
    default: 'false',
    description: 'Enable ML analysis features',
  },
  {
    name: 'WASM4PM_RL_ENABLED',
    field: 'rl.enabled',
    type: 'boolean',
    default: 'false',
    description: 'Enable RL autonomic system',
  },
];

function getFieldValue(config: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce((cur: unknown, k: string) =>
    (cur as Record<string, unknown>)?.[k], config);
}

export const configEnv = defineCommand({
  meta: {
    name: 'env',
    description:
      'Show all recognized WASM4PM_* environment variables with their current status.\n' +
      'Examples: wpm config env  |  wpm config env --format json',
  },
  args: {
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
    set: {
      type: 'boolean',
      default: false,
      description: 'Show only variables that are currently SET',
    },
    unset: {
      type: 'boolean',
      default: false,
      description: 'Show only variables that are NOT SET',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const showOnlySet = Boolean(ctx.args.set);
    const showOnlyUnset = Boolean(ctx.args.unset);

    return withSpanRaw('config.env', {}, async () => {
      const env = process.env;
      let config: Record<string, unknown> = {};

      try {
        const resolved = await resolveConfig({});
        config = resolved as unknown as Record<string, unknown>;
      } catch {
        // Config may be invalid — still show env status
      }

      const rows = ENV_VAR_CATALOG.map(entry => {
        const envValue = env[entry.name];
        const isSet = envValue !== undefined && envValue !== '';
        const currentValue = isSet ? envValue : getFieldValue(config, entry.field);
        return {
          name: entry.name,
          field: entry.field,
          type: entry.type,
          default: entry.default,
          description: entry.description,
          set: isSet,
          env_value: envValue,
          resolved_value: currentValue,
        };
      });

      let filtered = rows;
      if (showOnlySet) filtered = rows.filter(r => r.set);
      if (showOnlyUnset) filtered = rows.filter(r => !r.set);

      const setCount = rows.filter(r => r.set).length;

      const result = makeResult(
        'config env',
        { vars: filtered, set_count: setCount, total: rows.length },
        performance.now() - t0
      );

      emitResult(result, { format, quiet: false }, (res, projection) => {
        projection.log('WASM4PM_* Environment Variables');
        projection.log('='.repeat(60));

        const maxName = Math.max(...res.payload.vars.map((v: {name: string}) => v.name.length));

        for (const v of res.payload.vars as typeof rows) {
          const status = v.set ? '[SET]    ' : '[NOT SET]';
          const valueNote = v.set
            ? `= ${String(v.env_value)}`
            : `— using ${v.default === '' ? 'default (unset)' : `default: ${v.default}`}`;
          projection.log(`  ${v.name.padEnd(maxName)}  ${status}  ${valueNote}`);
        }

        projection.log('');
        projection.log(`${setCount}/${rows.length} variables set`);
        if (setCount === 0) {
          projection.log('Tip: Set WASM4PM_ALGORITHM=dfg to override the default algorithm.');
        }
      });

      return await exitWithFlush(EXIT_CODES.success);
    });
  },
});
