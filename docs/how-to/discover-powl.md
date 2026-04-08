# POWL Discovery Guide

POWL (Partially Ordered Workflow Language) discovery finds process models that preserve partial order structure — non-hierarchical dependencies that are lost in Petri Net or Process Tree conversion.

## Quick Start

```bash
# Basic discovery (default: decision_graph_cyclic variant)
pmctl powl discover -i my-log.xes

# Specify variant
pmctl powl discover -i my-log.xes --variant tree

# Custom parameters
pmctl powl discover -i my-log.xes \
  --variant decision_graph_cyclic \
  --activity-key concept:name \
  --min-trace-count 2 \
  --noise-threshold 0.1

# JSON output
pmctl powl discover -i my-log.xes --format json

# Quiet mode (suppress non-error output)
pmctl powl discover -i my-log.xes --quiet
```

## Discovery Variants

| Variant | Description | Speed | Quality |
|---------|-------------|-------|----------|
| `decision_graph_cyclic` | Cyclic decision graphs (default) | 45 | 82 |
| `decision_graph_cyclic_strict` | Strict cyclic decision graphs | 48 | 80 |
| `decision_graph_max` | Maximal decision graph cut | 55 | 78 |
| `decision_graph_clustering` | Decision graph with clustering | 60 | 80 |
| `maximal` | Maximal partial order cut | 40 | 70 |
| `dynamic_clustering` | Dynamic clustering with frequency filtering | 50 | 72 |
| `tree` | Process tree only (no partial orders) | 30 | 55 |

## Output Fields

| Field | Description |
|-------|-------------|
| `root` | Arena node index of the POWL model root |
| `node_count` | Total number of nodes in the model |
| `variant` | Discovery variant used |
| `repr` | Human-readable POWL representation string |
| `config` | Configuration used (activity_key, min_trace_count, noise_threshold) |

## POWL Representation

POWL models use the following notation:

- `A` — Labeled transition (activity)
- `τ` — Silent transition
- `X(A, B)` — XOR choice (A or B)
- `→(A, B)` — Sequence (A then B)
- `◯(A, B)` — LOOP (A repeated, optional B)
- `∧(A, B)` — Parallel (A and B, StrictPartialOrder)
- `DG(...)` — DecisionGraph (non-block-structured choice)

## Examples

### Sequential Process

```json
{
  "traces": [
    {"events": [{"concept:name": "A"}, {"concept:name": "B"}]},
    {"events": [{"concept:name": "A"}, {"concept:name": "B"}]}
  ]
}
```

Output: `→(A, B)` — Sequence of A then B

### Concurrent Process

```json
{
  "traces": [
    {"events": [{"concept:name": "A"}, {"concept:name": "B"}]},
    {"events": [{"concept:name": "B"}, {"concept:name": "A"}]}
  ]
}
```

Output: `∧(A, B)` — Partial order with A and B concurrent

### Choice Process

```json
{
  "traces": [
    {"events": [{"concept:name": "A"}]},
    {"events": [{"concept:name": "B"}]}
  ]
}
```

Output: `X(A, B)` — XOR choice between A and B

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--input` / `-i` | string | required | Path to event log (JSON or XES) |
| `--variant` | string | `decision_graph_cyclic` | Discovery variant |
| `--activity-key` | string | `concept:name` | Event attribute for activity names |
| `--min-trace-count` | number | `1` | Minimum trace count for a cut |
| `--noise-threshold` | number | `0.0` | Noise threshold for fall-through |
| `--format` | string | `human` | Output format: human or json |
| `--quiet` / `-q` | flag | false | Suppress non-error output |

## Error Handling

| Error | Exit Code | Cause |
|-------|-----------|-------|
| `Input file not found` | 2 | `--input` path doesn't exist |
| `Missing input argument` | 2 | `--input` not provided |
| `Invalid variant` | 2 | `--variant` not recognized |

## See Also

- [POWL Concepts](../explanation/powl-concepts.md) — POWL theory and notation
- [Algorithm Reference](../reference/algorithms.md) — All discovery algorithms
- `pmctl powl parse` — Parse and analyze existing POWL models
- `pmctl powl convert` — Convert POWL to BPMN/Petri Net/Process Tree
