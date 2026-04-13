/**
 * Agent 1: OCEL Harvester
 *
 * Converts OpenTelemetry spans to Object-Centric Event Log (OCEL) format.
 * Ground truth: Wil van der Aalst — event log is the source of truth.
 *
 * Core transformation: OTEL spans → OCEL events + objects → process conformance truth
 */

import type { OtelSpan } from '../types';

export interface OcelObject {
  id: string;
  type: 'tool_invocation' | 'discovery_result' | 'conformance_result' | 'analysis_result' | 'receipt_chain' | 'federation_vote';
  state: 'created' | 'in_progress' | 'completed' | 'failed';
  attributes: Record<string, unknown>;
}

export interface OcelEvent {
  id: string;
  activity: string;
  timestamp: string;
  objects: string[];
  attributes: Record<string, unknown>;
}

export interface OcelEventLog {
  version: '2.0';
  events: OcelEvent[];
  objects: OcelObject[];
  metadata: {
    source: string;
    harvestedAt: string;
    spanCount: number;
  };
}

export const capturedHarvestSpans: Array<{ name: string; status: { code: 0 | 2 }; attributes: Record<string, unknown> }> = [];

export class OcelHarvester {
  private objectIndex: Map<string, OcelObject> = new Map();
  private eventIndex: Map<string, OcelEvent> = new Map();

  constructor() {}

  async harvestWithInstrumentation(spans: OtelSpan[]): Promise<OcelEventLog> {
    const harvestSpan: { name: string; status: { code: 0 | 2 }; attributes: Record<string, unknown> } = {
      name: 'agent_1.harvest',
      status: { code: 0 },
      attributes: {
        'agent_id': 'agent_1',
        'harvest.input_span_count': spans.length,
      },
    };

    try {
      for (const span of spans) {
        if (!span.name) throw new Error('span missing required field: name');
        if (!span.spanId) throw new Error('span missing required field: spanId');
        if (!span.startTimeUnixNano) throw new Error('span missing required field: startTimeUnixNano');
      }

      const ocel = await this.convertSpansToOcel(spans);

      harvestSpan.attributes['harvest.event_count'] = ocel.events.length;
      harvestSpan.attributes['harvest.object_count'] = ocel.objects.length;
      harvestSpan.attributes['harvest.status'] = 'ok';

      capturedHarvestSpans.push(harvestSpan);
      return ocel;
    } catch (error) {
      harvestSpan.status.code = 2;
      harvestSpan.attributes['harvest.error'] = error instanceof Error ? error.message : String(error);
      harvestSpan.attributes['harvest.status'] = 'error';
      capturedHarvestSpans.push(harvestSpan);
      throw error;
    }
  }

  private async convertSpansToOcel(spans: OtelSpan[]): Promise<OcelEventLog> {
    this.objectIndex.clear();
    this.eventIndex.clear();

    // Phase 1: Create objects for each span (tool_invocation)
    const traceInvocations = new Map<string, OcelObject>();
    for (const span of spans) {
      const traceKey = span.traceId;
      if (!traceInvocations.has(traceKey)) {
        const obj: OcelObject = {
          id: `invocation-${traceKey}`,
          type: 'tool_invocation',
          state: 'in_progress',
          attributes: { 'invocation:trace_id': traceKey },
        };
        traceInvocations.set(traceKey, obj);
        this.objectIndex.set(obj.id, obj);
      }
    }

    // Phase 2: Create result objects based on span attributes
    for (const span of spans) {
      if (span.attributes?.['pm.result_id']) {
        const resultId = String(span.attributes['pm.result_id']);
        const resultType = this.inferResultType(span.name);
        const obj: OcelObject = {
          id: `result-${resultId}`,
          type: resultType,
          state: 'completed',
          attributes: { 'result:span_id': span.spanId },
        };
        this.objectIndex.set(obj.id, obj);
      }
    }

    // Phase 3: Create events from spans
    const sortedSpans = spans.sort(
      (a, b) => (a.startTimeUnixNano ?? 0) - (b.startTimeUnixNano ?? 0)
    );

    for (const span of sortedSpans) {
      const activity = this.normalizeActivity(span.name);
      const timestamp = this.formatTimestamp(span.startTimeUnixNano ?? 0);

      // Collect objects for this event
      const objects: string[] = [];
      const traceKey = span.traceId;
      const invocationObj = traceInvocations.get(traceKey);
      if (invocationObj) {
        objects.push(invocationObj.id);
      }

      // Add result object if present
      if (span.attributes?.['pm.result_id']) {
        objects.push(`result-${span.attributes['pm.result_id']}`);
      }

      // Build event attributes
      const attributes: Record<string, unknown> = {
        'ocel:object_type': objects.length > 0 ? objects[0].split('-')[0] : 'unknown',
      };

      // Add causality info
      if (span.parentSpanId) {
        attributes['ocel:causality'] = span.parentSpanId;
      }

      // Copy span attributes, prefixed
      if (span.attributes) {
        for (const [key, value] of Object.entries(span.attributes)) {
          attributes[`pm:${key}`] = value;
        }
      }

      const event: OcelEvent = {
        id: span.spanId,
        activity,
        timestamp,
        objects,
        attributes,
      };

      this.eventIndex.set(event.id, event);
    }

    // Phase 4: Update object states based on final events
    for (const invocation of traceInvocations.values()) {
      const lastEvent = sortedSpans[sortedSpans.length - 1];
      if (lastEvent) {
        if (lastEvent.status?.code === 0) {
          invocation.state = 'completed';
        } else {
          invocation.state = 'failed';
        }
      }
    }

    return {
      version: '2.0',
      events: Array.from(this.eventIndex.values()),
      objects: Array.from(this.objectIndex.values()),
      metadata: {
        source: 'pictl-otel-harvester',
        harvestedAt: new Date().toISOString(),
        spanCount: spans.length,
      },
    };
  }

  private normalizeActivity(spanName: string): string {
    return spanName
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(':');
  }

  private inferResultType(
    spanName: string
  ): 'discovery_result' | 'conformance_result' | 'analysis_result' | 'receipt_chain' {
    if (spanName.includes('discovery')) return 'discovery_result';
    if (spanName.includes('conformance')) return 'conformance_result';
    if (spanName.includes('analysis')) return 'analysis_result';
    return 'receipt_chain';
  }

  private formatTimestamp(nanoTime: number): string {
    const millis = Math.floor(nanoTime / 1_000_000);
    return new Date(millis).toISOString();
  }
}
