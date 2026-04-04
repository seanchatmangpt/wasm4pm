/**
 * Analysis Functions Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../pkg/process_mining_wasm.js';

describe('Analysis - Event Statistics', () => {
  beforeEach(async () => {
    try { await wasm.init(); await wasm.clear_all_objects(); } catch (e) {}
  });

  afterEach(async () => {
    try { await wasm.clear_all_objects(); } catch (e) {}
  });

  it('should analyze event statistics from EventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    expect(logHandle).toBeTruthy();

    const stats = wasm.analyze_event_statistics(logHandle);
    expect(stats).toBeTruthy();
    expect(typeof stats).toBe('string');

    const statsObj = JSON.parse(stats);
    expect(statsObj).toBeTruthy();
    expect(statsObj.total_events).toBeGreaterThan(0);
    expect(statsObj.total_cases).toBeGreaterThan(0);
  });

  it('should include activity frequencies in event statistics', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    const stats = wasm.analyze_event_statistics(logHandle);

    const statsObj = JSON.parse(stats);
    expect(statsObj.activity_frequencies).toBeTruthy();
    expect(typeof statsObj.activity_frequencies).toBe('object');
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.analyze_event_statistics('obj_999999');
    }).toThrow();
  });
});

describe('Analysis - Case Duration', () => {
  beforeEach(async () => {
    try { await wasm.init(); await wasm.clear_all_objects(); } catch (e) {}
  });

  afterEach(async () => {
    try { await wasm.clear_all_objects(); } catch (e) {}
  });

  it('should analyze case duration from EventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    expect(logHandle).toBeTruthy();

    const duration = wasm.analyze_case_duration(logHandle);
    expect(duration).toBeTruthy();
    expect(typeof duration).toBe('string');

    const durationObj = JSON.parse(duration);
    expect(durationObj).toBeTruthy();
    expect(durationObj.case_count).toBeGreaterThan(0);
  });

  it('should provide min and max duration', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    const duration = wasm.analyze_case_duration(logHandle);

    const durationObj = JSON.parse(duration);
    expect(durationObj.min_duration_seconds).toBeTruthy();
    expect(durationObj.max_duration_seconds).toBeTruthy();
    expect(durationObj.min_duration_seconds).toBeLessThanOrEqual(durationObj.max_duration_seconds);
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.analyze_case_duration('obj_999999');
    }).toThrow();
  });
});

describe('Analysis - Available Functions List', () => {
  it('should list available analysis functions', () => {
    const functions = wasm.available_analysis_functions();
    expect(functions).toBeTruthy();
    expect(typeof functions).toBe('string');

    const functionsObj = JSON.parse(functions);
    expect(functionsObj.functions).toBeTruthy();
    expect(Array.isArray(functionsObj.functions)).toBe(true);
    expect(functionsObj.functions.length).toBeGreaterThan(0);
  });

  it('should include expected analysis functions', () => {
    const functions = wasm.available_analysis_functions();
    const functionsObj = JSON.parse(functions);

    const functionNames = functionsObj.functions.map((fn: any) => fn.name);
    expect(functionNames).toContain('event_statistics');
    expect(functionNames).toContain('case_duration');
  });
});
