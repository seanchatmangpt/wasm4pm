import { defineCommand } from 'citty';
import { getRegistry } from '@wasm4pm/kernel';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

type Tier = 'fast' | 'balanced' | 'quality' | 'stream';

const TIER_SPEED_RANGES: Record<Tier, [number, number]> = {
  fast: [0, 30],
  balanced: [31, 55],
  quality: [56, 85],
  stream: [0, 10],
};

type VdaLevel = 'high' | 'med' | 'low';

interface VdaRating {
  fitness: VdaLevel;
  precision: VdaLevel;
  generalization: VdaLevel;
  simplicity: VdaLevel;
  notes: string;
}

const ALGO_VDA_RATINGS: Record<string, VdaRating> = {
  dfg: { fitness: 'high', precision: 'low', generalization: 'high', simplicity: 'high', notes: 'Best for exploration; under-fits complex processes' },
  heuristic_miner: { fitness: 'high', precision: 'med', generalization: 'high', simplicity: 'med', notes: 'Noise-tolerant; good balanced first choice' },
  inductive_miner: { fitness: 'high', precision: 'high', generalization: 'med', simplicity: 'med', notes: 'Guarantees sound model; best for clean logs' },
  alpha_plus_plus: { fitness: 'med', precision: 'high', generalization: 'low', simplicity: 'high', notes: 'Precise but misses loops and skips' },
  genetic_algorithm: { fitness: 'high', precision: 'high', generalization: 'high', simplicity: 'low', notes: 'Best overall quality; slow for large logs' },
  ilp: { fitness: 'high', precision: 'high', generalization: 'med', simplicity: 'low', notes: 'Exact Petri net; best conformance accuracy' },
  simulated_annealing: { fitness: 'high', precision: 'med', generalization: 'high', simplicity: 'med', notes: 'Escapes local optima; good for complex processes' },
  aco: { fitness: 'high', precision: 'high', generalization: 'high', simplicity: 'low', notes: 'Ant colony; competitive with genetic for quality' },
  declare: { fitness: 'med', precision: 'high', generalization: 'med', simplicity: 'high', notes: 'Declarative rules; best when ordering is flexible' },
  simd_streaming_dfg: { fitness: 'high', precision: 'low', generalization: 'high', simplicity: 'high', notes: 'SIMD-accelerated; streaming use cases only' },
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
    'show-ratings': {
      type: 'boolean',
      description: 'Show Van der Aalst quality dimension ratings (fitness/precision/generalization/simplicity)',
      default: false,
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = Boolean(ctx.args.quiet);
    const tierFilter = ctx.args.tier as Tier | undefined;
    const showRatings = Boolean(ctx.args['show-ratings']);

    let lateTotal = 0;
    let lateFiltered = 0;

    return withSpan(
      'algorithms',
      { tier_filter: tierFilter ?? 'all', format, show_ratings: showRatings },
      async () => {
    const registry = getRegistry();
    let all = registry.list();
    lateTotal = all.length;

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
    lateFiltered = all.length;

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
      algorithms: all.map((a) => {
        const vda = ALGO_VDA_RATINGS[a.id];
        return {
          id: a.id,
          name: a.name,
          speed: a.speedTier,
          quality: a.qualityTier,
          outputType: a.outputType,
          tier: classifyTier(a.speedTier),
          ...(vda ? { vda } : {}),
        };
      }),
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

      if (showRatings) {
        const ratedAlgos = all.filter((a) => ALGO_VDA_RATINGS[a.id]);
        if (ratedAlgos.length > 0) {
          p.log('Quality Dimensions (Van der Aalst):');
          p.log('─'.repeat(85));
          p.log(
            `${'Algorithm'.padEnd(22)} ${'Fitness'.padEnd(11)} ${'Precision'.padEnd(11)} ${'General.'.padEnd(11)} ${'Simplicity'.padEnd(12)} Notes`
          );
          p.log('─'.repeat(85));
          for (const a of ratedAlgos) {
            const r = ALGO_VDA_RATINGS[a.id]!;
            p.log(
              `${a.id.padEnd(22)} ${r.fitness.padEnd(11)} ${r.precision.padEnd(11)} ${r.generalization.padEnd(11)} ${r.simplicity.padEnd(12)} ${r.notes}`
            );
          }
          p.log('─'.repeat(85));
          p.log('Legend: high=★★★  med=★★☆  low=★☆☆');
          p.log('');
          p.log('Tip: For high-quality process models, prefer algorithms with high fitness AND high precision.');
          p.log('     Use wpm compare -i <log> --algorithms genetic_algorithm,ilp to benchmark on your data.');
          p.log('');
        }
      }
    });

    return await exitWithFlush(EXIT_CODES.success);
      },
      () => ({ algorithm_count: lateTotal, filtered_count: lateFiltered }),
    ); // end withSpan
  },
});
