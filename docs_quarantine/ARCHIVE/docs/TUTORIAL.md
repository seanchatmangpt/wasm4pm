# Tutorial - Learning Process Mining with wasm4pm

By the end of these tutorials you will have loaded real event logs, discovered process models, checked conformance, explored variants and constraints, and processed a live stream of events — all running inside a single Node.js script with no external servers.

Work through them in order. Each tutorial builds on the one before it.

---

## Prerequisites

Run the following once before starting any tutorial.

```bash
cd wasm4pm        # the package directory, not the workspace root
npm install
npm run build:nodejs
```

Every tutorial script lives in the same directory and starts with the same two lines:

```javascript
const wasm = require('wasm4pm');
await wasm.init();
```

---

## Tutorial 1: Load an Event Log and Read Its Statistics

You will load a minimal XES event log from a string, store it in WASM memory, and print the number of cases and events it contains.

### Step 1: Write the XES string

Create a file called `tutorial1.js` and paste the following.

```javascript
const wasm = require('wasm4pm');

async function main() {
  await wasm.init();

  const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept"
             uri="http://www.xes-standard.org/concept.xesext"/>
  <global scope="trace">
    <string key="concept:name" value=""/>
  </global>
  <global scope="event">
    <string key="concept:name" value=""/>
  </global>
  <trace>
    <string key="concept:name" value="Case-1"/>
    <event><string key="concept:name" value="Receive Order"/></event>
    <event><string key="concept:name" value="Check Inventory"/></event>
    <event><string key="concept:name" value="Ship Order"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case-2"/>
    <event><string key="concept:name" value="Receive Order"/></event>
    <event><string key="concept:name" value="Ship Order"/></event>
  </trace>
</log>`;
```

### Step 2: Load the log into WASM memory

```javascript
  const logHandle = wasm.load_eventlog_from_xes(xes);
  console.log('Log handle:', logHandle);
  // => Log handle: obj_0
```

The handle is an opaque string that refers to the log stored in Rust memory. Use it for every subsequent call.

### Step 3: Read the statistics

```javascript
  const statsJson = JSON.stringify(wasm.analyze_event_statistics(logHandle));
  const stats = JSON.parse(statsJson);
  console.log('Total cases :', stats.total_cases);
  console.log('Total events:', stats.total_events);
  console.log('Avg events/case:', stats.avg_events_per_case.toFixed(1));
  // => Total cases : 2
  // => Total events: 5
  // => Avg events/case: 2.5
}

main();
```

### Step 4: Run the script

```bash
node tutorial1.js
```

Expected output:

```
Log handle: obj_0
Total cases : 2
Total events: 5
Avg events/case: 2.5
```

You have loaded an event log into WASM memory and read its basic statistics.

---

## Tutorial 2: Discover a Directly-Follows Graph

You will take the log from Tutorial 1 and discover which activities follow each other, producing a Directly-Follows Graph (DFG).

### Step 1: Set up the script

Create `tutorial2.js`. Copy the `xes` string and the `load_eventlog_from_xes` call from Tutorial 1. Then add:

```javascript
const wasm = require('wasm4pm');

async function main() {
  await wasm.init();

  const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept"
             uri="http://www.xes-standard.org/concept.xesext"/>
  <global scope="trace"><string key="concept:name" value=""/></global>
  <global scope="event"><string key="concept:name" value=""/></global>
  <trace>
    <string key="concept:name" value="Case-1"/>
    <event><string key="concept:name" value="Receive Order"/></event>
    <event><string key="concept:name" value="Check Inventory"/></event>
    <event><string key="concept:name" value="Ship Order"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case-2"/>
    <event><string key="concept:name" value="Receive Order"/></event>
    <event><string key="concept:name" value="Ship Order"/></event>
  </trace>
</log>`;

  const logHandle = wasm.load_eventlog_from_xes(xes);
```

### Step 2: Discover the DFG

```javascript
  const dfg = wasm.discover_dfg(logHandle, 'concept:name');
  console.log('Activities found:', dfg.nodes.length);
  console.log('Directly-follows edges:', dfg.edges.length);
  // => Activities found: 3
  // => Directly-follows edges: 3
```

### Step 3: Print each edge with its frequency

```javascript
  console.log('\nDirectly-follows relations:');
  for (const edge of dfg.edges) {
    console.log(`  ${edge.from} --> ${edge.to}  (seen ${edge.frequency}x)`);
  }
  // => Receive Order --> Check Inventory  (seen 1x)
  // => Check Inventory --> Ship Order     (seen 1x)
  // => Receive Order --> Ship Order       (seen 1x)
}

main();
```

### Step 4: Run the script

```bash
node tutorial2.js
```

Expected output:

```
Activities found: 3
Directly-follows edges: 3

Directly-follows relations:
  Receive Order --> Check Inventory  (seen 1x)
  Check Inventory --> Ship Order     (seen 1x)
  Receive Order --> Ship Order       (seen 1x)
```

You have discovered a DFG from an event log and read each transition frequency.

---

## Tutorial 3: Discover a Petri Net with Heuristic Miner

You will discover a Petri Net using the Heuristic Miner and then read the handle back out to use in conformance checking.

### Step 1: Prepare a richer log

Create `tutorial3.js`. This time the log has five traces so the dependency threshold has enough data to work with.

```javascript
const wasm = require('wasm4pm');

async function main() {
  await wasm.init();

  const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept"
             uri="http://www.xes-standard.org/concept.xesext"/>
  <global scope="trace"><string key="concept:name" value=""/></global>
  <global scope="event"><string key="concept:name" value=""/></global>
  <trace><string key="concept:name" value="C1"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
    <event><string key="concept:name" value="C"/></event>
  </trace>
  <trace><string key="concept:name" value="C2"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
    <event><string key="concept:name" value="C"/></event>
  </trace>
  <trace><string key="concept:name" value="C3"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
    <event><string key="concept:name" value="D"/></event>
  </trace>
  <trace><string key="concept:name" value="C4"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
    <event><string key="concept:name" value="C"/></event>
  </trace>
  <trace><string key="concept:name" value="C5"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
    <event><string key="concept:name" value="C"/></event>
  </trace>
</log>`;

  const logHandle = wasm.load_eventlog_from_xes(xes);
  console.log('Log loaded:', logHandle);
  // => Log loaded: obj_0
```

### Step 2: Run the Heuristic Miner

```javascript
  const resultJson = JSON.stringify(wasm.discover_heuristic_miner(
    logHandle,
    'concept:name',
    0.5          // dependency threshold: edges below this are filtered out
  ));
  const result = JSON.parse(resultJson);

  console.log('Algorithm    :', result.algorithm);
  console.log('DFG handle   :', result.handle);
  console.log('Activities   :', result.nodes);
  console.log('Strong edges :', result.edges);
  // => Algorithm    : heuristic_miner
  // => DFG handle   : obj_1
  // => Activities   : 4
  // => Strong edges : 2
```

### Step 3: Note the DFG handle for later use

```javascript
  const dfgHandle = result.handle;
  console.log('\nDFG stored as:', dfgHandle);
  // => DFG stored as: obj_1
}

main();
```

### Step 4: Run the script

```bash
node tutorial3.js
```

Expected output:

```
Log loaded: obj_0
Algorithm    : heuristic_miner
DFG handle   : obj_1
Activities   : 4
Strong edges : 2

DFG stored as: obj_1
```

You have run the Heuristic Miner and received back a stored DFG handle you can pass to other functions.

---

## Tutorial 4: Discover a Petri Net and Check Conformance

You will use Alpha++ to discover a Petri Net, then replay the original log against it and read the fitness score.

### Step 1: Load the log and discover the Petri Net

Create `tutorial4.js`.

```javascript
const wasm = require('wasm4pm');

async function main() {
  await wasm.init();

  const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept"
             uri="http://www.xes-standard.org/concept.xesext"/>
  <global scope="trace"><string key="concept:name" value=""/></global>
  <global scope="event"><string key="concept:name" value=""/></global>
  <trace><string key="concept:name" value="C1"/>
    <event><string key="concept:name" value="Submit"/></event>
    <event><string key="concept:name" value="Approve"/></event>
    <event><string key="concept:name" value="Pay"/></event>
  </trace>
  <trace><string key="concept:name" value="C2"/>
    <event><string key="concept:name" value="Submit"/></event>
    <event><string key="concept:name" value="Reject"/></event>
  </trace>
  <trace><string key="concept:name" value="C3"/>
    <event><string key="concept:name" value="Submit"/></event>
    <event><string key="concept:name" value="Approve"/></event>
    <event><string key="concept:name" value="Pay"/></event>
  </trace>
</log>`;

  const logHandle = wasm.load_eventlog_from_xes(xes);
  console.log('Log handle:', logHandle);
  // => Log handle: obj_0
```

### Step 2: Discover the Petri Net

```javascript
  const pnResultJson = JSON.stringify(wasm.discover_alpha_plus_plus(
    logHandle,
    'concept:name',
    0.0           // min_support: include all observed directly-follows arcs
  ));
  const pnResult = JSON.parse(pnResultJson);

  console.log('Petri Net handle:', pnResult.handle);
  console.log('Places          :', pnResult.places);
  console.log('Transitions     :', pnResult.transitions);
  console.log('Arcs            :', pnResult.arcs);
  // => Petri Net handle: obj_1
  // => Places          : 5
  // => Transitions     : 3
  // => Arcs            : 7
```

### Step 3: Run token-based replay conformance

```javascript
  const conformanceJson = JSON.stringify(wasm.check_token_based_replay(
    logHandle,
    pnResult.handle,
    'concept:name'
  ));
  const conformance = JSON.parse(conformanceJson);

  console.log('\nConformance result:');
  console.log('  Total cases    :', conformance.total_cases);
  console.log('  Conforming     :', conformance.conforming_cases);
  console.log('  Average fitness:', conformance.avg_fitness.toFixed(4));
  // => Conformance result:
  // =>   Total cases    : 3
  // =>   Conforming     : 3
  // =>   Average fitness: 1.0000
```

### Step 4: Print per-case fitness

```javascript
  console.log('\nPer-case fitness:');
  for (const c of conformance.case_fitness) {
    const label = c.is_conforming ? 'OK' : 'DEVIANT';
    console.log(`  Case ${c.case_id}: fitness=${c.trace_fitness.toFixed(2)}  [${label}]`);
  }
  // => Case 0: fitness=1.00  [OK]
  // => Case 1: fitness=1.00  [OK]
  // => Case 2: fitness=1.00  [OK]
}

main();
```

### Step 5: Run the script

```bash
node tutorial4.js
```

Expected output (exact numbers depend on log content):

```
Log handle: obj_0
Petri Net handle: obj_1
Places          : 5
Transitions     : 3
Arcs            : 7

Conformance result:
  Total cases    : 3
  Conforming     : 3
  Average fitness: 1.0000

Per-case fitness:
  Case 0: fitness=1.00  [OK]
  Case 1: fitness=1.00  [OK]
  Case 2: fitness=1.00  [OK]
```

You have discovered a Petri Net and replayed an event log against it to obtain per-case fitness scores.

---

## Tutorial 5: Explore Trace Variants and Detect Concept Drift

You will discover all unique execution paths in a log, print how often each occurs, then scan the log for points where the process behaviour changes.

### Step 1: Create a log with multiple variants

Create `tutorial5.js`.

```javascript
const wasm = require('wasm4pm');

async function main() {
  await wasm.init();

  // Build a log with three distinct variants across eight cases.
  const traces = [
    ['A', 'B', 'C'],   // variant 1 — appears 4 times
    ['A', 'B', 'C'],
    ['A', 'B', 'C'],
    ['A', 'B', 'C'],
    ['A', 'C'],        // variant 2 — appears 2 times
    ['A', 'C'],
    ['A', 'B', 'D'],   // variant 3 — appears 2 times (appears late, simulating drift)
    ['A', 'B', 'D'],
  ];

  const traceXml = traces.map((acts, i) => {
    const events = acts.map(a =>
      `<event><string key="concept:name" value="${a}"/></event>`
    ).join('\n    ');
    return `<trace><string key="concept:name" value="C${i + 1}"/>
    ${events}
  </trace>`;
  }).join('\n  ');

  const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept"
             uri="http://www.xes-standard.org/concept.xesext"/>
  <global scope="trace"><string key="concept:name" value=""/></global>
  <global scope="event"><string key="concept:name" value=""/></global>
  ${traceXml}
</log>`;

  const logHandle = wasm.load_eventlog_from_xes(xes);
  console.log('Log handle:', logHandle);
  // => Log handle: obj_0
```

### Step 2: Discover trace variants

```javascript
  const variantsJson = JSON.stringify(wasm.analyze_trace_variants(logHandle, 'concept:name'));
  const variants = JSON.parse(variantsJson);

  console.log('\nTotal unique variants:', variants.total_variants);
  console.log('\nTop variants by frequency:');
  for (const v of variants.top_variants) {
    console.log(`  [${v.path.join(' -> ')}]  x${v.count}  (${v.percentage}%)`);
  }
  // => Total unique variants: 3
  // =>
  // => Top variants by frequency:
  // =>   [A -> B -> C]  x4  (50%)
  // =>   [A -> C]       x2  (25%)
  // =>   [A -> B -> D]  x2  (25%)
```

### Step 3: Scan for concept drift

```javascript
  const driftJson = JSON.stringify(wasm.detect_concept_drift(
    logHandle,
    'concept:name',
    3           // window_size: compare activity sets in windows of 3 traces
  ));
  const drift = JSON.parse(driftJson);

  console.log('\nDrifts detected:', drift.drifts_detected);
  for (const d of drift.drifts) {
    console.log(`  At trace position ${d.position}: distance=${d.distance.toFixed(2)}`);
  }
  // => Drifts detected: 1
  // =>   At trace position 6: distance=0.50
}

main();
```

### Step 4: Run the script

```bash
node tutorial5.js
```

Expected output:

```
Log handle: obj_0

Total unique variants: 3

Top variants by frequency:
  [A -> B -> C]  x4  (50%)
  [A -> C]       x2  (25%)
  [A -> B -> D]  x2  (25%)

Drifts detected: 1
  At trace position 6: distance=0.50
```

You have enumerated every distinct execution path and identified where process behaviour shifted.

---

## Tutorial 6: Discover DECLARE Constraints

You will mine declarative constraints from a log and print which activity-pair rules have the highest support.

### Step 1: Prepare the log

Create `tutorial6.js`.

```javascript
const wasm = require('wasm4pm');

async function main() {
  await wasm.init();

  // A procurement process: every order is reviewed before it is approved,
  // and approval always leads to payment.
  const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept"
             uri="http://www.xes-standard.org/concept.xesext"/>
  <global scope="trace"><string key="concept:name" value=""/></global>
  <global scope="event"><string key="concept:name" value=""/></global>
  <trace><string key="concept:name" value="P1"/>
    <event><string key="concept:name" value="Create PO"/></event>
    <event><string key="concept:name" value="Review PO"/></event>
    <event><string key="concept:name" value="Approve PO"/></event>
    <event><string key="concept:name" value="Pay Invoice"/></event>
  </trace>
  <trace><string key="concept:name" value="P2"/>
    <event><string key="concept:name" value="Create PO"/></event>
    <event><string key="concept:name" value="Review PO"/></event>
    <event><string key="concept:name" value="Approve PO"/></event>
    <event><string key="concept:name" value="Pay Invoice"/></event>
  </trace>
  <trace><string key="concept:name" value="P3"/>
    <event><string key="concept:name" value="Create PO"/></event>
    <event><string key="concept:name" value="Review PO"/></event>
    <event><string key="concept:name" value="Reject PO"/></event>
  </trace>
</log>`;

  const logHandle = wasm.load_eventlog_from_xes(xes);
  console.log('Log handle:', logHandle);
  // => Log handle: obj_0
```

### Step 2: Discover DECLARE constraints

```javascript
  const declareJson = JSON.stringify(wasm.discover_declare(logHandle, 'concept:name'));
  const declare = JSON.parse(declareJson);

  console.log('\nActivities in model:', declare.activities.join(', '));
  console.log('Constraints found  :', declare.constraints.length);
  // => Activities in model: Create PO, Review PO, Approve PO, Pay Invoice, Reject PO
  // => Constraints found  : 12
```

### Step 3: Print the strongest constraints

```javascript
  // Sort by support descending and show the top 5
  const top = declare.constraints
    .sort((a, b) => b.support - a.support)
    .slice(0, 5);

  console.log('\nTop 5 constraints by support:');
  for (const c of top) {
    const [src, tgt] = c.activities;
    console.log(
      `  ${c.template}: ${src} --> ${tgt}` +
      `  (support=${c.support.toFixed(2)})`
    );
  }
  // => Top 5 constraints by support:
  // =>   Response: Create PO --> Review PO    (support=1.00)
  // =>   Response: Review PO --> Approve PO   (support=0.67)
  // =>   Response: Approve PO --> Pay Invoice (support=0.67)
  // =>   Response: Create PO --> Approve PO   (support=0.67)
  // =>   Response: Create PO --> Pay Invoice  (support=0.67)
}

main();
```

### Step 4: Run the script

```bash
node tutorial6.js
```

Expected output:

```
Log handle: obj_0

Activities in model: Create PO, Review PO, Approve PO, Pay Invoice, Reject PO
Constraints found  : 12

Top 5 constraints by support:
  Response: Create PO --> Review PO    (support=1.00)
  Response: Review PO --> Approve PO   (support=0.67)
  Response: Approve PO --> Pay Invoice (support=0.67)
  Response: Create PO --> Approve PO   (support=0.67)
  Response: Create PO --> Pay Invoice  (support=0.67)
```

You have mined DECLARE Response constraints and ranked them by how often they hold in the log.

---

## Tutorial 7: IoT Streaming Ingestion

Mine a process model from a sensor/device stream without ever loading the full log into memory.

### The Scenario

You have factory machines that emit events over MQTT. Each machine message contains a `machine_id` (case) and an `operation` (activity). You want a live DFG updated as events arrive, and a final stored DFG at end-of-shift.

### Step 1: Open a Streaming Session

```javascript
const wasm = require('wasm4pm');
await wasm.init();

const handle = wasm.streaming_dfg_begin();
console.log('Streaming session:', handle);
// => Streaming session: obj_0
```

### Step 2: Route Incoming Events

```javascript
// Simulated MQTT message handler
function onMqttMessage(msg) {
  const { machine_id, operation } = JSON.parse(msg.payload);
  wasm.streaming_dfg_add_event(handle, machine_id, operation);
}

// Or add a chunk of buffered messages at once:
function onBatch(messages) {
  const events = messages.map(m => ({
    case_id: m.machine_id,
    activity: m.operation,
  }));
  wasm.streaming_dfg_add_batch(handle, JSON.stringify(events));
}
```

### Step 3: Close Traces as Machines Complete Jobs

```javascript
function onJobComplete(machine_id) {
  const result = JSON.parse(wasm.streaming_dfg_close_trace(handle, machine_id));
  console.log(`Closed ${machine_id}: ${result.trace_count} total jobs processed`);
}
```

### Step 4: Live Snapshot (Dashboard Refresh)

```javascript
// Call every N seconds to update a live dashboard
function refreshDashboard() {
  const dfg = JSON.parse(wasm.streaming_dfg_snapshot(handle));
  console.log(`Activities: ${dfg.nodes.length}, Flows: ${dfg.edges.length}`);
  renderDiagram(dfg);  // e.g. your Mermaid/D3 renderer
}

setInterval(refreshDashboard, 5000);
```

### Step 5: Memory Check

```javascript
const stats = JSON.parse(wasm.streaming_dfg_stats(handle));
console.log(stats);
// {
//   event_count: 84200,      total events ingested
//   trace_count: 1050,       completed machine jobs
//   open_traces: 3,          machines mid-job
//   activities: 22,          unique operations seen
//   edge_pairs: 67,          unique A->B transitions
//   open_trace_events: 9     buffered events in 3 open machines
// }
//
// Memory cost: 9 u32 values (~36 bytes) for open trace buffers
// plus O(activities^2) count tables — independent of total event count.
```

### Step 6: End of Shift — Finalize

```javascript
// Flush any machines that didn't complete, store DFG, free the builder
const final = JSON.parse(wasm.streaming_dfg_finalize(handle));
console.log(`Final DFG stored as: ${final.dfg_handle}`);
console.log(`${final.nodes} activities, ${final.edges} flows`);

// Use with conformance or export
const dfgJson = wasm.streaming_dfg_snapshot(final.dfg_handle);
// Note: after finalize, the original handle is freed.
// Use final.dfg_handle for all subsequent operations.
```

You have ingested an unbounded event stream, sampled a live DFG at any point, and stored a final model with memory usage proportional only to open traces — not to total event count.

---

## Next Steps

- See [API.md](./API.md) for the complete function reference with all parameters
- See [reference/algorithms.md](./reference/algorithms.md) for how each discovery algorithm works
- See [QUICKSTART.md](./QUICKSTART.md) for setting up a browser or Express environment
