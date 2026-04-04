/**
 * I/O Operations Tests
 * Tests for loading and exporting EventLogs and OCELs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

describe('I/O Operations - EventLog XES', () => {
  beforeEach(async () => {
    try {
      await wasm.init();
      await wasm.clear_all_objects();
    } catch (e) {
      // Ignore initialization errors
    }
  });

  afterEach(async () => {
    try {
      await wasm.clear_all_objects();
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should load a valid XES file from string content', () => {
    const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" openlog.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="undefined"/></global>
  <global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global>
  <trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace>
</log>`;

    expect(() => {
      const handle = wasm.load_eventlog_from_xes(xes);
      expect(handle).toBeTruthy();
      expect(typeof handle).toBe('string');
    }).not.toThrow();
  });

  it('should export EventLog to XES format', () => {
    const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" openlog.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="undefined"/></global>
  <global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global>
  <trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event></trace>
</log>`;

    const loadHandle = wasm.load_eventlog_from_xes(xes);
    const xesContent = wasm.export_eventlog_to_xes(loadHandle);

    expect(xesContent).toBeTruthy();
    expect(typeof xesContent).toBe('string');
    expect(xesContent).toContain('<?xml');
    expect(xesContent).toContain('<log');
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.export_eventlog_to_xes('obj_999999');
    }).toThrow();
  });
});
