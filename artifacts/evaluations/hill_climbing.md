# Algorithm Evaluation: hill_climbing

## Overview
- **Algorithm ID**: `hill_climbing`
- **Category**: `discovery`
- **Summary**: An optimization algorithm used in process discovery to iteratively improve a process model based on a fitness function by exploring local neighborhoods.

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
- `hill_climbing.valid_minimal_log`: **passed**

### Negative Cases
- `hill_climbing.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
- `hill_climbing.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `hill_climbing.DeterministicSameInputCase`: **passed**

## Verification
- **Evidence Hash**: `2b4432ed2fe58265714cdfb4353483b180b605f03e8a51e5c87914e50a813e0c`
- **Verification State**: `Closed`

## Implementation Validation & Details
The Hill Climbing algorithm is correctly implemented in `wasm4pm/src/streaming/streaming_hill_climbing.rs`.

**Key Implementation Details:**
- **Paradigm:** Local optimization over a streaming DFG implementation (`StreamingHillClimbingBuilder`). It iteratively removes the least-costly edge to maximize model simplicity without sacrificing trace fitness.
- **Core Logic:** A greedy edge-pruning procedure. Starting from the full observed DFG, it evaluates the "removal cost" of each edge. The cost is calculated as the number of traces where the edge is the *only* valid occurrence of a pair (i.e., removing it breaks the trace). Zero-cost edges (those not essential to complete any trace) are iteratively pruned until every remaining edge is essential.
- **Filtering Mechanism:** Pre-filters the candidate edges using a `noise_threshold` based on relative frequency, removing infrequent transitions before the hill climbing algorithm begins.
- **Data Structures:** To evaluate trace breaking exactly, it persists full sequences in `closed_traces` as vectors of `u32` interner IDs during ingestion. It uses `FxHashMap` and `FxHashSet` for fast counting and candidate set management.
