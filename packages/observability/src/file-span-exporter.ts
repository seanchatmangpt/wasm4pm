/**
 * FileSpanExporter — appends span records as JSON lines to a local file.
 *
 * Used by self-conformance checks to read spans without a running collector.
 * Output path defaults to .wasm4pm/spans.jsonl relative to cwd, overridable
 * via WASM4PM_SPANS_FILE env var.
 *
 * Write errors are silently ignored — telemetry must never break execution
 * (observability §18.5).
 */

import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

/**
 * Zod schema for the RawSpan shape consumed by self-conformance.ts.
 * Coerces OTLP proto nanosecond strings to numbers and normalises the
 * status.code integer enum to its string equivalent.
 */
export const RawSpanSchema = z.object({
  trace_id: z.string(),
  span_id: z.string(),
  name: z.string(),
  kind: z.string().default('INTERNAL'),
  start_time: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]).default(0),
  end_time: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]).default(0),
  status: z
    .object({
      code: z.union([
        z.number().transform((n) => ({ 0: 'UNSET', 1: 'OK', 2: 'ERROR' }[n] ?? 'UNSET')),
        z.string(),
      ]),
      message: z.string().optional(),
    })
    .default({ code: 'UNSET' }),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});

/** RawSpan shape consumed by self-conformance.ts */
export type RawSpan = z.infer<typeof RawSpanSchema>;

/**
 * Normalise a raw OTLP span object into a typed RawSpan.
 * Uses RawSpanSchema.parse so coercions and defaults are applied by Zod.
 * Throws ZodError if the incoming object is structurally invalid.
 */
function normalizeSpan(raw: Record<string, unknown>): RawSpan {
  return RawSpanSchema.parse(raw);
}

export class FileSpanExporter {
  private readonly spansFile: string;
  private dirEnsured = false;

  constructor(spansFile?: string) {
    this.spansFile = spansFile ?? process.env['WASM4PM_SPANS_FILE'] ?? '.wasm4pm/spans.jsonl';
  }

  private ensureDir(): void {
    if (this.dirEnsured) return;
    try {
      mkdirSync(dirname(this.spansFile), { recursive: true });
      this.dirEnsured = true;
    } catch {
      /* ignore */
    }
  }

  appendSpan(span: object): void {
    try {
      this.ensureDir();
      const normalized = normalizeSpan(span as Record<string, unknown>);
      appendFileSync(this.spansFile, JSON.stringify(normalized) + '\n', 'utf8');
    } catch {
      /* never throws — telemetry must not break execution */
    }
  }
}

export const fileSpanExporter = new FileSpanExporter();

export function appendSpanToFile(span: object): void {
  fileSpanExporter.appendSpan(span);
}
