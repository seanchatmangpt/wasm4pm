//! `withSpan` — universal command-level span wrapper.
//!
//! Wraps the body of a command's `async run()` in a span named
//! `wasm4pm.command.<name>` and records duration, status, and caller-supplied
//! attributes. Span emission is best-effort; sink errors are swallowed.

import { randomBytes } from 'node:crypto';
import type { OtelSpan } from '@wasm4pm/cognition';
import { getGlobalSpanSink } from '../otel/sink.js';

export type SpanAttrs = Record<string, string | number | boolean>;

/**
 * Wrap a command body in a span. Optional `getLateAttrs` is called inside the
 * `finally` block, allowing the body to expose attributes computed at runtime
 * (outcome state, hashes, counters). Late attrs are merged on top of the
 * static `attrs` so callers can override pre-set values.
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttrs,
  fn: () => Promise<T>,
  getLateAttrs?: () => SpanAttrs,
): Promise<T> {
  const sink = getGlobalSpanSink();
  const startNs = Date.now() * 1_000_000;
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;
  try {
    return await fn();
  } catch (e) {
    status = 'ERROR';
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    try {
      const lateAttrs = getLateAttrs ? getLateAttrs() : {};
      const span: OtelSpan = {
        trace_id: randomBytes(16).toString('hex'),
        span_id: randomBytes(8).toString('hex'),
        name: `wasm4pm.command.${name}`,
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: errMsg !== undefined ? { code: status, message: errMsg } : { code: status },
        attributes: { 'service.name': 'wasm4pm', command: name, ...attrs, ...lateAttrs },
      };
      sink(span);
    } catch {
      /* never block on OTEL */
    }
  }
}

/**
 * Emit a span with an arbitrary full name (no `wasm4pm.command.` prefix).
 * Used for child spans like `wasm4pm.drift-watch.window` or `wasm4pm.watch.cycle`.
 */
export async function withSpanRaw<T>(
  fullName: string,
  attrs: SpanAttrs,
  fn: () => Promise<T>,
  getLateAttrs?: () => SpanAttrs,
): Promise<T> {
  const sink = getGlobalSpanSink();
  const startNs = Date.now() * 1_000_000;
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;
  try {
    return await fn();
  } catch (e) {
    status = 'ERROR';
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    try {
      const lateAttrs = getLateAttrs ? getLateAttrs() : {};
      const span: OtelSpan = {
        trace_id: randomBytes(16).toString('hex'),
        span_id: randomBytes(8).toString('hex'),
        name: fullName,
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: errMsg !== undefined ? { code: status, message: errMsg } : { code: status },
        attributes: { 'service.name': 'wasm4pm', ...attrs, ...lateAttrs },
      };
      sink(span);
    } catch {
      /* never block on OTEL */
    }
  }
}
