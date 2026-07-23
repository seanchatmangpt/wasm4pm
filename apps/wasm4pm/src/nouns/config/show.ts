/**
 * wpm config show — migrated from `commands/config/show.ts`.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { withSpanRaw } from '../../commands/_otel.js';

export const showVerb = defineVerb({
  noun: 'config',
  verb: 'show',
  summary: 'Display resolved configuration with provenance (CLI args > TOML > JSON > ENV vars > defaults)',
  args: {
    detailed: { type: 'boolean', default: false, description: 'Include all ENV variable mappings' },
  } as const,
  handler: async (args) => {
    const detailed = Boolean(args.detailed);
    return withSpanRaw('config.show', { 'config.detailed': detailed }, async () => {
      const config = await resolveConfig({});
      const warnings = checkConfigWarnings(config);
      const configAny = config as unknown as Record<string, unknown>;
      return {
        config: {
          source: configAny.source,
          sink: configAny.sink,
          algorithm: configAny.algorithm,
          execution: configAny.execution,
          observability: configAny.observability,
          watch: configAny.watch,
          output: configAny.output,
          prediction: configAny.prediction,
          ml: configAny.ml,
          rl: configAny.rl,
        },
        provenance: (config as { metadata: { provenance: unknown } }).metadata.provenance,
        warnings,
        ...(detailed ? {} : {}),
      };
    });
  },
});
