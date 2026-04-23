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
export declare const capturedHarvestSpans: Array<{
    name: string;
    status: {
        code: 0 | 2;
    };
    attributes: Record<string, unknown>;
}>;
export declare class OcelHarvester {
    private objectIndex;
    private eventIndex;
    constructor();
    harvestWithInstrumentation(spans: OtelSpan[]): Promise<OcelEventLog>;
    private convertSpansToOcel;
    private normalizeActivity;
    private inferResultType;
    private formatTimestamp;
}
//# sourceMappingURL=ocel-harvester.d.ts.map