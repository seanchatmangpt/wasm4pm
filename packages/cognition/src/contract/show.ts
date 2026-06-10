//! ZERO decision logic — returns the breed catalogue from WASM.

import { WasmLoader } from '../init.js';
import { CognitionError } from '../errors.js';
import type { SpanSink } from '../observability-types.js';
import { defaultSpanSink, hexId } from '../span-utils.js';
import { ShowReportSchema } from '../schemas.js';
import { ZOD_VALIDATION_ENABLED } from '../validation-config.js';
import type { ShowReport } from '../types.js';

export interface ShowOptions {
  spanSink?: SpanSink;
}

function formatZodIssues(issues: Array<{path: (string|number)[], code: string, message: string, expected?: unknown, received?: unknown}>): string {
  return issues.map(i => {
    const pathStr = i.path.reduce((acc: string, p: string | number, idx: number) => {
      if (typeof p === 'number') return acc + `[${p}]`;
      return idx === 0 ? String(p) : acc + `.${p}`;
    }, '');
    if ((i.code === 'invalid_type' || i.code === 'invalid_union') && /received undefined/i.test(i.message)) {
      const typeMatch = i.message.match(/expected (\w+)/i);
      const expected = typeMatch ? typeMatch[1] : 'the correct type';
      const article = /^[aeiou]/i.test(expected) ? 'an' : 'a';
      return `${pathStr} must be ${article} ${expected}`;
    }
    return `${pathStr}: ${i.message}`;
  }).join('; ');
}

function assertShowReport(raw: unknown): ShowReport {
  if (!ZOD_VALIDATION_ENABLED) return raw as ShowReport;
  const result = ShowReportSchema.safeParse(raw);
  if (!result.success) {
    throw new CognitionError(
      `cognition_show: WASM output rejected by field-contract guard: ${formatZodIssues(result.error.issues as Parameters<typeof formatZodIssues>[0])}`,
      'OUTPUT_PARSE_FAILED',
    );
  }
  return result.data;
}

export async function showCognition(
  options: ShowOptions = {},
): Promise<ShowReport> {
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get();

  const startNs = Date.now() * 1_000_000;
  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;

  try {
    const raw = wasm.cognition_show();
    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      throw new CognitionError(
        'Failed to parse cognition_show output',
        'OUTPUT_PARSE_FAILED',
        { cause: e },
      );
    }
    return assertShowReport(parsed);
  } catch (err) {
    status = 'ERROR';
    errMsg = err instanceof Error ? err.message : String(err);
    if (err instanceof CognitionError) throw err;
    throw new CognitionError(errMsg, 'BREED_FAILED', { cause: err });
  } finally {
    try {
      const sink = options.spanSink ?? defaultSpanSink;
      const endMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      sink({
        trace_id: hexId(32),
        span_id: hexId(16),
        name: 'cognition.show',
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: { code: status, message: errMsg },
        attributes: {
          'service.name': 'wasm4pm',
          'cognition.operation': 'show',
          'cognition.duration_ms': endMs - startMs,
        },
      });
    } catch {}
  }
}
