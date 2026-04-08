# POWL Concepts — Partially Ordered Workflow Language

POWL (Partially Ordered Workflow Language) is a process model notation that natively represents **concurrent activities** using partial orders. Unlike block-structured notations (Process Trees) or marking-based notations (Petri Nets), POWL makes concurrency a first-class citizen.

---

## Why POWL Matters

Traditional process discovery algorithms produce either **Petri Nets** or **Process Trees**. Both have limitations when representing real-world concurrency:

| Notation | Concurrency | Block Structure | Non-Block Choice |
|----------|-------------|-----------------|------------------|
| **Petri Net** | Yes (places/tokens) | No | Yes |
| **Process Tree** | Yes (parallel operator) | Yes (required) | No |
| **POWL** | Yes (native partial order) | Optional | Yes (DecisionGraph) |

**POWL's advantage**: It preserves partial order information from the event log that Petri Net conversions lose, while also supporting non-block-structured choice that Process Trees cannot represent.

---

## POWL Notation

### Atomic Activities

An activity is represented by its label:

```
A          — activity "A"
Submit     — activity "Submit"
Review_PO  — activity "Review PO"
```

The silent activity (invisible task) is written as:

```
τ          — tau (silent/empty transition)
```

### Operators

| Operator | Symbol | Meaning |
|----------|--------|---------|
| **XOR (exclusive choice)** | `X(...)` | Exactly one branch executes |
| **Sequence** | `→(...)` | Left-to-right execution order |
| **Loop** | `◯(...)` | Repeat; zero or more iterations |
| **Parallel (AND)** | `∧(...)` | All branches execute concurrently |

Examples:
```
X(A, B)          — choose A or B
→(A, B)          — do A, then B
◯(A, B)          — do A, then optionally repeat
∧(A, B)          — do A and B concurrently
```

### Partial Orders

A Strict Partial Order (SPO) represents concurrent activities with ordering constraints:

```
PO=(nodes={A, B, C}, order={A-->B, A-->C})
```

This means: A happens before both B and C, but B and C are concurrent (no ordering between them).

Nested partial orders are supported:
```
PO=(nodes={login, PO=(nodes={select_items, set_payment_method}, order={}), checkout},
     order={login-->PO=(...), PO=(...)>-->checkout})
```

### DecisionGraph

A DecisionGraph represents **non-block-structured choice** — choices that cannot be expressed as nested XOR operators. This is the key differentiator from Process Trees.

```
DG(start={s}, end={e}, nodes={s, A, B, C, e}, order={s-->A, A-->B, A-->C, B-->e, C-->e})
```

DecisionGraph uses start/end sentinel nodes to mark entry and exit points. The process can choose path A→B→e or A→C→e from a shared decision point.

---

## When to Use POWL vs Process Trees

### Use POWL when:

- Your event log has **concurrent activities** that aren't strictly nested
- You need to preserve **partial order information** from the log
- The process has **non-block-structured choices** (e.g., overlapping branches)
- You want the most **expressive model** from discovery

### Use Process Trees when:

- You need a **block-structured** model for analysis or execution
- You want to use tools that only support block-structured notation
- The process is known to be block-structured

### Use Petri Nets when:

- You need **marking-based execution semantics**
- You're integrating with Petri Net analysis tools
- You need to verify **soundness properties** (deadlock freedom, liveness)

---

## Theoretical Foundation

POWL is based on the work of:

- **Kourani & van der Aalst (2023)**: "Partially Ordered Workflow Language (POWL): A Language with First-Class Partial Orders" — Introduces POWL notation, DecisionGraph, and discovery algorithms
- **van der Aalst (2016)**: "Process Mining: Data Science in Action" — Foundation of process discovery theory

### Soundness

POWL models discovered by wasm4pm satisfy:
- **Deadlock freedom**: No reachable state where all activities are blocked
- **Proper completion**: Every execution path reaches an end state
- **Optional soundness**: The underlying Petri Net (from conversion) satisfies the classic soundness property

---

## POWL in wasm4pm

### 8 Discovery Variants

| Variant | ID | Description |
|---------|----|-------------|
| **DecisionGraph Cyclic** | `decision_graph_cyclic` | Default. Handles cyclic processes with DecisionGraph choice |
| **DecisionGraph Cyclic Strict** | `decision_graph_cyclic_strict` | Stricter cut detection, fewer false positives |
| **DecisionGraph Max** | `decision_graph_max` | Maximum edge detection in DecisionGraph |
| **DecisionGraph Clustering** | `decision_graph_clustering` | Clustering-based cut detection |
| **Dynamic Clustering** | `dynamic_clustering` | Adaptive clustering during discovery |
| **Maximal** | `maximal` | Maximum concurrency detection |
| **Tree** | `tree` | Block-structured only (Process Tree subset) |
| **OCEL Flattening** | `flattening` | OCEL logs flattened to case-centric |
| **OCEL POWL** | `oc_powl` | Native OCEL POWL discovery |

### Performance

All POWL variants run at approximately the same speed (~360K events/sec on BPI 2020). Variant selection should be based on **model quality**, not performance.

### See Also

- [POWL API Reference](../reference/powl-api.md) — Complete function reference
- [POWL Conversion Guide](../how-to/powl-conversion.md) — Convert POWL to/from other formats
- [How to Discover POWL](../how-to/discover-powl.md) — Practical discovery tutorial
- [Blue Ocean Strategy](./blue-ocean-strategy.md) — Competitive positioning with benchmarks
