/**
 * State Management Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../pkg/wasm4pm.js';

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
    const json = `{"ocel:global-event":{"ocel:attribute":[{"ocel:name":"concept:name","ocel:type":"string"}]},"ocel:global-object":{"ocel:object-type":[{"ocel:name":"Order"}]},"ocel:events":{"ocel:event":[{"ocel:id":"e1","ocel:type":"Create","ocel:timestamp":"2023-01-01T10:00:00","ocel:omap":{"ocel:o":[{"ocel:id":"o1"}]}}]},"ocel:objects":{"ocel:object":[{"ocel:id":"o1","ocel:type":"Order"}]}}`;

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

describe('State Management - Object Deletion', () => {
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

  it('should delete an object by handle', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    const initialCount = wasm.object_count();

    const deleted = wasm.delete_object(handle);
    expect(deleted).toBe(true);

    const finalCount = wasm.object_count();
    expect(finalCount).toBe(initialCount - 1);
  });

  it('should return false when deleting non-existent object', () => {
    const deleted = wasm.delete_object('obj_999999');
    expect(deleted).toBe(false);
  });

  it('should fail to use deleted object handle', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    const handle = wasm.load_eventlog_from_xes(xes);
    wasm.delete_object(handle);

    expect(() => {
      wasm.export_eventlog_to_xes(handle);
    }).toThrow();
  });
});

describe('State Management - Clear All Objects', () => {
  beforeEach(async () => {
    try {
      await wasm.init();
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  it('should clear all objects from state', () => {
    const xes = `<?xml version="1.0"?><log xes.version="1.0"><extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/><global scope="trace"><string key="concept:name" value="undefined"/></global><global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global><trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace></log>`;

    wasm.load_eventlog_from_xes(xes);
    const countBefore = wasm.object_count();
    expect(countBefore).toBeGreaterThan(0);

    wasm.clear_all_objects();

    const countAfter = wasm.object_count();
    expect(countAfter).toBe(0);
  });

  it('should work when clearing empty state', () => {
    expect(() => {
      wasm.clear_all_objects();
    }).not.toThrow();

    const count = wasm.object_count();
    expect(count).toBe(0);
  });
});
