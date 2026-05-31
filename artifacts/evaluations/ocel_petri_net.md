# Algorithm Evaluation: ocel_petri_net

## Metadata
- **Algorithm ID:** `ocel_petri_net`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Interface Status
- **Registry Entry:** ✅ Present
- **TypeScript Dispatch:** ✅ Present
- **CLI Surface:** ✅ Present
- **WASM Export:** ✅ Present

## Behavioral Evidence
- **Positive Cases:** 1/1 passed
- **Negative Cases:** 2/2 failed correctly
- **Invariant Cases:** 1/1 passed

## Verification
- **Evidence Hash:** `10da90f45a9cce12dffc48c1e5192e6071e35a47fe34659d72d8a1b45b797d85`
- **State:** `Closed`

## Algorithmic Role
Implements discovery of Petri net models from Object-Centric Event Logs (OCEL), allowing for the modeling of processes with interacting objects of different types. This algorithm is crucial for capturing complex multi-object relationships and synchronization in modern business processes.

## Implementation Validation & Details
Based on the source code in `wasm4pm/src/oc_petri_net.rs`:
- The algorithm flattens the Object-Centric Event Log (OCEL) into a single-type EventLog for each distinct `object_type`.
- It performs per-type discovery by extracting traces specific to each object type and computing a Petri Net using the `alpha++` algorithm.
- Places in the resulting per-type Petri nets are explicitly tagged with their corresponding `object_type`.
- The final output is a JSON mapping representing a collection of these per-type Petri nets.