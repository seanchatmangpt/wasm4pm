# Algorithm Evaluation: monte_carlo_simulation

## Overview
- **Algorithm ID:** `monte_carlo_simulation`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✅ Present
- **Dispatch:** ✅ Present
- **CLI:** ✅ Present
- **WASM:** ✅ Present

## Behavior Evidence
### Positive Cases
- `monte_carlo_simulation.valid_minimal_log`: ✅ Passed (Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`)

### Negative Cases
- `monte_carlo_simulation.MalformedLogCase`: ✅ Failed Correctly (Error Code: `MALFORMED_EVENT_LOG`)
- `monte_carlo_simulation.EmptyLogCase`: ✅ Failed Correctly (Error Code: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `monte_carlo_simulation.DeterministicSameInputCase`: ✅ Passed (Stable: true)

## Evidence Binding
- **Algorithm Evidence Hash:** `28a6caeee5dfdf2f5e07763502eaa623763793c42090ca2a537a92c8b755070f`
- **Verification State:** `Closed`

## Algorithmic Role
Run Monte Carlo simulation with stochastic replay for probabilistic process analysis. It simulates event log generation or model execution to estimate performance metrics and behavior distributions under uncertainty.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/montecarlo.rs`
- **Core Logic:** A discrete-event simulation that processes traces extracted from an `EventLog`. It simulates case execution by generating inter-arrival times and executing activities sequentially for each trace.
- **Distributions:** Activity service times are sampled from a Log-Normal distribution parameterized by mean and standard deviation. The implementation robustly converts these back to the underlying normal distribution parameters ($\mu$ and $\sigma$).
- **Resource Constraints:** Supports resource capacity constraints mapped via an `"{activity}_resource"` key. If resource capacity is exhausted, the simulation calculates waiting times before executing the activity.
- **Metrics Computation:** Aggregates and calculates extensive statistics including total and average sojourn times, total service and waiting times, average trace length, resource utilization, and per-activity service and waiting metrics. Also computes P5, P50 (median), and P95 percentiles for per-case sojourn times via linear interpolation.
- **Determinism:** Seeded random number generator (`StdRng::seed_from_u64`) enables completely deterministic replays and results matching.