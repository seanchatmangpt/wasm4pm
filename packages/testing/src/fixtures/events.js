/**
 * Event log fixtures for testing algorithms and connectors.
 */
/** Simple sequential process: A → B → C */
export const SIMPLE_SEQUENTIAL = {
    traces: [
        { 'concept:name': 'case-1', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T00:00:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T00:01:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T00:02:00Z' },
            ] },
        { 'concept:name': 'case-2', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T01:00:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T01:01:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T01:02:00Z' },
            ] },
    ],
};
/** Parallel split: A → (B | C) → D */
export const PARALLEL_SPLIT = {
    traces: [
        { 'concept:name': 'case-1', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T00:00:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T00:01:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T00:01:00Z' },
                { 'concept:name': 'D', 'time:timestamp': '2026-01-01T00:02:00Z' },
            ] },
        { 'concept:name': 'case-2', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T01:00:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T01:01:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T01:01:30Z' },
                { 'concept:name': 'D', 'time:timestamp': '2026-01-01T01:02:00Z' },
            ] },
    ],
};
/** Exclusive choice: A → (B xor C) → D */
export const EXCLUSIVE_CHOICE = {
    traces: [
        { 'concept:name': 'case-1', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T00:00:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T00:01:00Z' },
                { 'concept:name': 'D', 'time:timestamp': '2026-01-01T00:02:00Z' },
            ] },
        { 'concept:name': 'case-2', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T01:00:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T01:01:00Z' },
                { 'concept:name': 'D', 'time:timestamp': '2026-01-01T01:02:00Z' },
            ] },
    ],
};
/** Loop: A → B → (C → B)* → D */
export const LOOP_PROCESS = {
    traces: [
        { 'concept:name': 'case-1', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T00:00:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T00:01:00Z' },
                { 'concept:name': 'D', 'time:timestamp': '2026-01-01T00:02:00Z' },
            ] },
        { 'concept:name': 'case-2', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T01:00:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T01:01:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T01:02:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T01:03:00Z' },
                { 'concept:name': 'D', 'time:timestamp': '2026-01-01T01:04:00Z' },
            ] },
        { 'concept:name': 'case-3', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T02:00:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T02:01:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T02:02:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T02:03:00Z' },
                { 'concept:name': 'C', 'time:timestamp': '2026-01-01T02:04:00Z' },
                { 'concept:name': 'B', 'time:timestamp': '2026-01-01T02:05:00Z' },
                { 'concept:name': 'D', 'time:timestamp': '2026-01-01T02:06:00Z' },
            ] },
    ],
};
/** Empty log — edge case */
export const EMPTY_LOG = { traces: [] };
/** Single trace, single event */
export const SINGLE_EVENT = {
    traces: [
        { 'concept:name': 'case-1', events: [
                { 'concept:name': 'A', 'time:timestamp': '2026-01-01T00:00:00Z' },
            ] },
    ],
};
/** Large synthetic log generator */
export function generateSyntheticLog(traceCount, activitiesPerTrace, activities = ['A', 'B', 'C', 'D', 'E', 'F']) {
    const traces = [];
    for (let t = 0; t < traceCount; t++) {
        const events = [];
        for (let e = 0; e < activitiesPerTrace; e++) {
            const ts = new Date(2026, 0, 1, 0, t * activitiesPerTrace + e).toISOString();
            events.push({
                'concept:name': activities[e % activities.length],
                'time:timestamp': ts,
                'org:resource': `resource-${(e % 3) + 1}`,
            });
        }
        traces.push({ 'concept:name': `case-${t + 1}`, events });
    }
    return { traces };
}
/** XES string fixture for parser testing */
export const SAMPLE_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xes.features="nested-attributes">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <date key="time:timestamp" value="2026-01-01T11:00:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-01T12:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2026-01-01T13:00:00.000+00:00"/>
    </event>
  </trace>
</log>`;
//# sourceMappingURL=events.js.map