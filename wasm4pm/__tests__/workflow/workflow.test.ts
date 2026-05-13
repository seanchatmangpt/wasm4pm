/**
 * Workflow Integration Tests — full-workflow and streaming-conformance merged
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as pm from '../../pkg/wasm4pm.js';
import { XES_WORKFLOW, OCEL_MINIMAL } from '../helpers/fixtures';

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

  it('should initialize, load XES, track state, analyze, discover DFG, export, and list algorithms', () => {
    const version = pm.get_version();
    expect(version).toBeTruthy();
    expect(typeof version).toBe('string');

    const logHandle = pm.load_eventlog_from_xes(XES_WORKFLOW);
    expect(logHandle).toBeTruthy();
    expect(typeof logHandle).toBe('string');

    const initialCount = pm.object_count();
    expect(pm.object_count()).toBeGreaterThan(0);

    expect(pm.analyze_event_statistics(logHandle)).toBeTruthy();
    expect(pm.analyze_case_duration(logHandle)).toBeTruthy();

    const dfg = pm.discover_dfg(logHandle, 'concept:name');
    expect(dfg).toBeTruthy();

    const exportedXes = pm.export_eventlog_to_xes(logHandle);
    expect(exportedXes).toBeTruthy();
    expect(exportedXes).toContain('<?xml');
    expect(exportedXes).toContain('</log>');

    const ocelHandle = pm.load_ocel_from_json(SAMPLE_OCEL);
    expect(ocelHandle).toBeTruthy();
    expect(typeof ocelHandle).toBe('string');

    const countBefore = pm.object_count();
    const deleted = pm.delete_object(logHandle);
    expect(deleted).toBe(true);
    expect(pm.object_count()).toBeLessThan(countBefore);

    pm.clear_all_objects();
    expect(pm.object_count()).toBe(0);

    expect(pm.available_discovery_algorithms()).toBeTruthy();
    expect(pm.available_analysis_functions()).toBeTruthy();
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

  it('should detect conforming and non-conforming traces, report stats, and finalize with summary', () => {
    const logHandle = pm.load_eventlog_from_xes(XES_WORKFLOW);
    const dfgJson = pm.discover_dfg(logHandle, 'concept:name') as string;
    const dfgHandle = pm.store_dfg_from_json(dfgJson);

    // Conforming trace
    const session1 = pm.streaming_conformance_begin(dfgHandle);
    expect(session1).toBeTruthy();
    pm.streaming_conformance_add_event(session1, 'case-x', 'Activity A');
    pm.streaming_conformance_add_event(session1, 'case-x', 'Activity B');
    pm.streaming_conformance_add_event(session1, 'case-x', 'Activity C');
    const r1 = JSON.parse(pm.streaming_conformance_close_trace(session1, 'case-x'));
    expect(r1.ok).toBe(true);
    expect(r1.is_conforming).toBe(true);
    expect(r1.fitness).toBe(1.0);
    expect(r1.deviations).toHaveLength(0);
    pm.streaming_conformance_finalize(session1);

    // Non-conforming trace
    const session2 = pm.streaming_conformance_begin(dfgHandle);
    pm.streaming_conformance_add_event(session2, 'bad-case', 'Activity C');
    pm.streaming_conformance_add_event(session2, 'bad-case', 'Activity A');
    const r2 = JSON.parse(pm.streaming_conformance_close_trace(session2, 'bad-case'));
    expect(r2.ok).toBe(true);
    expect(r2.is_conforming).toBe(false);
    expect(r2.deviations.length).toBeGreaterThan(0);
    pm.streaming_conformance_finalize(session2);

    // Stats and summary
    const session3 = pm.streaming_conformance_begin(dfgHandle);
    pm.streaming_conformance_add_event(session3, 'c1', 'Activity A');
    pm.streaming_conformance_add_event(session3, 'c1', 'Activity B');
    pm.streaming_conformance_close_trace(session3, 'c1');
    const stats = JSON.parse(pm.streaming_conformance_stats(session3));
    expect(stats.event_count).toBe(2);
    expect(stats.closed_traces).toBe(1);
    expect(stats.open_traces).toBe(0);
    const summary = JSON.parse(pm.streaming_conformance_finalize(session3));
    expect(summary.total_traces).toBe(1);
    expect(typeof summary.avg_fitness).toBe('number');
    expect(Array.isArray(summary.results)).toBe(true);
  });
});
