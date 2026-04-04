/**
 * Integration tests for process_mining_wasm
 * Tests the complete workflow of the WASM module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as pm from '../pkg/wasm4pm.js';

// Sample XES content for testing
const SAMPLE_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="Case1"/>
    <event>
      <string key="concept:name" value="Activity A"/>
      <date key="time:timestamp" value="2023-01-01T10:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity B"/>
      <date key="time:timestamp" value="2023-01-01T10:05:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity C"/>
      <date key="time:timestamp" value="2023-01-01T10:10:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="Case2"/>
    <event>
      <string key="concept:name" value="Activity A"/>
      <date key="time:timestamp" value="2023-01-01T11:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Activity B"/>
      <date key="time:timestamp" value="2023-01-01T11:05:00.000+00:00"/>
    </event>
  </trace>
</log>`;

// OCEL sample for testing
const SAMPLE_OCEL = `{
  "event_types": ["CreateOrder", "ProcessOrder"],
  "object_types": ["Order"],
  "events": [
    {
      "id": "e1",
      "event_type": "CreateOrder",
      "timestamp": "2023-01-01T10:00:00",
      "attributes": {},
      "object_ids": ["o1"]
    },
    {
      "id": "e2",
      "event_type": "ProcessOrder",
      "timestamp": "2023-01-01T10:05:00",
      "attributes": {},
      "object_ids": ["o1"]
    }
  ],
  "objects": [
    {
      "id": "o1",
      "object_type": "Order",
      "attributes": {}
    }
  ]
}`;

describe('Process Mining WASM - Integration Tests', () => {
  beforeEach(async () => {
    try {
      await pm.init();
      await pm.clear_all_objects();
    } catch (e) {}
  });

  afterEach(async () => {
    try {
      await pm.clear_all_objects();
    } catch (e) {}
  });

  it('should initialize module and get version', () => {
    const version = pm.get_version();
    expect(version).toBeTruthy();
    expect(typeof version).toBe('string');
  });

  it('should load XES event log and return handle', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    expect(logHandle).toBeTruthy();
    expect(typeof logHandle).toBe('string');
  });

  it('should track object count in state', () => {
    const initialCount = pm.object_count();
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const newCount = pm.object_count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  it('should analyze event statistics', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const stats = pm.analyze_event_statistics(logHandle);
    expect(stats).toBeTruthy();
  });

  it('should analyze case duration', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const durations = pm.analyze_case_duration(logHandle);
    expect(durations).toBeTruthy();
  });

  it('should discover DFG from EventLog', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const dfg = pm.discover_dfg(logHandle, 'concept:name');
    expect(dfg).toBeTruthy();
  });

  it('should export EventLog to XES format', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const exportedXes = pm.export_eventlog_to_xes(logHandle);
    expect(exportedXes).toBeTruthy();
    expect(exportedXes).toContain('<?xml');
    expect(exportedXes).toContain('</log>');
  });

  it('should load OCEL from JSON', () => {
    const ocelHandle = pm.load_ocel_from_json(SAMPLE_OCEL);
    expect(ocelHandle).toBeTruthy();
    expect(typeof ocelHandle).toBe('string');
  });

  it('should delete objects by handle', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const countBefore = pm.object_count();
    const deleted = pm.delete_object(logHandle);
    expect(deleted).toBe(true);
    const countAfter = pm.object_count();
    expect(countAfter).toBeLessThan(countBefore);
  });

  it('should clear all objects from state', () => {
    pm.load_eventlog_from_xes(SAMPLE_XES);
    const countBefore = pm.object_count();
    expect(countBefore).toBeGreaterThan(0);

    pm.clear_all_objects();
    const countAfter = pm.object_count();
    expect(countAfter).toBe(0);
  });

  it('should list available discovery algorithms', () => {
    const algos = pm.available_discovery_algorithms();
    expect(algos).toBeTruthy();
  });

  it('should list available analysis functions', () => {
    const funcs = pm.available_analysis_functions();
    expect(funcs).toBeTruthy();
  });
});

describe('Streaming Conformance', () => {
  beforeEach(async () => {
    await pm.init();
    pm.clear_all_objects();
  });

  afterEach(() => {
    pm.clear_all_objects();
  });

  it('should detect conforming traces', () => {
    // Build a reference DFG from a log where A→B→C is the only path
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const dfgJson = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
    const dfgHandle = pm.store_dfg_from_json(dfgJson);

    const sessionHandle = pm.streaming_conformance_begin(dfgHandle);
    expect(sessionHandle).toBeTruthy();

    // Add a conforming trace (A→B→C matches the DFG)
    pm.streaming_conformance_add_event(sessionHandle, 'case-x', 'Activity A');
    pm.streaming_conformance_add_event(sessionHandle, 'case-x', 'Activity B');
    pm.streaming_conformance_add_event(sessionHandle, 'case-x', 'Activity C');

    const result = JSON.parse(pm.streaming_conformance_close_trace(sessionHandle, 'case-x'));
    expect(result.ok).toBe(true);
    expect(result.is_conforming).toBe(true);
    expect(result.fitness).toBe(1.0);
    expect(result.deviations).toHaveLength(0);

    pm.streaming_conformance_finalize(sessionHandle);
  });

  it('should detect non-conforming traces', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const dfgHandle = pm.store_dfg_from_json(JSON.stringify(pm.discover_dfg(logHandle, 'concept:name')));

    const sessionHandle = pm.streaming_conformance_begin(dfgHandle);

    // Add a non-conforming trace (C→A is not in the DFG)
    pm.streaming_conformance_add_event(sessionHandle, 'bad-case', 'Activity C');
    pm.streaming_conformance_add_event(sessionHandle, 'bad-case', 'Activity A');

    const result = JSON.parse(pm.streaming_conformance_close_trace(sessionHandle, 'bad-case'));
    expect(result.ok).toBe(true);
    expect(result.is_conforming).toBe(false);
    expect(result.deviations.length).toBeGreaterThan(0);

    pm.streaming_conformance_finalize(sessionHandle);
  });

  it('should report stats for open session', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const dfgHandle = pm.store_dfg_from_json(JSON.stringify(pm.discover_dfg(logHandle, 'concept:name')));
    const sessionHandle = pm.streaming_conformance_begin(dfgHandle);

    pm.streaming_conformance_add_event(sessionHandle, 'c1', 'Activity A');
    pm.streaming_conformance_add_event(sessionHandle, 'c1', 'Activity B');
    pm.streaming_conformance_close_trace(sessionHandle, 'c1');

    const stats = JSON.parse(pm.streaming_conformance_stats(sessionHandle));
    expect(stats.event_count).toBe(2);
    expect(stats.closed_traces).toBe(1);
    expect(stats.open_traces).toBe(0);

    pm.streaming_conformance_finalize(sessionHandle);
  });

  it('should finalize and return summary', () => {
    const logHandle = pm.load_eventlog_from_xes(SAMPLE_XES);
    const dfgHandle = pm.store_dfg_from_json(JSON.stringify(pm.discover_dfg(logHandle, 'concept:name')));
    const sessionHandle = pm.streaming_conformance_begin(dfgHandle);

    pm.streaming_conformance_add_event(sessionHandle, 'c1', 'Activity A');
    pm.streaming_conformance_add_event(sessionHandle, 'c1', 'Activity B');
    pm.streaming_conformance_close_trace(sessionHandle, 'c1');

    const summary = JSON.parse(pm.streaming_conformance_finalize(sessionHandle));
    expect(summary.total_traces).toBe(1);
    expect(typeof summary.avg_fitness).toBe('number');
    expect(Array.isArray(summary.results)).toBe(true);
  });
});
