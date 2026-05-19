# POWL Conversion Guide

Convert POWL models to and from BPMN, Petri Nets, and Process Trees.

---

## Prerequisites

```javascript
const wasm = require('wasm4pm');
await wasm.init();
```

---

## POWL to BPMN

Convert a POWL model to BPMN 2.0 XML for use in BPMN tools (Camunda, Signavio, Bizagi).

```javascript
const powl = 'PO=(nodes={A, B, C}, order={A-->B, A-->C})';
const bpmnXml = wasm.powl_to_bpmn(powl);

console.log(bpmnXml);
// => <?xml version="1.0" encoding="UTF-8"?>
//    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ...>
//      <parallelGateway id="fork_1" .../>
//      ...
//    </definitions>
```

**Output**: Valid BPMN 2.0 XML string. Save to `.bpmn` or `.bpmn20.xml` file.

---

## POWL to Petri Net

Convert a POWL model to a Petri Net (places, transitions, arcs, markings).

```javascript
const powl = 'X(A, B)';
const pnJson = wasm.powl_to_petri_net(powl);
const pn = JSON.parse(pnJson);

console.log('Places:', pn.net.places.length);
console.log('Transitions:', pn.net.transitions.length);
console.log('Arcs:', pn.net.arcs.length);
console.log('Initial marking:', pn.initial_marking);
console.log('Final marking:', pn.final_marking);
```

**Output**: JSON object with `net` (places, transitions, arcs), `initial_marking`, and `final_marking`.

---

## POWL to Process Tree

Convert a POWL model to a Process Tree.

```javascript
const powl = 'PO=(nodes={A, B, C}, order={A-->B, A-->C})';
const treeJson = wasm.powl_to_process_tree(powl);
const tree = JSON.parse(treeJson);

console.log(tree);
// => { "operator": "Parallel", "children": [
//      { "operator": "Sequence", "children": [{"label": "A"}, {"label": "B"}] },
//      { "label": "C" }
//    ]}
```

**Output**: JSON Process Tree with `operator`/`label`/`children` nodes.

---

## Process Tree to POWL (Reverse)

Convert a Process Tree back to POWL notation.

```javascript
const treeJson = JSON.stringify({
  operator: 'Xor',
  children: [{ label: 'A' }, { label: 'B' }]
});

const result = JSON.parse(wasm.process_tree_to_powl(treeJson));
console.log(result.repr);
// => X ( A, B )
```

---

## Petri Net to POWL (Reverse)

Convert a Petri Net back to POWL notation.

```javascript
const pnJson = JSON.stringify({
  net: {
    places: [{ id: 'p1' }, { id: 'p2' }],
    transitions: [{ id: 't1', label: 'A' }, { id: 't2', label: 'B' }],
    arcs: [
      { source: 'p1', target: 't1' },
      { source: 't1', target: 'p2' },
      { source: 'p2', target: 't2' }
    ]
  },
  initial_marking: { p1: 1 },
  final_marking: { /* ... */ }
});

const result = JSON.parse(wasm.petri_net_to_powl(pnJson));
console.log(result.repr);
// => → ( A, B )
```

---

## When to Convert

| Target Format | Use When |
|---------------|----------|
| **BPMN** | Sharing with business stakeholders, importing into BPMN tools, process documentation |
| **Petri Net** | Soundness verification, token-based conformance checking, academic analysis |
| **Process Tree** | Block-structured analysis, inductive miner comparison, process tree querying |

---

## See Also

- [POWL Concepts](../explanation/powl-concepts.md) — POWL notation and theory
- [POWL API Reference](../reference/powl-api.md) — All conversion function signatures
