import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@pictl/engine';
import { isWasmAvailable, handleWasmUnavailable } from './shared.js';

export interface TemporalOptions extends OutputOptions {
  input?: string;
  threshold?: number;
  activityKey?: string;
  timestampKey?: string;
}

export const temporal = defineCommand({
  meta: {
    name: 'temporal',
    description: 'Analyze temporal profiles and performance patterns in event logs',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file (named alternative to positional)',
      alias: 'i',
    },
    threshold: {
      type: 'string',
      description: 'Significance threshold for temporal violations (default: 0.05)',
      default: '0.05',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
      default: 'concept:name',
    },
    'timestamp-key': {
      type: 'string',
      description: 'XES timestamp attribute key (default: time:timestamp)',
      default: 'time:timestamp',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    // Check WASM availability before any WASM-dependent work
    // Pass quiet=true when in JSON mode to suppress observability logs
    const isJson = ctx.args.format === 'json';
    if (!(await isWasmAvailable(isJson))) {
      handleWasmUnavailable(isJson ? 'json' : 'human');
    }

    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        formatter.error(
          'Input file required.\n\nUsage:  pictl temporal <log.xes>\n        pictl temporal <log.xes> --threshold 0.01\n\nRun "pictl temporal --help" for details.'
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Validate input file exists
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
      const threshold = parseFloat((ctx.args.threshold as string) || '0.05');

      if (formatter instanceof HumanFormatter) {
        formatter.info(`Temporal analysis: ${inputPath}`);
        formatter.debug(`Threshold: ${threshold}, Timestamp key: ${timestampKey}`);
      }

      // Load WASM module
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // Parse XES and load log
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Loading event log from XES file...');
      }

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      // Discover DFG for temporal analysis
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Discovering directly-follows graph for temporal analysis...');
      }

      const rawDfg = wasm.discover_dfg(logHandle, activityKey);
      const dfg = typeof rawDfg === 'string' ? JSON.parse(rawDfg) : rawDfg;

      // Compute temporal profile
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Computing temporal profile...');
      }

      let temporalProfile: Record<string, unknown> | null = null;
      try {
        const rawProfile = wasm.compute_temporal_profile(logHandle, activityKey, timestampKey);
        temporalProfile = typeof rawProfile === 'string' ? JSON.parse(rawProfile) : rawProfile;
      } catch {
        // Temporal profile not available
      }

      // Check for temporal violations
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Checking for temporal violations...');
      }

      let violations: Array<Record<string, unknown>> = [];
      try {
        const rawViolations = wasm.check_temporal_conformance(logHandle, activityKey, timestampKey, threshold);
        const violationsResult = typeof rawViolations === 'string' ? JSON.parse(rawViolations) : rawViolations;
        violations = (violationsResult.violations as Array<Record<string, unknown>>) ?? [];
      } catch {
        // Temporal conformance not available
      }

      // Compute performance DFG (edge durations)
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Computing performance DFG...');
      }

      let performanceDfg: Record<string, unknown> | null = null;
      try {
        const rawPerf = wasm.compute_performance_dfg(logHandle, activityKey, timestampKey);
        performanceDfg = typeof rawPerf === 'string' ? JSON.parse(rawPerf) : rawPerf;
      } catch {
        // Performance DFG not available
      }

      // Compute activity duration statistics
      let activityDurations: Record<string, unknown> | null = null;
      try {
        const rawDurations = wasm.compute_activity_durations(logHandle, activityKey, timestampKey);
        activityDurations = typeof rawDurations === 'string' ? JSON.parse(rawDurations) : rawDurations;
      } catch {
        // Activity durations not available
      }

      // Free log handle
      try {
        wasm.delete_object(logHandle);
      } catch {
        /* best-effort */
      }

      // Build result
      const result = {
        status: 'success',
        input: inputPath,
        activityKey,
        timestampKey,
        threshold,
        dfg: {
          nodes: (dfg as Record<string, unknown>).nodes ?? [],
          edges: (dfg as Record<string, unknown>).edges ?? [],
        },
        temporalProfile,
        violations: {
          count: violations.length,
          threshold,
          items: violations,
        },
        performanceDfg,
        activityDurations,
      };

      // Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Temporal analysis complete', result);
      } else {
        printHumanTemporal(formatter as HumanFormatter, result);
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Temporal analysis failed', error);
      } else {
        formatter.error(
          `Temporal analysis failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

function printHumanTemporal(formatter: HumanFormatter, result: Record<string, unknown>): void {
  const violations = result.violations as Record<string, unknown>;
  const perfDfg = result.performanceDfg as Record<string, unknown> | null;
  const activityDurs = result.activityDurations as Record<string, unknown> | null;

  formatter.log('');
  formatter.success(`Temporal Analysis — ${result.input as string}`);
  formatter.log(`  Activity key: ${result.activityKey as string}`);
  formatter.log(`  Timestamp key: ${result.timestampKey as string}`);
  formatter.log(`  Threshold: ${(result.threshold as number).toFixed(3)}`);
  formatter.log('');

  const violationCount = violations.count as number;
  if (violationCount > 0) {
    formatter.warn(`Found ${violationCount} temporal violation(s):`);
    const items = violations.items as Array<Record<string, unknown>>;
    for (const v of items.slice(0, 10)) {
      const activity = v.activity as string;
      const expected = v.expected as number;
      const actual = v.actual as number;
      const diff = v.diff as number;
      formatter.log(`  - ${activity}: expected ${expected.toFixed(2)}ms, got ${actual.toFixed(2)}ms (diff: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}ms)`);
    }
    if (items.length > 10) {
      formatter.log(`  ... and ${items.length - 10} more violations`);
    }
  } else {
    formatter.success('No temporal violations found');
  }
  formatter.log('');

  if (activityDurs) {
    formatter.log('  Activity durations (ms):');
    const durations = activityDurs.durations as Record<string, { mean: number; min: number; max: number; median: number }>;
    if (durations) {
      for (const [activity, stats] of Object.entries(durations).slice(0, 10)) {
        formatter.log(`    ${activity}: mean=${stats.mean.toFixed(1)}, min=${stats.min.toFixed(1)}, max=${stats.max.toFixed(1)}, median=${stats.median.toFixed(1)}`);
      }
    }
    formatter.log('');
  }

  if (perfDfg) {
    const edges = perfDfg.edges as Array<{ from: string; to: string; avgDuration: number; minDuration: number; maxDuration: number }>;
    if (edges && edges.length > 0) {
      formatter.log('  Performance DFG (top 10 edges by duration):');
      const sortedEdges = [...edges].sort((a, b) => b.avgDuration - a.avgDuration).slice(0, 10);
      for (const edge of sortedEdges) {
        formatter.log(`    ${edge.from} → ${edge.to}: avg=${edge.avgDuration.toFixed(1)}ms (min: ${edge.minDuration.toFixed(1)}, max: ${edge.maxDuration.toFixed(1)})`);
      }
    }
    formatter.log('');
  }
}
