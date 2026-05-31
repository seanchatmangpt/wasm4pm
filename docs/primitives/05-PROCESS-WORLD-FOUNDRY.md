# Agent 6 — Process-world foundry agent

## Mission
Build the generator family from the papers. Given a domain (e.g. Order-to-Cash
Object-Centric World), manufacture OCEL v2 log, POWL 2.0 model, WF-net projection,
positive/negative traces.

## Status
Partially implemented. Discovery and Petri-net playout exist; coordinated world
generation from a single domain spec is not yet wired end-to-end.

---

## What already exists

| Module | File | Purpose |
|--------|------|---------|
| DFG discovery | `wasm4pm/src/discovery.rs` | `discover_dfg_from_log` — pure-Rust, deterministic |
| Inductive Miner | `wasm4pm/src/more_discovery.rs` | `discover_inductive_miner_from_log` — returns process tree |
| A\* / Heuristic / Genetic | `wasm4pm/src/fast_discovery.rs`, `genetic_discovery.rs` | Stochastic discovery with seed 42 |
| Object-centric Petri net | `wasm4pm/src/oc_petri_net.rs` | `discover_oc_petri_net` — per-type Alpha++ / heuristic |
| Petri-net playout | `wasm4pm/src/petri_net_playout.rs` | Token-replay simulation → positive trace set |
| Petri-net structures | `wasm4pm/src/powl_petri_net.rs` | `Place`, `Transition`, `Arc`, `Marking` data model |
| POWL → Petri net | `wasm4pm/src/powl_to_process_tree.rs` | Structural conversion |

## What is planned (not yet implemented)

- **World-spec DSL**: A declarative descriptor (YAML/JSON) naming a domain,
  its object types, and activity grammar; drives all downstream generation.
- **Coordinated generator**: One call that emits: OCEL v2 log + POWL model +
  WF-net projection + positive-trace corpus + negative-trace corpus.
- **Domain library**: Pre-packaged world specs for Order-to-Cash, Sepsis,
  BPI 2020 Travel Permits, and Loan Application.

---

## Key APIs (existing)

```
// Positive traces from a discovered Petri net
discover_inductive_miner(handle, activity_key) → ProcessTree JSON
petri_net_playout(pn_handle, config_json) → { traces[], deadlocks, all_complete }
discover_oc_petri_net(ocel_handle, algorithm) → { <ObjectType>: PetriNet }
```

Output shapes follow the handle pattern: load an event log, receive an opaque
handle string, pass it to discovery/playout functions.

---

## Paper grounding

Van der Aalst, "Process Mining" (3rd ed.) §6.1–§6.4: discovery algorithms as
generators of sound WF-net models. OCEL 2.0 standard: object-centric log as
ground truth for multi-object process worlds.

---

## Acceptance sequence

1. `cargo test --test algorithm_integration_tests` — existing discovery passes
2. `cargo test --test negative_quality` — discovered models reject impossible logs
3. **Planned**: `cargo test --test world_foundry` — end-to-end domain → log + model
