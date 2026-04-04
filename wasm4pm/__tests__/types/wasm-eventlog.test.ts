/**
 * Type Wrapper Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

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

    expect(() => {
      wasmLog.event_count();
    }).not.toThrow();
  });

  it('should retrieve case count from WasmEventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    const wasmLog = new wasm.WasmEventLog(handle);

    expect(() => {
      wasmLog.case_count();
    }).not.toThrow();
  });

  it('should retrieve stats from WasmEventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    const wasmLog = new wasm.WasmEventLog(handle);

    expect(() => {
      wasmLog.stats();
    }).not.toThrow();
  });

  it('should fail with invalid handle', () => {
    const wasmLog = new wasm.WasmEventLog('obj_999999');

    expect(() => {
      wasmLog.event_count();
    }).toThrow();
  });
});
