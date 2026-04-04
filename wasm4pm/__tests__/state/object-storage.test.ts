/**
 * State Management Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

describe('State Management - Object Storage', () => {
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

  it('should store EventLog and return a handle', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);

    expect(handle).toBeTruthy();
    expect(typeof handle).toBe('string');
    expect(handle).toMatch(/^obj_\d+$/);
  });

  it('should store OCEL and return a handle', () => {
    const json = `{"event_types":["Create"],"object_types":["Order"],"events":[{"id":"e1","event_type":"Create","timestamp":"2023-01-01T10:00:00","attributes":{},"object_ids":["o1"]}],"objects":[{"id":"o1","object_type":"Order","attributes":{}}]}`;

    const handle = wasm.load_ocel_from_json(json);

    expect(handle).toBeTruthy();
    expect(typeof handle).toBe('string');
    expect(handle).toMatch(/^obj_\d+$/);
  });

  it('should generate unique handles for different objects', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle1 = wasm.load_eventlog_from_xes(xes);
    const handle2 = wasm.load_eventlog_from_xes(xes);

    expect(handle1).not.toBe(handle2);
  });

  it('should track object count correctly', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const initialCount = wasm.object_count();
    expect(typeof initialCount).toBe('number');

    const handle1 = wasm.load_eventlog_from_xes(xes);
    const count1 = wasm.object_count();
    expect(count1).toBe(initialCount + 1);
  });
});
