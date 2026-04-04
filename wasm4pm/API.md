# wasm4pm API Reference

All functions are exported from the WASM module. Import the module before calling any function.

```javascript
const pm = require('wasm4pm'); // Node.js (CommonJS)
import * as pm from 'wasm4pm'; // ES modules
```

**Return value convention.** Functions that return complex objects return a JSON-encoded `string`. Callers must parse the result with `JSON.parse()`. Functions that return a handle return a plain `string` (do not parse). Primitive return types (`number`, `boolean`) are returned directly. Every function that can fail throws a JavaScript `Error`.

---

## Table of Contents

1. [Initialization](#initialization)
2. [Data Loading](#data-loading)
3. [Data Export](#data-export)
4. [Discovery Algorithms](#discovery-algorithms)
5. [Streaming API](#streaming-api)
6. [Analysis Functions](#analysis-functions)
7. [Conformance Checking](#conformance-checking)
8. [Utilities and Filtering](#utilities-and-filtering)
9. [State Management](#state-management)

---

## Initialization

### `init()`

Initializes the global WASM state. Must be called once before any other function.

**Signature**

```javascript
pm.init(): string
```

**Parameters** — none

**Returns** `string` — `"Rust4PM WASM initialized successfully"`

**Throws** — never

**Example**

```javascript
const pm = require('wasm4pm');
pm.init();
```

---

### `get_version()`

Returns the library version string.

**Signature**

```javascript
pm.get_version(): string
```

**Parameters** — none

**Returns** `string` — version identifier, e.g. `"0.5.4"`

**Throws** — never

**Example**

```javascript
console.log(pm.get_version()); // "0.5.4"
```

---

## Data Loading

All loading functions return an opaque handle string (`"obj_N"`) that identifies the stored object. Pass this handle to all subsequent operations. Handles are valid until the object is deleted with `delete_object()` or `clear_all_objects()`.

---

### `load_eventlog_from_xes(content)`

Parses an XES 1.0 file and stores the resulting EventLog.

**Signature**

```javascript
pm.load_eventlog_from_xes(content: string): string
```

| Parameter | Type     | Description                             |
| --------- | -------- | --------------------------------------- |
| `content` | `string` | Full XES XML document as a UTF-8 string |

**Returns** `string` — EventLog handle

**Throws** `Error` — if the XES document cannot be parsed

**Example**

```javascript
const fs = require('fs');
const xes = fs.readFileSync('log.xes', 'utf8');
const logHandle = pm.load_eventlog_from_xes(xes);
```

---

### `load_eventlog_from_json(content)`

Parses a JSON-serialized EventLog and stores it.

**Signature**

```javascript
pm.load_eventlog_from_json(content: string): string
```

| Parameter | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `content` | `string` | JSON string matching the EventLog schema |

**Returns** `string` — EventLog handle

**Throws** `Error` — `"Failed to parse EventLog JSON: ..."` if content is invalid

**Example**

```javascript
const raw = fs.readFileSync('log.json', 'utf8');
const logHandle = pm.load_eventlog_from_json(raw);
```

---

### `load_ocel_from_json(content)`

Parses a JSON-serialized OCEL (Object-Centric Event Log) and stores it.

**Signature**

```javascript
pm.load_ocel_from_json(content: string): string
```

| Parameter | Type     | Description                          |
| --------- | -------- | ------------------------------------ |
| `content` | `string` | JSON string matching the OCEL schema |

**Returns** `string` — OCEL handle

**Throws** `Error` — `"Failed to parse OCEL JSON: ..."` if content is invalid

**Example**

```javascript
const raw = fs.readFileSync('ocel.json', 'utf8');
const ocelHandle = pm.load_ocel_from_json(raw);
```

---

## Data Export

### `export_eventlog_to_xes(handle)`

Serializes a stored EventLog to XES 1.0 XML.

**Signature**

```javascript
pm.export_eventlog_to_xes(handle: string): string
```

| Parameter | Type     | Description                                    |
| --------- | -------- | ---------------------------------------------- |
| `handle`  | `string` | EventLog handle returned by a loading function |

**Returns** `string` — XES XML document

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const xes = pm.export_eventlog_to_xes(logHandle);
fs.writeFileSync('out.xes', xes);
```

---

### `export_eventlog_to_json(handle)`

Serializes a stored EventLog to JSON.

**Signature**

```javascript
pm.export_eventlog_to_json(handle: string): string
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** `string` — JSON document (not a handle; the full serialized object)

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const json = pm.export_eventlog_to_json(logHandle);
fs.writeFileSync('out.json', json);
```

---

### `export_ocel_to_json(handle)`

Serializes a stored OCEL to JSON.

**Signature**

```javascript
pm.export_ocel_to_json(handle: string): string
```

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `handle`  | `string` | OCEL handle |

**Returns** `string` — JSON document

**Throws** `Error` — `"Object is not an OCEL"` or `"OCEL not found"`

**Example**

```javascript
const json = pm.export_ocel_to_json(ocelHandle);
```

---

## Discovery Algorithms

All discovery functions accept an EventLog or OCEL handle and an `activity_key` string. The `activity_key` names the event attribute that holds the activity label (commonly `"concept:name"` in XES logs).

Discovery functions return either:

- a **handle** to a stored DFG/PetriNet/DeclareModel, or
- a **JSON string** describing the result and containing the handle.

The table below lists which form each function uses.

| Function                       | Input    | Output form       | Returns             |
| ------------------------------ | -------- | ----------------- | ------------------- |
| `discover_dfg`                 | EventLog | JS object (parse) | DFG object          |
| `discover_ocel_dfg`            | OCEL     | JS object (parse) | DFG object          |
| `discover_declare`             | EventLog | JS object (parse) | DeclareModel object |
| `discover_heuristic_miner`     | EventLog | JSON string       | handle + summary    |
| `discover_inductive_miner`     | EventLog | JS object (parse) | handle + summary    |
| `discover_astar`               | EventLog | JS object (parse) | handle + summary    |
| `discover_hill_climbing`       | EventLog | JS object (parse) | handle + summary    |
| `discover_genetic_algorithm`   | EventLog | JSON string       | handle + summary    |
| `discover_pso_algorithm`       | EventLog | JSON string       | handle + summary    |
| `discover_ant_colony`          | EventLog | JS object (parse) | handle + summary    |
| `discover_simulated_annealing` | EventLog | JS object (parse) | handle + summary    |
| `discover_ilp_petri_net`       | EventLog | JSON string       | handle + summary    |
| `discover_optimized_dfg`       | EventLog | JSON string       | handle + summary    |
| `extract_process_skeleton`     | EventLog | JS object (parse) | handle + summary    |

---

### `discover_dfg(handle, activity_key)`

Discovers a Directly-Follows Graph using a single-pass columnar algorithm.

**Signature**

```javascript
pm.discover_dfg(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                                                    |
| -------------- | -------- | -------------------------------------------------------------- |
| `handle`       | `string` | EventLog handle                                                |
| `activity_key` | `string` | Event attribute key for activity names (e.g. `"concept:name"`) |

**Returns** — a deserialized JavaScript object with the shape:

```json
{
  "nodes": [{ "id": "A", "label": "A", "frequency": 42 }],
  "edges": [{ "from": "A", "to": "B", "frequency": 35 }],
  "start_activities": { "A": 20 },
  "end_activities": { "B": 18 }
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const dfg = pm.discover_dfg(logHandle, 'concept:name');
console.log(dfg.nodes.length, dfg.edges.length);
```

---

### `discover_ocel_dfg(handle)`

Discovers a DFG from an Object-Centric Event Log. Edges are object-scoped (consecutive events sharing an object).

**Signature**

```javascript
pm.discover_ocel_dfg(handle: string): object
```

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `handle`  | `string` | OCEL handle |

**Returns** — deserialized DFG object (same shape as `discover_dfg`)

**Throws** `Error` — `"Object is not an OCEL"` or `"OCEL not found"`

**Example**

```javascript
const dfg = pm.discover_ocel_dfg(ocelHandle);
```

---

### `discover_declare(handle, activity_key)`

Discovers DECLARE Response constraints with support >= 0.1 from an EventLog.

**Signature**

```javascript
pm.discover_declare(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized DeclareModel object:

```json
{
  "activities": ["A", "B", "C"],
  "constraints": [
    {
      "template": "Response",
      "activities": ["A", "B"],
      "support": 0.85,
      "confidence": 1.0
    }
  ]
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const model = pm.discover_declare(logHandle, 'concept:name');
console.log(model.constraints.length, 'constraints found');
```

---

### `discover_heuristic_miner(handle, activity_key, dependency_threshold)`

Applies the Heuristic Miner dependency measure to filter DFG edges. Edges where `(ab - ba) / (ab + ba + 1) < dependency_threshold` are discarded.

**Signature**

```javascript
pm.discover_heuristic_miner(
  handle: string,
  activity_key: string,
  dependency_threshold: number
): string
```

| Parameter              | Type     | Description                                                        |
| ---------------------- | -------- | ------------------------------------------------------------------ |
| `handle`               | `string` | EventLog handle                                                    |
| `activity_key`         | `string` | Event attribute key for activity names                             |
| `dependency_threshold` | `number` | Minimum dependency value to retain an edge (0.0–1.0; typical: 0.5) |

**Returns** JSON string. Parse to get:

```json
{
  "handle": "obj_2",
  "nodes": 8,
  "edges": 12,
  "algorithm": "heuristic_miner",
  "dependency_threshold": 0.5
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const result = JSON.parse(pm.discover_heuristic_miner(logHandle, 'concept:name', 0.5));
const dfgHandle = result.handle;
```

---

### `discover_inductive_miner(handle, activity_key)`

Builds a DFG using all directly-follows relations, with start/end activity tracking. Simplified Inductive Miner variant.

**Signature**

```javascript
pm.discover_inductive_miner(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object:

```json
{ "handle": "obj_3", "algorithm": "inductive_miner", "nodes": 7, "edges": 9 }
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.discover_inductive_miner(logHandle, 'concept:name');
const dfgHandle = r.handle;
```

---

### `discover_astar(handle, activity_key, max_iterations)`

A\* search over the DFG space. Iteratively adds edges that maximize a fitness heuristic, up to `max_iterations`.

**Signature**

```javascript
pm.discover_astar(
  handle: string,
  activity_key: string,
  max_iterations: number
): object
```

| Parameter        | Type     | Description                              |
| ---------------- | -------- | ---------------------------------------- |
| `handle`         | `string` | EventLog handle                          |
| `activity_key`   | `string` | Event attribute key for activity names   |
| `max_iterations` | `number` | Maximum search iterations (integer >= 1) |

**Returns** — deserialized object:

```json
{ "handle": "obj_4", "algorithm": "astar", "nodes": 7, "edges": 10, "iterations": 50 }
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.discover_astar(logHandle, 'concept:name', 100);
```

---

### `discover_hill_climbing(handle, activity_key)`

Greedy local search. Adds edges one at a time, choosing the edge with the highest marginal fitness gain until no improvement is found.

**Signature**

```javascript
pm.discover_hill_climbing(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object:

```json
{ "handle": "obj_5", "algorithm": "hill_climbing", "nodes": 7, "edges": 9 }
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.discover_hill_climbing(logHandle, 'concept:name');
```

---

### `discover_genetic_algorithm(handle, activity_key, population_size, generations)`

Evolves a population of DFGs toward higher fitness using crossover and mutation (10% mutation rate, 25% elitism).

**Signature**

```javascript
pm.discover_genetic_algorithm(
  handle: string,
  activity_key: string,
  population_size: number,
  generations: number
): string
```

| Parameter         | Type     | Description                                  |
| ----------------- | -------- | -------------------------------------------- |
| `handle`          | `string` | EventLog handle                              |
| `activity_key`    | `string` | Event attribute key for activity names       |
| `population_size` | `number` | Number of DFGs per generation (integer >= 1) |
| `generations`     | `number` | Number of evolution rounds (integer >= 1)    |

**Returns** JSON string. Parse to get:

```json
{
  "handle": "obj_6",
  "algorithm": "genetic_algorithm",
  "nodes": 8,
  "edges": 11,
  "final_fitness": 0.92,
  "population_size": 50,
  "generations": 100
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = JSON.parse(pm.discover_genetic_algorithm(logHandle, 'concept:name', 50, 100));
console.log('fitness:', r.final_fitness);
```

---

### `discover_pso_algorithm(handle, activity_key, swarm_size, iterations)`

Particle Swarm Optimization over the DFG space. Each particle's position is a set of edges; particles move toward the global best.

**Signature**

```javascript
pm.discover_pso_algorithm(
  handle: string,
  activity_key: string,
  swarm_size: number,
  iterations: number
): string
```

| Parameter      | Type     | Description                             |
| -------------- | -------- | --------------------------------------- |
| `handle`       | `string` | EventLog handle                         |
| `activity_key` | `string` | Event attribute key for activity names  |
| `swarm_size`   | `number` | Number of particles (integer >= 1)      |
| `iterations`   | `number` | Number of PSO iterations (integer >= 1) |

**Returns** JSON string. Parse to get:

```json
{
  "handle": "obj_7",
  "algorithm": "pso_algorithm",
  "nodes": 8,
  "edges": 10,
  "final_fitness": 0.89
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = JSON.parse(pm.discover_pso_algorithm(logHandle, 'concept:name', 30, 50));
```

---

### `discover_ant_colony(handle, activity_key, num_ants, iterations)`

Ant Colony Optimization. Pheromone trails are initialized from directly-follows frequencies and updated by fitness after each iteration.

**Signature**

```javascript
pm.discover_ant_colony(
  handle: string,
  activity_key: string,
  num_ants: number,
  iterations: number
): object
```

| Parameter      | Type     | Description                                 |
| -------------- | -------- | ------------------------------------------- |
| `handle`       | `string` | EventLog handle                             |
| `activity_key` | `string` | Event attribute key for activity names      |
| `num_ants`     | `number` | Number of ants per iteration (integer >= 1) |
| `iterations`   | `number` | Number of ACO iterations (integer >= 1)     |

**Returns** — deserialized object:

```json
{ "handle": "obj_8", "algorithm": "ant_colony", "nodes": 7, "edges": 10, "fitness": 0.88 }
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.discover_ant_colony(logHandle, 'concept:name', 20, 30);
```

---

### `discover_simulated_annealing(handle, activity_key, temperature, cooling_rate)`

Simulated Annealing search. Accepts worsening moves with probability `exp(-delta/T)`. Terminates when temperature drops below 0.01.

**Signature**

```javascript
pm.discover_simulated_annealing(
  handle: string,
  activity_key: string,
  temperature: number,
  cooling_rate: number
): object
```

| Parameter      | Type     | Description                                          |
| -------------- | -------- | ---------------------------------------------------- |
| `handle`       | `string` | EventLog handle                                      |
| `activity_key` | `string` | Event attribute key for activity names               |
| `temperature`  | `number` | Starting temperature (e.g. `1.0`)                    |
| `cooling_rate` | `number` | Multiplicative cooling factor per step (e.g. `0.95`) |

**Returns** — deserialized object:

```json
{ "handle": "obj_9", "algorithm": "simulated_annealing", "nodes": 7, "edges": 9, "fitness": 0.87 }
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.discover_simulated_annealing(logHandle, 'concept:name', 1.0, 0.95);
```

---

### `discover_ilp_petri_net(handle, activity_key)`

ILP-based Petri net discovery. Creates transitions for each activity, infers implicit places from the directly-follows relation, and reports fitness, precision, and F-measure.

**Signature**

```javascript
pm.discover_ilp_petri_net(handle: string, activity_key: string): string
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** JSON string. Parse to get:

```json
{
  "handle": "obj_10",
  "algorithm": "ilp_petri_net",
  "places": 6,
  "transitions": 5,
  "arcs": 12,
  "fitness": 0.91,
  "precision": 0.88,
  "simplicity": 0.75,
  "f_measure": 0.895
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = JSON.parse(pm.discover_ilp_petri_net(logHandle, 'concept:name'));
const netHandle = r.handle;
```

---

### `discover_optimized_dfg(handle, activity_key, fitness_weight, simplicity_weight)`

Constraint-satisfaction DFG discovery. Edges are scored by a weighted combination of fitness and simplicity; only edges above the weighted threshold are retained.

**Signature**

```javascript
pm.discover_optimized_dfg(
  handle: string,
  activity_key: string,
  fitness_weight: number,
  simplicity_weight: number
): string
```

| Parameter           | Type     | Description                                      |
| ------------------- | -------- | ------------------------------------------------ |
| `handle`            | `string` | EventLog handle                                  |
| `activity_key`      | `string` | Event attribute key for activity names           |
| `fitness_weight`    | `number` | Weight for fitness in the objective (0.0–1.0)    |
| `simplicity_weight` | `number` | Weight for simplicity in the objective (0.0–1.0) |

**Returns** JSON string. Parse to get:

```json
{
  "handle": "obj_11",
  "algorithm": "optimized_dfg",
  "nodes": 7,
  "edges": 9
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = JSON.parse(pm.discover_optimized_dfg(logHandle, 'concept:name', 0.7, 0.3));
```

---

### `extract_process_skeleton(handle, activity_key, min_frequency)`

Extracts the minimal DFG structure by keeping only edges whose frequency meets `min_frequency`. Nodes with no surviving edges are removed.

**Signature**

```javascript
pm.extract_process_skeleton(
  handle: string,
  activity_key: string,
  min_frequency: number
): object
```

| Parameter       | Type     | Description                                            |
| --------------- | -------- | ------------------------------------------------------ |
| `handle`        | `string` | EventLog handle                                        |
| `activity_key`  | `string` | Event attribute key for activity names                 |
| `min_frequency` | `number` | Minimum edge occurrence count to retain (integer >= 1) |

**Returns** — deserialized object:

```json
{ "handle": "obj_12", "algorithm": "process_skeleton", "nodes": 5, "edges": 6, "min_frequency": 3 }
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.extract_process_skeleton(logHandle, 'concept:name', 5);
```

---

### `available_discovery_algorithms()`

Returns metadata for all implemented discovery algorithms.

**Signature**

```javascript
pm.available_discovery_algorithms(): object
```

**Parameters** — none

**Returns** — deserialized object:

```json
{
  "algorithms": [
    {
      "name": "dfg",
      "description": "...",
      "input": "EventLog",
      "parameters": ["activity_key"],
      "status": "implemented"
    }
  ]
}
```

**Throws** — never

---

## Streaming API

The Streaming API ingests events incrementally without holding the full log in memory. Memory use is proportional to open (in-progress) traces only. Closed traces are folded into compact count tables and their buffers freed immediately.

All streaming functions operate on a `StreamingDfgBuilder` stored under a handle returned by `streaming_dfg_begin()`.

---

### `streaming_dfg_begin()`

Opens a new streaming session.

**Signature**

```javascript
pm.streaming_dfg_begin(): string
```

**Parameters** — none

**Returns** `string` — streaming session handle (e.g. `"obj_0"`)

**Throws** `Error` — if the state mutex cannot be acquired

**Example**

```javascript
const stream = pm.streaming_dfg_begin();
```

---

### `streaming_dfg_add_event(handle, case_id, activity)`

Appends one event to an open trace. Creates the trace buffer for `case_id` automatically on first use.

**Signature**

```javascript
pm.streaming_dfg_add_event(handle: string, case_id: string, activity: string): string
```

| Parameter  | Type     | Description              |
| ---------- | -------- | ------------------------ |
| `handle`   | `string` | Streaming session handle |
| `case_id`  | `string` | Trace/case identifier    |
| `activity` | `string` | Activity name            |

**Returns** JSON string. Parse to get:

```json
{ "ok": true, "event_count": 1, "open_traces": 1, "activities": 1 }
```

| Field         | Type      | Description                                   |
| ------------- | --------- | --------------------------------------------- |
| `ok`          | `boolean` | Always `true` on success                      |
| `event_count` | `number`  | Total events ingested (including open traces) |
| `open_traces` | `number`  | Number of in-progress traces                  |
| `activities`  | `number`  | Unique activity count so far                  |

**Throws** `Error` — `"Handle is not a StreamingDfgBuilder"` or `"StreamingDfgBuilder handle not found"`

**Example**

```javascript
JSON.parse(pm.streaming_dfg_add_event(stream, 'case-1', 'Register'));
JSON.parse(pm.streaming_dfg_add_event(stream, 'case-1', 'Approve'));
```

---

### `streaming_dfg_add_batch(handle, events_json)`

Adds multiple events in one call. Each element must have `case_id` and `activity` string fields.

**Signature**

```javascript
pm.streaming_dfg_add_batch(handle: string, events_json: string): string
```

| Parameter     | Type     | Description                                                   |
| ------------- | -------- | ------------------------------------------------------------- |
| `handle`      | `string` | Streaming session handle                                      |
| `events_json` | `string` | JSON array of `{ case_id: string, activity: string }` objects |

**Returns** JSON string. Parse to get:

```json
{ "ok": true, "added": 2, "event_count": 3, "open_traces": 2, "activities": 2 }
```

| Field         | Type      | Description                  |
| ------------- | --------- | ---------------------------- |
| `ok`          | `boolean` | Always `true` on success     |
| `added`       | `number`  | Events added in this batch   |
| `event_count` | `number`  | Running total events         |
| `open_traces` | `number`  | Number of in-progress traces |
| `activities`  | `number`  | Unique activity count        |

**Throws** `Error` — `"Invalid events JSON: ..."` if `events_json` is not a valid JSON array; `"Each event must have a 'case_id' string field"` or `"Each event must have an 'activity' string field"` if an element is malformed

**Example**

```javascript
const batch = JSON.stringify([
  { case_id: 'c1', activity: 'A' },
  { case_id: 'c2', activity: 'B' },
]);
const stats = JSON.parse(pm.streaming_dfg_add_batch(stream, batch));
```

---

### `streaming_dfg_close_trace(handle, case_id)`

Closes a trace: folds its event buffer into the running DFG counts, then frees the per-trace buffer.

**Signature**

```javascript
pm.streaming_dfg_close_trace(handle: string, case_id: string): string
```

| Parameter | Type     | Description                      |
| --------- | -------- | -------------------------------- |
| `handle`  | `string` | Streaming session handle         |
| `case_id` | `string` | Identifier of the trace to close |

**Returns** JSON string. Parse to get:

Success: `{ "ok": true, "trace_count": 1, "open_traces": 0 }`

Not open: `{ "ok": false, "trace_count": 0, "open_traces": 0 }`

| Field         | Type      | Description                                |
| ------------- | --------- | ------------------------------------------ |
| `ok`          | `boolean` | `false` if `case_id` was not an open trace |
| `trace_count` | `number`  | Total traces closed so far                 |
| `open_traces` | `number`  | Remaining open traces                      |

**Throws** `Error` — `"Handle is not a StreamingDfgBuilder"` or `"StreamingDfgBuilder handle not found"`

**Example**

```javascript
const r = JSON.parse(pm.streaming_dfg_close_trace(stream, 'case-1'));
if (!r.ok) console.warn('case-1 was not open');
```

---

### `streaming_dfg_flush_open(handle)`

Closes all currently-open traces at once.

**Signature**

```javascript
pm.streaming_dfg_flush_open(handle: string): string
```

| Parameter | Type     | Description              |
| --------- | -------- | ------------------------ |
| `handle`  | `string` | Streaming session handle |

**Returns** JSON string. Parse to get:

```json
{ "ok": true, "flushed": 2, "trace_count": 5 }
```

| Field         | Type      | Description                                        |
| ------------- | --------- | -------------------------------------------------- |
| `ok`          | `boolean` | Always `true`                                      |
| `flushed`     | `number`  | Number of traces that were open and are now closed |
| `trace_count` | `number`  | Total traces closed so far                         |

**Throws** `Error` — `"Handle is not a StreamingDfgBuilder"` or `"StreamingDfgBuilder handle not found"`

**Example**

```javascript
const r = JSON.parse(pm.streaming_dfg_flush_open(stream));
console.log(`Flushed ${r.flushed} open traces`);
```

---

### `streaming_dfg_snapshot(handle)`

Returns a non-destructive DFG snapshot from closed-trace counts. Open (in-progress) traces are not included. Does not modify or free the streaming session.

**Signature**

```javascript
pm.streaming_dfg_snapshot(handle: string): string
```

| Parameter | Type     | Description              |
| --------- | -------- | ------------------------ |
| `handle`  | `string` | Streaming session handle |

**Returns** JSON string. Parse to get a DFG object with the same shape as `discover_dfg`:

```json
{
  "nodes": [{ "id": "A", "label": "A", "frequency": 10 }],
  "edges": [{ "from": "A", "to": "B", "frequency": 8 }],
  "start_activities": { "A": 5 },
  "end_activities": { "B": 5 }
}
```

**Throws** `Error` — `"Handle is not a StreamingDfgBuilder"` or `"StreamingDfgBuilder handle not found"`

**Example**

```javascript
const dfg = JSON.parse(pm.streaming_dfg_snapshot(stream));
console.log(dfg.nodes.length, 'activities seen so far');
```

---

### `streaming_dfg_finalize(handle)`

Flushes all open traces, stores the resulting DFG as a new object, frees the streaming builder, and returns the DFG handle. After this call, the streaming `handle` is invalid.

**Signature**

```javascript
pm.streaming_dfg_finalize(handle: string): string
```

| Parameter | Type     | Description                                            |
| --------- | -------- | ------------------------------------------------------ |
| `handle`  | `string` | Streaming session handle (invalidated after this call) |

**Returns** JSON string. Parse to get:

```json
{ "dfg_handle": "obj_1", "nodes": 5, "edges": 8 }
```

| Field        | Type     | Description                                        |
| ------------ | -------- | -------------------------------------------------- |
| `dfg_handle` | `string` | Handle to the stored DFG; use with other functions |
| `nodes`      | `number` | Node count in the finalized DFG                    |
| `edges`      | `number` | Edge count in the finalized DFG                    |

**Throws** `Error` — `"Handle is not a StreamingDfgBuilder"` or `"StreamingDfgBuilder handle not found"` or `"Failed to store DFG"`

**Example**

```javascript
const r = JSON.parse(pm.streaming_dfg_finalize(stream));
const dfgHandle = r.dfg_handle;
// stream is now invalid; use dfgHandle for conformance checking, etc.
```

---

### `streaming_dfg_stats(handle)`

Returns memory and progress statistics for an open streaming session. Does not modify the session.

**Signature**

```javascript
pm.streaming_dfg_stats(handle: string): string
```

| Parameter | Type     | Description              |
| --------- | -------- | ------------------------ |
| `handle`  | `string` | Streaming session handle |

**Returns** JSON string. Parse to get:

```json
{
  "event_count": 1500,
  "trace_count": 120,
  "open_traces": 3,
  "activities": 18,
  "edge_pairs": 42,
  "open_trace_events": 9
}
```

| Field               | Type     | Description                                                     |
| ------------------- | -------- | --------------------------------------------------------------- |
| `event_count`       | `number` | Total events ingested (closed + open traces)                    |
| `trace_count`       | `number` | Total traces closed so far                                      |
| `open_traces`       | `number` | Currently open (in-progress) trace count                        |
| `activities`        | `number` | Unique activity count                                           |
| `edge_pairs`        | `number` | Unique directed pairs in closed-trace counts                    |
| `open_trace_events` | `number` | Total buffered events in open traces — the dominant memory cost |

**Throws** `Error` — `"Handle is not a StreamingDfgBuilder"` or `"StreamingDfgBuilder handle not found"`

**Example**

```javascript
const stats = JSON.parse(pm.streaming_dfg_stats(stream));
console.log(`Memory pressure: ${stats.open_trace_events} buffered events`);
```

---

## Analysis Functions

### `analyze_dotted_chart(handle)`

Computes a dotted-chart summary: event count per case.

**Signature**

```javascript
pm.analyze_dotted_chart(handle: string): object
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** — deserialized object:

```json
{
  "type": "dotted_chart",
  "case_count": 500,
  "total_events": 4823,
  "cases": [{ "case_id": 0, "event_count": 9 }]
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const chart = pm.analyze_dotted_chart(logHandle);
console.log(`${chart.case_count} cases, ${chart.total_events} events`);
```

---

### `analyze_event_statistics(handle)`

Computes aggregate event statistics.

**Signature**

```javascript
pm.analyze_event_statistics(handle: string): object
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** — deserialized object:

```json
{
  "total_events": 4823,
  "total_cases": 500,
  "avg_events_per_case": 9.646
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const stats = pm.analyze_event_statistics(logHandle);
```

---

### `analyze_ocel_statistics(handle)`

Computes event and object counts for an OCEL.

**Signature**

```javascript
pm.analyze_ocel_statistics(handle: string): object
```

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `handle`  | `string` | OCEL handle |

**Returns** — deserialized object:

```json
{ "total_events": 1200, "total_objects": 340 }
```

**Throws** `Error` — `"Object is not an OCEL"` or `"OCEL not found"`

**Example**

```javascript
const stats = pm.analyze_ocel_statistics(ocelHandle);
```

---

### `analyze_case_duration(handle)`

Computes per-case event-count distribution (min, max, median, average). Note: durations are measured in events, not wall-clock time.

**Signature**

```javascript
pm.analyze_case_duration(handle: string): object
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** — deserialized object:

```json
{
  "case_count": 500,
  "average_events_per_case": 9.6,
  "median_events_per_case": 9,
  "min_events_per_case": 3,
  "max_events_per_case": 27
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const d = pm.analyze_case_duration(logHandle);
console.log(`Median case length: ${d.median_events_per_case} events`);
```

---

### `analyze_infrequent_paths(handle, activity_key, frequency_threshold)`

Identifies trace variants whose relative frequency is below `frequency_threshold`.

**Signature**

```javascript
pm.analyze_infrequent_paths(
  handle: string,
  activity_key: string,
  frequency_threshold: number
): object
```

| Parameter             | Type     | Description                                                 |
| --------------------- | -------- | ----------------------------------------------------------- |
| `handle`              | `string` | EventLog handle                                             |
| `activity_key`        | `string` | Event attribute key for activity names                      |
| `frequency_threshold` | `number` | Maximum relative frequency to count as infrequent (0.0–1.0) |

**Returns** — deserialized object:

```json
{
  "infrequent_paths": [{ "path": ["A", "C", "B"], "count": 2, "frequency": 0.004 }],
  "total_distinct_paths": 43,
  "frequency_threshold": 0.05
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.analyze_infrequent_paths(logHandle, 'concept:name', 0.05);
console.log(r.infrequent_paths.length, 'rare variants');
```

---

### `detect_rework(handle, activity_key)`

Detects activities that repeat within individual traces (rework).

**Signature**

```javascript
pm.detect_rework(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object:

```json
{
  "traces_with_rework": 42,
  "rework_percentage": 8.4,
  "total_rework_instances": 57,
  "rework_by_activity": [
    ["Review", 23],
    ["Approve", 11]
  ]
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.detect_rework(logHandle, 'concept:name');
console.log(`${r.rework_percentage.toFixed(1)}% of cases have rework`);
```

---

### `detect_bottlenecks(handle, activity_key, timestamp_key, duration_threshold_seconds)`

Identifies activities where the interval to the next event exceeds `duration_threshold_seconds`.

**Signature**

```javascript
pm.detect_bottlenecks(
  handle: string,
  activity_key: string,
  timestamp_key: string,
  duration_threshold_seconds: number
): object
```

| Parameter                    | Type     | Description                                                 |
| ---------------------------- | -------- | ----------------------------------------------------------- |
| `handle`                     | `string` | EventLog handle                                             |
| `activity_key`               | `string` | Event attribute key for activity names                      |
| `timestamp_key`              | `string` | Event attribute key for timestamps (ISO 8601 Date values)   |
| `duration_threshold_seconds` | `number` | Minimum duration to flag as a bottleneck (integer, seconds) |

**Returns** — deserialized object:

```json
{
  "bottlenecks": [
    { "activity": "Review", "occurrences": 15, "avg_duration": 7200.0, "max_duration": 28800 }
  ],
  "duration_threshold": 3600
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.detect_bottlenecks(logHandle, 'concept:name', 'time:timestamp', 3600);
```

---

### `compute_model_metrics(handle, activity_key)`

Computes structural complexity metrics: activity count, edge count, variant count, average degree, density, and a composite complexity score.

**Signature**

```javascript
pm.compute_model_metrics(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object:

```json
{
  "num_activities": 12,
  "num_edges": 28,
  "num_variants": 97,
  "avg_degree": 4.67,
  "density": 0.21,
  "complexity_score": 34.1
}
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const m = pm.compute_model_metrics(logHandle, 'concept:name');
```

---

### `analyze_trace_variants(handle, activity_key)`

Extracts all distinct trace variants and returns the top 20 by frequency.

**Signature**

```javascript
pm.analyze_trace_variants(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object:

```json
{
  "total_variants": 43,
  "top_variants": [{ "path": ["A", "B", "C"], "count": 120, "percentage": 24.0 }],
  "coverage": 100.0
}
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const v = pm.analyze_trace_variants(logHandle, 'concept:name');
console.log(`${v.total_variants} distinct variants`);
```

---

### `mine_sequential_patterns(handle, activity_key, min_support, pattern_length)`

Finds activity sequences of exactly `pattern_length` that appear in at least `min_support` fraction of traces.

**Signature**

```javascript
pm.mine_sequential_patterns(
  handle: string,
  activity_key: string,
  min_support: number,
  pattern_length: number
): object
```

| Parameter        | Type     | Description                                     |
| ---------------- | -------- | ----------------------------------------------- |
| `handle`         | `string` | EventLog handle                                 |
| `activity_key`   | `string` | Event attribute key for activity names          |
| `min_support`    | `number` | Minimum relative support threshold (0.0–1.0)    |
| `pattern_length` | `number` | Exact length of patterns to mine (integer >= 2) |

**Returns** — deserialized object containing a `patterns` array.

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.mine_sequential_patterns(logHandle, 'concept:name', 0.1, 3);
```

---

### `detect_concept_drift(handle, activity_key, window_size)`

Detects points where the set of active activities changes significantly between consecutive windows of traces. Uses Jaccard distance; drift is reported when distance exceeds 0.3.

**Signature**

```javascript
pm.detect_concept_drift(
  handle: string,
  activity_key: string,
  window_size: number
): object
```

| Parameter      | Type     | Description                                           |
| -------------- | -------- | ----------------------------------------------------- |
| `handle`       | `string` | EventLog handle                                       |
| `activity_key` | `string` | Event attribute key for activity names                |
| `window_size`  | `number` | Number of traces per comparison window (integer >= 1) |

**Returns** — deserialized object:

```json
{
  "drifts_detected": 2,
  "drifts": [{ "position": 200, "distance": 0.45, "type": "concept_drift" }],
  "window_size": 50
}
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.detect_concept_drift(logHandle, 'concept:name', 50);
```

---

### `cluster_traces(handle, activity_key, num_clusters)`

Groups traces into `num_clusters` clusters using activity-set similarity (k-medoids style). Cluster centers are initialized from the first `num_clusters` traces.

**Signature**

```javascript
pm.cluster_traces(
  handle: string,
  activity_key: string,
  num_clusters: number
): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |
| `num_clusters` | `number` | Number of clusters (integer >= 1)      |

**Returns** — deserialized object containing cluster sizes and percentages.

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.cluster_traces(logHandle, 'concept:name', 5);
```

---

### `analyze_start_end_activities(handle, activity_key)`

Identifies activity frequencies at trace start, trace end, and start-end pairs.

**Signature**

```javascript
pm.analyze_start_end_activities(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object with `start_activities`, `end_activities`, and `start_end_pairs` arrays, each sorted by frequency descending.

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.analyze_start_end_activities(logHandle, 'concept:name');
```

---

### `analyze_activity_cooccurrence(handle, activity_key)`

Computes pairwise activity co-occurrence counts (how many traces contain both activities). Returns the top 30 pairs by count.

**Signature**

```javascript
pm.analyze_activity_cooccurrence(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object:

```json
{
  "cooccurrences": [{ "activity1": "A", "activity2": "B", "cooccurrence_count": 480 }]
}
```

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.analyze_activity_cooccurrence(logHandle, 'concept:name');
```

---

### `analyze_activity_dependencies(handle, activity_key)`

Computes predecessor and successor sets for each activity.

**Signature**

```javascript
pm.analyze_activity_dependencies(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized object with `dependencies` array. Each entry has `activity`, `predecessors` (array), and `successors` (array).

**Throws** `Error` — `"Not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.analyze_activity_dependencies(logHandle, 'concept:name');
```

---

### `available_analysis_functions()`

Returns metadata for all implemented analysis functions.

**Signature**

```javascript
pm.available_analysis_functions(): string
```

**Parameters** — none

**Returns** JSON string (not an object — call `JSON.parse()`). Contains a `functions` array with `name`, `description`, and `input_type` per entry.

**Throws** — never

---

## Conformance Checking

### `check_token_based_replay(eventlog_handle, petri_net_handle, activity_key)`

Checks conformance by replaying each trace against a Petri net. A trace is conforming when fitness >= 0.9 and no deviations are found.

**Signature**

```javascript
pm.check_token_based_replay(
  eventlog_handle: string,
  petri_net_handle: string,
  activity_key: string
): object
```

| Parameter          | Type     | Description                                          |
| ------------------ | -------- | ---------------------------------------------------- |
| `eventlog_handle`  | `string` | EventLog handle                                      |
| `petri_net_handle` | `string` | PetriNet handle (e.g. from `discover_ilp_petri_net`) |
| `activity_key`     | `string` | Event attribute key for activity names               |

**Returns** — deserialized ConformanceResult object:

```json
{
  "avg_fitness": 0.91,
  "conforming_cases": 460,
  "total_cases": 500,
  "case_fitness": [
    {
      "case_id": "0",
      "is_conforming": true,
      "trace_fitness": 1.0,
      "tokens_missing": 0,
      "tokens_remaining": 0,
      "deviations": []
    }
  ]
}
```

| Field                          | Type     | Description                                            |
| ------------------------------ | -------- | ------------------------------------------------------ |
| `avg_fitness`                  | `number` | Mean fitness across all traces (0.0–1.0)               |
| `conforming_cases`             | `number` | Traces with fitness >= 0.9 and no deviations           |
| `total_cases`                  | `number` | Total trace count                                      |
| `case_fitness`                 | `array`  | Per-trace results                                      |
| `case_fitness[].case_id`       | `string` | Zero-based trace index as string                       |
| `case_fitness[].trace_fitness` | `number` | Fraction of events with the activity attribute present |
| `case_fitness[].deviations`    | `array`  | List of `{ event_index, activity, deviation_type }`    |

**Throws** `Error` — `"Handle is not a PetriNet"` or `"PetriNet not found"` (checked first); `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const netResult = JSON.parse(pm.discover_ilp_petri_net(logHandle, 'concept:name'));
const conformance = pm.check_token_based_replay(logHandle, netResult.handle, 'concept:name');
console.log(`Avg fitness: ${conformance.avg_fitness.toFixed(3)}`);
```

---

## Utilities and Filtering

### `get_trace_count(handle)`

Returns the number of traces in an EventLog.

**Signature**

```javascript
pm.get_trace_count(handle: string): number
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** `number` — trace count

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `get_event_count(handle)`

Returns the total event count across all traces.

**Signature**

```javascript
pm.get_event_count(handle: string): number
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** `number` — total event count

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `get_activities(handle, activity_key)`

Returns all unique activity names observed in the log.

**Signature**

```javascript
pm.get_activities(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized `string[]` array of activity names (insertion order)

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `get_trace_lengths(handle)`

Returns the event count for each trace as an array.

**Signature**

```javascript
pm.get_trace_lengths(handle: string): object
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** — deserialized `number[]` array, one entry per trace

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `get_trace_length_statistics(handle)`

Returns summary statistics of trace lengths.

**Signature**

```javascript
pm.get_trace_length_statistics(handle: string): object
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** — deserialized object:

```json
{ "min": 3, "max": 27, "average": 9.6, "median": 9, "count": 500 }
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `get_attribute_names(handle)`

Returns all attribute keys used anywhere in the log (log-level, trace-level, event-level), sorted alphabetically.

**Signature**

```javascript
pm.get_attribute_names(handle: string): object
```

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `handle`  | `string` | EventLog handle |

**Returns** — deserialized `string[]` array of attribute names

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `get_activity_frequencies(handle, activity_key)`

Returns activity occurrence counts across the entire log, sorted by frequency descending.

**Signature**

```javascript
pm.get_activity_frequencies(handle: string, activity_key: string): object
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** — deserialized array of `[activity_name, count]` pairs

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const freqs = pm.get_activity_frequencies(logHandle, 'concept:name');
freqs.forEach(([name, count]) => console.log(name, count));
```

---

### `filter_log_by_activity(handle, activity_key, activity_name)`

Creates a new EventLog containing only traces that include at least one event with the specified activity.

**Signature**

```javascript
pm.filter_log_by_activity(
  handle: string,
  activity_key: string,
  activity_name: string
): object
```

| Parameter       | Type     | Description                                  |
| --------------- | -------- | -------------------------------------------- |
| `handle`        | `string` | EventLog handle                              |
| `activity_key`  | `string` | Event attribute key for activity names       |
| `activity_name` | `string` | Activity that must appear in retained traces |

**Returns** — deserialized object:

```json
{ "handle": "obj_13", "trace_count": 210, "event_count": 1980 }
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

**Example**

```javascript
const r = pm.filter_log_by_activity(logHandle, 'concept:name', 'Approve');
const filteredHandle = r.handle;
```

---

### `filter_log_by_trace_length(handle, min_length, max_length)`

Creates a new EventLog retaining only traces with event counts in `[min_length, max_length]`.

**Signature**

```javascript
pm.filter_log_by_trace_length(
  handle: string,
  min_length: number,
  max_length: number
): object
```

| Parameter    | Type     | Description                                            |
| ------------ | -------- | ------------------------------------------------------ |
| `handle`     | `string` | EventLog handle                                        |
| `min_length` | `number` | Minimum trace length inclusive (integer >= 0)          |
| `max_length` | `number` | Maximum trace length inclusive (integer >= min_length) |

**Returns** — deserialized object:

```json
{ "handle": "obj_14", "trace_count": 380, "event_count": 3600 }
```

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `calculate_trace_durations(handle, timestamp_key)`

Extracts start and end timestamps for each trace that has at least two events with `timestamp_key` attributes.

**Signature**

```javascript
pm.calculate_trace_durations(handle: string, timestamp_key: string): object
```

| Parameter       | Type     | Description                                      |
| --------------- | -------- | ------------------------------------------------ |
| `handle`        | `string` | EventLog handle                                  |
| `timestamp_key` | `string` | Event attribute key holding ISO 8601 date values |

**Returns** — deserialized array of `{ start, end, duration_str }` objects. `duration_str` is currently `"computed"` (placeholder).

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `validate_has_timestamps(handle, timestamp_key)`

Returns `true` if every event in every trace has a `timestamp_key` attribute of type Date.

**Signature**

```javascript
pm.validate_has_timestamps(handle: string, timestamp_key: string): boolean
```

| Parameter       | Type     | Description                        |
| --------------- | -------- | ---------------------------------- |
| `handle`        | `string` | EventLog handle                    |
| `timestamp_key` | `string` | Event attribute key for timestamps |

**Returns** `boolean`

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

### `validate_has_activities(handle, activity_key)`

Returns `true` if every event in every trace has an `activity_key` attribute of type String.

**Signature**

```javascript
pm.validate_has_activities(handle: string, activity_key: string): boolean
```

| Parameter      | Type     | Description                            |
| -------------- | -------- | -------------------------------------- |
| `handle`       | `string` | EventLog handle                        |
| `activity_key` | `string` | Event attribute key for activity names |

**Returns** `boolean`

**Throws** `Error` — `"Object is not an EventLog"` or `"EventLog not found"`

---

## State Management

### `object_count()`

Returns the number of objects currently held in the WASM store.

**Signature**

```javascript
pm.object_count(): number
```

**Parameters** — none

**Returns** `number`

**Throws** — never (returns 0 if state is inaccessible)

**Example**

```javascript
console.log(pm.object_count()); // 3
```

---

### `delete_object(handle)`

Deletes a single object from the WASM store. The handle becomes invalid after this call.

**Signature**

```javascript
pm.delete_object(handle: string): boolean
```

| Parameter | Type     | Description                    |
| --------- | -------- | ------------------------------ |
| `handle`  | `string` | Handle of the object to delete |

**Returns** `boolean` — `true` if the object existed and was removed; `false` if the handle was not found

**Throws** — never

**Example**

```javascript
pm.delete_object(logHandle); // free memory when done
```

---

### `clear_all_objects()`

Removes all objects from the WASM store. All existing handles become invalid.

**Signature**

```javascript
pm.clear_all_objects(): void
```

**Parameters** — none

**Returns** `void`

**Throws** — never

**Example**

```javascript
pm.clear_all_objects();
console.log(pm.object_count()); // 0
```
