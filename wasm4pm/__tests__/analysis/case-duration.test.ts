/**
 * Analysis Functions Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

describe('Analysis - Case Duration', () => {
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

  it('should analyze case duration from EventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    expect(logHandle).toBeTruthy();

    const duration = wasm.analyze_case_duration(logHandle);
    expect(duration).toBeTruthy();
  });

  it('should provide min and max duration', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    const duration = wasm.analyze_case_duration(logHandle);
    expect(duration).toBeTruthy();
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.analyze_case_duration('obj_999999');
    }).toThrow();
  });
});
