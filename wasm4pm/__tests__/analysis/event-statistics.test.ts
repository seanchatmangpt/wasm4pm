/**
 * Analysis Functions Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

describe('Analysis - Event Statistics', () => {
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

  it('should analyze event statistics from EventLog', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    expect(logHandle).toBeTruthy();

    const stats = wasm.analyze_event_statistics(logHandle);
    expect(stats).toBeTruthy();
  });

  it('should include activity frequencies in event statistics', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    const stats = wasm.analyze_event_statistics(logHandle);
    expect(stats).toBeTruthy();
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.analyze_event_statistics('obj_999999');
    }).toThrow();
  });
});
