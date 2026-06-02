# Algorithm Evaluation: ilp

## Overview
- **Algorithm ID**: `ilp`
- **Category**: `discovery`
- **Summary**: Uses Integer Linear Programming for process discovery to find the optimal process model that satisfies specific constraints expressed as linear equations.

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
- `ilp.valid_minimal_log`: **passed**

### Negative Cases
- `ilp.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
- `ilp.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `ilp.DeterministicSameInputCase`: **passed**

## Verification
- **Evidence Hash**: `af7b36a335ed902946a7d803c14f7a18b379d92400c8b46b544f7753f88513bc`
- **Verification State**: `Closed`

## Implementation Validation & Details
The ILP (Integer Linear Programming) algorithm is correctly implemented in `wasm4pm/src/ilp_discovery.rs`.

**Key Implementation Details:**
- **Paradigm:** Region-based, ILP-inspired constraint optimization that produces explicit `PetriNet` models capturing true concurrency rather than flat DFG projections.
- **Core Logic:** Operates via a 4-stage pipeline:
  1. Identifies causal, parallel, and self-loop pairs from the raw directly-follows frequencies.
  2. Generates candidate `PetriNetPlace` objects covering 1-to-1 causal relationships, AND-splits, and AND-joins.
  3. Validates each candidate using simulated token replay; a place is considered "consistent" only if no trace causes a token deficit during traversal.
  4. Resolves the optimal process topology by applying a Greedy Set-Cover algorithm (`ilp_greedy_cover`) to select the smallest minimal set of consistent places that completely explains all observed causal pairs.
- **Fitness Mechanism:** Instead of estimating fitness through DFG fitting, it performs exact token replay against the newly generated Petri net. It additionally calculates model simplicity by comparing the produced structural complexity against the theoretical linear minimum.
- **Data Structures:** Heavily leverages standard sets (`HashSet`) and maps (`FxHashMap`) to rapidly track and intersect causal relationships against candidate subsets.
