<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/wasm4pm_docs/AGENTIC.md; source-sha256: 92c9f04dd7b195114770a0491aa8841071f86498a354e70a87908ac15212ec52; reason: tooling or agent control surface -->

# Agentic Control Primitives

## Quickstart

The `agentic` module provides lawful control primitives for `wpm` (wasm4pm). Use these to orchestrate complex process mining workflows.

### Components

- `RoleSelector`: Determines the best agent for a task phase.
- `TaskDecomposer`: Maps risk and phase to an optimal swarm topology.
- `HandoffValidator`: Ensures secure transition between agent roles.

### Example

```rust
use wasm4pm::agentic::prelude::*;

let policy = TopologyPolicy;
let task = TaskContext {
    risk_level: RiskLevel::Medium,
    phase: WorkflowPhase::Plan,
    ..Default::default()
};

let topologies = policy.allowed_topologies(&task).unwrap();
assert!(topologies.contains(&SwarmTopology::Pipeline));
```
