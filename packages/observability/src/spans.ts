/**
 * Span definitions for every lifecycle phase.
 * Provides the Tracer/Span interfaces and factory functions
 * for bootstrap, planning, running, and watching spans.
 */

import { RequiredFields } from './fields.js';
import { SpanContext } from './context.js';

// ---- Core span types ----

export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
export type SpanStatusCode = 'UNSET' | 'OK' | 'ERROR';

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface SpanEvent {
  name: string;
  timestampNs: number;
  attributes?: Record<string, unknown>;
}

/**
 * A single trace span. Call `end()` when the operation completes.
 */
export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTimeNs: number;
  endTimeNs?: number;
  status?: SpanStatus;
  attributes: Record<string, unknown>;
  events?: SpanEvent[];

  /** Mark span as ended (sets endTimeNs to now). */
  end(): void;
  /** Record an in-span event. */
  addEvent(name: string, attrs?: Record<string, unknown>): void;
  /** Set span status. */
  setStatus(code: SpanStatusCode, message?: string): void;
  /** Set a single attribute. */
  setAttribute(key: string, value: unknown): void;
}

/**
 * Tracer interface — implemented by OtelTracer (real) and NoopTracer.
 */
export interface Tracer {
  startSpan(
    name: string,
    options?: {
      kind?: SpanKind;
      parent?: SpanContext;
      attributes?: Record<string, unknown>;
    }
  ): Span;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

// ---- Live span implementation ----

export class LiveSpan implements Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTimeNs: number;
  endTimeNs?: number;
  status?: SpanStatus;
  attributes: Record<string, unknown>;
  events: SpanEvent[] = [];

  private readonly onEnd: (span: LiveSpan) => void;

  constructor(
    ctx: SpanContext,
    name: string,
    kind: SpanKind,
    requiredFields: RequiredFields,
    customAttrs: Record<string, unknown>,
    onEnd: (span: LiveSpan) => void
  ) {
    this.traceId = ctx.traceId;
    this.spanId = ctx.spanId;
    this.parentSpanId = ctx.parentSpanId;
    this.name = name;
    this.kind = kind;
    this.startTimeNs = Date.now() * 1_000_000;
    this.attributes = { ...requiredFields, ...customAttrs };
    this.onEnd = onEnd;
  }

  end(): void {
    if (this.endTimeNs !== undefined) return; // idempotent
    this.endTimeNs = Date.now() * 1_000_000;
    if (!this.status) this.status = { code: 'OK' };
    this.onEnd(this);
  }

  addEvent(name: string, attrs?: Record<string, unknown>): void {
    this.events.push({
      name,
      timestampNs: Date.now() * 1_000_000,
      attributes: attrs,
    });
  }

  setStatus(code: SpanStatusCode, message?: string): void {
    this.status = { code, message };
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }
}

// ---- Convenience span factories for each lifecycle phase ----

/** Create span name following `phase.operation` convention. */
function spanName(phase: string, operation: string): string {
  return `${phase}.${operation}`;
}

// Bootstrap phase spans
export const BootstrapSpans = {
  configLoad: () => spanName('bootstrap', 'config_load'),
  configValidation: () => spanName('bootstrap', 'config_validation'),
} as const;

// Planning phase spans
export const PlanningSpans = {
  configResolution: () => spanName('planning', 'config_resolution'),
  planGeneration: () => spanName('planning', 'plan_generation'),
} as const;

// Running phase spans
export const RunningSpans = {
  runStart: () => spanName('running', 'run_start'),
  sourceRead: () => spanName('running', 'source_read'),
  algorithmExec: (alg: string) => spanName('running', `algorithm.${alg}`),
  sinkWrite: () => spanName('running', 'sink_write'),
  runEnd: () => spanName('running', 'run_end'),
} as const;

// Watching phase spans
export const WatchingSpans = {
  heartbeat: () => spanName('watching', 'heartbeat'),
  reconnect: () => spanName('watching', 'reconnect'),
  checkpointSave: () => spanName('watching', 'checkpoint_save'),
  checkpointLoad: () => spanName('watching', 'checkpoint_load'),
} as const;
