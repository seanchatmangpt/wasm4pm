/**
 * OTEL event capture for testing.
 *
 * Provides in-memory collectors that capture OTEL spans, events, and JSON log
 * entries so tests can assert on observability output without a real collector.
 */

export interface CapturedOtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  startTime: number;
  endTime?: number;
  status?: { code: string; message?: string };
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

export interface CapturedJsonEvent {
  timestamp: string;
  component: string;
  eventType: string;
  runId?: string;
  data: Record<string, unknown>;
}

export interface CapturedCliEvent {
  level: string;
  message: string;
  timestamp: Date;
}

export interface OtelCaptureStats {
  spanCount: number;
  eventCount: number;
  jsonEventCount: number;
  cliEventCount: number;
  traceIds: string[];
  components: string[];
}

/**
 * In-memory OTEL event collector for testing.
 */
export class OtelCapture {
  private _spans: CapturedOtelSpan[] = [];
  private _jsonEvents: CapturedJsonEvent[] = [];
  private _cliEvents: CapturedCliEvent[] = [];

  captureSpan(span: CapturedOtelSpan): void {
    this._spans.push({ ...span, events: [...(span.events ?? [])] });
  }

  captureJson(event: CapturedJsonEvent): void {
    this._jsonEvents.push({ ...event });
  }

  captureCli(event: CapturedCliEvent): void {
    this._cliEvents.push({ ...event });
  }

  /** Convenience: capture a raw OTEL-like event object */
  captureRaw(event: Record<string, unknown>): void {
    if ('trace_id' in event || 'traceId' in event) {
      this.captureSpan({
        traceId: (event.trace_id ?? event.traceId) as string,
        spanId: (event.span_id ?? event.spanId) as string,
        parentSpanId: (event.parent_span_id ?? event.parentSpanId) as string | undefined,
        name: (event.name as string) ?? 'unknown',
        kind: event.kind as string | undefined,
        startTime: (event.start_time ?? event.startTime ?? Date.now()) as number,
        endTime: (event.end_time ?? event.endTime) as number | undefined,
        status: event.status as { code: string; message?: string } | undefined,
        attributes: (event.attributes ?? {}) as Record<string, unknown>,
        events: ((event.events ?? []) as Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>),
      });
    } else if ('component' in event) {
      this.captureJson({
        timestamp: (event.timestamp as string) ?? new Date().toISOString(),
        component: event.component as string,
        eventType: (event.event_type ?? event.eventType) as string,
        runId: (event.run_id ?? event.runId) as string | undefined,
        data: (event.data ?? {}) as Record<string, unknown>,
      });
    } else {
      this.captureCli({
        level: (event.level as string) ?? 'info',
        message: (event.message as string) ?? '',
        timestamp: new Date(),
      });
    }
  }

  get spans(): readonly CapturedOtelSpan[] { return this._spans; }
  get jsonEvents(): readonly CapturedJsonEvent[] { return this._jsonEvents; }
  get cliEvents(): readonly CapturedCliEvent[] { return this._cliEvents; }

  stats(): OtelCaptureStats {
    const traceIds = [...new Set(this._spans.map(s => s.traceId))];
    const components = [...new Set(this._jsonEvents.map(e => e.component))];
    return {
      spanCount: this._spans.length,
      eventCount: this._spans.reduce((sum, s) => sum + s.events.length, 0),
      jsonEventCount: this._jsonEvents.length,
      cliEventCount: this._cliEvents.length,
      traceIds,
      components,
    };
  }

  /** Find spans by name pattern */
  findSpans(namePattern: string | RegExp): CapturedOtelSpan[] {
    const pattern = typeof namePattern === 'string' ? new RegExp(namePattern, 'i') : namePattern;
    return this._spans.filter(s => pattern.test(s.name));
  }

  /** Find spans that have a specific attribute */
  findSpansByAttribute(key: string, value?: unknown): CapturedOtelSpan[] {
    return this._spans.filter(s => {
      if (!(key in s.attributes)) return false;
      return value === undefined || s.attributes[key] === value;
    });
  }

  /** Find JSON events by component */
  findJsonEvents(component: string): CapturedJsonEvent[] {
    return this._jsonEvents.filter(e => e.component === component);
  }

  /** Assert that required OTEL attributes are present on all spans */
  assertRequiredAttributes(requiredKeys: string[]): string[] {
    const errors: string[] = [];
    for (const span of this._spans) {
      for (const key of requiredKeys) {
        if (!(key in span.attributes) || span.attributes[key] === undefined) {
          errors.push(`Span '${span.name}' (${span.spanId}) missing required attribute '${key}'`);
        }
      }
    }
    return errors;
  }

  /** Assert that OTEL is non-blocking: no span exceeds the given duration */
  assertNonBlocking(maxDurationMs: number): string[] {
    const errors: string[] = [];
    for (const span of this._spans) {
      if (span.endTime && span.startTime) {
        const durationMs = (span.endTime - span.startTime) / 1_000_000;
        if (durationMs > maxDurationMs) {
          errors.push(`Span '${span.name}' took ${durationMs.toFixed(1)}ms, exceeds ${maxDurationMs}ms limit`);
        }
      }
    }
    return errors;
  }

  /** Assert span parent-child relationships form valid trees */
  assertValidTraces(): string[] {
    const errors: string[] = [];
    const spanIds = new Set(this._spans.map(s => s.spanId));
    for (const span of this._spans) {
      if (span.parentSpanId && !spanIds.has(span.parentSpanId)) {
        errors.push(`Span '${span.name}' references unknown parent ${span.parentSpanId}`);
      }
    }
    return errors;
  }

  clear(): void {
    this._spans.length = 0;
    this._jsonEvents.length = 0;
    this._cliEvents.length = 0;
  }
}

export function createOtelCapture(): OtelCapture {
  return new OtelCapture();
}
