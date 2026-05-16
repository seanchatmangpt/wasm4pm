//! Span helper utilities used by every wrapper.
//!
//! Pure data construction. Failure to emit a span must never block a wrapper's
//! primary control flow — sinks should swallow their own errors.

import type { OtelSpan, SpanSink } from './observability-types.js';

export function hexId(length: number): string {
  const len = Math.max(0, length | 0);
  const bytes = new Uint8Array(len);
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_, i) => { bytes[i] = (Math.random() * 256) | 0; }); // @lint-allow-fakery — crypto fallback for W3C span ID
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, len);
}

export const defaultSpanSink: SpanSink = (_span: OtelSpan): void => {
  /* no-op: tests inject a recording sink */
};
