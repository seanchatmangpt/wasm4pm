import { defineCommand } from 'citty';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { emitResult, makeResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';

export const configVerify = defineCommand({
  meta: {
    name: 'verify',
    description: 'Verify config is self-consistent: schema valid, provenance complete, zero warnings',
  },
  args: {
    format: { type: 'string', description: 'Output format: human (default) or json' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = ctx.args.quiet ?? false;
    const gates: Array<{ gate: string; pass: boolean; detail: string }> = [];

    try {
      const config = await resolveConfig();

      gates.push({ gate: 'schema valid', pass: true, detail: 'Zod validation passed' });

      const prov = config.metadata?.provenance ?? {};
      const unknownKeys = Object.entries(prov)
        .filter(([, v]) => (v as { source: string }).source === 'unknown')
        .map(([k]) => k);
      gates.push({
        gate: 'provenance complete',
        pass: unknownKeys.length === 0,
        detail: unknownKeys.length === 0
          ? 'All keys have known source'
          : `Unknown source for: ${unknownKeys.join(', ')}`,
      });

      const warnings = checkConfigWarnings(config);
      gates.push({
        gate: 'zero warnings',
        pass: warnings.length === 0,
        detail: warnings.length === 0
          ? 'No warnings'
          : warnings.map((w) => `${(w as any).field}: ${(w as any).warning}`).join('; '),
      });

      gates.push({
        gate: 'hash present',
        pass: !!config.metadata?.hash,
        detail: config.metadata?.hash ? `hash: ${config.metadata.hash.slice(0, 16)}…` : 'no hash',
      });
    } catch (e) {
      gates.push({ gate: 'schema valid', pass: false, detail: e instanceof Error ? e.message : String(e) });
    }

    const allPass = gates.every((g) => g.pass);
    const result = makeResult('config verify', { gates, all_pass: allPass }, performance.now() - t0,
      allPass ? EXIT_CODES.success : EXIT_CODES.execution_error);

    emitResult(result, { format, quiet }, (res, projection) => {
      for (const g of res.payload.gates) {
        const icon = g.pass ? '✓' : '✗';
        projection.log(`  ${icon} ${g.gate.padEnd(24)} ${g.detail}`);
      }
      if (res.payload.all_pass) projection.success('Config verify passed.');
      else projection.error('Config verify FAILED — see above.');
    });

    return await exitWithFlush(result.exit_code);
  },
});
