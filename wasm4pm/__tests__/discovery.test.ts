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

    const petriNet = wasm.discover_alpha_plus_plus(logHandle, 0);
    expect(petriNet).toBeTruthy();
    expect(typeof petriNet).toBe('string');

    const petriNetObj = JSON.parse(petriNet);
    expect(petriNetObj).toBeTruthy();
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

    const petriNet0 = wasm.discover_alpha_plus_plus(logHandle, 0);
    const petriNet1 = wasm.discover_alpha_plus_plus(logHandle, 1);

    expect(petriNet0).toBeTruthy();
    expect(petriNet1).toBeTruthy();

    expect(() => JSON.parse(petriNet0)).not.toThrow();
    expect(() => JSON.parse(petriNet1)).not.toThrow();
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

    const dfg = wasm.discover_dfg_fn(logHandle);
    expect(dfg).toBeTruthy();
    expect(typeof dfg).toBe('string');

    const dfgObj = JSON.parse(dfg);
    expect(dfgObj).toBeTruthy();
  });

  it('should fail when EventLog handle is invalid', () => {
    expect(() => {
      wasm.discover_dfg_fn('obj_999999');
    }).toThrow();
  });
});

describe('Discovery - Available Algorithms List', () => {
  it('should list available discovery algorithms', () => {
    const algorithms = wasm.available_discovery_algorithms();
    expect(algorithms).toBeTruthy();
    expect(typeof algorithms).toBe('string');

    const algorithmsObj = JSON.parse(algorithms);
    expect(algorithmsObj.algorithms).toBeTruthy();
    expect(Array.isArray(algorithmsObj.algorithms)).toBe(true);
    expect(algorithmsObj.algorithms.length).toBeGreaterThan(0);
  });

  it('should include expected algorithms in the list', () => {
    const algorithms = wasm.available_discovery_algorithms();
    const algorithmsObj = JSON.parse(algorithms);

    const algorithmNames = algorithmsObj.algorithms.map((alg: any) => alg.name);
    expect(algorithmNames).toContain('alpha_plus_plus');
    expect(algorithmNames).toContain('dfg');
  });
});
