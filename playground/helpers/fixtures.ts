/**
 * Shared fixtures for playground scenarios.
 *
 * Re-exports from @wasm4pm/testing where possible — no duplication.
 * Adds only playground-specific items not available in the testing package.
 */

// Re-export testing fixtures so scenarios only need one import
export { MINIMAL_CONFIG } from '@wasm4pm/testing';
export type { TestConfig } from '@wasm4pm/testing';

/** XES log where the second half of traces use activity D instead of B (drift scenario) */
export const XES_WITH_DRIFT = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="undefined"/></global>
  <global scope="event"><string key="concept:name" value="undefined"/><date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/></global>
  <trace><string key="concept:name" value="Pre1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:00:00"/></event>
  </trace>
  <trace><string key="concept:name" value="Pre2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-02T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-02T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-02T11:00:00"/></event>
  </trace>
  <trace><string key="concept:name" value="Post1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-06-01T09:00:00"/></event>
    <event><string key="concept:name" value="D"/><date key="time:timestamp" value="2024-06-01T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-06-01T11:00:00"/></event>
  </trace>
  <trace><string key="concept:name" value="Post2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-06-02T09:00:00"/></event>
    <event><string key="concept:name" value="D"/><date key="time:timestamp" value="2024-06-02T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-06-02T11:00:00"/></event>
  </trace>
</log>`;
