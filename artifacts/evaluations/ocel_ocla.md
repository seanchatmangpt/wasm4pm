# Algorithm Evaluation: ocel_ocla

## Overview
- **Algorithm ID:** `ocel_ocla`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✅ Present
- **Dispatch:** ✅ Present
- **CLI:** ✅ Present
- **WASM:** ✅ Present

## Behavior Evidence
### Positive Cases
- `ocel_ocla.valid_minimal_log`: ✅ Passed (Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`)

### Negative Cases
- `ocel_ocla.MalformedLogCase`: ✅ Failed Correctly (Error Code: `MALFORMED_EVENT_LOG`)
- `ocel_ocla.EmptyLogCase`: ✅ Failed Correctly (Error Code: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `ocel_ocla.DeterministicSameInputCase`: ✅ Passed (Stable: true)

## Evidence Binding
- **Algorithm Evidence Hash:** `891c3aefae7d0f837145ce70422db86840ca0fa37050f1f6bfa1134cd3e2ae4e`
- **Verification State:** `Closed`

## Algorithmic Role
Discover Object-Centric Language Abstraction (OCLA) from an OCEL. Captures the language of events per object type and their interactions, abstracting complex event sequences into higher-level behavioral patterns.

## Implementation Validation & Details
- **Source Module:** `wasm4pm/src/advanced/ocla.rs`
- **WASM Export:** `discover_ocla_wasm(ocel_handle: &str)`
- **Core Logic:**
  1. Maps object IDs to their respective object types and collects chronologically sorted event traces for each object instance.
  2. Extracts the first and last events from each object instance trace to populate sets of start (`start_ev_types`) and end (`end_ev_types`) event types per object type.
  3. Applies a sliding window over the chronological event traces to extract all directly-follows pairwise relationships between adjacent events.
  4. Formalizes the output in the `OCLanguageAbstraction` structure, grouping the discovered behavioral abstractions explicitly by object type to reflect the footprint representation of the object-centric log.