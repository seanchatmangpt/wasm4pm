/**
 * Canonical proof-lane fixtures — TEST-FOUNDATION-RESET-1.
 * The ONE source of MINIMAL_XES. Do not duplicate this literal elsewhere.
 */
export const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xes.features="nested-attributes">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T00:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T01:00:00Z"/></event>
  </trace>
</log>`;

export const MINIMAL_OCEL = {
  ocel: { events: {}, objects: {} },
  'ocel:events': {
    e1: { 'ocel:activity': 'A', 'ocel:timestamp': '2024-01-01T00:00:00Z', 'ocel:omap': ['o1'], 'ocel:vmap': {} },
    e2: { 'ocel:activity': 'B', 'ocel:timestamp': '2024-01-01T01:00:00Z', 'ocel:omap': ['o1'], 'ocel:vmap': {} },
  },
  'ocel:objects': {
    o1: { 'ocel:type': 'order', 'ocel:ovmap': {} },
  },
} as const;
