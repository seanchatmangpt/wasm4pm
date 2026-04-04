/**
 * Type Wrapper Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../pkg/wasm4pm.js';

describe('Type Wrapper - WasmEventLog', () => {
  beforeEach(async () => {
    try {
      await wasm.init();
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  afterEach(async () => {
    try {
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  it('should create WasmEventLog from handle', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    expect(handle).toBeTruthy();

    const wasmLog = new wasm.WasmEventLog(handle);
    expect(wasmLog).toBeTruthy();
  });

  it('should retrieve event count from WasmEventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    const wasmLog = new wasm.WasmEventLog(handle);

    const eventCount = wasmLog.event_count();
    expect(typeof eventCount).toBe('number');
    expect(eventCount).toBeGreaterThan(0);
  });

  it('should retrieve case count from WasmEventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    const wasmLog = new wasm.WasmEventLog(handle);

    const caseCount = wasmLog.case_count();
    expect(typeof caseCount).toBe('number');
    expect(caseCount).toBeGreaterThan(0);
  });

  it('should retrieve stats from WasmEventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    const wasmLog = new wasm.WasmEventLog(handle);

    const statsStr = wasmLog.stats();
    expect(typeof statsStr).toBe('string');

    const stats = JSON.parse(statsStr);
    expect(stats.event_count).toBeTruthy();
    expect(stats.case_count).toBeTruthy();
  });

  it('should fail with invalid handle', () => {
    const wasmLog = new wasm.WasmEventLog('obj_999999');

    expect(() => {
      wasmLog.event_count();
    }).toThrow();
  });
});

describe('Type Wrapper - WasmOCEL', () => {
  beforeEach(async () => {
    try {
      await wasm.init();
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  afterEach(async () => {
    try {
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  it('should create WasmOCEL from handle', () => {
    const json = `{"ocel:global-event":{"ocel:attribute":[{"ocel:name":"concept:name","ocel:type":"string"}]},"ocel:global-object":{"ocel:object-type":[{"ocel:name":"Order"}]},"ocel:events":{"ocel:event":[{"ocel:id":"e1","ocel:type":"Create","ocel:timestamp":"2023-01-01T10:00:00","ocel:omap":{"ocel:o":[{"ocel:id":"o1"}]}}]},"ocel:objects":{"ocel:object":[{"ocel:id":"o1","ocel:type":"Order"}]}}`;

    const handle = wasm.load_ocel_from_json(json);
    expect(handle).toBeTruthy();

    const wasmOCEL = new wasm.WasmOCEL(handle);
    expect(wasmOCEL).toBeTruthy();
  });

  it('should retrieve event count from WasmOCEL', () => {
    const json = `{"ocel:global-event":{"ocel:attribute":[{"ocel:name":"concept:name","ocel:type":"string"}]},"ocel:global-object":{"ocel:object-type":[{"ocel:name":"Order"}]},"ocel:events":{"ocel:event":[{"ocel:id":"e1","ocel:type":"Create","ocel:timestamp":"2023-01-01T10:00:00","ocel:omap":{"ocel:o":[{"ocel:id":"o1"}]}}]},"ocel:objects":{"ocel:object":[{"ocel:id":"o1","ocel:type":"Order"}]}}`;

    const handle = wasm.load_ocel_from_json(json);
    const wasmOCEL = new wasm.WasmOCEL(handle);

    const eventCount = wasmOCEL.event_count();
    expect(typeof eventCount).toBe('number');
    expect(eventCount).toBeGreaterThan(0);
  });

  it('should retrieve object count from WasmOCEL', () => {
    const json = `{"ocel:global-event":{"ocel:attribute":[{"ocel:name":"concept:name","ocel:type":"string"}]},"ocel:global-object":{"ocel:object-type":[{"ocel:name":"Order"}]},"ocel:events":{"ocel:event":[{"ocel:id":"e1","ocel:type":"Create","ocel:timestamp":"2023-01-01T10:00:00","ocel:omap":{"ocel:o":[{"ocel:id":"o1"}]}}]},"ocel:objects":{"ocel:object":[{"ocel:id":"o1","ocel:type":"Order"}]}}`;

    const handle = wasm.load_ocel_from_json(json);
    const wasmOCEL = new wasm.WasmOCEL(handle);

    const objectCount = wasmOCEL.object_count();
    expect(typeof objectCount).toBe('number');
    expect(objectCount).toBeGreaterThan(0);
  });

  it('should retrieve stats from WasmOCEL', () => {
    const json = `{"ocel:global-event":{"ocel:attribute":[{"ocel:name":"concept:name","ocel:type":"string"}]},"ocel:global-object":{"ocel:object-type":[{"ocel:name":"Order"}]},"ocel:events":{"ocel:event":[{"ocel:id":"e1","ocel:type":"Create","ocel:timestamp":"2023-01-01T10:00:00","ocel:omap":{"ocel:o":[{"ocel:id":"o1"}]}}]},"ocel:objects":{"ocel:object":[{"ocel:id":"o1","ocel:type":"Order"}]}}`;

    const handle = wasm.load_ocel_from_json(json);
    const wasmOCEL = new wasm.WasmOCEL(handle);

    const statsStr = wasmOCEL.stats();
    expect(typeof statsStr).toBe('string');

    const stats = JSON.parse(statsStr);
    expect(stats.event_count).toBeTruthy();
    expect(stats.object_count).toBeTruthy();
  });

  it('should fail with invalid handle', () => {
    const wasmOCEL = new wasm.WasmOCEL('obj_999999');

    expect(() => {
      wasmOCEL.event_count();
    }).toThrow();
  });
});
