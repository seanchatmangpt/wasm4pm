/**
 * Event log fixtures for testing algorithms and connectors.
 */
export interface TestEvent {
    'concept:name': string;
    'time:timestamp'?: string;
    'org:resource'?: string;
    'lifecycle:transition'?: string;
    [key: string]: unknown;
}
export interface TestTrace {
    'concept:name': string;
    events: TestEvent[];
}
export interface TestEventLog {
    traces: TestTrace[];
}
/** Simple sequential process: A → B → C */
export declare const SIMPLE_SEQUENTIAL: TestEventLog;
/** Parallel split: A → (B | C) → D */
export declare const PARALLEL_SPLIT: TestEventLog;
/** Exclusive choice: A → (B xor C) → D */
export declare const EXCLUSIVE_CHOICE: TestEventLog;
/** Loop: A → B → (C → B)* → D */
export declare const LOOP_PROCESS: TestEventLog;
/** Empty log — edge case */
export declare const EMPTY_LOG: TestEventLog;
/** Single trace, single event */
export declare const SINGLE_EVENT: TestEventLog;
/** Large synthetic log generator */
export declare function generateSyntheticLog(traceCount: number, activitiesPerTrace: number, activities?: string[]): TestEventLog;
/** XES string fixture for parser testing */
export declare const SAMPLE_XES = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<log xes.version=\"1.0\" xes.features=\"nested-attributes\">\n  <extension name=\"Concept\" prefix=\"concept\" uri=\"http://www.xes-standard.org/concept.xesext\"/>\n  <extension name=\"Time\" prefix=\"time\" uri=\"http://www.xes-standard.org/time.xesext\"/>\n  <trace>\n    <string key=\"concept:name\" value=\"case-1\"/>\n    <event>\n      <string key=\"concept:name\" value=\"Register\"/>\n      <date key=\"time:timestamp\" value=\"2026-01-01T09:00:00.000+00:00\"/>\n    </event>\n    <event>\n      <string key=\"concept:name\" value=\"Approve\"/>\n      <date key=\"time:timestamp\" value=\"2026-01-01T10:00:00.000+00:00\"/>\n    </event>\n    <event>\n      <string key=\"concept:name\" value=\"Complete\"/>\n      <date key=\"time:timestamp\" value=\"2026-01-01T11:00:00.000+00:00\"/>\n    </event>\n  </trace>\n  <trace>\n    <string key=\"concept:name\" value=\"case-2\"/>\n    <event>\n      <string key=\"concept:name\" value=\"Register\"/>\n      <date key=\"time:timestamp\" value=\"2026-01-01T12:00:00.000+00:00\"/>\n    </event>\n    <event>\n      <string key=\"concept:name\" value=\"Reject\"/>\n      <date key=\"time:timestamp\" value=\"2026-01-01T13:00:00.000+00:00\"/>\n    </event>\n  </trace>\n</log>";
//# sourceMappingURL=events.d.ts.map