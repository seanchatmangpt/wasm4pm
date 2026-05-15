import { defineCommand } from 'citty';
import { getRegistry } from '@wasm4pm/kernel';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';

type Tier = 'fast' | 'balanced' | 'quality' | 'stream';

const TIER_SPEED_RANGES: Record<Tier, [number, number]> = {
  fast: [0, 30],
  balanced: [31, 55],
  quality: [56, 85],
  stream: [0, 10],
};

function classifyTier(speed: number): Tier {
  if (speed <= 10) return 'stream';
  if (speed <= 30) return 'fast';
  if (speed <= 55) return 'balanced';
  return 'quality';
}

export const algorithms = defineCommand({
  meta: {
    name: 'algorithms',
    description:
      'List all registered algorithms with speed, quality, and output type. Use --tier to filter.',
  },
  args: {
    tier: {
      type: 'string',
      description: 'Filter by tier: fast, balanced, quality, stream',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress headers',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = Boolean(ctx.args.quiet);
    const tierFilter = ctx.args.tier as Tier | undefined;

    const registry = getRegistry();
    let all = registry.list();

    if (tierFilter) {
      const validTiers: Tier[] = ['fast', 'balanced', 'quality', 'stream'];
      if (!validTiers.includes(tierFilter)) {
        process.stderr.write(
          `Unknown tier "${tierFilter}". Valid: ${validTiers.join(', ')}\n`
        );
        return await exitWithFlush(EXIT_CODES.config_error);
      }
      const [lo, hi] = TIER_SPEED_RANGES[tierFilter];
      all = all.filter((a) => a.speedTier >= lo && a.speedTier <= hi);
    }

    const grouped: Record<Tier, typeof all> = {
      stream: all.filter((a) => classifyTier(a.speedTier) === 'stream'),
      fast: all.filter((a) => classifyTier(a.speedTier) === 'fast' && classifyTier(a.speedTier) !== 'stream'),
      balanced: all.filter((a) => classifyTier(a.speedTier) === 'balanced'),
      quality: all.filter((a) => classifyTier(a.speedTier) === 'quality'),
    };

    // Deduplicate (stream-tier algorithms also appear in fast tier otherwise)
    const streamIds = new Set(grouped.stream.map((a) => a.id));
    grouped.fast = grouped.fast.filter((a) => !streamIds.has(a.id));

    const payload = {
      total: all.length,
      tiers: grouped,
      algorithms: all.map((a) => ({
        id: a.id,
        name: a.name,
        speed: a.speedTier,
        quality: a.qualityTier,
        outputType: a.outputType,
        tier: classifyTier(a.speedTier),
      })),
    };

    const result = makeResult('algorithms', payload, 0, EXIT_CODES.success);

    emitResult(result, { format, verbose: false, quiet }, (_res, p) => {
      const TIER_LABEL: Record<Tier, string> = {
        stream: 'STREAMING  (speed ≤10, real-time)',
        fast: 'FAST       (speed ≤30)',
        balanced: 'BALANCED   (speed 31-55)',
        quality: 'QUALITY    (speed >55)',
      };

      p.log('');
      p.log(`wpm algorithms — ${all.length} registered (${tierFilter ? `filtered: ${tierFilter}` : 'all tiers'})`);
      p.log('');
      p.log(
        `${'ID'.padEnd(28)} ${'Speed'.padStart(6)} ${'Quality'.padStart(8)}  Output`
      );
      p.log('─'.repeat(65));

      for (const tier of (['stream', 'fast', 'balanced', 'quality'] as Tier[])) {
        const group = grouped[tier];
        if (!group.length) continue;
        if (!quiet) {
          p.log('');
          p.log(`  ${TIER_LABEL[tier]}`);
        }
        for (const a of group) {
          p.log(
            `  ${a.id.padEnd(26)} ${String(a.speedTier).padStart(6)} ${String(a.qualityTier).padStart(8)}  ${a.outputType}`
          );
        }
      }

      p.log('');
      p.log(`Run: wpm run <log.xes> --algorithm <id>`);
      p.log(`     wpm compare <id,id,...> -i <log.xes>`);
      p.log('');
    });

    return await exitWithFlush(EXIT_CODES.success);
  },
});
