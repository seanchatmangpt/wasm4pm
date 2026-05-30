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

/** Multi-perspective deep analysis — only present when --deep flag is set. */
interface DeepAnalysis {
  control_flow: {
    similarity: number;
    added_paths: number;
    removed_paths: number;
    added_activities: string[];
    removed_activities: string[];
  };
  performance: {
    baseline_avg_duration_hours: number;
    current_avg_duration_hours: number;
    duration_delta_pct: number;
    throughput_change_pct: number;
  };
  variants: {
    baseline_count: number;
    current_count: number;
    new_variants: number;
    removed_variants: number;
    top_new_variant: string;
    top_removed_variant: string;
  };
  overall_verdict: 'IMPROVED' | 'DEGRADED' | 'CHANGED' | 'IDENTICAL';
}

interface DiffPayload {
  log1: string;
  log2: string;
  activityKey: string;
  diff: DiffResult;
  /** True when log1 and log2 resolve to the same file (jaccard is always 1.0 in this case). */
  same_file?: boolean;
  /** Deep multi-perspective analysis, present only when --deep flag is used. */
  deep?: DeepAnalysis;
}

export const diff = defineCommand({
  meta: {
    name: 'diff',
    description:
      'Compare two XES event logs via Jaccard similarity on DFG edges. ' +
      'Ex: wpm diff before.xes after.xes  |  wpm diff log1.xes log2.xes --format json  |  wpm diff log1.xes log2.xes --deep',
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
    deep: {
      type: 'boolean',
      description:
        'Run multi-perspective deep analysis (control-flow, performance, variants, verdict)',
    },
    'same-file-check': {
      type: 'boolean',
      description:
        'Detect when both paths resolve to the same file and return similarity: 1.0 immediately',
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
    const deep = Boolean(ctx.args.deep);
    const sameFileCheck = Boolean(ctx.args['same-file-check']);

    const t0 = Date.now();

    return withSpan(
      'diff',
      {
        log1: String(ctx.args.log1 ?? ''),
        log2: String(ctx.args.log2 ?? ''),
        format,
        deep,
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

          // --same-file-check: when paths are identical, short-circuit with similarity=1.0
          if (sameFileCheck && isSameFile) {
            const shortCircuitDiff = buildIdenticalDiff();
            const payload: DiffPayload = {
              log1: log1Path,
              log2: log2Path,
              activityKey,
              diff: shortCircuitDiff,
              same_file: true,
            };
            if (deep) {
              payload.deep = buildIdenticalDeep();
            }
            const elapsedMs = Date.now() - t0;
            const result = makeResult('diff', payload, elapsedMs, EXIT_CODES.success);
            emitResult(result, { format, verbose, quiet }, (res, projection) => {
              printHumanDiff(res.payload, log1Path, log2Path, projection, deep);
            });
            return await exitWithFlush(EXIT_CODES.success);
          }

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
          let deepAnalysis: DeepAnalysis | undefined;

          try {
            await withSpanRaw(
              `wasm4pm.${AnalysisSpans.diffCompute()}`,
              { activityKey, log1: log1Path, log2: log2Path, deep },
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

                // --deep: multi-perspective analysis
                if (deep) {
                  deepAnalysis = computeDeepAnalysis(
                    dfg1,
                    dfg2,
                    variants1,
                    variants2,
                    xes1,
                    xes2,
                    diffResult
                  );
                }
              },
              () => ({
                jaccard: diffResult ? Math.round(diffResult.jaccard * 1000) / 1000 : 0,
                activities_added: diffResult ? diffResult.activities.added.length : 0,
                activities_removed: diffResult ? diffResult.activities.removed.length : 0,
                edges_added: diffResult ? diffResult.edges.added.length : 0,
                edges_removed: diffResult ? diffResult.edges.removed.length : 0,
                deep_enabled: deep,
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
            ...(deepAnalysis ? { deep: deepAnalysis } : {}),
          };

          const result = makeResult('diff', payload, elapsedMs, EXIT_CODES.success);
          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            printHumanDiff(res.payload, log1Path, log2Path, projection, deep);
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
                  deep,
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

// ─── Deep analysis helpers ─────────────────────────────────────────────────────

/**
 * Extract all ISO-8601 timestamps from an XES string.
 * Returns sorted millisecond values per trace.
 */
function extractTraceDurations(xes: string): number[] {
  const durations: number[] = [];
  // Match each <trace>...</trace> block
  const traceRegex = /<trace[\s\S]*?<\/trace>/g;
  let traceMatch: RegExpExecArray | null;

  while ((traceMatch = traceRegex.exec(xes)) !== null) {
    const traceXml = traceMatch[0];
    // Extract all timestamps within this trace
    const tsRegex = /value="(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)"/g;
    const timestamps: number[] = [];
    let tsMatch: RegExpExecArray | null;

    while ((tsMatch = tsRegex.exec(traceXml)) !== null) {
      const ms = Date.parse(tsMatch[1]);
      if (!isNaN(ms)) timestamps.push(ms);
    }

    if (timestamps.length >= 2) {
      const sorted = timestamps.sort((a, b) => a - b);
      durations.push(sorted[sorted.length - 1] - sorted[0]);
    }
  }

  return durations;
}

function avgHours(durations: number[]): number {
  if (durations.length === 0) return 0;
  const avgMs = durations.reduce((s, d) => s + d, 0) / durations.length;
  return Math.round((avgMs / 3_600_000) * 10) / 10;
}

/**
 * Pick the top variant (by count) that is unique to a given set of variant keys.
 */
function topUniqueVariant(
  variants: TraceVariant[],
  uniqueKeys: Set<string>
): string {
  const unique = variants
    .filter((v) => uniqueKeys.has(variantKey(v)))
    .sort((a, b) => (b.count ?? b.frequency ?? 0) - (a.count ?? a.frequency ?? 0));
  return unique.length > 0 ? variantKey(unique[0]) : '';
}

/**
 * Compute the multi-perspective deep analysis.
 */
function computeDeepAnalysis(
  dfg1: Dfg,
  dfg2: Dfg,
  variants1: TraceVariant[],
  variants2: TraceVariant[],
  xes1: string,
  xes2: string,
  base: DiffResult
): DeepAnalysis {
  // ── Control flow ──────────────────────────────────────────────────────────────
  const controlFlow = {
    similarity: Math.round(base.jaccard * 1000) / 1000,
    added_paths: base.edges.added.length,
    removed_paths: base.edges.removed.length,
    added_activities: [...base.activities.added],
    removed_activities: [...base.activities.removed],
  };

  // ── Performance ───────────────────────────────────────────────────────────────
  const durations1 = extractTraceDurations(xes1);
  const durations2 = extractTraceDurations(xes2);

  const baselineAvgH = avgHours(durations1);
  const currentAvgH = avgHours(durations2);

  const durationDeltaPct =
    baselineAvgH > 0
      ? Math.round(((currentAvgH - baselineAvgH) / baselineAvgH) * 1000) / 10
      : 0;

  // Throughput approximation: inverse of avg duration (more variants → more throughput)
  const baselineThroughput = baselineAvgH > 0 ? 1 / baselineAvgH : 0;
  const currentThroughput = currentAvgH > 0 ? 1 / currentAvgH : 0;
  const throughputChangePct =
    baselineThroughput > 0
      ? Math.round(((currentThroughput - baselineThroughput) / baselineThroughput) * 1000) / 10
      : 0;

  const performance = {
    baseline_avg_duration_hours: baselineAvgH,
    current_avg_duration_hours: currentAvgH,
    duration_delta_pct: durationDeltaPct,
    throughput_change_pct: throughputChangePct,
  };

  // ── Variants ─────────────────────────────────────────────────────────────────
  const vKeys1 = new Set(variants1.map(variantKey));
  const vKeys2 = new Set(variants2.map(variantKey));

  const onlyIn2 = new Set([...vKeys2].filter((k) => !vKeys1.has(k)));
  const onlyIn1 = new Set([...vKeys1].filter((k) => !vKeys2.has(k)));

  const variantsSummary = {
    baseline_count: vKeys1.size,
    current_count: vKeys2.size,
    new_variants: onlyIn2.size,
    removed_variants: onlyIn1.size,
    top_new_variant: topUniqueVariant(variants2, onlyIn2),
    top_removed_variant: topUniqueVariant(variants1, onlyIn1),
  };

  // ── Overall verdict ───────────────────────────────────────────────────────────
  let verdict: DeepAnalysis['overall_verdict'];

  if (base.jaccard === 1.0 && durationDeltaPct === 0) {
    verdict = 'IDENTICAL';
  } else if (base.jaccard > 0.6 && durationDeltaPct < 0) {
    // Similar structure + faster → IMPROVED
    verdict = 'IMPROVED';
  } else if (base.jaccard < 0.4 || durationDeltaPct > 20) {
    // Very different structure or much slower → DEGRADED
    verdict = 'DEGRADED';
  } else {
    verdict = 'CHANGED';
  }

  return {
    control_flow: controlFlow,
    performance,
    variants: variantsSummary,
    overall_verdict: verdict,
  };
}

/** Trivial identical diff result for same-file short-circuit. */
function buildIdenticalDiff(): DiffResult {
  return {
    activities: { added: [], removed: [], shared: [] },
    edges: { added: [], removed: [], changed: [] },
    variants: { uniqueLog1: 0, uniqueLog2: 0, shared: 0, totalLog1: 0, totalLog2: 0 },
    jaccard: 1.0,
    summary: 'Structurally nearly identical (Jaccard 1.000) — same file',
  };
}

/** Trivial identical deep analysis for same-file short-circuit. */
function buildIdenticalDeep(): DeepAnalysis {
  return {
    control_flow: {
      similarity: 1.0,
      added_paths: 0,
      removed_paths: 0,
      added_activities: [],
      removed_activities: [],
    },
    performance: {
      baseline_avg_duration_hours: 0,
      current_avg_duration_hours: 0,
      duration_delta_pct: 0,
      throughput_change_pct: 0,
    },
    variants: {
      baseline_count: 0,
      current_count: 0,
      new_variants: 0,
      removed_variants: 0,
      top_new_variant: '',
      top_removed_variant: '',
    },
    overall_verdict: 'IDENTICAL',
  };
}

// ─── Core diff computation ─────────────────────────────────────────────────────

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
  projection: ConsoleProjection,
  deep: boolean
): void {
  const result = payload.diff;
  const log1Name = log1Path.split('/').pop() ?? log1Path;
  const log2Name = log2Path.split('/').pop() ?? log2Path;

  // ANSI colour helpers (gracefully degraded if not a TTY)
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

  const line = (s: string) => projection.log(s);

  // ─── Quick summary (always shown) ────────────────────────────────────────────
  const acts1 = result.activities.shared.length + result.activities.removed.length;
  const acts2 = result.activities.shared.length + result.activities.added.length;

  line('');
  line(bold(`Process Diff: ${log1Name} → ${log2Name}`));

  // Compact one-liner summary
  const simPct = (result.jaccard * 100).toFixed(1);
  const simColor =
    result.jaccard >= 0.7 ? green : result.jaccard >= 0.4 ? yellow : red;

  // Deep verdict badge
  const verdictBadge =
    payload.deep
      ? ' | Verdict: ' +
        (payload.deep.overall_verdict === 'IMPROVED'
          ? green('IMPROVED')
          : payload.deep.overall_verdict === 'DEGRADED'
            ? red('DEGRADED')
            : payload.deep.overall_verdict === 'IDENTICAL'
              ? cyan('IDENTICAL')
              : yellow('CHANGED'))
      : '';

  const durationSummary =
    payload.deep
      ? ` | Duration: ${payload.deep.performance.baseline_avg_duration_hours}h→${payload.deep.performance.current_avg_duration_hours}h (${payload.deep.performance.duration_delta_pct >= 0 ? '+' : ''}${payload.deep.performance.duration_delta_pct}%)`
      : '';

  line(
    `Similarity: ${simColor(simPct + '%')} | Activities: ${acts1}→${acts2} | Variants: ${result.variants.totalLog1}→${result.variants.totalLog2}${durationSummary}${verdictBadge}`
  );

  if (!deep) {
    line(cyan('Run with --deep for full analysis.'));
    line('');
    return;
  }

  // ─── Deep output ─────────────────────────────────────────────────────────────
  line('━'.repeat(60));

  // Jaccard banner
  const jaccardColor = result.jaccard >= 0.7 ? green : result.jaccard >= 0.4 ? cyan : red;
  line('');
  line(
    `  ${bold('Structural similarity:')} ${jaccardColor(result.jaccard.toFixed(3))}  ${result.summary}`
  );

  // ── Control flow ──────────────────────────────────────────────────────────────
  line('');
  line(bold('Control Flow:'));
  const { added: actAdded, removed: actRemoved, shared: actShared } = result.activities;

  if (actAdded.length > 0) {
    const list = actAdded.join(', ');
    line(`  ${green('+')} New:     ${list.length > 60 ? list.slice(0, 57) + '...' : list}`);
  }
  if (actRemoved.length > 0) {
    const list = actRemoved.join(', ');
    line(`  ${red('-')} Removed: ${list.length > 60 ? list.slice(0, 57) + '...' : list}`);
  }
  if (actAdded.length === 0 && actRemoved.length === 0) {
    line(`  ${cyan('=')} No activity changes`);
  }
  line(`  ${cyan('=')} Shared:  ${actShared.length} activit${actShared.length === 1 ? 'y' : 'ies'}`);
  line(`  Paths added: ${result.edges.added.length} | Paths removed: ${result.edges.removed.length}`);

  // ── Edges ─────────────────────────────────────────────────────────────────────
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

  // ── Performance ───────────────────────────────────────────────────────────────
  if (payload.deep) {
    const perf = payload.deep.performance;
    line('');
    line(bold('Performance:'));
    const durColor = perf.duration_delta_pct < 0 ? green : perf.duration_delta_pct > 10 ? red : yellow;
    line(
      `  Avg duration: ${perf.baseline_avg_duration_hours}h → ${perf.current_avg_duration_hours}h  (${durColor((perf.duration_delta_pct >= 0 ? '+' : '') + perf.duration_delta_pct + '%')})`
    );
    const tpColor = perf.throughput_change_pct > 0 ? green : perf.throughput_change_pct < -10 ? red : yellow;
    line(
      `  Throughput change: ${tpColor((perf.throughput_change_pct >= 0 ? '+' : '') + perf.throughput_change_pct + '%')}`
    );

    // ── Variants ─────────────────────────────────────────────────────────────────
    const vars = payload.deep.variants;
    line('');
    line(bold('Variants:'));
    const variantDelta = vars.current_count - vars.baseline_count;
    line(
      `  Unique variants  baseline: ${vars.baseline_count}  current: ${vars.current_count}  (${variantDelta >= 0 ? green('+' + variantDelta) : red(String(variantDelta))})`
    );
    line(`  New variants: ${vars.new_variants}  |  Removed: ${vars.removed_variants}`);
    if (vars.top_new_variant) {
      line(`  Top new:     ${green(vars.top_new_variant)}`);
    }
    if (vars.top_removed_variant) {
      line(`  Top removed: ${red(vars.top_removed_variant)}`);
    }

    // ── Verdict ───────────────────────────────────────────────────────────────────
    line('');
    const v = payload.deep.overall_verdict;
    const vColor =
      v === 'IMPROVED' ? green : v === 'DEGRADED' ? red : v === 'IDENTICAL' ? cyan : yellow;
    line(bold('Verdict: ') + vColor(v));
  }

  line('');
}
