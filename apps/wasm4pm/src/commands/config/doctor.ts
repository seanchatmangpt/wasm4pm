import { defineCommand } from 'citty';
import * as fss from 'node:fs';
import * as path from 'node:path';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { ALGORITHM_IDS } from '@wasm4pm/contracts';
import { emitResult, makeResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

const VALID_PROFILES = ['fast', 'balanced', 'quality', 'stream'];

export const configDoctor = defineCommand({
  meta: {
    name: 'doctor',
    description:
      'Run a config health check — detect common config problems.\n' +
      'Examples: wpm config doctor  |  wpm config doctor --format json',
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

    return withSpanRaw('config.doctor', {}, async () => {
      const checks: HealthCheck[] = [];
      let config: Record<string, unknown> | null = null;

      // Check 1: wasm4pm.toml exists and is parseable
      const tomlPath = path.join(process.cwd(), 'wasm4pm.toml');
      const jsonPath = path.join(process.cwd(), 'wasm4pm.json');
      const tomlExists = fss.existsSync(tomlPath);
      const jsonExists = fss.existsSync(jsonPath);

      if (tomlExists) {
        checks.push({ name: 'config file (TOML)', status: 'pass', detail: `wasm4pm.toml found at ${tomlPath}` });
      } else if (jsonExists) {
        checks.push({ name: 'config file (JSON)', status: 'pass', detail: `wasm4pm.json found at ${jsonPath}` });
      } else {
        checks.push({
          name: 'config file',
          status: 'warn',
          detail: 'No wasm4pm.toml or wasm4pm.json found — using all defaults. Run "wpm init" to create one.',
        });
      }

      // Check 2: Config resolves without errors
      try {
        const resolved = await resolveConfig({});
        config = resolved as unknown as Record<string, unknown>;
        checks.push({ name: 'config resolves', status: 'pass', detail: 'Config parsed and validated successfully' });
      } catch (e) {
        checks.push({
          name: 'config resolves',
          status: 'fail',
          detail: `Config validation failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      if (config) {
        // Check 3: algorithm.name is a known algorithm
        const algoName = (config.algorithm as Record<string, unknown> | undefined)?.name as string | undefined;
        if (algoName && (ALGORITHM_IDS as readonly string[]).includes(algoName)) {
          checks.push({ name: 'algorithm.name', status: 'pass', detail: `"${algoName}" is a registered algorithm` });
        } else if (algoName) {
          checks.push({ name: 'algorithm.name', status: 'fail', detail: `"${algoName}" is not a known algorithm (38 registered)` });
        } else {
          checks.push({ name: 'algorithm.name', status: 'warn', detail: 'Not set — will use default: dfg' });
        }

        // Check 4: execution.profile
        const profile = (config.execution as Record<string, unknown> | undefined)?.profile as string | undefined;
        if (!profile || VALID_PROFILES.includes(profile)) {
          const note = profile === 'quality' ? ' (expect slow runs on large logs)' : '';
          checks.push({ name: 'execution.profile', status: profile === 'quality' ? 'warn' : 'pass', detail: profile ? `"${profile}"${note}` : 'not set (default: balanced)' });
        } else {
          checks.push({ name: 'execution.profile', status: 'fail', detail: `"${profile}" is not valid. Use: ${VALID_PROFILES.join(', ')}` });
        }

        // Check 5: OTEL endpoint configured
        const otel = (config.observability as Record<string, unknown> | undefined)?.otel as Record<string, unknown> | undefined;
        const otelEnabled = otel?.enabled as boolean | undefined;
        const otelEndpoint = otel?.endpoint as string | undefined;
        if (otelEnabled && otelEndpoint) {
          checks.push({ name: 'OTEL endpoint', status: 'pass', detail: `endpoint: ${otelEndpoint}` });
        } else if (otelEnabled && !otelEndpoint) {
          checks.push({ name: 'OTEL endpoint', status: 'fail', detail: 'OTEL is enabled but no endpoint is configured (set WASM4PM_OTEL_ENDPOINT or observability.otel.endpoint)' });
        } else {
          checks.push({ name: 'OTEL endpoint', status: 'warn', detail: 'No OTEL endpoint configured — observability disabled' });
        }

        // Check 6: output.format
        const outputFormat = (config.output as Record<string, unknown> | undefined)?.format as string | undefined;
        if (!outputFormat || outputFormat === 'human' || outputFormat === 'json') {
          checks.push({ name: 'output.format', status: 'pass', detail: outputFormat ? `"${outputFormat}"` : 'not set (default: human)' });
        } else {
          checks.push({ name: 'output.format', status: 'fail', detail: `"${outputFormat}" is invalid. Use: human, json` });
        }

        // Check 7: source.path exists (if set)
        const sourceKind = (config.source as Record<string, unknown> | undefined)?.kind as string | undefined;
        const sourcePath = (config.source as Record<string, unknown> | undefined)?.path as string | undefined;
        if (sourceKind === 'file' && sourcePath) {
          if (fss.existsSync(sourcePath)) {
            checks.push({ name: 'source.path', status: 'pass', detail: `"${sourcePath}" exists` });
          } else {
            checks.push({ name: 'source.path', status: 'fail', detail: `"${sourcePath}" does not exist` });
          }
        } else {
          checks.push({ name: 'source.path', status: 'warn', detail: 'Not set — will require --input at runtime' });
        }

        // Check 8: No schema warnings
        try {
          const warnings = checkConfigWarnings(config as Parameters<typeof checkConfigWarnings>[0]);
          if (warnings.length === 0) {
            checks.push({ name: 'config warnings', status: 'pass', detail: 'No warnings' });
          } else {
            for (const w of warnings as Array<{ field: string; warning: string }>) {
              checks.push({ name: `warning: ${w.field}`, status: 'warn', detail: w.warning });
            }
          }
        } catch {
          // ignore warning check failures
        }
      }

      const failCount = checks.filter(c => c.status === 'fail').length;
      const warnCount = checks.filter(c => c.status === 'warn').length;
      const overall = failCount > 0 ? 'UNHEALTHY' : warnCount > 0 ? 'NEEDS ATTENTION' : 'HEALTHY';

      const payload = { checks, overall, fail_count: failCount, warn_count: warnCount };
      const exitCode = failCount > 0 ? EXIT_CODES.config_error : EXIT_CODES.success;
      const result = makeResult('config doctor', payload, performance.now() - t0, exitCode);

      emitResult(result, { format, quiet }, (res, projection) => {
        projection.log('Config Health Check');
        projection.log('='.repeat(50));
        for (const c of res.payload.checks as HealthCheck[]) {
          const icon = c.status === 'pass' ? '✔' : c.status === 'warn' ? '⚠' : '✗';
          projection.log(`${icon} ${c.name.padEnd(28)} ${c.detail}`);
        }
        projection.log('');
        if (failCount > 0) projection.error(`Overall: ${overall} (${failCount} error${failCount === 1 ? '' : 's'}, ${warnCount} warning${warnCount === 1 ? '' : 's'})`);
        else if (warnCount > 0) projection.warn(`Overall: ${overall} (${warnCount} warning${warnCount === 1 ? '' : 's'})`);
        else projection.success(`Overall: ${overall}`);
      });

      return await exitWithFlush(exitCode);
    });
  },
});
