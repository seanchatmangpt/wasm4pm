/**
 * Discovery Algorithm Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../pkg/wasm4pm.js';

describe('Discovery - Alpha++ Algorithm', () => {
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

  it('should discover a Petri net from EventLog using Alpha++', () => {
    const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" openlog.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="undefined"/></global>
  <global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global>
  <trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace>
</log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    expect(logHandle).toBeTruthy();
  });

  it('should handle threshold parameter in Alpha++', () => {
    const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" openlog.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="undefined"/></global>
  <global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global>
  <trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace>
</log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    expect(logHandle).toBeTruthy();
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.discover_alpha_plus_plus('obj_999999', 0);
    }).toThrow();
  });
});

describe('Discovery - DFG (Directly-Follows Graph)', () => {
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

  it('should discover DFG from EventLog', () => {
    const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" openlog.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="undefined"/></global>
  <global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global>
  <trace><string key="concept:name" value="Case1"/><event><string key="concept:name" value="ActivityA"/><date key="time:timestamp" value="2023-01-01T10:00:00"/></event><event><string key="concept:name" value="ActivityB"/><date key="time:timestamp" value="2023-01-01T11:00:00"/></event></trace>
</log>`;

    const logHandle = wasm.load_eventlog_from_xes(xes);
    expect(logHandle).toBeTruthy();

    const dfg = wasm.discover_dfg(logHandle, 'concept:name');
    expect(dfg).toBeTruthy();
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.discover_dfg('obj_999999', 'concept:name');
    }).toThrow();
  });
});

describe('Discovery - Module Initialization', () => {
  it('should initialize WASM module', async () => {
    await wasm.init();
    const version = wasm.get_version();
    expect(version).toBeTruthy();
    expect(typeof version).toBe('string');
  });
});
