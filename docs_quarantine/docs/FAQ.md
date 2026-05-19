# Frequently Asked Questions - wasm4pm

Quick answers to common questions about wasm4pm.

## Installation & Setup

### Q: Which version of Node.js do I need?
**A:** Node.js 16 or later. We recommend 18+ for best performance and security.

```bash
node --version  # Check your version
nvm install 18  # Update if needed
```

### Q: Can I use wasm4pm in the browser?
**A:** Yes! Fully supported in all modern browsers (Chrome, Firefox, Safari, Edge).

```html
<script src="node_modules/wasm4pm/pkg/wasm4pm.js"></script>
<script>
  const pm = wasm4pm;
  await pm.init();
</script>
```

### Q: What's the minimum browser version?
**A:** 
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 79+

### Q: How large is the WASM binary?
**A:**
- Uncompressed: ~2MB
- Gzipped: ~600KB (typical production)
- Most of the size is algorithm implementations

### Q: Can I use wasm4pm with TypeScript?
**A:** Yes! TypeScript definitions are generated automatically and included in the npm package.

```typescript
import * as wasm4pm from 'wasm4pm';

async function analyze(xesContent: string): Promise<void> {
  await wasm4pm.init();
  const log = wasm4pm.loadEventLogFromXES(xesContent);
  const dfg = wasm4pm.discoverDFG(log);
}
```

---

## Features & Capabilities

### Q: How many discovery algorithms are available?
**A:** 14 main algorithms:
1. DFG (Directly-Follows Graph)
2. Alpha++
3. ILP Optimization
4. Genetic Algorithm
5. Particle Swarm Optimization
6. A* Search
7. DECLARE (Constraint Discovery)
8. Heuristic Miner
9. Inductive Miner
10. Hill Climbing
11. Ant Colony Optimization
12. Simulated Annealing
13. Process Skeleton
14. Optimized DFG

### Q: What algorithms are fastest?
**A:** Ranked by speed (for 1000 events):
1. Process Skeleton: ~3ms
2. DFG: ~5ms
3. Hill Climbing: ~20ms
4. Alpha++: ~50ms

### Q: What algorithms are most accurate?
**A:** Ranked by fitness (accuracy):
1. ILP Optimization: 99%
2. Genetic Algorithm: 97%
3. Alpha++: 98%
4. A* Search: 97%

### Q: Can I analyze object-centric processes?
**A:** Currently optimized for case-centric (XES) logs. Object-centric support is planned for v1.0.

### Q: What file formats are supported?
**A:**
- **Input**: XES (standard), JSON
- **Output**: PNML (Petri Net), DECLARE, JSON, Mermaid, D3, SVG, HTML

### Q: Can I export to ProM format?
**A:** PNML is ProM-compatible. Import the .pnml file into ProM.

---

## Performance & Optimization

### Q: How fast can wasm4pm process large logs?
**A:**
- 100K events: ~10-30 seconds (depending on algorithm)
- 1M events: ~100-300 seconds
- Linear scalability for most algorithms

For real-time analysis, use DFG or Process Skeleton (fast, ~0.3ms per 100 events).

### Q: How much memory does wasm4pm use?
**A:** Typical usage (1000 events):
- Memory: 1-10MB depending on algorithm
- WASM heap: Automatically managed

Large logs (100K+ events) may use 50-500MB.

### Q: Can I use wasm4pm for real-time streaming?
**A:** Yes. wasm4pm has a purpose-built streaming API designed for IoT devices and
memory-constrained environments. Unlike the batch API, the streaming builder never
holds the full event log in memory — once a trace is closed its buffer is freed and
its data lives only in compact count tables.

```javascript
await wasm4pm.init();

// 1. Open a streaming session
const handle = wasm4pm.streaming_dfg_begin();

// 2. Add events one-by-one as they arrive from sensors / queues
wasm4pm.streaming_dfg_add_event(handle, 'case-42', 'Order Received');
wasm4pm.streaming_dfg_add_event(handle, 'case-42', 'Payment Checked');
wasm4pm.streaming_dfg_add_event(handle, 'case-43', 'Order Received');

// 3. Close a trace when the case completes (frees the per-trace buffer)
wasm4pm.streaming_dfg_close_trace(handle, 'case-42');

// 4. Get a live DFG snapshot at any point (non-destructive)
const dfgJson = wasm4pm.streaming_dfg_snapshot(handle);
console.log('Live DFG:', JSON.parse(dfgJson));

// 5. Add events in bulk (chunked ingestion)
const chunk = [
  { case_id: 'case-44', activity: 'Order Received' },
  { case_id: 'case-44', activity: 'Fulfillment' },
];
wasm4pm.streaming_dfg_add_batch(handle, JSON.stringify(chunk));
wasm4pm.streaming_dfg_close_trace(handle, 'case-44');

// 6. Finalize: flush remaining open traces, store DFG, free the builder
const result = JSON.parse(wasm4pm.streaming_dfg_finalize(handle));
// result.dfg_handle can now be used with conformance checking, etc.
console.log(`Finalized DFG: ${result.nodes} nodes, ${result.edges} edges`);
```

Memory stays at **O(open_traces × avg_trace_length)** — typically kilobytes even when
millions of events have been processed in closed traces.

### Q: What memory stats are available for a streaming session?
**A:**
```javascript
const stats = JSON.parse(wasm4pm.streaming_dfg_stats(handle));
// {
//   event_count: 1500,      total events seen
//   trace_count: 120,       closed traces
//   open_traces: 3,         currently buffered traces
//   activities: 18,         unique activities discovered
//   edge_pairs: 42,         unique directly-follows pairs
//   open_trace_events: 12   events buffered in open traces
// }
```

`open_trace_events` is the dominant memory cost — it drops to 0 after each `close_trace` or `flush_open` call.

### Q: How do I optimize for large datasets?
**A:**
1. Use fast algorithms (DFG, Process Skeleton)
2. Filter logs before processing
3. Process in chunks
4. Use Web Workers (browser) or Worker Threads (Node.js)

### Q: How does browser performance compare to Node.js?
**A:** Browser performance is typically 2-3x slower than Node.js due to V8 JIT optimization patterns and WebAssembly memory model differences.

To measure and compare:

```bash
# Run Node.js benchmarks
npm run bench

# Run browser benchmarks (headless Chromium)
npm run bench:browser

# Compare results
node benchmarks/compare.js results/nodejs_bench.json results/browser_bench.json
```

**Typical results:**
- Node.js: 2-50ms per algorithm
- Browser: 5-150ms per algorithm
- Speedup: 0.3-0.5x (browser is slower)

**Note:** Despite slower absolute times, browser performance is still excellent for production use. Most algorithms complete in milliseconds.

See [BROWSER-BENCHMARKS.md](./BROWSER-BENCHMARKS.md) for detailed performance analysis and optimization strategies.

---

## Data Handling

### Q: What XES format do you support?
**A:** Standard XES 1.0 and 2.0. Features:
- Traces, events, attributes
- Timestamps, strings, integers, floats
- Meta information

### Q: How do I convert my logs to XES?
**A:** Use industry-standard tools:
- ProM framework (free, Java)
- pm4py (Python)
- Custom scripts (our QuickStart has examples)

### Q: What happens if my XES is malformed?
**A:** Clear error message indicating the problem:
```javascript
try {
  const log = wasm4pm.loadEventLogFromXES(badXES);
} catch (error) {
  console.error(error.message);  // E.g., "Missing attribute key"
}
```

### Q: Can I add events programmatically?
**A:** Yes, create logs in code:

```javascript
const log = wasm4pm.createEventLog();

log.addTrace('CaseID1', [
  { activity: 'A', timestamp: 1000 },
  { activity: 'B', timestamp: 2000 }
]);

log.addTrace('CaseID2', [
  { activity: 'A', timestamp: 1100 },
  { activity: 'C', timestamp: 2100 }
]);
```

### Q: How do I filter logs?
**A:**
```javascript
// By date range
const filtered = wasm4pm.filterLogByDateRange(log, {
  start: '2024-01-01',
  end: '2024-03-31'
});

// By activity
const filtered = wasm4pm.filterByActivity(log, ['A', 'B']);

// By case ID
const filtered = wasm4pm.filterByCaseId(log, ['Case1', 'Case2']);
```

---

## Algorithm Selection

### Q: Which algorithm should I use?
**A:** Depends on your needs:

| Need | Algorithm |
|------|-----------|
| Fast overview | DFG |
| Balanced | Alpha++ |
| Exact model | ILP Optimization |
| Evolutionary | Genetic Algorithm |
| Constraint discovery | DECLARE |
| Dependency analysis | Heuristic Miner |

### Q: How do I choose algorithm parameters?
**A:** Start with defaults, then tune:

```javascript
// Genetic Algorithm parameters
const model = wasm4pm.discoverGeneticAlgorithm(log, {
  populationSize: 50,     // More = better but slower
  generations: 100,       // More = more accurate
  mutationRate: 0.1,      // 0.05-0.2 typical
  crossoverRate: 0.8      // 0.7-0.9 typical
});
```

### Q: What's the difference between fitness and precision?
**A:**
- **Fitness** (0-1): How much of the log is covered by the model
- **Precision** (0-1): How specific the model is (less overfitting)
- High fitness + high precision = good model

### Q: Why does my model have low fitness?
**A:** Common causes:
1. **Noisy data** - Try filtering or using noise-tolerant algorithms
2. **Complex process** - Try Genetic Algorithm or ILP
3. **Outliers** - Filter anomalous traces
4. **Wrong algorithm** - Try different algorithms

---

## Conformance Checking

### Q: What is conformance checking?
**A:** Verifies if event log matches a discovered model:
- Traces that follow the model = conforming
- Traces that deviate = non-conforming

### Q: What do conformance metrics mean?
**A:**
- **Fitness** (0-1): % of log replayed successfully
- **Precision** (0-1): Model doesn't allow unobserved behavior
- **Generalization** (0-1): Model flexibility
- **Simplicity** (0-1): Model is concise

### Q: How do I analyze deviations?
**A:**
```javascript
const result = wasm4pm.checkConformance(log, model, {
  includeDeviations: true
});

result.deviations.forEach(dev => {
  console.log(`Case ${dev.caseId}: ${dev.description}`);
});
```

### Q: Can I find specific non-conforming traces?
**A:** Yes:
```javascript
const deviating = wasm4pm.findNonConformingTraces(log, model);
deviating.traces.forEach(trace => {
  console.log(`${trace.caseId}: ${trace.deviationPoint}`);
});
```

---

## Troubleshooting

### Q: Getting "WASM module not initialized"
**A:** Call `init()` first:
```javascript
await wasm4pm.init();
// Now safe to use
```

### Q: "out of memory" error
**A:** Solutions:
1. Process smaller logs
2. Use streaming/chunking
3. Free unused handles: `wasm4pm.freeHandle(handle)`
4. Increase Node.js memory: `node --max-old-space-size=4096 app.js`

### Q: Algorithm produces unexpected results
**A:** Debug step-by-step:
```javascript
const log = wasm4pm.loadEventLogFromXES(xes);
const stats = wasm4pm.analyzeEventStatistics(log);
console.log('Log stats:', stats);  // Verify data

const model = wasm4pm.discoverDFG(log);
console.log('Model:', model);

const conformance = wasm4pm.checkConformance(log, model);
console.log('Quality:', conformance);  // Check fitness
```

### Q: Browser shows blank page
**A:**
1. Check browser console for errors
2. Verify WASM is supported: `typeof WebAssembly !== 'undefined'`
3. Check network tab - .wasm file should load
4. Try different browser

### Q: npm install hangs or fails
**A:**
```bash
# Clear cache
npm cache clean --force

# Reinstall
npm install wasm4pm

# Or specify version
npm install wasm4pm@26.4.5
```

### Q: TypeScript "module not found" error
**A:**
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "types": ["node"],
    "allowJs": true
  }
}
```

---

## Development

### Q: How do I modify wasm4pm source?
**A:**
```bash
cd wasm4pm
pnpm install
# Edit src/lib.rs, src/discovery.rs, etc.
pnpm run build:dev
pnpm test
```

### Q: Can I extend wasm4pm?
**A:** Yes, contribute to GitHub:
1. Fork repository
2. Create feature branch
3. Submit pull request

### Q: Is there a Rust API?
**A:** Yes, wasm4pm is built with Rust. Full source code available.

### Q: How do I run tests?
**A:**
```bash
npm test                    # All tests
npm run test:integration   # Integration only
npm run test:watch        # Watch mode
```

---

## Licensing & Legal

### Q: What license is wasm4pm?
**A:** Dual-licensed:
- MIT License (permissive)
- Apache 2.0 (permissive with patent clause)

Choose whichever works for you.

### Q: Can I use wasm4pm commercially?
**A:** Yes, both licenses permit commercial use.

### Q: Do I need to disclose that I use wasm4pm?
**A:** Not required, but appreciated. See LICENSE files for details.

### Q: Is there a warranty?
**A:** No, provided "as-is". See LICENSE files.

---

## Community & Support

### Q: How do I report bugs?
**A:** GitHub Issues: https://github.com/seanchatmangpt/wasm4pm/issues

Include:
- wasm4pm version
- Node.js/browser version
- Minimal reproducible example
- Error message

### Q: How do I request features?
**A:** GitHub Discussions: https://github.com/seanchatmangpt/wasm4pm/discussions

### Q: Is there a community Slack/Discord?
**A:** Not yet, but may be created for v1.0. Follow GitHub for updates.

### Q: Who maintains wasm4pm?
**A:** Created by Sean Chat Man GPT. Contributions welcome!

---

## CLI: Algorithm Selection

### Q: How do I choose between discovery algorithms?

**A:** Use the speed/quality tradeoff table. Every algorithm is scored 0-100 on both axes.

| Algorithm | Speed | Quality | Output | Best when |
|-----------|-------|---------|--------|-----------|
| `simd_streaming_dfg` | 2 | 28 | DFG | Streaming, real-time |
| `process_skeleton` | 3 | 25 | DFG | Fastest overview |
| `dfg` | 5 | 30 | DFG | First look at any log |
| `alpha_plus_plus` | 20 | 45 | Petri net | Standard benchmarking |
| `heuristic_miner` | 25 | 50 | DFG | Real logs with noise |
| `inductive_miner` | 30 | 55 | Process tree | Sound models guaranteed |
| `hill_climbing` | 40 | 55 | Petri net | Quick structured model |
| `declare` | 35 | 50 | Declare | Flexible/ad-hoc processes |
| `simulated_annealing` | 55 | 65 | Petri net | Balanced quality/time |
| `a_star` | 60 | 70 | Petri net | Optimal search |
| `aco` | 65 | 75 | Petri net | Nature-inspired tuning |
| `pso` | 70 | 75 | Petri net | Particle swarm |
| `genetic_algorithm` | 75 | 80 | Petri net | High-quality, time available |
| `optimized_dfg` | 70 | 85 | DFG | Best DFG quality |
| `ilp` | 80 | 90 | Petri net | Highest quality, slow |

**Rule of thumb:**
- First exploration: `dfg` (milliseconds, good enough to see structure)
- Production model: `heuristic_miner` (balanced, noise-tolerant)
- Publication quality: `ilp` or `genetic_algorithm` (minutes, highest fitness)

```bash
wpm run log.xes --algorithm dfg           # Fast overview
wpm run log.xes --algorithm heuristic_miner  # Balanced
wpm run log.xes --algorithm ilp           # Highest quality
wpm compare dfg,heuristic_miner,ilp -i log.xes  # Side-by-side
```

---

### Q: Why is DFG so much faster than the genetic algorithm?

**A:** DFG runs in O(n) time — it makes a single pass through the event log counting directly-follows pairs. Each event is visited once.

The genetic algorithm is O(n * p * g) where n is log size, p is population size, and g is the number of generations. With default settings (population 50, 100 generations), it performs 5,000 evaluation passes over the log.

For a 10,000-event log:
- DFG: roughly 10,000 operations
- Genetic algorithm: roughly 50,000,000 operations

The quality difference exists for the same reason: more computation allows the genetic algorithm to search a much larger model space and find Petri nets that replay more of the log correctly.

---

## CLI: Exit Codes

### Q: What does exit code 2 mean?

**A:** Exit code 2 is `source_error`. It means the problem is with the input data, not the configuration or algorithm.

Common causes:
- The log file path does not exist or is not readable
- The XES file is malformed (invalid XML)
- The JSON log file is not valid JSON
- The algorithm name is spelled incorrectly (routing to a non-existent algorithm is treated as a source resolution failure)
- An unknown `concept:name` attribute key was specified

```bash
wpm run missing.xes           # exit 2 — file not found
wpm run bad.xes               # exit 2 — malformed XES
wpm run log.xes --algorithm xyz  # exit 2 — unknown algorithm
```

**Diagnose with:**
```bash
wpm validate -i log.xes       # Checks structure before running
wpm doctor                    # Shows WASM and system state
```

Full exit code contract (from `apps/wasm4pm/src/exit-codes.ts`):

| Code | Name | Meaning |
|------|------|---------|
| 0 | `success` | Completed successfully |
| 1 | `config_error` | Config file missing, invalid, or malformed |
| 2 | `source_error` | Invalid log format, missing file, unknown algorithm |
| 3 | `execution_error` | Algorithm failure, timeout, resource exhaustion |
| 4 | `partial_failure` | Some operations succeeded, some failed |
| 5 | `system_error` | I/O, permission, or system resource issues |
| 6 | `conformance_fail` | Fitness below threshold during conformance check |

---

### Q: What does exit code 3 mean?

**A:** Exit code 3 is `execution_error`. The input was valid and the algorithm was found, but the algorithm itself failed during execution.

Common causes:
- The algorithm exceeded the configured timeout (default varies by profile)
- The WASM module ran out of memory during execution
- A numerical error inside the algorithm (e.g., division by zero in an edge case)
- The algorithm received valid-but-pathological input that caused an internal error

```bash
wpm run log.xes --algorithm ilp --timeout 5000   # May exit 3 if 5s is too short
```

If you consistently see exit code 3 with a specific algorithm, try a faster algorithm first to confirm the log is processable, then increase the timeout for the slower algorithm.

---

## CLI: Deployment Profiles

### Q: Which deployment profile should I choose?

**A:** Choose the profile that matches where wasm4pm will run.

| Profile | Binary size | Algorithms | Use when |
|---------|-------------|-----------|----------|
| `browser` | ~2.7MB (default) | All 41 | Web apps, Node.js servers, CLI (default) |
| `fog` | ~2MB | 35-40 (no POWL) | IoT gateways, edge servers with ML |
| `edge` | ~1.5MB | 18-25 | CDN workers, Cloudflare Workers |
| `iot` | ~1MB | 12-18 | Raspberry Pi, embedded Linux |
| `mobile` | ~500KB | 10-15 | Mobile apps, smallest footprint |

**Decision flow:**
1. Running in a browser or Node.js server with no size constraint? Use `browser` (default — no action needed).
2. Running on a gateway or fog node that needs ML? Use `fog`.
3. Running at the CDN edge (Cloudflare Workers, Deno Deploy)? Use `edge`.
4. Running on an embedded device or microcontroller? Use `iot` or `mobile`.

**Build for a specific profile:**
```bash
cd wasm4pm
npm run build:edge     # ~1.5MB binary
npm run build:fog      # ~2MB binary
npm run build:mobile   # ~500KB binary
```

**Note:** The `browser` profile is always the default build. You only need to rebuild if targeting a constrained environment.

---

## CLI: Prediction (`wpm predict`)

### Q: How do I use `wpm predict`?

**A:** `wpm predict` covers six orthogonal prediction perspectives. Each is invoked by name as the first positional argument.

**Syntax:**
```bash
wpm predict <task> -i <log.xes> [options]
```

**All six tasks with examples:**

```bash
# 1. next-activity — What activity comes next in a running case?
wpm predict next-activity -i log.xes
wpm predict next-activity -i log.xes --prefix "Register,Approve" --top-k 3

# 2. remaining-time — How long until this case finishes?
wpm predict remaining-time -i log.xes

# 3. outcome — Will this case end normally or deviate?
wpm predict outcome -i log.xes

# 4. drift — Has the process changed over time?
wpm predict drift -i log.xes --drift-window 20

# 5. features — What prefix features predict the outcome?
wpm predict features -i log.xes

# 6. resource — Which resource or intervention is optimal?
wpm predict resource -i log.xes
```

**Key options:**
- `--prefix "A,B,C"` — Condition prediction on a specific activity prefix (comma-separated). This is the "prefix hypothesis": type recent activities and get predictions without re-running discovery.
- `--top-k 5` — Return top 5 predictions (default: 3)
- `--activity-key task` — Use `task` instead of `concept:name` (default)
- `--ngram-order 3` — Use trigrams instead of bigrams for next-activity
- `--drift-window 20` — Window size for drift comparison (default: 10)
- `--format json` — Machine-readable output

**Output is auto-saved to** `.wasm4pm/results/<timestamp>-predict-<task>.json`. Pass `--no-save` to skip.

---

## CLI: ML Analysis (`wpm ml`)

### Q: How do I use `wpm ml`?

**A:** `wpm ml` applies machine learning analysis to an event log. Six tasks are supported.

**Syntax:**
```bash
wpm ml <task> -i <log.xes> [options]
```

**All six tasks with examples:**

```bash
# 1. classify — Predict case outcome (approved/rejected, fast/slow)
wpm ml classify -i log.xes
wpm ml classify -i log.xes --method decision_tree --target-key outcome

# 2. cluster — Group cases into cohorts (no labels required)
wpm ml cluster -i log.xes
wpm ml cluster -i log.xes --method kmeans --k 4

# 3. forecast — Predict future throughput or event rates
wpm ml forecast -i log.xes
wpm ml forecast -i log.xes --forecast-periods 10

# 4. anomaly — Find outlier cases (fraud, errors, exceptions)
wpm ml anomaly -i log.xes

# 5. regress — Predict a continuous value (e.g., remaining time)
wpm ml regress -i log.xes
wpm ml regress -i log.xes --target-key duration

# 6. pca — Reduce feature dimensions for visualization or pre-processing
wpm ml pca -i log.xes
wpm ml pca -i log.xes --n-components 3
```

**Available methods per task:**
- `classify`: `knn`, `logistic_regression`, `decision_tree`, `naive_bayes`
- `cluster`: `kmeans`, `dbscan`
- `forecast`: `linear`, `polynomial`, `exponential`
- `anomaly`: (automatic — EMA-based scoring)
- `regress`: `linear_regression`
- `pca`: (automatic — SVD-based)

**Key options:**
- `--activity-key task` — Use `task` attribute instead of `concept:name`
- `--k 4` — Number of clusters or KNN neighbors
- `--eps 0.5` — DBSCAN epsilon (cluster radius)
- `--format json` — Machine-readable output

---

## CLI: WASM Internals

### Q: What is a WASM handle?

**A:** A WASM handle is an opaque string identifier that refers to an object stored inside the WASM module's linear memory. When you load an event log, parse a Petri net, or build a DFG, the data lives inside WASM memory and you receive a handle (a string like `"log_abc123"`) to reference it in subsequent calls.

Handles are used between WASM API calls:
```javascript
// Inside the WASM module boundary:
const handle = wasm.load_eventlog_from_xes(xesContent);  // returns a handle string
const dfg    = wasm.discover_dfg(handle, 'concept:name'); // uses the handle
wasm.delete_object(handle);                               // frees the object
```

**You do not need to manage handles manually when using the `wpm` CLI.** Every command acquires, uses, and frees handles within a single invocation. Handles only become visible when calling the WASM JavaScript API directly.

If you do call the WASM API directly, always call `wasm.delete_object(handle)` after you are finished with an object to prevent memory leaks inside WASM linear memory.

---

## CLI: Configuration

### Q: How do I configure wasm4pm via environment variables?

**A:** All configuration keys accept an equivalent `WASM4PM_*` environment variable. CLI arguments take highest precedence, then config file, then environment variables, then defaults.

| Environment variable | Config key | Example |
|---------------------|-----------|---------|
| `WASM4PM_PROFILE` | `execution.profile` | `fast`, `balanced`, `quality`, `stream` |
| `WASM4PM_ALGORITHM` | `algorithm.name` | `dfg`, `heuristic_miner`, `ilp` |
| `WASM4PM_OUTPUT_FORMAT` | `output.format` | `human`, `json` |
| `WASM4PM_LOG_LEVEL` | `observability.logLevel` | `debug`, `info`, `warn`, `error` |
| `WASM4PM_WATCH` | `watch.enabled` | `true`, `false` |
| `WASM4PM_OTEL_ENABLED` | `observability.otel.enabled` | `true`, `false` |
| `WASM4PM_OTEL_ENDPOINT` | `observability.otel.endpoint` | `http://localhost:4317` |
| `WASM4PM_OUTPUT_DESTINATION` | `output.destination` | `stdout`, `/path/to/file` |
| `WASM4PM_SOURCE_KIND` | `source.kind` | `file`, `stream`, `http` |
| `WASM4PM_SINK_KIND` | `sink.kind` | `stdout`, `file`, `http` |
| `WASM4PM_PREDICTION_ENABLED` | `prediction.enabled` | `true`, `false` |
| `WASM4PM_PREDICTION_TASKS` | `prediction.tasks` | `next-activity,drift` |
| `WASM4PM_PREDICTION_ACTIVITY_KEY` | `prediction.activityKey` | `concept:name`, `task` |
| `WASM4PM_PREDICTION_NGRAM_ORDER` | `prediction.ngramOrder` | `2`, `3` |
| `WASM4PM_PREDICTION_DRIFT_WINDOW` | `prediction.driftWindowSize` | `10`, `20` |

**Example:**
```bash
export WASM4PM_PROFILE=quality
export WASM4PM_ALGORITHM=genetic_algorithm
export WASM4PM_OUTPUT_FORMAT=json
wpm run log.xes
```

---

### Q: What is the `wasm4pm.toml` config file format?

**A:** `wasm4pm.toml` is the primary configuration file. Run `wpm init` to scaffold it. It is read from the current working directory (or the path set by `--config`).

Key sections with examples:

```toml
[source]
kind = "file"
path = "logs/process.xes"

[algorithm]
name = "heuristic_miner"

[algorithm.parameters]
dependency_threshold = 0.3

[execution]
profile = "balanced"
timeout = 60000

[output]
format = "human"
destination = "stdout"
pretty = true
colorize = true

[observability]
logLevel = "info"

[observability.otel]
enabled = false
exporter = "otlp"
endpoint = "http://localhost:4317"

[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 2
driftWindowSize = 10
tasks = ["next-activity", "drift"]

[watch]
enabled = false
poll_interval = 5000
```

Config file is optional. Without it, defaults apply and the log file is passed as a CLI argument.

---

## CLI: Conformance and Quality

### Q: How do I run conformance checking?

**A:** Use `wpm conformance`. It compares your event log against a discovered or imported process model and reports fitness and precision.

```bash
# Discover a model and check conformance in one step
wpm conformance -i log.xes

# With a specific algorithm
wpm conformance -i log.xes --algorithm inductive_miner

# JSON output for scripting
wpm conformance -i log.xes --format json

# Check against PNML model file
wpm conformance -i log.xes --model model.pnml
```

**Output includes:**
- `fitness` (0-1): Fraction of log behavior the model can replay. Values above 0.85 are considered acceptable.
- `precision` (0-1): How much of the model's allowed behavior was actually observed. Low precision means the model is too permissive.
- `generalization` (0-1): How well the model generalizes to unseen traces.
- `simplicity`: Element count (fewer places and transitions is better).

A fitness below 0.85 is treated as a conformance defect, not a discrepancy. Exit code 6 (`conformance_fail`) is returned when fitness falls below the configured threshold.

---

### Q: How do I interpret quality metrics?

**A:** The four Van der Aalst quality dimensions form a balance:

**Fitness** (target: >0.85) — "Can the model replay what happened?"
A fitness of 1.0 means every trace in the log can be replayed token-by-token through the model without any missing or remaining tokens. Low fitness means the model is too restrictive — it forbids behavior that actually occurred.

**Precision** (higher is better) — "Does the model forbid things that didn't happen?"
A precision of 1.0 means the model allows exactly the behavior in the log. Low precision means the model is too permissive — it accepts traces that were never observed.

**Generalization** (higher is better) — "Does the model generalize beyond the sample?"
Low generalization means the model is overfit to the specific traces in the log and won't handle new valid cases.

**Simplicity** — "Is the model as simple as possible?"
Measured by element count (places + transitions in a Petri net). More elements = more complex model. Prefer simpler models that still achieve good fitness and precision.

**The key tension:** Fitness and precision trade off against each other. A model that allows everything has perfect fitness but zero precision. A model that only allows exact observed sequences has high precision but generalizes poorly.

---

### Q: What is drift detection and how do I use it?

**A:** Concept drift means the process behavior has changed over time — for example, a new approval step was introduced, or a shortcut emerged. wasm4pm detects drift by comparing sliding windows of traces using Jaccard similarity on directly-follows edges, smoothed with EWMA (Exponentially Weighted Moving Average).

**`wpm predict drift`** — Single-shot drift analysis of a static log:
```bash
wpm predict drift -i log.xes
wpm predict drift -i log.xes --drift-window 20   # Larger window = less sensitive
```

**`wpm drift-watch`** — Continuous monitoring that re-analyzes as the log grows:
```bash
wpm drift-watch -i log.xes
wpm drift-watch -i log.xes --alpha 0.3 --threshold 0.4
```

**Key parameters:**
- `--drift-window` (default: 10): Number of traces per comparison window. Larger windows detect slower structural drift; smaller windows catch sudden changes.
- `--alpha` (default: 0.2): EWMA smoothing factor. Higher alpha makes the detector more responsive to recent changes (but also noisier).
- `--threshold` (default: 0.5): Jaccard similarity below this value triggers a drift alert. Lower threshold = more sensitive.

**Output:** Drift score per window (0 = identical, 1 = completely different) and a list of window indices where drift was detected.

---

### Q: How do I tune the heuristic miner?

**A:** The heuristic miner's primary tuning parameter is `dependency_threshold` — a value between 0.0 and 1.0 that controls how strong a directly-follows relationship must be before it is included in the model.

**Effect of the threshold:**
- High threshold (0.7-0.9): Only very frequent, consistent edges survive. The model becomes simpler but may miss infrequent paths. Real logs at 0.8 often filter out almost everything.
- Low threshold (0.1-0.3): More edges survive, including noisy ones. The model is more complete but potentially spaghetti-like.
- Default (0.5): Balanced starting point for clean synthetic logs.

**For real-world logs, start at 0.2-0.4:**
```bash
wpm run log.xes --algorithm heuristic_miner
# In wasm4pm.toml:
[algorithm.parameters]
dependency_threshold = 0.3
```

**Or via the kernel directly (for WASM API users):**
```javascript
// dependency_threshold of 0.3 is appropriate for noisy real logs
const result = wasm.discover_heuristic_miner(handle, 'concept:name', 0.3);
```

If the discovered model has zero edges or very few nodes, the threshold is too high. Lower it toward 0.2 and try again.

---

## More Help

- **Documentation**: Check README.md, QUICKSTART.md, TUTORIAL.md
- **Examples**: See examples/ directory
- **Benchmarks**: See THESIS.md for performance data
- **GitHub**: https://github.com/seanchatmangpt/wasm4pm
- **npm**: https://www.npmjs.com/package/wasm4pm

