# HOW-TO Guides — wasm4pm

Task-oriented guides for common process mining goals. Each guide assumes you have already installed `wasm4pm` and know the basics. See [QUICKSTART.md](QUICKSTART.md) if you are starting from scratch.

---

### How to load an event log from an XES file

Goal: get a log handle from an `.xes` file on disk.

```javascript
const fs = require('fs');
const pm = require('wasm4pm');
await pm.init();

const xesContent = fs.readFileSync('eventlog.xes', 'utf8');
const logHandle = pm.load_eventlog_from_xes(xesContent);
```

`logHandle` is an opaque string. Pass it to any discovery or analysis function.

---

### How to load an event log from JSON

Goal: load an OCEL (object-centric event log) stored as JSON.

```javascript
const fs = require('fs');
const pm = require('wasm4pm');
await pm.init();

const jsonContent = fs.readFileSync('ocel.json', 'utf8');
const ocelHandle = pm.load_ocel_from_json(jsonContent);
```

For OCEL XML use `pm.load_ocel_from_xml(xmlContent)` instead.

---

### How to discover a Directly-Follows Graph (DFG)

Goal: produce a DFG from a loaded event log.

```javascript
const dfgHandle = pm.discover_dfg(logHandle);
const dfg = JSON.parse(pm.object_to_json(dfgHandle));
// dfg.nodes  — activity names
// dfg.edges  — { from, to, count } pairs
```

---

### How to discover a Petri net with Alpha++

Goal: produce a structured process model with noise filtering.

```javascript
// threshold 0.0 = no filtering; 0.1 = drop activities appearing < 10 % of cases
const netHandle = pm.discover_alpha_plus_plus(logHandle, 0.1);
const net = JSON.parse(pm.object_to_json(netHandle));
```

Raise the threshold to suppress infrequent paths. Lower it to include everything.

---

### How to compare two algorithms on the same log

Goal: run two algorithms and inspect both results side by side.

```javascript
const dfgHandle  = pm.discover_dfg(logHandle);
const alphaHandle = pm.discover_alpha_plus_plus(logHandle, 0.0);

const dfgJson   = JSON.parse(pm.object_to_json(dfgHandle));
const alphaJson = JSON.parse(pm.object_to_json(alphaHandle));

console.log('DFG nodes :', dfgJson.nodes.length);
console.log('Alpha nodes:', alphaJson.places?.length ?? alphaJson.nodes?.length);
```

Both handles remain live until you call `pm.delete_object()` on them.

---

### How to check conformance

Goal: measure how well a log fits a discovered model.

```javascript
const netHandle    = pm.discover_alpha_plus_plus(logHandle, 0.0);
const conformance  = JSON.parse(pm.object_to_json(pm.check_conformance(logHandle, netHandle)));

console.log('Fitness   :', conformance.fitness);
console.log('Precision :', conformance.precision);
console.log('Simplicity:', conformance.simplicity);
```

Values are 0–1; higher is better for all three metrics.

---

### How to filter noisy activities before discovery

Goal: remove low-frequency activities so the discovered model is cleaner.

```javascript
// Keep only activities that appear in at least 10 % of cases
const filtered = pm.filterByActivityFrequency(logHandle, 0.1);

// Or drop specific activity names entirely
const filtered2 = pm.filterByActivity(logHandle, ['Error', 'Undo']);

const dfgHandle = pm.discover_dfg(filtered);
```

If you prefer built-in threshold filtering, pass a non-zero threshold to `discover_alpha_plus_plus`.

---

### How to process events incrementally (streaming)

Goal: ingest events one-by-one without holding the full log in memory.

```javascript
await pm.init();
const handle = pm.streaming_dfg_begin();

// Add events as they arrive
pm.streaming_dfg_add_event(handle, 'case-1', 'Register');
pm.streaming_dfg_add_event(handle, 'case-1', 'Approve');
pm.streaming_dfg_close_trace(handle, 'case-1');   // frees per-trace buffer

// Add a batch at once
pm.streaming_dfg_add_batch(handle, JSON.stringify([
  { case_id: 'case-2', activity: 'Register' },
  { case_id: 'case-2', activity: 'Reject' },
]));
pm.streaming_dfg_close_trace(handle, 'case-2');

// Finalize: flush remaining traces, produce a DFG handle, free the builder
const result = JSON.parse(pm.streaming_dfg_finalize(handle));
// result.dfg_handle is now a normal DFG handle
```

Memory stays at O(open traces), not O(total events).

---

### How to get a live DFG snapshot mid-stream

Goal: read the current DFG without stopping the streaming session.

```javascript
// Session is still open and accepting events
const dfg = JSON.parse(pm.streaming_dfg_snapshot(handle));
console.log(`${dfg.nodes.length} activities seen so far`);
// Continue adding events — the snapshot does not consume the handle
```

---

### How to free WASM memory

Goal: release objects that are no longer needed.

```javascript
// Free one object
pm.delete_object(logHandle);

// Free everything at once (all handles become invalid)
pm.clear_all_objects();

// Check how many objects are currently live
console.log('Live objects:', pm.object_count());
```

Always free large logs and models when done to prevent WASM heap growth.

---

### How to get the activity list from a log

Goal: enumerate unique activity names present in a log.

```javascript
const statsHandle = pm.analyze_event_statistics(logHandle);
const stats = JSON.parse(pm.object_to_json(statsHandle));

// stats.events is an object keyed by activity name
const activities = Object.keys(stats.events);
console.log('Activities:', activities);
// e.g. ["Register", "Approve", "Payment", ...]
```

---

### How to generate a Mermaid diagram

Goal: produce a Mermaid flowchart from a DFG for embedding in Markdown or a web page.

```javascript
const dfgHandle  = pm.discover_dfg(logHandle);
const mermaid    = pm.dfg_to_mermaid(dfgHandle);
// mermaid is a string starting with "flowchart LR\n..."
console.log(mermaid);
```

Paste the output into any Mermaid renderer, GitHub Markdown, or `<pre class="mermaid">` block.

---

### How to use wasm4pm in a browser

Goal: run process mining client-side without a server.

```html
<!-- Include the bundler build from node_modules -->
<script src="node_modules/wasm4pm/pkg/wasm4pm.js"></script>
<script type="module">
  await wasm4pm.init();

  const response = await fetch('eventlog.xes');
  const xesContent = await response.text();

  const logHandle = wasm4pm.load_eventlog_from_xes(xesContent);
  const dfg = JSON.parse(wasm4pm.object_to_json(wasm4pm.discover_dfg(logHandle)));
  console.log(`${dfg.nodes.length} activities`);
</script>
```

The `.wasm` file must be served over HTTP (not `file://`).

---

### How to use wasm4pm in Node.js

Goal: use wasm4pm in a CommonJS or ESM Node.js script.

```javascript
// CommonJS
const pm = require('wasm4pm');
await pm.init();

// ESM
import * as pm from 'wasm4pm';
await pm.init();

const fs = require('fs');
const logHandle = pm.load_eventlog_from_xes(fs.readFileSync('log.xes', 'utf8'));
const dfg = JSON.parse(pm.object_to_json(pm.discover_dfg(logHandle)));
```

Node.js 16+ is required; 18+ is recommended.

---

### How to handle errors

Goal: catch and inspect errors from WASM calls.

```javascript
try {
  const logHandle = pm.load_eventlog_from_xes(maybeInvalidXes);
  const netHandle = pm.discover_alpha_plus_plus(logHandle, 0.1);
} catch (err) {
  // err.message describes the failure, e.g.:
  //   "Object not found"          — stale or invalid handle
  //   "Failed to parse input data" — malformed XES/JSON
  //   "Memory allocation failed"   — WASM heap exhausted
  console.error('Process mining failed:', err.message);
}
```

Always wrap loading and discovery calls when processing user-supplied data.

---

### How to export results to JSON

Goal: serialize any result object to a plain JSON string for storage or API responses.

```javascript
// Any handle — log, DFG, Petri net, stats, etc.
const jsonString = pm.object_to_json(anyHandle);
const data = JSON.parse(jsonString);

// Persist to disk (Node.js)
const fs = require('fs');
fs.writeFileSync('result.json', JSON.stringify(data, null, 2));

// Return from an Express endpoint
res.json(data);
```

To round-trip an EventLog back to XES use `pm.export_eventlog_to_xes(logHandle)`.

---

### How to list all available discovery algorithms

Goal: query the runtime for which algorithms are compiled in.

```javascript
const algorithms = JSON.parse(pm.available_discovery_algorithms());
console.log(algorithms);
// ["alpha++", "dfg", "oc-dfg", "declare", ...]
```

Similarly, `pm.available_analysis_functions()` lists all analysis functions.

---

### How to analyze case durations

Goal: find the min, max, and average time cases take to complete.

```javascript
const durHandle = pm.analyze_case_duration(logHandle);
const durations = JSON.parse(pm.object_to_json(durHandle));

console.log('Min  :', durations.min);
console.log('Max  :', durations.max);
console.log('Avg  :', durations.average);
console.log('Median:', durations.median);
```

---

### How to read streaming session stats

Goal: inspect memory usage and progress of an active streaming session.

```javascript
const stats = JSON.parse(pm.streaming_dfg_stats(handle));
// {
//   event_count:       1500,  // total events seen
//   trace_count:        120,  // closed traces
//   open_traces:          3,  // traces still buffered
//   activities:          18,  // unique activities
//   edge_pairs:          42,  // unique directly-follows pairs
//   open_trace_events:    9   // events in open-trace buffers (dominant memory cost)
// }
```

Call `pm.streaming_dfg_flush_open(handle)` to close all open traces and drive `open_trace_events` to 0.
