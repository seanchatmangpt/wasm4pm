import { defineCommand } from 'citty';
import * as path from 'node:path';
import { resolveConfig } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

/**
 * Flatten a nested object into dot-path keys for easy comparison.
 */
function flattenObject(
  obj: unknown,
  prefix = '',
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  if (obj === null || obj === undefined) return result;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    result[prefix] = obj;
    return result;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const dotKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      value !== undefined &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      flattenObject(value, dotKey, result);
    } else {
      result[dotKey] = value;
    }
  }
  return result;
}

/**
 * Diff two flattened config objects and return a list of differences.
 */
interface DiffEntry {
  field: string;
  left: unknown;
  right: unknown;
  changed: boolean;
}

function diffConfigs(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): DiffEntry[] {
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const diffs: DiffEntry[] = [];

  for (const key of [...allKeys].sort()) {
    const l = left[key];
    const r = right[key];
    // Skip metadata fields — hash, loadTime, provenance
    if (key.startsWith('metadata.')) continue;
    const changed = JSON.stringify(l) !== JSON.stringify(r);
    diffs.push({ field: key, left: l, right: r, changed });
  }

  return diffs;
}

export const configDiff = defineCommand({
  meta: {
    name: 'diff',
    description:
      'Compare two resolved configs side by side.\n' +
      'Examples: wpm config diff --env production  |  wpm config diff --file ./prod.toml',
  },
  args: {
    env: {
      type: 'string',
      description: 'Named environment prefix for WASM4PM_<ENV>_* variables (e.g. --env production)',
    },
    file: {
      type: 'string',
      description: 'Path to a second config file to compare against (TOML or JSON)',
    },
    all: {
      type: 'boolean',
      default: false,
      description: 'Show all fields including unchanged ones',
    },
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const showAll = Boolean(ctx.args.all);
    const envName = ctx.args.env as string | undefined;
    const altFile = ctx.args.file as string | undefined;

    return withSpanRaw(
      'config.diff',
      { 'config.env': envName ?? '', 'config.file': altFile ?? '' },
      async () => {
        try {
          // Left: current environment config
          const leftConfig = await resolveConfig({});
          const leftFlat = flattenObject({
            source: leftConfig.source,
            sink: leftConfig.sink,
            algorithm: leftConfig.algorithm,
            execution: leftConfig.execution,
            observability: leftConfig.observability,
            watch: leftConfig.watch,
            output: leftConfig.output,
          });

          // Right: alternative config (env-prefixed or file-based)
          let rightLabel = 'baseline';
          let rightFlat: Record<string, unknown>;

          if (envName) {
            // Build an env override set from WASM4PM_<ENV>_* variables
            const envPrefix = `WASM4PM_${envName.toUpperCase()}_`;
            const envOverrides: Record<string, string> = {};
            for (const [k, v] of Object.entries(process.env)) {
              if (k.startsWith(envPrefix) && v !== undefined) {
                const stripped = k.slice(envPrefix.length);
                // Map WASM4PM_PRODUCTION_ALGORITHM → WASM4PM_ALGORITHM
                envOverrides[`WASM4PM_${stripped}`] = v;
              }
            }
            const mergedEnv = { ...process.env, ...envOverrides };
            const rightConfig = await resolveConfig({ env: mergedEnv as NodeJS.ProcessEnv });
            rightFlat = flattenObject({
              source: rightConfig.source,
              sink: rightConfig.sink,
              algorithm: rightConfig.algorithm,
              execution: rightConfig.execution,
              observability: rightConfig.observability,
              watch: rightConfig.watch,
              output: rightConfig.output,
            });
            rightLabel = `env:${envName}`;
          } else if (altFile) {
            const absFile = path.resolve(altFile);
            const searchDir = path.dirname(absFile);
            const fileName = path.basename(absFile);
            const rightConfig = await resolveConfig({
              configSearchPaths: [searchDir],
              env: { ...process.env, WASM4PM_CONFIG_FILE: fileName } as NodeJS.ProcessEnv,
            });
            rightFlat = flattenObject({
              source: rightConfig.source,
              sink: rightConfig.sink,
              algorithm: rightConfig.algorithm,
              execution: rightConfig.execution,
              observability: rightConfig.observability,
              watch: rightConfig.watch,
              output: rightConfig.output,
            });
            rightLabel = absFile;
          } else {
            // Compare current config against pure defaults (no env, no file)
            const rightConfig = await resolveConfig({
              env: {} as NodeJS.ProcessEnv,
              configSearchPaths: [],
            });
            rightFlat = flattenObject({
              source: rightConfig.source,
              sink: rightConfig.sink,
              algorithm: rightConfig.algorithm,
              execution: rightConfig.execution,
              observability: rightConfig.observability,
              watch: rightConfig.watch,
              output: rightConfig.output,
            });
            rightLabel = 'defaults';
          }

          const diffs = diffConfigs(leftFlat, rightFlat);
          const changedCount = diffs.filter(d => d.changed).length;
          const displayed = showAll ? diffs : diffs.filter(d => d.changed);

          const payload = {
            left_label: 'current',
            right_label: rightLabel,
            changed_count: changedCount,
            total_fields: diffs.length,
            diffs: displayed,
          };

          const result = makeResult('config diff', payload, performance.now() - t0);

          emitResult(result, { format, quiet: false }, (res, projection) => {
            const p = res.payload;
            projection.log(`Config Diff: current ↔ ${p.right_label}`);
            projection.log('='.repeat(60));

            if (p.diffs.length === 0) {
              projection.success('No differences found.');
            } else {
              const maxField = Math.max(...p.diffs.map((d: DiffEntry) => d.field.length));
              for (const d of p.diffs as DiffEntry[]) {
                if (!d.changed) {
                  if (showAll) {
                    projection.log(`  ${d.field.padEnd(maxField)}  ${JSON.stringify(d.left)}`);
                  }
                } else {
                  projection.log(
                    `~ ${d.field.padEnd(maxField)}  ${JSON.stringify(d.left)} → ${JSON.stringify(d.right)}`
                  );
                }
              }
            }

            projection.log('');
            const msg = `${p.changed_count} field${p.changed_count === 1 ? '' : 's'} differ${p.changed_count === 1 ? 's' : ''} out of ${p.total_fields}`;
            if (p.changed_count > 0) projection.warn(msg);
            else projection.success(msg);

            if (!showAll && p.changed_count < p.total_fields) {
              projection.log(`(${p.total_fields - p.changed_count} unchanged fields hidden — use --all to see all)`);
            }
          });

          return await exitWithFlush(EXIT_CODES.success);
        } catch (error) {
          const result = makeErrorResult(
            'config diff',
            error,
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format, quiet: false });
          return await exitWithFlush(EXIT_CODES.config_error);
        }
      }
    );
  },
});
