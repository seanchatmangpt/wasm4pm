# Quick Start

In 5 minutes you will have a working Node.js script that loads a process event
log and prints the directly-follows graph (DFG) it discovered.

## API Styles

wasm4pm exposes two API styles:

| Style | Naming | Use when... |
|-------|--------|-------------|
| **Direct FFI** | `load_eventlog_from_xes()`, `discover_dfg()` | Browser `<script>` tags, maximum performance |
| **Client wrapper** | `loadEventLogFromXES()`, `discoverDFG()` | Node.js, TypeScript, framework integration |

Both call the same WASM functions. The examples below use direct FFI (no import wrapper needed). For the client wrapper, see [how-to/nodejs-integration.md](./how-to/nodejs-integration.md).

## Install

```bash
npm install wasm4pm
```

## Working example

Create `quickstart.js` and paste this in:

```javascript
const pm = require('wasm4pm');

const XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org">
  <trace>
    <string key="concept:name" value="Case1"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2024-01-01T08:00:00+00:00"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2024-01-01T09:00:00+00:00"/></event>
    <event><string key="concept:name" value="Close"/><date key="time:timestamp" value="2024-01-01T10:00:00+00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case2"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2024-01-01T08:30:00+00:00"/></event>
    <event><string key="concept:name" value="Reject"/><date key="time:timestamp" value="2024-01-01T09:30:00+00:00"/></event>
    <event><string key="concept:name" value="Close"/><date key="time:timestamp" value="2024-01-01T10:30:00+00:00"/></event>
  </trace>
</log>`;

async function main() {
  await pm.init();

  const logHandle = pm.load_eventlog_from_xes(XES);
  const dfg = JSON.parse(pm.discover_dfg(logHandle, 'concept:name'));

  console.log(`Activities (${dfg.nodes.length}):`);
  dfg.nodes.forEach(n => console.log(`  ${n}`));

  console.log(`\nFlows (${dfg.edges.length}):`);
  dfg.edges.forEach(e => console.log(`  ${e.source} -> ${e.target}  (${e.count})`));

  pm.delete_object(logHandle);
}

main();
```

Run it:

```bash
node quickstart.js
```

## Expected output

```
Activities (4):
  Register
  Approve
  Reject
  Close

Flows (4):
  Register -> Approve  (1)
  Register -> Reject  (1)
  Approve -> Close  (1)
  Reject -> Close  (1)
```

You are looking at a real process model: two paths from `Register` to `Close`.

## Streaming (IoT / large logs)

For incremental ingestion, feed events one-by-one without loading the full log:

```javascript
await pm.init();
const handle = pm.streaming_dfg_begin();
pm.streaming_dfg_add_event(handle, 'case-1', 'Register');
pm.streaming_dfg_add_event(handle, 'case-1', 'Approve');
pm.streaming_dfg_close_trace(handle, 'case-1');  // frees case buffer
const result = JSON.parse(pm.streaming_dfg_finalize(handle));
console.log(`${result.nodes} activities, ${result.edges} flows`);
```

Memory stays O(concurrent open traces), not O(total events).

## What's next

| Goal | Document |
|------|----------|
| Real-world workflow (load a file, check conformance, export) | [TUTORIAL.md](./TUTORIAL.md) |
| Recipes for specific tasks | [HOW-TO.md](./HOW-TO.md) |
| Every function and parameter | [API.md](./API.md) |
| How the algorithms work | [EXPLANATION.md](./EXPLANATION.md) |
| Measure performance (Node.js & browser) | [DEPLOYMENT.md](./DEPLOYMENT.md#performance-benchmarks-nodejs) → [BROWSER-BENCHMARKS.md](./BROWSER-BENCHMARKS.md) |
