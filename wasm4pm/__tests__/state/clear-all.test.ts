/**
 * State Management Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

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
