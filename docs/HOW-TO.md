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
const dfgHandle = pm.discover_dfg(logHandle, 'concept:name');
const dfg = dfgHandle;
// dfg.nodes  — activity names
// dfg.edges  — { from, to, count } pairs
```

---

### How to discover a Petri net with Alpha++

Goal: produce a structured process model with noise filtering.

```javascript
// threshold 0.0 = no filtering; 0.1 = drop activities appearing < 10 % of cases
const netHandle = pm.discover_alpha_plus_plus(logHandle, 0.1);
const net = netHandle;
```

Raise the threshold to suppress infrequent paths. Lower it to include everything.

---

### How to compare two algorithms on the same log

Goal: run two algorithms and inspect both results side by side.

```javascript
const dfgHandle  = pm.discover_dfg(logHandle, 'concept:name');
const alphaHandle = pm.discover_alpha_plus_plus(logHandle, 0.0);

const dfgJson   = dfgHandle;
const alphaJson = alphaHandle;

console.log('DFG nodes :', dfgJson.nodes.length);
console.log('Alpha nodes:', alphaJson.places?.length ?? alphaJson.nodes?.length);
```

Both handles remain live until you call `pm.delete_object()` on them.

---

### How to check conformance

Goal: measure how well a log fits a discovered model.

```javascript
const netHandle    = pm.discover_alpha_plus_plus(logHandle, 0.0);
const conformance  = pm.check_token_based_replay(logHandle, netHandle, 'concept:name');

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
const dfg = pm.discover_dfg(logHandle, 'concept:name');
console.log(`${dfg.nodes.length} activities, ${dfg.edges.length} flows`);
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

Goal: serialize discovered models and analysis results to JSON format.

```javascript
// Export DFG to JSON
const dfgJson = pm.export_dfg_to_json(dfgHandle);

// Export Petri net to JSON
const netJson = pm.export_petri_net_to_json(netHandle);

// Export event log to JSON
const logJson = pm.export_eventlog_to_json(logHandle);

// Persist to disk (Node.js)
const fs = require('fs');
fs.writeFileSync('dfg.json', dfgJson);
fs.writeFileSync('model.json', netJson);

// Return from an Express endpoint
res.json(JSON.parse(dfgJson));
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
const durations = pm.analyze_case_duration(logHandle);

console.log('Min  :', durations.min);
console.log('Max  :', durations.max);
console.log('Mean :', durations.mean);
console.log('Median:', durations.median);
console.log('Std Dev:', durations.stddev);
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

---

### How to discover advanced algorithms (Genetic, ILP, Ant Colony)

Goal: use high-quality optimization algorithms for best-effort discovery.

```javascript
// Genetic Algorithm (40-200ms, high quality)
const netGA = pm.discover_genetic_algorithm(logHandle, 50, 100);
// 50 generations, population 100

// ILP Optimization (20-100ms, provably optimal with timeout)
const netILP = pm.discover_ilp_petri_net(logHandle, 30000);
// 30 second timeout

// Ant Colony Optimization (exploration-exploitation balance)
const netACO = pm.discover_ant_colony(logHandle, 100, 0.9);
// 100 iterations, 0.9 evaporation rate
```

---

### How to detect anomalies and concept drift

Goal: identify unusual behavior and process changes over time.

```javascript
// Score how anomalous each trace is (0=normal, 1=highly anomalous)
const scores = pm.score_log_anomalies(logHandle);
scores.forEach((item, idx) => {
  console.log(`Trace ${idx}: anomaly score ${item.score}`);
});

// Detect where process behavior changes (concept drift)
const drift = pm.detect_concept_drift(logHandle, 50);
// 50-trace sliding window
console.log(`Drift detected at positions: ${drift.change_points}`);

// Find temporal bottlenecks (slow transitions)
const bottlenecks = pm.analyze_temporal_bottlenecks(logHandle);
console.log(`Slowest activity: ${bottlenecks[0].activity}`);
```

---

### How to analyze resource efficiency

Goal: understand who does what and find bottlenecks in resource allocation.

```javascript
// Who does what?
const matrix = pm.analyze_resource_activity_matrix(logHandle, 'org:resource');
// Returns 2D matrix: resources x activities

// How busy are resources?
const utilization = pm.analyze_resource_utilization(logHandle, 'org:resource');
console.log(utilization);
// { "Alice": 0.85, "Bob": 0.92, "Charlie": 0.42 }

// Who are the bottlenecks?
const bottlenecks = pm.identify_resource_bottlenecks(logHandle, 'org:resource');
console.log(`Resource bottleneck: ${bottlenecks[0].resource}`);

// How do resources collaborate?
const network = pm.discover_working_together_network(logHandle, 'org:resource');
// Shows which resources work on same cases
```

---

### How to mine activity patterns

Goal: discover frequent activity sequences and co-occurrence patterns.

```javascript
// Find frequently occurring activity sequences
const patterns = pm.mine_sequential_patterns(logHandle, 0.1);
// minSupport=0.1 means "appears in ≥10% of traces"

console.log(`Found ${patterns.length} frequent patterns`);
patterns.forEach(p => {
  console.log(`${p.sequence.join(' → ')} (support: ${p.support})`);
});

// Which activities happen together in same case?
const cooccurrence = pm.analyze_activity_cooccurrence(logHandle);
console.log(cooccurrence);
// { "Register,Approve": 125, "Register,Reject": 45, ... }

// Activity ordering relationships
const ordering = pm.analyze_activity_ordering(logHandle);
console.log(`${ordering.length} ordering constraints discovered`);
```

---

### How to cluster similar traces

Goal: group traces by behavioral similarity.

```javascript
const k = 3;  // Desired number of clusters
const clusters = pm.cluster_traces(logHandle, k);

// clusters[i] = cluster ID for trace i
console.log(`Assigned ${clusters.length} traces to ${k} clusters`);

// Count traces per cluster
const clusterCounts = {};
clusters.forEach(cid => {
  clusterCounts[cid] = (clusterCounts[cid] || 0) + 1;
});
console.log('Cluster sizes:', clusterCounts);
```

---

### How to extract features for ML

Goal: convert process data into feature vectors for machine learning.

```javascript
// Case-level features (one vector per trace)
const caseFeatures = pm.extract_case_features(logHandle);
// Returns JSON array suitable for ML models

// Prefix-level features (for remaining time prediction)
const prefixFeatures = pm.extract_prefix_features(logHandle);
// More granular, one vector per possible prefix

// Activity ordering as features
const orderingFeatures = pm.extract_activity_ordering(logHandle);

// Export to CSV for use in sklearn, PyTorch, etc.
const csv = pm.export_features_csv(caseFeatures);
const fs = require('fs');
fs.writeFileSync('features.csv', csv);
```

---

### How to analyze Object-Centric Event Logs (OCEL)

Goal: work with multi-object processes.

```javascript
const ocelHandle = pm.load_ocel_from_json(ocelJsonContent);

// Get basic statistics
const stats = pm.analyze_ocel_statistics(ocelHandle);
console.log(`${stats.num_events} events, ${stats.num_objects} objects`);
console.log(`Object types: ${stats.object_types.join(', ')}`);

// Discover object-aware DFG (one per object type)
const dfgPerType = pm.discover_ocel_dfg_per_type(ocelHandle);
Object.entries(dfgPerType).forEach(([type, dfg]) => {
  console.log(`${type}: ${dfg.nodes.length} activities`);
});

// Convert to traditional event log (flatten)
const flatLogHandle = pm.flatten_ocel_to_eventlog(ocelHandle);

// Export OCEL 2.0 format
const ocel2Json = pm.export_ocel2_to_json(ocelHandle);
```

---

### How to filter logs before discovery

Goal: clean up logs to focus on main process behavior.

```javascript
// Keep only high-frequency activities
const topActivities = ['Register', 'Approve', 'Close', 'Payment'];
const filtered = pm.filter_log_by_activity(logHandle, topActivities);

// Keep traces of reasonable length
const goodLength = pm.filter_log_by_trace_length(logHandle, 3, 50);

// Keep only "happy path" traces (start→end)
const happyPath = pm.filter_by_start_activity(logHandle, 'Register');
const complete = pm.filter_by_end_activity(happyPath, 'Close');

// Keep only traces with specific directly-follows pattern
const withApproval = pm.filter_by_directly_follows(logHandle, 'Register', 'Approve');

// Keep top 80% of traces (by frequency)
const mainVariants = pm.filter_by_variant_coverage(logHandle, 80);

// Discover model from cleaned log
const net = pm.discover_alpha_plus_plus(mainVariants, 0.05);
```

---

### How to check data quality

Goal: identify data issues before process mining.

```javascript
// Check event log quality
const quality = pm.check_data_quality(logHandle);
console.log(quality);
// { 
//   "issues": [...],
//   "has_timestamps": true,
//   "has_activities": true,
//   "missing_values": 5,
//   "duplicate_events": 2
// }

// Check OCEL data quality
const ocelQuality = pm.check_ocel_data_quality(ocelHandle);

// Validate specific requirements
if (!pm.validate_has_timestamps(logHandle)) {
  console.warn('Log has no timestamps - time-based analysis unavailable');
}
if (!pm.validate_has_activities(logHandle)) {
  throw new Error('Log has no activity attribute');
}

// Infer schema
const schema = pm.infer_eventlog_schema(logHandle);
console.log('Inferred attributes:', schema.attributes);
```

---

### How to generate text summaries (for LLMs)

Goal: convert WASM objects to natural language for Claude/GPT integration.

```javascript
// Convert DFG to text
const dfgText = pm.encode_dfg_as_text(dfgHandle);
console.log(dfgText);
// Returns: "Activities: Register, Approve, Close\nFlows: Register→Approve (100)"

// Convert Petri net to text
const netText = pm.encode_petri_net_as_text(netHandle);

// Convert conformance results to text
const confText = pm.encode_conformance_as_text(logHandle, netHandle, 'concept:name');

// Convert trace variants to text
const variantText = pm.encode_variants_as_text(logHandle);

// Use with LLM
const llmPrompt = `Analyze this process: ${dfgText}\n${confText}`;
// Send to Claude API
```

---

### How to set up monitoring and recommendations

Goal: get AI-powered suggestions for process improvement.

```javascript
// Get recommendations for the log
const recs = pm.generate_recommendations(logHandle, 'optimization');
console.log(recs);
// Returns: [
//   { type: "variant_reduction", severity: "high", description: "..." },
//   { type: "bottleneck", severity: "medium", resource: "Alice", ... },
//   ...
// ]

// Get module status/capabilities
const caps = pm.get_capability_registry();
console.log('Available algorithms:', caps.discovery_algorithms);
console.log('Available analysis:', caps.analysis_functions);

// Check specific module status
const discoveryStatus = pm.discovery_info();
console.log(discoveryStatus);  // { status: "operational", ... }
```

---

### How to compute model metrics

Goal: analyze structural properties of discovered models.

```javascript
// Get Petri net metrics
const metrics = pm.compute_model_metrics(netHandle);
console.log(metrics);
// {
//   "places": 12,
//   "transitions": 8,
//   "arcs": 25,
//   "complexity_score": 0.35,
//   "fitness_guarantee": true
// }

// Compute alignments (how well traces fit the model)
const alignments = pm.compute_alignments(logHandle, netHandle, 'concept:name');
alignments.forEach(align => {
  console.log(`Trace ${align.trace_id}: fitness=${align.fitness}`);
});

// Compute optimal alignments (slower, guaranteed optimal)
const optimalAligns = pm.compute_optimal_alignments(logHandle, netHandle, 'concept:name');
```

---

### How to compute activity transition matrix

Goal: understand which activities tend to follow which.

```javascript
// Get transition matrix
const matrix = pm.compute_activity_transition_matrix(logHandle);
// matrix[i][j] = number of times activity i is followed by activity j

// Get list of activities to interpret matrix
const activities = pm.get_activities(logHandle);

// Print as table
console.log('Activity Transition Matrix:');
console.log('From \\ To', activities.join('\t'));
activities.forEach((from, i) => {
  const row = activities.map((_, j) => matrix[i][j]);
  console.log(from, row.join('\t'));
});
```
