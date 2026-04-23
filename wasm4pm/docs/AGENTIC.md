# Agentic Control Primitives
## Quickstart
The `agentic` module provides lawful control primitives for `pictl`. Use these to orchestrate complex process mining workflows.

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
