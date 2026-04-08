# POWL API Reference

Complete reference for all POWL functions exported by the WASM module.

---

## Parsing

### `parse_powl(s: string): Result<JSON>`

Parse a POWL model string into an arena representation.

```javascript
const result = wasm.parse_powl('X(A, B)');
// => { "root": 0, "node_count": 3, "repr": "X ( A, B )" }
```

### `validate_partial_orders(s: string): Result<JSON>`

Validate that all StrictPartialOrder nodes have irreflexive, transitive order.

```javascript
const result = wasm.validate_partial_orders('PO=(nodes={A, B}, order={A-->B})');
// => { "valid": true }
```

### `powl_to_string(s: string): Result<string>`

Get the canonical string representation of a POWL model.

```javascript
const repr = wasm.powl_to_string('X( A , B )');
// => "X ( A, B )"
```

---

## Simplification

### `simplify_powl(s: string): Result<JSON>`

Simplify a POWL model (XOR/LOOP merging, nested XOR flattening, SPO inlining).

```javascript
const result = wasm.simplify_powl('X(X(A, B), C)');
// => { "root": 0, "node_count": 3, "repr": "X ( A, B, C )" }
```

### `simplify_frequent_transitions(s: string): Result<JSON>`

Simplify using FrequentTransition frequency bounds (skippable/self-loop detection).

```javascript
const result = wasm.simplify_frequent_transitions(powlString);
```

---

## Introspection

### `node_to_string(s: string, arenaIdx: number): Result<string>`

Get the string representation of a specific node in the arena.

```javascript
const nodeStr = wasm.node_to_string('X(A, B)', 1);
// => "A"
```

### `get_children(s: string, arenaIdx: number): Result<JSON>`

Get the children arena indices of a node.

```javascript
const result = wasm.get_children('X(A, B)', 0);
// => { "children": [1, 2] }
```

### `node_info_json(s: string, arenaIdx: number): Result<string>`

Get detailed JSON info about a node (type, label, edges, etc.).

```javascript
const info = JSON.parse(wasm.node_info_json('PO=(nodes={A, B}, order={A-->B})', 0));
// => {
//   "type": "strict_partial_order",
//   "children": [1, 2],
//   "edges": [[1, 2]],
//   "node_count": 2
// }
```

Node types: `transition`, `frequent_transition`, `strict_partial_order`, `operator`, `decision_graph`.

---

## Conversions

### `powl_to_petri_net(s: string): Result<string>`

Convert POWL to Petri Net JSON.

```javascript
const pn = JSON.parse(wasm.powl_to_petri_net('X(A, B)'));
// => { "net": { "places": [...], "transitions": [...], "arcs": [...] },
//      "initial_marking": {...}, "final_marking": {...} }
```

### `powl_to_process_tree(s: string): Result<string>`

Convert POWL to Process Tree JSON.

```javascript
const tree = JSON.parse(wasm.powl_to_process_tree('∧(A, B)'));
// => { "operator": "Parallel", "children": [{"label": "A"}, {"label": "B"}] }
```

### `process_tree_to_powl(treeJson: string): Result<JSON>`

Convert Process Tree JSON to POWL.

```javascript
const result = wasm.process_tree_to_powl('{"operator":"Xor","children":[{"label":"A"},{"label":"B"}]}');
// => { "root": 0, "node_count": 3, "repr": "X ( A, B )" }
```

### `petri_net_to_powl(pnJson: string): Result<JSON>`

Convert Petri Net JSON to POWL.

```javascript
const result = wasm.petri_net_to_powl(petriNetJson);
// => { "root": 0, "node_count": N, "repr": "..." }
```

### `powl_to_bpmn(s: string): Result<string>`

Convert POWL to BPMN 2.0 XML.

```javascript
const bpmnXml = wasm.powl_to_bpmn('X(A, B)');
// => "<?xml version=\"1.0\"?><definitions ...>...</definitions>"
```

---

## Conformance

### `token_replay_fitness(powlStr: string, logJson: string): Result<string>`

Compute token replay fitness for a POWL model against an event log.

```javascript
const fitness = JSON.parse(wasm.token_replay_fitness(
  '→(A, B, C)',
  JSON.stringify({
    traces: [
      { case_id: 'c1', events: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
      { case_id: 'c2', events: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }
    ]
  })
));
// => { "percentage": 100.0, "total_traces": 2, "avg_trace_fitness": 1.0, ... }
```

---

## Analysis

### `measure_complexity(s: string): Result<string>`

Measure complexity metrics for a POWL model.

```javascript
const metrics = JSON.parse(wasm.measure_complexity('X(A, B, C)'));
// => {
//   "cyclomatic": 3,
//   "cfc": 1.5,
//   "cognitive": 2.0,
//   "halstead": { "volume": 12.0, ... },
//   "activity_count": 3,
//   "node_count": 4
// }
```

### `diff_models(modelAStr: string, modelBStr: string): Result<string>`

Structural + behavioral comparison of two POWL models.

```javascript
const diff = JSON.parse(wasm.diff_models('X(A, B)', 'X(A, B, C)'));
// => {
//   "severity": "Moderate",
//   "always_changes": [...],
//   "order_changes": [...],
//   "structure_changes": [...],
//   "added_activities": ["C"],
//   "removed_activities": []
// }
```

### `powl_footprints(s: string): Result<string>`

Compute behavioral footprints for a POWL model.

```javascript
const fp = JSON.parse(wasm.powl_footprints('PO=(nodes={A, B, C}, order={A-->B, A-->C})'));
// => {
//   "start_activities": ["A"],
//   "end_activities": ["B", "C"],
//   "parallel": [["B", "C"]],
//   "sequence": [["A", "B"], ["A", "C"]]
// }
```

---

## Discovery

### `discover_powl_from_log(logJson: string, variant: string): Result<JSON>`

Discover a POWL model from an event log.

**Variants**: `decision_graph_cyclic` (default), `decision_graph_cyclic_strict`, `decision_graph_max`, `decision_graph_clustering`, `dynamic_clustering`, `maximal`, `tree`

```javascript
const result = wasm.discover_powl_from_log(eventLogJson, 'decision_graph_cyclic');
// => { "root": 0, "node_count": 15, "repr": "PO=(nodes={...}, order={...})", "variant": "decision_graph_cyclic" }
```

### `discover_powl_from_log_config(logJson, activityKey, variant, minTraceCount, noiseThreshold): Result<JSON>`

Discover POWL with custom configuration.

```javascript
const result = wasm.discover_powl_from_log_config(
  eventLogJson,
  'concept:name',    // activity key
  'decision_graph_cyclic',
  2,                  // min_trace_count
  0.1                 // noise_threshold
);
```

### `discover_powl_from_partial_orders(logJson: string, variant: string): Result<JSON>`

Discover POWL from partially ordered event log (lifecycle events).

```javascript
const result = wasm.discover_powl_from_partial_orders(partialOrderLogJson, 'decision_graph_cyclic');
// => { "root": 0, "node_count": N, "repr": "...", "variant": "...", "partial_order": true }
```

### `discover_ocel_powl(ocelJson: string, variant: string): Result<JSON>`

Discover POWL from OCEL event log.

**OCEL variants**: `flattening`, `oc_powl`

```javascript
const result = wasm.discover_ocel_powl(ocelLogJson, 'flattening');
// => { "root": 0, "node_count": N, "repr": "...", "ocel_variant": "flattening" }
```

---

## See Also

- [POWL Concepts](../explanation/powl-concepts.md) — Theory and notation
- [POWL Conversion Guide](../how-to/powl-conversion.md) — Conversion examples
- [Algorithm Matrix](./algorithms.md) — All algorithms including POWL variants
