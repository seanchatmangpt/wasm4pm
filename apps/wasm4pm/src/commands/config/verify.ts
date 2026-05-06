import { defineCommand } from 'citty';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { EXIT_CODES } from '../../exit-codes.js';

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
    const isJson = ctx.args.format === 'json';
    const gates: Array<{ gate: string; pass: boolean; detail: string }> = [];

    try {
      const config = await resolveConfig();

      // Gate 1: schema valid (resolveConfig throws if invalid)
      gates.push({ gate: 'schema valid', pass: true, detail: 'Zod validation passed' });

      // Gate 2: provenance complete — every tracked key has a known source
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

      // Gate 3: zero warnings
      const warnings = checkConfigWarnings(config);
      gates.push({
        gate: 'zero warnings',
        pass: warnings.length === 0,
        detail: warnings.length === 0
          ? 'No warnings'
          : warnings.map((w) => `${w.field}: ${w.warning}`).join('; '),
      });

      // Gate 4: hash present
      gates.push({
        gate: 'hash present',
        pass: !!config.metadata?.hash,
        detail: config.metadata?.hash ? `hash: ${config.metadata.hash.slice(0, 16)}…` : 'no hash',
      });

    } catch (e) {
      gates.push({ gate: 'schema valid', pass: false, detail: e instanceof Error ? e.message : String(e) });
    }

    const allPass = gates.every((g) => g.pass);

    if (isJson) {
      process.stdout.write(JSON.stringify({ gates, all_pass: allPass }, null, 2) + '\n');
    } else if (!ctx.args.quiet) {
      for (const g of gates) {
        const icon = g.pass ? '✓' : '✗';
        process.stderr.write(`  ${icon} ${g.gate.padEnd(24)} ${g.detail}\n`);
      }
      if (allPass) process.stderr.write('  Config verify passed.\n');
      else process.stderr.write('  Config verify FAILED — see above.\n');
    }

    process.exit(allPass ? EXIT_CODES.success : EXIT_CODES.execution_error);
  },
});
