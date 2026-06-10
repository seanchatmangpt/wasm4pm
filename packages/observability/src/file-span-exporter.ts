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

/** RawSpan shape consumed by self-conformance.ts */
export interface RawSpan {
  trace_id: string;
  span_id: string;
  name: string;
  kind: string;
  start_time: number;
  end_time: number;
  status: { code: string; message?: string };
  attributes: Record<string, string | number | boolean>;
}

const STATUS_CODE_MAP: Record<number, string> = { 0: 'UNSET', 1: 'OK', 2: 'ERROR' };

function normalizeSpan(raw: Record<string, unknown>): RawSpan {
  // start_time / end_time may arrive as nanosecond strings (OTLP proto encoding)
  // or already as numbers. Normalise to numbers.
  const toNumber = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseInt(v, 10);
    return 0;
  };

  // status.code may be a number (proto enum) or already a string.
  const rawStatus = (raw['status'] ?? {}) as Record<string, unknown>;
  const codeRaw = rawStatus['code'];
  const codeStr =
    typeof codeRaw === 'number'
      ? (STATUS_CODE_MAP[codeRaw] ?? 'UNSET')
      : typeof codeRaw === 'string'
        ? codeRaw
        : 'UNSET';

  return {
    trace_id: String(raw['trace_id'] ?? ''),
    span_id: String(raw['span_id'] ?? ''),
    name: String(raw['name'] ?? ''),
    kind: String(raw['kind'] ?? 'INTERNAL'),
    start_time: toNumber(raw['start_time']),
    end_time: toNumber(raw['end_time']),
    status: { code: codeStr, message: rawStatus['message'] as string | undefined },
    attributes: (raw['attributes'] ?? {}) as Record<string, string | number | boolean>,
  };
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
