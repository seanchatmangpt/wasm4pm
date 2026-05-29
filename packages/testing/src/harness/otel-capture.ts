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
        events: (event.events ?? []) as Array<{
          name: string;
          timestamp: number;
          attributes?: Record<string, unknown>;
        }>,
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

  get spans(): readonly CapturedOtelSpan[] {
    return this._spans;
  }
  get jsonEvents(): readonly CapturedJsonEvent[] {
    return this._jsonEvents;
  }
  get cliEvents(): readonly CapturedCliEvent[] {
    return this._cliEvents;
  }

  stats(): OtelCaptureStats {
    const traceIds = [...new Set(this._spans.map((s) => s.traceId))];
    const components = [...new Set(this._jsonEvents.map((e) => e.component))];
    return {
      spanCount: this._spans.length,
      eventCount: this._spans.reduce((sum, s) => sum + s.events.length, 0),
      jsonEventCount: this._jsonEvents.length,
      cliEventCount: this._cliEvents.length,
      traceIds,
      components,
    };
  }

  /**
   * Get all captured spans, optionally filtered by exact span name.
   *
   * This is the primary access method for test assertions. When `name` is omitted,
   * returns all captured spans. When `name` is provided, returns only spans whose
   * name exactly matches (case-sensitive).
   *
   * @param name - Optional exact span name to filter by
   * @returns Array of matching captured spans (empty if none)
   */
  getAllSpans(name?: string): CapturedOtelSpan[] {
    if (name === undefined) return [...this._spans];
    return this._spans.filter((s) => s.name === name);
  }

  /** Find spans by name pattern */
  findSpans(namePattern: string | RegExp): CapturedOtelSpan[] {
    const pattern = typeof namePattern === 'string' ? new RegExp(namePattern, 'i') : namePattern;
    return this._spans.filter((s) => pattern.test(s.name));
  }

  /** Find spans that have a specific attribute */
  findSpansByAttribute(key: string, value?: unknown): CapturedOtelSpan[] {
    return this._spans.filter((s) => {
      if (!(key in s.attributes)) return false;
      return value === undefined || s.attributes[key] === value;
    });
  }

  /** Find JSON events by component */
  findJsonEvents(component: string): CapturedJsonEvent[] {
    return this._jsonEvents.filter((e) => e.component === component);
  }

  /** Assert that required OTEL attributes are present on all spans.
   *
   * Each violation string includes what span, which attribute, and what to do next.
   * The practitioner receives actionable output, not just an ID and a field name.
   *
   * Example violation:
   *   "Span 'algorithm.dfg' (a3f8b2c1): missing 'plan.hash'
   *    → set requiredAttrs['plan.hash'] before calling createAlgorithmStartedEvent()"
   */
  assertRequiredAttributes(requiredKeys: string[]): string[] {
    const errors: string[] = [];
    // Build a map of attribute key → which factory method sets it, for actionable hints.
    const attrHints: Record<string, string> = {
      'run.id': "set requiredAttrs['run.id'] from the engine run UUID before emitting spans",
      'config.hash': "set requiredAttrs['config.hash'] from resolveConfig().metadata.hash",
      'input.hash': "set requiredAttrs['input.hash'] from the BLAKE3 hash of the input file",
      'plan.hash': "set requiredAttrs['plan.hash'] from plan().planHash",
      'execution.profile': "set requiredAttrs['execution.profile'] from config.execution.profile",
      'source.kind': "set requiredAttrs['source.kind'] from config.source.kind",
      'sink.kind': "set requiredAttrs['sink.kind'] from config.sink.kind",
    };
    for (const span of this._spans) {
      for (const key of requiredKeys) {
        if (!(key in span.attributes) || span.attributes[key] === undefined) {
          const hint = attrHints[key] ?? `add '${key}' to the span attributes object`;
          errors.push(
            `Span '${span.name}' (${span.spanId.slice(0, 8)}): missing '${key}'\n` +
              `  → ${hint}`
          );
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
          errors.push(
            `Span '${span.name}' took ${durationMs.toFixed(1)}ms, exceeds ${maxDurationMs}ms limit`
          );
        }
      }
    }
    return errors;
  }

  /** Assert span parent-child relationships form valid trees */
  assertValidTraces(): string[] {
    const errors: string[] = [];
    const spanIds = new Set(this._spans.map((s) => s.spanId));
    for (const span of this._spans) {
      if (span.parentSpanId && !spanIds.has(span.parentSpanId)) {
        errors.push(`Span '${span.name}' references unknown parent ${span.parentSpanId}`);
      }
    }
    return errors;
  }

  /**
   * Assert that all completed spans have valid chronological timestamps:
   * - endTime must be >= startTime (no negative durations from clock skew)
   * - a child span's startTime must not precede its parent's startTime
   *
   * Returns a list of violation strings (empty = no violations).
   */
  assertChronological(): string[] {
    const errors: string[] = [];
    const spanById = new Map(this._spans.map((s) => [s.spanId, s]));

    for (const span of this._spans) {
      // Check endTime >= startTime for completed spans
      if (span.endTime !== undefined && span.endTime < span.startTime) {
        const durationMs = ((span.endTime - span.startTime) / 1_000_000).toFixed(3);
        errors.push(
          `Span '${span.name}' (${span.spanId}) has negative duration: endTime < startTime (${durationMs}ms)`
        );
      }

      // Check child span does not start before its parent
      if (span.parentSpanId) {
        const parent = spanById.get(span.parentSpanId);
        if (parent && span.startTime < parent.startTime) {
          errors.push(
            `Span '${span.name}' (${span.spanId}) starts before parent '${parent.name}' (${span.parentSpanId})`
          );
        }
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
