/**
 * State Management Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

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
