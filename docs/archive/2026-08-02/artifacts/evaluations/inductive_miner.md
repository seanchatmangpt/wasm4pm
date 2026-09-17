<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-08-02/artifacts/evaluations/inductive_miner.md; source-sha256: 1e0a136f8554fb3a69b85c54deff075f9c49aef305a37e4555c4c22cca58ac00; reason: tooling or agent control surface -->

# Algorithm Evaluation: inductive_miner

## Overview
- **Algorithm ID**: `inductive_miner`
- **Category**: `discovery`
- **Summary**: A process discovery algorithm that recursively splits the event log into smaller parts based on process operators, guaranteeing sound process models.

## Status
- **Registry**: Present
- **Dispatch**: Present
- **CLI**: Present
- **WASM**: Present

## Supported Profiles
- `fast`
- `balanced`
- `quality`

## Behavior Evidence
### Positive Cases
- `inductive_miner.valid_minimal_log`: **passed**

### Negative Cases
- `inductive_miner.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
- `inductive_miner.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `inductive_miner.DeterministicSameInputCase`: **passed**

## Verification
- **Evidence Hash**: `f1a73d2a0d00e46b23372d2501b27c532adee103aad35d84eadc4049cb6af725`
- **Verification State**: `Closed`

## Implementation Validation & Details
The Inductive Miner algorithm is correctly implemented in `wasm4pm/src/streaming/streaming_inductive.rs`.

**Key Implementation Details:**
- **Paradigm:** Streaming Algorithm (`StreamingInductiveBuilder`) based on recursive process tree discovery by identifying DFG cuts. Converts findings into explicit `PetriNet` graphs.
- **Core Logic:** Accumulates DFG metrics incrementally. During `snapshot`, detects cuts using priority sequence:
  1. *Sequential Cut*: Partitions groups forming a strict topological total order.
  2. *Exclusive Cut*: Disjoint activity groups with no interconnecting edges.
  3. *Parallel Cut*: Groups containing symmetric bi-directional edges indicating concurrency.
  4. *Loop Cut*: Identifies activities with overlapping start/end sets.
  5. *Fallback*: Creates a "flower model" (a highly permissive loop net with a silent tau transition) if no distinct cut is found.
- **Data Structures:** Operates over lightweight `HashSet` maps tracking starts, ends, successors, and predecessors natively derived from integer `u32` interner IDs. Resolves findings natively to explicit Petri nets composed of `PetriNetPlace` and `PetriNetTransition` nodes without relying on third-party conversions.
