import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@wasm4pm/engine';

export interface DiffOptions extends OutputOptions {
  log1?: string;
  log2?: string;
  activityKey?: string;
}

interface DfgNode {
  id: string;
  label?: string;
  frequency?: number;
}

interface DfgEdge {
  from: string;
  to: string;
  count: number;
}

interface Dfg {
  nodes: DfgNode[];
  edges: DfgEdge[];
  start_activities?: Record<string, number>;
  end_activities?: Record<string, number>;
}

interface TraceVariant {
  variant: string | string[];
  count?: number;
  frequency?: number;
}

interface DiffResult {
  activities: {
    added: string[];
    removed: string[];
    shared: string[];
  };
  edges: {
    added: Array<{ from: string; to: string; count: number }>;
    removed: Array<{ from: string; to: string; count: number }>;
    changed: Array<{ from: string; to: string; count1: number; count2: number; pctChange: number }>;
  };
  variants: {
    uniqueLog1: number;
    uniqueLog2: number;
    shared: number;
    totalLog1: number;
    totalLog2: number;
  };
}

export const diff = defineCommand({
  meta: {
    name: 'diff',
    description: 'Compare two event logs and report process model differences',
  },
  args: {
    log1: {
      type: 'positional',
      description: 'Path to first XES event log file',
      required: true,
    },
    log2: {
      type: 'positional',
      description: 'Path to second XES event log file',
      required: true,
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
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

    try {
      const log1Path = ctx.args.log1 as string;
      const log2Path = ctx.args.log2 as string;
      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

      // Validate both input files exist
      for (const [label, filePath] of [['log1', log1Path], ['log2', log2Path]] as const) {
        try {
          await fs.access(filePath);
        } catch {
          formatter.error(`Input file not found (${label}): ${filePath}`);
          process.exit(EXIT_CODES.source_error);
        }
      }

      if (formatter instanceof HumanFormatter) {
        formatter.info(`Comparing event logs: ${log1Path} → ${log2Path}`);
      }

      // Load WASM module
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // Read and parse both XES files
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Loading event logs from XES files...');
      }

      const [xes1, xes2] = await Promise.all([
        fs.readFile(log1Path, 'utf-8'),
        fs.readFile(log2Path, 'utf-8'),
      ]);

      const handle1: string = wasm.load_eventlog_from_xes(xes1);
      const handle2: string = wasm.load_eventlog_from_xes(xes2);

      // Discover DFGs for both logs
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Discovering directly-follows graphs...');
      }

      const dfg1Raw = wasm.discover_dfg(handle1, activityKey);
      const dfg2Raw = wasm.discover_dfg(handle2, activityKey);

      const dfg1: Dfg = typeof dfg1Raw === 'string' ? JSON.parse(dfg1Raw) : dfg1Raw;
      const dfg2: Dfg = typeof dfg2Raw === 'string' ? JSON.parse(dfg2Raw) : dfg2Raw;

      // Discover trace variants for both logs
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Analyzing trace variants...');
      }

      const variants1Raw = wasm.analyze_trace_variants(handle1, activityKey);
      const variants2Raw = wasm.analyze_trace_variants(handle2, activityKey);

      const variants1: TraceVariant[] = normalizeVariants(
        typeof variants1Raw === 'string' ? JSON.parse(variants1Raw) : variants1Raw
      );
      const variants2: TraceVariant[] = normalizeVariants(
        typeof variants2Raw === 'string' ? JSON.parse(variants2Raw) : variants2Raw
      );

      // Compute diff
      const result = computeDiff(dfg1, dfg2, variants1, variants2);

      // Free handles
      try { wasm.delete_object(handle1); } catch { /* best-effort */ }
      try { wasm.delete_object(handle2); } catch { /* best-effort */ }

      // Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Process diff complete', {
          log1: log1Path,
          log2: log2Path,
          activityKey,
          diff: result as unknown as Record<string, unknown>,
        });
      } else {
        printHumanDiff(formatter, log1Path, log2Path, result);
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Diff failed', error);
      } else {
        formatter.error(
          `Diff failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

/**
 * Normalise whatever shape analyze_trace_variants returns into a flat array
 * of { variant: string, count: number } objects.
 */
function normalizeVariants(raw: unknown): TraceVariant[] {
  if (Array.isArray(raw)) {
    return raw as TraceVariant[];
  }
  // Some versions return { variants: [...] }
  if (raw && typeof raw === 'object' && 'variants' in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown[]>)['variants'] as TraceVariant[];
  }
  return [];
}

/**
 * Stringify a variant's activity sequence so it can be used as a map key.
 */
function variantKey(v: TraceVariant): string {
  if (Array.isArray(v.variant)) return v.variant.join('→');
  return String(v.variant ?? '');
}

/**
 * Compute the full diff between two DFGs and variant lists.
 */
function computeDiff(
  dfg1: Dfg,
  dfg2: Dfg,
  variants1: TraceVariant[],
  variants2: TraceVariant[],
): DiffResult {
  // --- Activities ---
  const acts1 = new Set<string>(dfg1.nodes.map((n) => n.id));
  const acts2 = new Set<string>(dfg2.nodes.map((n) => n.id));

  const added = [...acts2].filter((a) => !acts1.has(a)).sort();
  const removed = [...acts1].filter((a) => !acts2.has(a)).sort();
  const shared = [...acts1].filter((a) => acts2.has(a)).sort();

  // --- Edges ---
  // Build maps keyed by "from→to"
  const edgeMap1 = new Map<string, DfgEdge>();
  for (const e of dfg1.edges) {
    edgeMap1.set(`${e.from}→${e.to}`, e);
  }
  const edgeMap2 = new Map<string, DfgEdge>();
  for (const e of dfg2.edges) {
    edgeMap2.set(`${e.from}→${e.to}`, e);
  }

  const addedEdges: DiffResult['edges']['added'] = [];
  const removedEdges: DiffResult['edges']['removed'] = [];
  const changedEdges: DiffResult['edges']['changed'] = [];

  for (const [key, e2] of edgeMap2) {
    if (!edgeMap1.has(key)) {
      addedEdges.push({ from: e2.from, to: e2.to, count: e2.count });
    } else {
      const e1 = edgeMap1.get(key)!;
      if (e1.count !== e2.count) {
        const pctChange = e1.count > 0 ? ((e2.count - e1.count) / e1.count) * 100 : 100;
        changedEdges.push({ from: e2.from, to: e2.to, count1: e1.count, count2: e2.count, pctChange });
      }
    }
  }

  for (const [key, e1] of edgeMap1) {
    if (!edgeMap2.has(key)) {
      removedEdges.push({ from: e1.from, to: e1.to, count: e1.count });
    }
  }

  // Sort edges for deterministic output
  addedEdges.sort((a, b) => b.count - a.count);
  removedEdges.sort((a, b) => b.count - a.count);
  changedEdges.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));

  // --- Trace Variants ---
  const vKeys1 = new Set(variants1.map(variantKey));
  const vKeys2 = new Set(variants2.map(variantKey));

  const uniqueLog1 = [...vKeys1].filter((k) => !vKeys2.has(k)).length;
  const uniqueLog2 = [...vKeys2].filter((k) => !vKeys1.has(k)).length;
  const sharedVariants = [...vKeys1].filter((k) => vKeys2.has(k)).length;

  return {
    activities: { added, removed, shared },
    edges: { added: addedEdges, removed: removedEdges, changed: changedEdges },
    variants: {
      uniqueLog1,
      uniqueLog2,
      shared: sharedVariants,
      totalLog1: vKeys1.size,
      totalLog2: vKeys2.size,
    },
  };
}

/**
 * Print a colour-coded human-readable diff to the formatter.
 */
function printHumanDiff(
  formatter: HumanFormatter,
  log1Path: string,
  log2Path: string,
  result: DiffResult,
): void {
  const log1Name = log1Path.split('/').pop() ?? log1Path;
  const log2Name = log2Path.split('/').pop() ?? log2Path;

  // ANSI colour helpers (gracefully degraded if not a TTY)
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;

  const line = (s: string) => formatter.log(s);

  line('');
  line(bold(`Process Diff: ${log1Name} → ${log2Name}`));
  line('━'.repeat(60));

  // --- Activities section ---
  line('');
  line(bold('Activities:'));
  const { added: actAdded, removed: actRemoved, shared: actShared } = result.activities;

  if (actAdded.length > 0) {
    const list = actAdded.join(', ');
    line(`  ${green('+')} New:     ${list.length > 60 ? list.slice(0, 57) + '...' : list}`);
    line(`           (appeared in log2, ${actAdded.length} activit${actAdded.length === 1 ? 'y' : 'ies'})`);
  }
  if (actRemoved.length > 0) {
    const list = actRemoved.join(', ');
    line(`  ${red('-')} Removed: ${list.length > 60 ? list.slice(0, 57) + '...' : list}`);
    line(`           (gone in log2, ${actRemoved.length} activit${actRemoved.length === 1 ? 'y' : 'ies'})`);
  }
  if (actAdded.length === 0 && actRemoved.length === 0) {
    line(`  ${cyan('=')} No activity changes`);
  }
  line(`  ${cyan('=')} Shared:  ${actShared.length} activit${actShared.length === 1 ? 'y' : 'ies'}`);

  // --- Edges section ---
  line('');
  line(bold('Edges (directly-follows):'));
  const { added: edgeAdded, removed: edgeRemoved, changed: edgeChanged } = result.edges;

  if (edgeAdded.length === 0 && edgeRemoved.length === 0 && edgeChanged.length === 0) {
    line(`  ${cyan('=')} No edge changes`);
  } else {
    for (const e of edgeAdded.slice(0, 10)) {
      line(`  ${green('+')} New:     ${e.from}→${e.to} (${e.count})`);
    }
    if (edgeAdded.length > 10) {
      line(`           ... and ${edgeAdded.length - 10} more new edges`);
    }

    for (const e of edgeRemoved.slice(0, 10)) {
      line(`  ${red('-')} Removed: ${e.from}→${e.to} (${e.count})`);
    }
    if (edgeRemoved.length > 10) {
      line(`           ... and ${edgeRemoved.length - 10} more removed edges`);
    }

    for (const e of edgeChanged.slice(0, 10)) {
      const pctStr = (e.pctChange >= 0 ? '+' : '') + e.pctChange.toFixed(0) + '%';
      const pctColored = e.pctChange >= 0 ? green(pctStr) : red(pctStr);
      line(`  ${cyan('~')} Changed: ${e.from}→${e.to}  ${e.count1} → ${e.count2}  (${pctColored})`);
    }
    if (edgeChanged.length > 10) {
      line(`           ... and ${edgeChanged.length - 10} more changed edges`);
    }
  }

  // --- Variants section ---
  line('');
  line(bold('Traces:'));
  const v = result.variants;
  const variantDelta = v.totalLog2 - v.totalLog1;
  const variantDeltaStr = variantDelta >= 0
    ? green(`+${variantDelta}`)
    : red(String(variantDelta));

  line(`  Unique variants  log1: ${v.totalLog1}  log2: ${v.totalLog2}  (${variantDeltaStr})`);
  line(`  Shared variants: ${v.shared}`);
  line(`  Only in log1:    ${v.uniqueLog1}`);
  line(`  Only in log2:    ${v.uniqueLog2}`);
  line('');
}
