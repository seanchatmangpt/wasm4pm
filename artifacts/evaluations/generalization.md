# Algorithm Evaluation: generalization

## Meta
- **ID**: `generalization`
- **Category**: `discovery`
- **Profiles**: `fast`, `balanced`, `quality`

## Status
- **Registry**: Present
- **Dispatch**: Present
- **CLI**: Present
- **WASM**: Present

## Behavior Evidence
- **Positive Case**: `passed`
- **Negative Cases**:
  - `MALFORMED_EVENT_LOG`: `failed_correctly`
  - `EMPTY_EVENT_LOG`: `failed_correctly`
- **Invariant Case**: `passed` (Stable: `true`)

## Evidence Hash
`b20fbdd342c5c59399ea498471f64f095bd228774b0cc0e184a4c089994a824d`

## Verification State
**Closed**

## Algorithmic Role
Measures the generalization capability of a process model, assessing how well the model can account for future, unseen process instances based on the observed log behavior. High generalization indicates a model that captures the underlying logic without over-fitting to specific log noise.

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/generalization.rs`
- **Algorithm Type**: Token-based generalization metric evaluation.
- **Implementation Mechanism**: Evaluates a model generalizability by examining how frequently its transitions fire when replaying the event log (using `ReplayNet::from_petri_net`). The calculation mirrors the token-replay approach from `pm4py`.
- **Formula**: `generalization = 1 - penalty_sum / num_visible_transitions`. 
- **Penalty Logic**: The penalty sum introduces a penalization of `1/sqrt(n)` for each visible transition, where `n` is its execution frequency. Rarely fired transitions thus incur a higher penalty, degrading the generalization score. Silent transitions are properly excluded from the calculation.
