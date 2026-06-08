import { defineCommand } from 'citty';
import { getRegistry } from 'wasm4pm';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { withLogSession } from '../with-log-session.js';

type Tier = 'fast' | 'balanced' | 'quality' | 'stream';

const TIER_SPEED_RANGES: Record<Tier, [number, number]> = {
  fast: [0, 30],
  balanced: [31, 55],
  quality: [56, 85],
  stream: [0, 10],
};

const TIER_RATIONALE: Record<Tier, string> = {
  stream: 'Best for real-time dashboards and edge devices; processes live events with minimal memory footprint.',
  fast: 'Best for rapid, interactive exploration of large logs; optimized for developer feedback loops.',
  balanced: 'Best for general-purpose batch analysis; balances structural precision with reasonable compute time.',
  quality: 'Best for offline audits and compliance; captures complex concurrency and loops, but can be slow.',
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

/**
 * Analyse log characteristics from XES content (lightweight parse, no WASM needed).
 * Used by --recommend to avoid WASM boot overhead for this advisory command.
 */
function analyseLogFile(filePath: string): {
  traceCount: number;
  eventCount: number;
  uniqueActivities: number;
  uniqueVariants: number;
  avgTraceLength: number;
} | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const traceMatches = content.match(/<trace>/gi);
    const eventMatches = content.match(/<event>/gi);
    const actMatches = content.match(/key="concept:name"\s+value="([^"]+)"/gi);
    const traceCount = traceMatches?.length ?? 0;
    const eventCount = eventMatches?.length ?? 0;
    const activities = new Set<string>();
    if (actMatches) {
      for (const m of actMatches) {
        const v = /value="([^"]+)"/.exec(m);
        if (v) activities.add(v[1]);
      }
    }
    // Rough variant estimate: parse trace-level activity sequences
    const variantSet = new Set<string>();
    const traceBlocks = content.match(/<trace>[\s\S]*?<\/trace>/gi) ?? [];
    for (const block of traceBlocks) {
      const acts = (block.match(/key="concept:name"\s+value="([^"]+)"/gi) ?? [])
        .map((m) => { const v = /value="([^"]+)"/.exec(m); return v ? v[1] : ''; })
        .filter(Boolean);
      variantSet.add(acts.join('|'));
    }
    return {
      traceCount,
      eventCount,
      uniqueActivities: activities.size,
      uniqueVariants: variantSet.size,
      avgTraceLength: traceCount > 0 ? eventCount / traceCount : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Recommend an algorithm based on log statistics (Van der Aalst practitioner heuristics).
 */
function recommendForLog(
  stats: {
    traceCount: number;
    uniqueVariants: number;
    uniqueActivities: number;
    avgTraceLength: number;
  },
  optimizeFor?: 'size' | 'time'
): { id: string; rationale: string } {
  if (optimizeFor === 'time') {
    return {
      id: 'dfg',
      rationale: 'Optimized for speed (time) — DFG runs in O(n) and returns immediately.',
    };
  }
  if (optimizeFor === 'size') {
    return {
      id: 'process_skeleton',
      rationale: 'Optimized for minimal footprint (size) — Process Skeleton produces the most compact structural representation.',
    };
  }
  const variantRatio = stats.traceCount > 0 ? stats.uniqueVariants / stats.traceCount : 0;

  if (stats.traceCount === 0) {
    return { id: 'dfg', rationale: 'Empty or unreadable log — DFG is safest starting point.' };
  }
  if (stats.traceCount < 100) {
    return {
      id: 'dfg',
      rationale: `Small log (${stats.traceCount} traces) — DFG gives a fast structural overview before committing to heavier discovery.`,
    };
  }
  if (variantRatio > 0.7) {
    return {
      id: 'genetic_algorithm',
      rationale: `High variant diversity (${(variantRatio * 100).toFixed(0)}% unique traces) — genetic algorithm handles complex variant space best.`,
    };
  }
  if (stats.traceCount > 1000) {
    return {
      id: 'heuristic_miner',
      rationale: `Large log (${stats.traceCount} traces) — heuristic miner scales linearly and tolerates noise well.`,
    };
  }
  if (stats.avgTraceLength > 20) {
    return {
      id: 'inductive_miner',
      rationale: `Long average trace length (${stats.avgTraceLength.toFixed(1)} events) — inductive miner produces sound models for complex sequential behaviour.`,
    };
  }
  return {
    id: 'inductive_miner',
    rationale: `Balanced log (${stats.traceCount} traces, ${stats.uniqueVariants} variants) — inductive miner gives a sound, balanced model.`,
  };
}

export const algorithms = defineCommand({
  meta: {
    name: 'algorithms',
    description:
      'List all registered discovery algorithms. Filter, benchmark, recommend, or run a coverage test.\n\n' +
      'Examples:\n' +
      '  wpm algorithms                          # list all 38 with speed/quality/output\n' +
      '  wpm algorithms --profile fast           # filter by execution profile\n' +
      '  wpm algorithms --type petri_net         # filter by output type\n' +
      '  wpm algorithms --recommend log.xes      # recommend best algorithm for a log\n' +
      '  wpm algorithms --benchmark              # show speed benchmarks from registry\n' +
      '  wpm algorithms --test-all -i log.xes    # run all discovery algorithms on a fixture log\n' +
      '  wpm algorithms --tier fast              # : filter by speed tier\n' +
      '  wpm algorithms --show-parameters dfg    # show parameters for a specific algorithm',
  },
  args: {
    tier: {
      type: 'string',
      description: 'Filter by speed tier: fast, balanced, quality, stream ( flag, prefer --profile)',
    },
    profile: {
      type: 'string',
      description: 'Filter by execution profile: fast, balanced, quality, stream',
    },
    type: {
      type: 'string',
      description: 'Filter by output type: dfg, petrinet, declare, tree, ml_result, analytics',
    },
    recommend: {
      type: 'string',
      description: 'Path to XES log file — recommend best algorithm based on log characteristics',
    },
    'recommend-for': {
      type: 'string',
      description: 'Optimize recommendation for: size (minimal model/memory) or time (fastest execution)',
    },
    benchmark: {
      type: 'boolean',
      description: 'Show speed benchmark table from registry metadata (estimatedDurationMs per 100 events)',
    },
    'test-all': {
      type: 'boolean',
      description: 'Run all discovery algorithms against a fixture log and report pass/fail',
    },
    input: {
      type: 'string',
      alias: 'i',
      description: 'Input XES log path for --test-all (optional; defaults to built-in fixture)',
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
    'show-parameters': {
      type: 'string',
      description: 'Show parameters for a specific algorithm (e.g. --show-parameters heuristic_miner)',
    },
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = Boolean(ctx.args.quiet);
    // --profile takes precedence; --tier is kept for baseline admissibility
    const profileFilter = (ctx.args.profile as string | undefined) ?? (ctx.args.tier as string | undefined);
    const typeFilter = ctx.args.type as string | undefined;
    const recommendPath = ctx.args.recommend as string | undefined;
    const showBenchmark = Boolean(ctx.args.benchmark);
    const testAll = Boolean(ctx.args['test-all']);
    const showRatings = Boolean(ctx.args['show-ratings']);
    const showParameters = ctx.args['show-parameters'] as string | undefined;

    let lateTotal = 0;
    let lateFiltered = 0;

    return withSpan(
      'algorithms',
      {
        profile_filter: profileFilter ?? 'all',
        type_filter: typeFilter ?? 'all',
        recommend: recommendPath ?? 'none',
        benchmark: showBenchmark,
        test_all: testAll,
        format,
        show_ratings: showRatings,
        show_parameters: showParameters ?? 'none',
      },
      async () => {
    const registry = getRegistry();

    // ── --show-parameters ────────────────────────────────────────────────────
    if (showParameters) {
      const algo = registry.get(showParameters);
      if (!algo) {
        process.stderr.write(`Algorithm not found: ${showParameters}\n`);
        return await exitWithFlush(EXIT_CODES.config_error);
      }

      const payload = {
        algorithmId: algo.id,
        algorithmName: algo.name,
        parameters: algo.parameters.map(p => ({
          name: p.name,
          type: p.type,
          description: p.description,
          required: p.required,
          default: p.default,
          ...(p.min !== undefined && { min: p.min }),
          ...(p.max !== undefined && { max: p.max }),
          ...(p.options && { options: p.options }),
        })),
      };

      const result = makeResult('algorithm-parameters', payload, 0, EXIT_CODES.success);

      emitResult(result, { format, verbose: false, quiet }, (_res, p) => {
        p.log('');
        p.log(`Algorithm: ${algo.name} (${algo.id})`);
        p.log(`Description: ${algo.description}`);
        p.log('');

        if (algo.parameters.length === 0) {
          p.log('No parameters (activity_key is implicit).');
          p.log('');
          return;
        }

        p.log('Parameters:');
        p.log('─'.repeat(100));
        p.log(
          `${'Name'.padEnd(25)} ${'Type'.padEnd(12)} ${'Required'.padEnd(10)} ${'Range / Options'.padEnd(30)} ${'Default'.padEnd(20)} Description`
        );
        p.log('─'.repeat(100));

        for (const param of algo.parameters) {
          const rangeOrOptions = param.options
            ? `[${param.options.join(', ')}]`
            : param.min !== undefined || param.max !== undefined
              ? `${param.min ?? '—'}..${param.max ?? '—'}`
              : '—';
          const defaultStr = param.default !== undefined ? String(param.default) : '(none)';
          const requiredStr = param.required ? 'yes' : 'no';

          p.log(
            `${param.name.padEnd(25)} ${param.type.padEnd(12)} ${requiredStr.padEnd(10)} ${rangeOrOptions.padEnd(30)} ${defaultStr.padEnd(20)} ${param.description}`
          );
        }
        p.log('─'.repeat(100));
        p.log('');
        p.log(`Usage example:`);
        p.log(`  wpm run log.xes --algorithm ${algo.id} --parameters '{"${algo.parameters[0]?.name ?? 'activity_key'}":"concept:name"}'`);
        p.log('');
      });

      return await exitWithFlush(EXIT_CODES.success);
    }

    // ── --recommend <log.xes> ─────────────────────────────────────────────────
    if (recommendPath) {
      if (!fs.existsSync(recommendPath)) {
        const errResult = makeErrorResult(
          'algorithms',
          `Log file not found: ${recommendPath}`,
          EXIT_CODES.source_error,
          'FILE_NOT_FOUND'
        );
        emitResult(errResult, { format, verbose: false, quiet });
        return await exitWithFlush(errResult.exit_code);
      }
      const stats = analyseLogFile(recommendPath);
      if (!stats) {
        const errResult = makeErrorResult(
          'algorithms',
          `Could not parse log file: ${recommendPath}`,
          EXIT_CODES.source_error,
          'PARSE_ERROR'
        );
        emitResult(errResult, { format, verbose: false, quiet });
        return await exitWithFlush(errResult.exit_code);
      }
      const recommendFor = ctx.args['recommend-for'] as 'size' | 'time' | undefined;
      const rec = recommendForLog(stats, recommendFor);
      const algoMeta = registry.get(rec.id);

      const payload = {
        logFile: path.basename(recommendPath),
        logStats: stats,
        recommendation: {
          algorithmId: rec.id,
          algorithmName: algoMeta?.name ?? rec.id,
          rationale: rec.rationale,
          speedTier: algoMeta?.speedTier ?? 0,
          qualityTier: algoMeta?.qualityTier ?? 0,
          outputType: algoMeta?.outputType ?? 'dfg',
        },
        alternatives: [
          { id: 'dfg', reason: 'Fastest — for a quick structural overview (speed tier 5)' },
          { id: 'heuristic_miner', reason: 'Noise-tolerant balanced choice (speed tier 25)' },
          { id: 'inductive_miner', reason: 'Guarantees sound model (speed tier 30)' },
          { id: 'genetic_algorithm', reason: 'Highest quality for complex variant space (speed tier 75)' },
        ].filter((a) => a.id !== rec.id),
      };

      const result = makeResult('algorithm-recommendation', payload, 0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet }, (_res, p) => {
        p.log('');
        p.log(`Algorithm Recommendation for: ${path.basename(recommendPath)}`);
        p.log('');
        p.log(`  Log statistics:`);
        p.log(`    Traces:            ${stats.traceCount}`);
        p.log(`    Events:            ${stats.eventCount}`);
        p.log(`    Unique activities: ${stats.uniqueActivities}`);
        p.log(`    Unique variants:   ${stats.uniqueVariants}`);
        p.log(`    Avg trace length:  ${stats.avgTraceLength.toFixed(1)} events`);
        p.log('');
        p.log(`  Recommended: ${algoMeta?.name ?? rec.id} (${rec.id})`);
        p.log(`  Rationale:   ${rec.rationale}`);
        p.log('');
        p.log('  Alternatives:');
        for (const alt of payload.alternatives) {
          p.log(`    ${alt.id.padEnd(22)} ${alt.reason}`);
        }
        p.log('');
        p.log(`  Usage: wpm run ${path.basename(recommendPath)} --algorithm ${rec.id}`);
        p.log('');
      });
      return await exitWithFlush(EXIT_CODES.success);
    }

    // ── --benchmark ───────────────────────────────────────────────────────────
    if (showBenchmark) {
      const all = registry.list().filter((a) => a.estimatedDurationMs !== undefined);
      all.sort((a, b) => (a.estimatedDurationMs ?? 999) - (b.estimatedDurationMs ?? 999));

      const payload = {
        benchmarks: all.map((a) => ({
          id: a.id,
          name: a.name,
          estimatedDurationMs: a.estimatedDurationMs,
          outputType: a.outputType,
          speedTier: a.speedTier,
          qualityTier: a.qualityTier,
          scalesWell: a.scalesWell,
        })),
      };

      const result = makeResult('algorithm-benchmark', payload, 0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet }, (_res, p) => {
        p.log('');
        p.log('Algorithm Speed Benchmarks (registry metadata, per 100 events)');
        p.log('─'.repeat(80));
        p.log(`${'Algorithm'.padEnd(30)} ${'Est. ms/100ev'.padStart(14)} ${'Speed'.padStart(6)} ${'Quality'.padStart(8)}  ${'Scales'.padEnd(6)}  Output`);
        p.log('─'.repeat(80));
        for (const a of all) {
          const ms = a.estimatedDurationMs != null ? a.estimatedDurationMs.toFixed(2).padStart(14) : '         N/A';
          const scales = a.scalesWell ? 'yes' : 'no';
          p.log(
            `  ${a.id.padEnd(28)} ${ms} ${String(a.speedTier).padStart(6)} ${String(a.qualityTier).padStart(8)}  ${scales.padEnd(6)}  ${a.outputType}`
          );
        }
        p.log('─'.repeat(80));
        p.log('');
        p.log('  Legend: Est. ms/100ev = estimated time per 100 events from registry metadata.');
        p.log('          For authoritative benchmarks on your log: wpm compare dfg,heuristic,genetic -i <log>');
        p.log('');
      });
      return await exitWithFlush(EXIT_CODES.success);
    }

    // ── --test-all ────────────────────────────────────────────────────────────
    if (testAll) {
      // Resolve the fixture path relative to this file's location
      const fixtureRelPath = '../../../../packages/testing/__tests__/fixtures/sample.xes';
      const thisFileDir = path.dirname(new URL(import.meta.url).pathname);
      const defaultFixture = path.resolve(thisFileDir, fixtureRelPath);
      const inputPath = (ctx.args.input as string | undefined) ?? defaultFixture;

      if (!fs.existsSync(inputPath)) {
        const errResult = makeErrorResult(
          'algorithms',
          `Test log not found: ${inputPath}. Provide a log with --input/-i.`,
          EXIT_CODES.source_error,
          'FILE_NOT_FOUND'
        );
        emitResult(errResult, { format, verbose: false, quiet });
        return await exitWithFlush(errResult.exit_code);
      }

      // Discovery algorithms exercised via known WASM export signatures
      const TESTABLE_WASM_CALLS: Array<{
        id: string;
        call: (wasm: Record<string, CallableFunction>, handle: string, ak: string) => unknown;
      }> = [
        { id: 'dfg',                 call: (w, h, ak) => w['discover_dfg'](h, ak) },
        { id: 'process_skeleton',    call: (w, h, ak) => w['extract_process_skeleton'](h, ak, 1) },
        { id: 'alpha_plus_plus',     call: (w, h, ak) => w['discover_alpha_plus_plus'](h, ak, 0.0) },
        { id: 'heuristic_miner',     call: (w, h, ak) => w['discover_heuristic_miner'](h, ak, 0.5) },
        { id: 'inductive_miner',     call: (w, h, ak) => w['discover_inductive_miner'](h, ak) },
        { id: 'hill_climbing',       call: (w, h, ak) => w['discover_hill_climbing'](h, ak) },
        { id: 'declare',             call: (w, h, ak) => w['discover_declare'](h, ak) },
        { id: 'simulated_annealing', call: (w, h, ak) => w['discover_simulated_annealing'](h, ak, 1.0, 0.95) },
        { id: 'a_star',              call: (w, h, ak) => w['discover_astar'](h, ak, 200) },
        { id: 'aco',                 call: (w, h, ak) => w['discover_ant_colony'](h, ak, 10, 10) },
        { id: 'pso',                 call: (w, h, ak) => w['discover_pso_algorithm'](h, ak, 10, 10) },
        { id: 'genetic_algorithm',   call: (w, h, ak) => w['discover_genetic_algorithm'](h, ak, 10, 10) },
        { id: 'optimized_dfg',       call: (w, h, ak) => w['discover_dfg_filtered'](h, ak, 1) },
        { id: 'ilp',                 call: (w, h, ak) => w['discover_ilp_petri_net'](h, ak) },
        { id: 'simd_streaming_dfg',  call: (w, h, ak) => w['discover_dfg_simd_handle'](h, ak) },
      ];

      type AlgoTestResult = { id: string; status: 'pass' | 'fail'; elapsedMs: number; error?: string };
      const results: AlgoTestResult[] = [];
      const activityKey = 'concept:name';

      await withLogSession(
        { inputPath, activityKey, commandName: 'algorithms-test-all', emitOptions: { format, verbose: false, quiet } },
        async (wasmBase, logHandle) => {
          const wasm = wasmBase as Record<string, CallableFunction>;

          if (!quiet && format === 'human') {
            process.stdout.write(`\nTesting ${TESTABLE_WASM_CALLS.length} discovery algorithms on ${path.basename(inputPath)}...\n\n`);
          }

          for (const entry of TESTABLE_WASM_CALLS) {
            const t0 = performance.now();
            try {
              const raw = entry.call(wasm, logHandle, activityKey);
              const elapsed = performance.now() - t0;
              if (raw === null || raw === undefined) {
                throw new Error('null result returned');
              }
              results.push({ id: entry.id, status: 'pass', elapsedMs: elapsed });
              if (!quiet && format === 'human') {
                process.stdout.write(`  ✔ ${entry.id.padEnd(28)} (${elapsed.toFixed(1)}ms)\n`);
              }
            } catch (err) {
              const elapsed = performance.now() - t0;
              const msg = err instanceof Error ? err.message : String(err);
              results.push({ id: entry.id, status: 'fail', elapsedMs: elapsed, error: msg });
              if (!quiet && format === 'human') {
                process.stdout.write(`  ✗ ${entry.id.padEnd(28)} FAILED: ${msg.slice(0, 80)}\n`);
              }
            }
          }
        }
      );

      const passing = results.filter((r) => r.status === 'pass').length;
      const failing = results.filter((r) => r.status === 'fail').length;

      const payload = {
        total: results.length,
        passing,
        failing,
        logFile: path.basename(inputPath),
        results,
      };

      const exitCode = failing > 0 ? EXIT_CODES.partial_failure : EXIT_CODES.success;
      const result = makeResult('algorithm-test-all', payload, 0, exitCode);

      emitResult(result, { format, verbose: false, quiet }, (_res, p) => {
        p.log('');
        p.log(`Summary: ${passing}/${results.length} passing, ${failing} failing`);
        if (failing > 0) {
          p.log('');
          p.log('  Failing algorithms:');
          for (const r of results.filter((r) => r.status === 'fail')) {
            p.log(`    ✗ ${r.id}: ${r.error ?? 'unknown error'}`);
          }
        }
        p.log('');
        p.log('  Note: Some algorithms may fail on small fixture logs (e.g. ILP timeout on complex models).');
        p.log('        Run wpm compare <algo1,algo2> -i <log> for authoritative comparison.');
        p.log('');
      });

      return await exitWithFlush(exitCode);
    }

    // ── Main listing ──────────────────────────────────────────────────────────
    let all = registry.list();
    lateTotal = all.length;

    // Apply --profile / --tier filter
    if (profileFilter) {
      const validTiers: Tier[] = ['fast', 'balanced', 'quality', 'stream'];
      if (!validTiers.includes(profileFilter as Tier)) {
        const errResult = makeErrorResult(
          'algorithms',
          `Unknown profile/tier "${profileFilter}". Valid: ${validTiers.join(', ')}`,
          EXIT_CODES.config_error,
          'INVALID_TIER'
        );
        emitResult(errResult, { format, verbose: false, quiet });
        return await exitWithFlush(errResult.exit_code);
      }
      // Support both --profile (execution profile) and  --tier (speed range)
      const profileAlgos = registry.getForProfile(profileFilter as 'fast' | 'balanced' | 'quality' | 'stream');
      const profileIds = new Set(profileAlgos.map((a) => a.id));
      all = all.filter((a) => profileIds.has(a.id));
    }

    // Apply --type filter
    if (typeFilter) {
      const validTypes = ['dfg', 'petrinet', 'declare', 'tree', 'ml_result', 'analytics'];
      // Accept both 'petri_net' and 'petrinet'
      const normalised = typeFilter.replace('_', '').toLowerCase();
      if (!validTypes.map((t) => t.replace('_', '')).includes(normalised)) {
        const errResult = makeErrorResult(
          'algorithms',
          `Unknown output type "${typeFilter}". Valid: ${validTypes.join(', ')}`,
          EXIT_CODES.config_error,
          'INVALID_TYPE'
        );
        emitResult(errResult, { format, verbose: false, quiet });
        return await exitWithFlush(errResult.exit_code);
      }
      all = all.filter((a) => a.outputType.replace('_', '').toLowerCase() === normalised);
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

      const filterDesc = [
        profileFilter ? `profile: ${profileFilter}` : null,
        typeFilter ? `type: ${typeFilter}` : null,
      ].filter(Boolean).join(', ') || 'all';

      p.log('');
      p.log(`wpm algorithms — ${all.length} registered (${filterDesc})`);
      p.log('');
      p.log(
        `${'ID'.padEnd(30)} ${'Speed'.padStart(6)} ${'Quality'.padStart(8)}  Output`
      );
      p.log('─'.repeat(68));

      for (const tier of (['stream', 'fast', 'balanced', 'quality'] as Tier[])) {
        const group = grouped[tier];
        if (!group.length) continue;
        if (!quiet) {
          p.log('');
          p.log(`  ${TIER_LABEL[tier]}`);
          p.log(`  Rationale: ${TIER_RATIONALE[tier]}`);
        }
        for (const a of group) {
          p.log(
            `  ${a.id.padEnd(28)} ${String(a.speedTier).padStart(6)} ${String(a.qualityTier).padStart(8)}  ${a.outputType}`
          );
        }
      }

      p.log('');
      p.log(`Run: wpm run <log.xes> --algorithm <id>`);
      p.log(`     wpm compare <id,id,...> -i <log.xes>`);
      p.log(`     wpm algorithms --recommend <log.xes>     # get a recommendation`);
      p.log(`     wpm algorithms --benchmark               # see speed estimates`);
      p.log(`     wpm algorithms --test-all -i <log.xes>   # test all algorithms`);
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
