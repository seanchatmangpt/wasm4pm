import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { discriminate } from '../discriminator.js';
import { withSpan, withSpanRaw } from './_otel.js';
import { AnalysisSpans } from '@wasm4pm/observability';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';
import { WasmInstrumentation } from './_wasm-instrumentation.js';

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
  /** Jaccard similarity over DFG edge sets: |E1∩E2| / |E1∪E2|. Range [0,1]. 1 = identical structure. */
  jaccard: number;
  /** One-line human summary of the structural distance. */
  summary: string;
}

interface DiffPayload {
  log1: string;
  log2: string;
  activityKey: string;
  diff: DiffResult;
  /** True when log1 and log2 resolve to the same file (jaccard is always 1.0 in this case). */
  same_file?: boolean;
}

export const diff = defineCommand({
  meta: {
    name: 'diff',
    description:
      'Compare two XES event logs via Jaccard similarity on DFG edges. ' +
      'Ex: wpm diff before.xes after.xes  |  wpm diff log1.xes log2.xes --format json',
  },
  args: {
    log1: {
      type: 'positional',
      description: 'Path to first XES event log file (.xes)',
      required: true,
    },
    log2: {
      type: 'positional',
      description: 'Path to second XES event log file (.xes)',
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
      description: 'Enable verbose output — use -v as shorthand',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output — use -q as shorthand',
      alias: 'q',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the receipt to .wasm4pm/receipts/',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const t0 = Date.now();

    return withSpan(
      'diff',
      {
        log1: String(ctx.args.log1 ?? ''),
        log2: String(ctx.args.log2 ?? ''),
        format,
      },
      async () => {
        try {
          const log1Path = ctx.args.log1 as string;
          const log2Path = ctx.args.log2 as string;
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

          // Validate both input files exist; use distinct error codes per argument
          for (const [label, filePath] of [
            ['log1', log1Path],
            ['log2', log2Path],
          ] as const) {
            try {
              await fs.access(filePath);
            } catch {
              const errorCode = label === 'log1' ? 'LOG1_NOT_FOUND' : 'LOG2_NOT_FOUND';
              const result = makeErrorResult(
                'diff',
                new Error(
                  `Input file not found (${label}): ${filePath}\n\n` +
                    `  wpm diff accepts XES event logs (.xes files).\n` +
                    `  Usage:  wpm diff before.xes after.xes\n\n` +
                    `  Check that the file path is correct and the file is readable.`
                ),
                EXIT_CODES.source_error,
                errorCode
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

          // Detect when both paths resolve to the same file — the diff is trivially
          // identical (jaccard=1.0).  We do NOT block execution because this is valid
          // usage (e.g. baseline testing), but we surface a `same_file: true` flag in
          // the JSON payload so callers can detect it without parsing the summary string.
          const [realPath1, realPath2] = await Promise.all([
            fs.realpath(log1Path).catch(() => log1Path),
            fs.realpath(log2Path).catch(() => log2Path),
          ]);
          const isSameFile = log1Path === log2Path || realPath1 === realPath2;

          // Load WASM module
          const loader = WasmLoader.getInstance();
          await loader.init();
          const wasm = loader.get() as any;

          // Read and parse both XES files
          const [xes1, xes2] = await Promise.all([
            fs.readFile(log1Path, 'utf-8'),
            fs.readFile(log2Path, 'utf-8'),
          ]);

          // INSTRUMENTED: load_eventlog_from_xes — top 1 most-called WASM export (70 calls)
          const handle1: string = WasmInstrumentation.load_eventlog_from_xes(wasm, xes1);
          const handle2: string = WasmInstrumentation.load_eventlog_from_xes(wasm, xes2);

          let diffResult!: DiffResult;
          try {
            await withSpanRaw(
              `wasm4pm.${AnalysisSpans.diffCompute()}`,
              { activityKey, log1: log1Path, log2: log2Path },
              async () => {
                // INSTRUMENTED: discover_dfg — top 2 most-called WASM export (25 calls)
                const dfg1Raw = WasmInstrumentation.discover_dfg(wasm, handle1, activityKey);
                const dfg2Raw = WasmInstrumentation.discover_dfg(wasm, handle2, activityKey);

                // Validate both outputs are DFGs (diff is DFG-only).
                const shape1 = discriminate(dfg1Raw, 'dfg');
                const shape2 = discriminate(dfg2Raw, 'dfg');
                if (shape1.kind !== 'dfg' || shape2.kind !== 'dfg') {
                  const offending = shape1.kind !== 'dfg' ? shape1.kind : shape2.kind;
                  const result = makeErrorResult(
                    'diff',
                    new Error(`diff requires DFG output (got ${offending})`),
                    EXIT_CODES.execution_error,
                    'DIFF_REQUIRES_DFG'
                  );
                  emitResult(result, { format, verbose, quiet });
                  await exitWithFlush(result.exit_code);
                  return;
                }

                const dfg1: Dfg = shape1.raw as Dfg;
                const dfg2: Dfg = shape2.raw as Dfg;

                // Discover trace variants for both logs
                const variants1Raw = wasm.analyze_trace_variants(handle1, activityKey);
                const variants2Raw = wasm.analyze_trace_variants(handle2, activityKey);

                const variants1: TraceVariant[] = normalizeVariants(
                  typeof variants1Raw === 'string' ? JSON.parse(variants1Raw) : variants1Raw
                );
                const variants2: TraceVariant[] = normalizeVariants(
                  typeof variants2Raw === 'string' ? JSON.parse(variants2Raw) : variants2Raw
                );

                diffResult = computeDiff(dfg1, dfg2, variants1, variants2);
              },
              () => ({
                jaccard: diffResult ? Math.round(diffResult.jaccard * 1000) / 1000 : 0,
                activities_added: diffResult ? diffResult.activities.added.length : 0,
                activities_removed: diffResult ? diffResult.activities.removed.length : 0,
                edges_added: diffResult ? diffResult.edges.added.length : 0,
                edges_removed: diffResult ? diffResult.edges.removed.length : 0,
              })
            );
          } finally {
            // INSTRUMENTED: delete_object — guaranteed cleanup regardless of throw/early exit
            try { WasmInstrumentation.delete_object(wasm, handle1); } catch { /* best-effort */ }
            try { WasmInstrumentation.delete_object(wasm, handle2); } catch { /* best-effort */ }
          }

          const elapsedMs = Date.now() - t0;
          const payload: DiffPayload = {
            log1: log1Path,
            log2: log2Path,
            activityKey,
            diff: diffResult,
            ...(isSameFile ? { same_file: true } : {}),
          };

          const result = makeResult('diff', payload, elapsedMs, EXIT_CODES.success);
          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            printHumanDiff(res.payload, log1Path, log2Path, projection);
          });

          // Persist BLAKE3 receipt for proof-of-execution
          if (!ctx.args['no-save']) {
            try {
              const log1Bytes = await fs.readFile(log1Path);
              const log2Bytes = await fs.readFile(log2Path);
              const receipt: CommandReceipt = {
                ...newReceipt('diff'),
                input_hash: blake3Hex(Buffer.concat([log1Bytes, log2Bytes])),
                output_hash: blake3Hex(JSON.stringify(payload)),
                status: 'success',
                summary: {
                  log1: log1Path,
                  log2: log2Path,
                  activityKey,
                  elapsedMs: Math.round(elapsedMs * 100) / 100,
                },
              };
              saveCommandReceipt(receipt);
            } catch {
              /* receipt write must never break the command */
            }
          }

          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const result = makeErrorResult(
            'diff',
            error,
            EXIT_CODES.execution_error,
            'EXECUTION_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
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
  variants2: TraceVariant[]
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
        changedEdges.push({
          from: e2.from,
          to: e2.to,
          count1: e1.count,
          count2: e2.count,
          pctChange,
        });
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

  // --- Jaccard similarity over DFG edge sets ---
  // J = |E1 ∩ E2| / |E1 ∪ E2|   (1.0 = identical structure, 0.0 = no overlap)
  const allEdgeKeys = new Set([...edgeMap1.keys(), ...edgeMap2.keys()]);
  const intersectionSize = [...edgeMap1.keys()].filter((k) => edgeMap2.has(k)).length;
  const jaccard = allEdgeKeys.size > 0 ? intersectionSize / allEdgeKeys.size : 1.0;

  const summary =
    jaccard >= 0.9
      ? `Structurally nearly identical (Jaccard ${jaccard.toFixed(3)})`
      : jaccard >= 0.7
        ? `Minor structural changes (Jaccard ${jaccard.toFixed(3)})`
        : jaccard >= 0.4
          ? `Significant structural drift (Jaccard ${jaccard.toFixed(3)})`
          : `Processes are more different than similar (Jaccard ${jaccard.toFixed(3)})`;

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
    jaccard,
    summary,
  };
}

import type { ConsoleProjection } from '../output.js';

/**
 * Print a colour-coded human-readable diff via ConsoleProjection.
 */
function printHumanDiff(
  payload: DiffPayload,
  log1Path: string,
  log2Path: string,
  projection: ConsoleProjection
): void {
  const result = payload.diff;
  const log1Name = log1Path.split('/').pop() ?? log1Path;
  const log2Name = log2Path.split('/').pop() ?? log2Path;

  // ANSI colour helpers (gracefully degraded if not a TTY)
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

  const line = (s: string) => projection.log(s);

  // Sparkbar helper (8 chars, ▓ filled ░ empty)
  const sparkBar = (val: number, min: number, max: number, width = 8): string => {
    if (max <= min) return '▓'.repeat(width);
    const ratio = Math.max(0, Math.min(1, (val - min) / (max - min)));
    const filled = Math.round(ratio * width);
    return '▓'.repeat(filled) + '░'.repeat(width - filled);
  };

  line('');
  line(bold(`Process Diff: ${log1Name} → ${log2Name}`));
  line('━'.repeat(60));

  // --- Jaccard similarity banner (structural distance at a glance) ---
  const jaccardColor = result.jaccard >= 0.7 ? green : result.jaccard >= 0.4 ? cyan : red;
  const jaccardBar = sparkBar(result.jaccard, 0, 1);
  line('');
  line(
    `  ${bold('Structural similarity:')} ${jaccardColor(result.jaccard.toFixed(3))}  ${jaccardBar}  ${result.summary}`
  );

  // --- Activities section (control-flow perspective) ---
  line('');
  line(bold('Activities  [control-flow perspective]:'));
  const { added: actAdded, removed: actRemoved, shared: actShared } = result.activities;

  if (actAdded.length > 0) {
    const list = actAdded.join(', ');
    line(`  ${green('+')} New:     ${list.length > 60 ? list.slice(0, 57) + '...' : list}`);
    line(
      `           (appeared in log2, ${actAdded.length} activit${actAdded.length === 1 ? 'y' : 'ies'})`
    );
  }
  if (actRemoved.length > 0) {
    const list = actRemoved.join(', ');
    line(`  ${red('-')} Removed: ${list.length > 60 ? list.slice(0, 57) + '...' : list}`);
    line(
      `           (gone in log2, ${actRemoved.length} activit${actRemoved.length === 1 ? 'y' : 'ies'})`
    );
  }
  if (actAdded.length === 0 && actRemoved.length === 0) {
    line(`  ${cyan('=')} No activity changes`);
  }
  line(
    `  ${cyan('=')} Shared:  ${actShared.length} activit${actShared.length === 1 ? 'y' : 'ies'}`
  );

  // --- Edges section (control-flow + frequency perspective) ---
  line('');
  line(bold('Edges (directly-follows)  [control-flow perspective]:'));
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

  // --- Variants section (variant/case perspective) ---
  line('');
  line(bold('Traces  [variant perspective]:'));
  const v = result.variants;
  const variantDelta = v.totalLog2 - v.totalLog1;
  const variantDeltaStr = variantDelta >= 0 ? green(`+${variantDelta}`) : red(String(variantDelta));

  line(`  Unique variants  log1: ${v.totalLog1}  log2: ${v.totalLog2}  (${variantDeltaStr})`);
  line(`  Shared variants: ${v.shared}`);
  line(`  Only in log1:    ${v.uniqueLog1}  (process paths abandoned in log2)`);
  line(`  Only in log2:    ${v.uniqueLog2}  (new process paths that emerged in log2)`);
  line('');
  // Time perspective note: DFG comparison does not surface performance differences.
  // Use `wpm temporal` to compare waiting times, processing times, and case durations.
  line(
    cyan(
      `  [time perspective] Not shown here — use "wpm temporal" to compare performance profiles (waiting times, case durations).`
    )
  );
  line('');
}
