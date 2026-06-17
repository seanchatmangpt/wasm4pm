import { defineCommand } from 'citty';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { toOcelJsonl, type OcelEvent } from '@wasm4pm/contracts';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

// ── declared lifecycle (reference model) ─────────────────────────────────────

const DECLARED_LIFECYCLE = {
  nodes: ['wasm4pm.init', 'wasm4pm.run', 'wasm4pm.complete', 'wasm4pm.error'],
  edges: [
    { from: 'wasm4pm.init', to: 'wasm4pm.run' },
    { from: 'wasm4pm.run', to: 'wasm4pm.complete' },
    { from: 'wasm4pm.run', to: 'wasm4pm.error' },
  ],
} as const;

// ── types ─────────────────────────────────────────────────────────────────────

/**
 * Minimal shape of an OTEL span as written by wpm's FileSpanExporter to the
 * on-disk JSONL sink (`.wasm4pm/spans/*.jsonl`).
 *
 * Uses snake_case field names and numeric nanosecond timestamps — intentionally
 * distinct from the W3C OTLP wire format (SpanExport in span-ocel-bridge.ts)
 * which uses camelCase and string-encoded nanosecond timestamps.
 */
interface RawSpan {
  trace_id?: string;
  span_id?: string;
  name?: string;
  kind?: string;
  start_time?: number;
  end_time?: number;
  status?: { code: string; message?: string };
  attributes?: Record<string, string | number | boolean>;
}

interface DfgPerTypeEntry {
  object_type: string;
  activities: string[];
  edges: Array<{ source: string; target: string; count: number }>;
}

interface LifecycleDiff {
  shadow_edges: Array<{ from: string; to: string }>;
  missing_edges: Array<{ from: string; to: string }>;
  coverage: number;
}

interface SelfConformancePayload {
  spans_file: string;
  span_count: number;
  ocel_event_count: number;
  object_type_count: number;
  dfg_per_type: DfgPerTypeEntry[];
  threshold: number;
  fitness: number;
  passed: boolean;
  lifecycle_diff?: LifecycleDiff;
}

// ── span → OCEL conversion ────────────────────────────────────────────────────

/**
 * Convert an array of raw OTEL spans into OCEL 2.0 JSONL string.
 *
 * Each span becomes one OCEL event:
 *   - ocel:activity  = span.name
 *   - ocel:timestamp = ISO-8601 from span.start_time (nanoseconds)
 *   - ocel:omap      = [span.attributes["service.name"] ?? "wasm4pm"]
 *   - ocel:vmap      = span status + duration_ms
 */
export function spansToOcelJsonl(spans: RawSpan[]): string {
  const events: OcelEvent[] = spans
    .filter((s) => typeof s.name === 'string' && s.name.length > 0)
    .map((s, idx) => {
      const startNs = typeof s.start_time === 'number' ? s.start_time : Date.now() * 1_000_000;
      const endNs = typeof s.end_time === 'number' ? s.end_time : startNs;
      const durationMs = (endNs - startNs) / 1_000_000;
      const ts = new Date(startNs / 1_000_000).toISOString();
      const service =
        (s.attributes?.['service.name'] as string | undefined) ?? 'wasm4pm';
      const eid = s.span_id ?? `span-${idx}`;

      return {
        'ocel:eid': eid,
        'ocel:activity': s.name!,
        'ocel:timestamp': ts,
        'ocel:omap': [service],
        'ocel:vmap': {
          status: s.status?.code ?? 'OK',
          duration_ms: Math.round(durationMs * 100) / 100,
          ...(s.trace_id ? { trace_id: s.trace_id } : {}),
          ...(s.attributes ?? {}),
        },
      } satisfies OcelEvent;
    });

  return toOcelJsonl(events);
}

/**
 * Parse a JSONL file of OTEL spans, tolerating malformed lines.
 */
function parseSpansJsonl(raw: string): RawSpan[] {
  const spans: RawSpan[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      spans.push(JSON.parse(trimmed) as RawSpan);
    } catch {
      // skip unparseable lines
    }
  }
  return spans;
}

// ── command ───────────────────────────────────────────────────────────────────

export const selfConformance = defineCommand({
  meta: {
    name: 'self-conformance',
    description:
      "Mine wpm's own execution spans and report process conformance.\n\n" +
      'Reads OTEL spans emitted by previous wpm invocations, converts them to\n' +
      'OCEL 2.0, loads them through the WASM kernel, and runs ocel_dfg_per_type\n' +
      'to report the observed process structure.\n\n' +
      'EXAMPLES:\n' +
      '  wpm self-conformance                             # Default spans file\n' +
      '  wpm self-conformance --spans ./my-spans.jsonl   # Custom spans file\n' +
      '  wpm self-conformance --threshold 0.9 --json     # Strict threshold + JSON output\n\n' +
      STANDARD_EXIT_CODE_DOCS,
  },
  args: {
    spans: {
      type: 'string',
      description: 'JSONL file of exported OTEL spans',
      default: '.wasm4pm/spans.jsonl',
    },
    threshold: {
      type: 'string',
      description: 'Minimum fitness threshold (0-1)',
      default: '0.85',
    },
    json: {
      type: 'boolean',
      description: 'Output JSON',
      default: false,
    },
    'assert-lifecycle': {
      type: 'boolean',
      description: 'Exit 3 if shadow edges are present or declared lifecycle coverage < 50%',
      default: false,
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress verbose output; exit 0 if healthy, non-zero if fitness < 0.5',
      default: false,
    },
  },
  async run({ args }) {
    const t0 = performance.now();

    await withSpan(
      'self-conformance',
      { 'spans.file': args.spans, threshold: args.threshold },
      async () => {
        const spansFile = resolve(args.spans);
        const threshold = parseFloat(args.threshold);
        // In quiet mode, use 0.5 as the effective exit threshold regardless of --threshold
        const quietThreshold = 0.5;
        const outputOptions = args.json ? { format: 'json' as const } : {};

        if (isNaN(threshold) || threshold < 0 || threshold > 1) {
          if (!args.quiet) {
            emitResult(
              makeErrorResult(
                'self-conformance',
                `Invalid threshold "${args.threshold}" — must be a number between 0 and 1`,
                EXIT_CODES.config_error,
                'CONFIG_INVALID_THRESHOLD',
                'Provide a decimal value between 0.0 and 1.0, e.g. --threshold 0.85',
              ),
              outputOptions,
            );
          }
          await exitWithFlush(EXIT_CODES.config_error);
          return;
        }

        if (!existsSync(spansFile)) {
          if (!args.quiet) {
            emitResult(
              makeErrorResult(
                'self-conformance',
                `Spans file not found: ${spansFile}`,
                EXIT_CODES.source_error,
                'SOURCE_SPANS_NOT_FOUND',
                'Run wpm commands first to emit spans, or pass --spans <file>.',
              ),
              outputOptions,
            );
          }
          await exitWithFlush(EXIT_CODES.source_error);
          return;
        }

        let spans: RawSpan[];
        try {
          const raw = readFileSync(spansFile, 'utf-8');
          spans = parseSpansJsonl(raw);
        } catch (err) {
          emitResult(
            makeErrorResult(
              'self-conformance',
              err,
              EXIT_CODES.source_error,
              'SOURCE_READ_ERROR',
            ),
            outputOptions,
          );
          await exitWithFlush(EXIT_CODES.source_error);
          return;
        }

        if (spans.length === 0) {
          if (!args.quiet) {
            emitResult(
              makeErrorResult(
                'self-conformance',
                `No valid spans found in file — nothing to mine`,
                EXIT_CODES.execution_error,
                'EXEC_NO_SPANS',
                'Run wpm commands first to populate the spans file.',
              ),
              outputOptions,
            );
          }
          await exitWithFlush(EXIT_CODES.execution_error);
          return;
        }

        // Convert spans → OCEL JSONL
        const ocelJsonl = spansToOcelJsonl(spans);
        const ocelLines = ocelJsonl.split('\n').filter((l) => l.trim().length > 0);

        // Load WASM kernel and run discovery
        let dfgPerType: DfgPerTypeEntry[] = [];
        let objectTypeCount = 0;

        try {
          // Dynamic import — avoids WASM load cost on unrelated commands
          const wasm = await import('wasm4pm');
          // init() is the default export when wasm-pack builds for Node.js
          if (typeof wasm.default === 'function') {
            await (wasm.default as unknown as () => Promise<void>)();
          }

          // Assemble minimal OCEL 2.0 JSON from the JSONL lines.
          // load_ocel_from_json expects the full OCEL 2.0 JSON object.
          const events = ocelLines.map((l) => JSON.parse(l) as OcelEvent);

          const objectTypes = new Set<string>();
          for (const ev of events) {
            for (const obj of ev['ocel:omap']) {
              objectTypes.add(obj);
            }
          }

          const ocel2Json = {
            'ocel:global-log': {
              'ocel:version': '2.0',
              'ocel:ordering': 'timestamp',
              'ocel:attribute-names': ['status', 'duration_ms'],
              'ocel:object-types': Array.from(objectTypes),
            },
            'ocel:global-event': {},
            'ocel:global-object': {},
            'ocel:events': Object.fromEntries(
              events.map((ev) => [
                ev['ocel:eid'],
                {
                  'ocel:activity': ev['ocel:activity'],
                  'ocel:timestamp': ev['ocel:timestamp'],
                  'ocel:omap': ev['ocel:omap'],
                  'ocel:vmap': ev['ocel:vmap'],
                },
              ]),
            ),
            'ocel:objects': Object.fromEntries(
              Array.from(objectTypes).map((ot) => [
                ot,
                { 'ocel:type': ot, 'ocel:ovmap': {} },
              ]),
            ),
          };

          const ocelJsonStr = JSON.stringify(ocel2Json);
          const handle = (wasm as Record<string, unknown>)['load_ocel_from_json'] as (s: string) => string;
          const dfgFn = (wasm as Record<string, unknown>)['discover_ocel_dfg_per_type'] as (h: string) => unknown;

          if (typeof handle !== 'function' || typeof dfgFn !== 'function') {
            throw new Error(
              'WASM exports load_ocel_from_json or discover_ocel_dfg_per_type not found — rebuild WASM core',
            );
          }

          const ocelHandle = handle(ocelJsonStr);
          const dfgRaw = dfgFn(ocelHandle);

          // dfgRaw may be an array or an object keyed by object type
          if (Array.isArray(dfgRaw)) {
            dfgPerType = dfgRaw as DfgPerTypeEntry[];
          } else if (dfgRaw && typeof dfgRaw === 'object') {
            dfgPerType = Object.entries(dfgRaw as Record<string, unknown>).map(
              ([objectType, data]: [string, unknown]) => {
                const d = data as {
                  activities?: string[];
                  edges?: Array<{ source: string; target: string; count: number }>;
                };
                return {
                  object_type: objectType,
                  activities: d.activities ?? [],
                  edges: d.edges ?? [],
                };
              },
            );
          }

          objectTypeCount = dfgPerType.length;
        } catch (err) {
          if (!args.quiet) {
            emitResult(
              makeErrorResult(
                'self-conformance',
                err,
                EXIT_CODES.execution_error,
                'EXEC_WASM_FAILURE',
              ),
              outputOptions,
            );
          }
          await exitWithFlush(EXIT_CODES.execution_error);
          return;
        }

        // Fitness proxy: fraction of object types that have at least one edge
        // (a type with only a single activity and no edges is structurally trivial)
        const nonTrivialTypes = dfgPerType.filter((t) => t.edges.length > 0).length;
        const fitness =
          objectTypeCount > 0 ? nonTrivialTypes / objectTypeCount : 0;
        const passed = fitness >= threshold;
        const durationMs = performance.now() - t0;

        // ── lifecycle diff (Gap 3: model-vs-log structural comparison) ─────────
        // Collect all discovered edges across all object types into a flat set
        const discoveredEdgeSet = new Set<string>();
        for (const entry of dfgPerType) {
          for (const e of entry.edges) {
            discoveredEdgeSet.add(`${e.source}→${e.target}`);
          }
        }

        const declaredEdges = DECLARED_LIFECYCLE.edges as ReadonlyArray<{ from: string; to: string }>;

        const shadow_edges = Array.from(discoveredEdgeSet)
          .map((key) => {
            const [from, to] = key.split('→');
            return { from, to };
          })
          .filter(
            ({ from, to }) =>
              !declaredEdges.some((d) => d.from === from && d.to === to),
          );

        const missing_edges = declaredEdges.filter(
          ({ from, to }) => !discoveredEdgeSet.has(`${from}→${to}`),
        ).map(({ from, to }) => ({ from, to }));

        const coverage =
          declaredEdges.length > 0
            ? (declaredEdges.length - missing_edges.length) / declaredEdges.length
            : 1;

        const lifecycleDiff: LifecycleDiff = { shadow_edges, missing_edges, coverage };

        // Print lifecycle diff (human-readable; always shown unless --json)
        if (!args.json && !args.quiet) {
          if (shadow_edges.length > 0) {
            const list = shadow_edges.map((e) => `${e.from} → ${e.to}`).join(', ');
            console.warn(`[WARN] Shadow paths detected: ${list}`);
          }
          if (missing_edges.length > 0) {
            const list = missing_edges.map((e) => `${e.from} → ${e.to}`).join(', ');
            console.info(`[INFO] Never-exercised paths: ${list}`);
          }
          console.info(`[INFO] Lifecycle coverage: ${(coverage * 100).toFixed(1)}% of declared edges observed`);
        }

        // --assert-lifecycle: fail with exit 3 if shadow edges present or coverage < 50%
        const assertLifecycle = (args as Record<string, unknown>)['assert-lifecycle'] as boolean | undefined;
        if (assertLifecycle && (shadow_edges.length > 0 || coverage < 0.5)) {
          if (!args.quiet) {
            emitResult(
              makeErrorResult(
                'self-conformance',
                `Lifecycle assertion failed — shadow_edges=${shadow_edges.length}, coverage=${(coverage * 100).toFixed(1)}%`,
                EXIT_CODES.execution_error,
                'CONF_LIFECYCLE_ASSERTION_FAILED',
                'Inspect shadow_edges and missing_edges in the output. Ensure wasm4pm.init→run→complete/error paths are exercised.',
              ),
              outputOptions,
            );
          }
          await exitWithFlush(EXIT_CODES.execution_error);
          return;
        }

        const payload: SelfConformancePayload = {
          spans_file: spansFile,
          span_count: spans.length,
          ocel_event_count: ocelLines.length,
          object_type_count: objectTypeCount,
          dfg_per_type: dfgPerType,
          threshold,
          fitness,
          passed,
          lifecycle_diff: lifecycleDiff,
        };

        // In quiet mode: exit 0 if fitness >= 0.5, non-zero otherwise (regardless of --threshold)
        const effectiveThreshold = args.quiet ? quietThreshold : threshold;
        const quietPassed = fitness >= effectiveThreshold;

        if (passed) {
          if (!args.quiet) {
            emitResult(
              makeResult(
                'self-conformance',
                payload,
                durationMs,
                EXIT_CODES.success,
                `Self-conformance passed (fitness=${fitness.toFixed(3)} >= ${threshold}) across ${objectTypeCount} object type(s)`,
              ),
              outputOptions,
            );
          }
          await exitWithFlush(EXIT_CODES.success);
        } else if (args.quiet && quietPassed) {
          // fitness < declared threshold but >= 0.5: quiet mode considers this healthy
          await exitWithFlush(EXIT_CODES.success);
        } else {
          if (!args.quiet) {
            emitResult(
              makeErrorResult(
                'self-conformance',
                `Self-conformance failed — fitness ${fitness.toFixed(3)} < threshold ${threshold}`,
                EXIT_CODES.conformance_fail,
                'CONF_FITNESS_BELOW_THRESHOLD',
                'Run more wpm commands to populate the span log, or lower --threshold.',
              ),
              outputOptions,
            );
          }
          await exitWithFlush(EXIT_CODES.conformance_fail);
        }
      },
    );
  },
});
