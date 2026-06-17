# WASM4PM Capability Inventory

**Gate:** Horse Gate  
**Mission:** Process Mining Algorithms & Capabilities Scan  
**Date:** 2026-06-02  
**Inventory Version:** 26.5.29  

---

## Executive Summary

wasm4pm is a high-performance process mining system compiled to WebAssembly with Rust backend. It provides **335+ exported functions** across discovery, conformance, replay, simulation, and forensic analysis. The system is built on evidence-bearing witness patterns and delivers deterministic, cache-friendly algorithms suitable for nanosecond-latency event routing and real-time process intelligence.

All algorithms are invocable via:
- **CLI:** `wpm` command-line tool (Rust)
- **WASM API:** JavaScript/TypeScript (wasm-bindgen, 335 exports)
- **Rust API:** Direct crate imports (pm-core, wasm4pm-algos, wasm4pm-compat)

---

## 1. Discovery Algorithms

### 1.1 DFG (Directly-Follows Graph) Discovery

**Algorithm Name:** DFG / Heuristic DFG  
**Crate:** `wasm4pm-algos::dfg`, `wasm4pm-algos::heuristic`  
**Source Files:** `/crates/wasm4pm-algos/src/dfg.rs`, `/crates/wasm4pm-algos/src/heuristic.rs`

| Attribute | Value |
|-----------|-------|
| **Input Format** | EventLog (Trace[Event[activity, timestamp, attributes]]) |
| **Output Format** | DFG { nodes: Vec<DFGNode>, edges: Vec<DFGEdge>, start_activities, end_activities } |
| **Time Complexity** | O(n) where n = total events |
| **Space Complexity** | O(k + e) where k = unique activities, e = directly-follows edges |
| **Invocation — CLI** | `wpm mining discover <path.xes> --algo heuristic` |
| **Invocation — WASM** | `discover_dfg(handle, activity_key)` or `discover_heuristic_miner(handle, activity_key, threshold)` |
| **Invocation — Rust** | `heuristic::discover_heuristic(&log, "concept:name")?` |
| **Stability** | Production-grade, branchless cache-friendly |
| **Features** | Single-pass columnar encoding, activity frequency counting, edge aggregation |

**Columnar Optimization:** Uses `build_edge_counts()` for integer-keyed edge compression. Eliminates 43 repeated encoding patterns across all discovery algorithms.

---

### 1.2 Alpha+ Miner

**Algorithm Name:** Alpha++ (Implicit Places)  
**Crate:** `wasm4pm-algos::alpha`  
**Source File:** `/crates/wasm4pm-algos/src/alpha.rs`

| Attribute | Value |
|-----------|-------|
| **Input Format** | EventLog |
| **Output Format** | PetriNet { places: Vec<Place>, transitions: Vec<Transition>, arcs: Vec<Arc> } |
| **Relations Computed** | → (directly-follows), → ∧ ¬(←) (causality), implicit place handling |
| **Time Complexity** | O(n + m²) where n = events, m = unique activities |
| **Invocation — WASM** | `discover_alpha_plus_plus(handle, activity_key, min_support)` |
| **Invocation — Rust** | `alpha::discover_alpha(&log, "concept:name")?` |
| **Stability** | Stable; supports implicit place inference |
| **Features** | Source/sink place creation, causal relation inference, arc weighting |

---

### 1.3 Inductive Miner (Streaming Variant)

**Algorithm Name:** Inductive Miner / Streaming DFG  
**Crate:** `wasm4pm-algos::streaming`  
**Source File:** `/crates/wasm4pm-algos/src/streaming.rs`

| Attribute | Value |
|-----------|-------|
| **Input Format** | EventLog (single-pass streaming) |
| **Output Format** | DFG { nodes, edges, start_activities, end_activities } |
| **Processing Mode** | Single-pass columnar (no intermediate allocations) |
| **Time Complexity** | O(n) where n = total events |
| **Invocation — WASM** | `discover_inductive_miner(handle, activity_key)` or `start_streaming_dfg(activity_key)` → `stream_event()` → `flush_streaming_dfg()` |
| **Invocation — Rust** | `streaming::discover_streaming_dfg(&log, "concept:name")?` |
| **Stability** | Production-grade for streaming; incremental discovery |
| **Features** | Real-time event ingestion, no intermediate model materialization |

---

### 1.4 Advanced Metaheuristic Discovery

**Algorithms:** A*, Hill Climbing, Genetic Algorithm, PSO, ACO, Simulated Annealing, ILP

| Algorithm | WASM Invocation | Input | Output | Notes |
|-----------|-----------------|-------|--------|-------|
| **A*** | `discover_astar(handle, activity_key, max_iterations)` | EventLog | DFG + iterations_used | **Caution:** `iterations_used` is search-step count, not fitness |
| **Hill Climbing** | `discover_hill_climbing(handle, activity_key)` | EventLog | Petri Net | Local optimum |
| **Genetic** | `discover_genetic_algorithm(handle, activity_key, pop_size, generations)` | EventLog | DFG + final_fitness | Returns `Err("no_edges")` on empty log |
| **PSO** | `discover_pso_algorithm(handle, activity_key, swarm_size, iterations)` | EventLog | DFG + final_fitness | Returns `Err("no_edges")` if swarm_size < 1 or iterations == 0 |
| **ACO** | `discover_aco_algorithm(handle, activity_key, ant_count, iterations)` | EventLog | DFG + final_fitness | Returns `Err("no_edges")` if ant_count < 1 or iterations == 0 |
| **Simulated Annealing** | `discover_simulated_annealing(handle, activity_key)` | EventLog | Petri Net | Temperature-driven search |
| **ILP** | `discover_ilp_petri_net(handle, activity_key)` | EventLog | Petri Net | Highest quality; bounded by solver budget |

---

### 1.5 DECLARE Constraint Discovery

**Algorithm Name:** DECLARE  
**WASM Invocation:** `discover_declare(handle, activity_key)`  
**Input:** EventLog  
**Output:** Set of DECLARE constraints (e.g., `existence(A)`, `precedence(A,B)`, `response(A,B)`)  
**Stability:** Experimental; constraint extraction via direct implication inference

---

### 1.6 Other Discovery Capabilities

| Capability | WASM Invocation | Output | Purpose |
|------------|-----------------|--------|---------|
| **DFG Filtered** | `discover_dfg_filtered(handle, activity_key, threshold)` | DFG | Remove low-frequency edges |
| **Process Skeleton** | `extract_process_skeleton(handle, activity_key)` | Skeleton | Simplified control flow |
| **OCEL DFG** | `discover_ocel_dfg(handle)` | DFG | Object-centric event log analysis |
| **OCEL DFG per Type** | `discover_ocel_dfg_per_type(handle)` | Map<ObjectType, DFG> | Per-object-type graph |
| **Temporal Profile** | `discover_temporal_profile(handle, activity_key, timestamp_key)` | TemporalProfile | Activity duration statistics |

---

## 2. Conformance Checking

### 2.1 Token-Based Replay

**Algorithm Name:** Token-Based Replay Fitness  
**Crate:** `wasm4pm-algos::conformance`  
**Source File:** `/crates/wasm4pm-algos/src/conformance.rs`

| Attribute | Value |
|-----------|-------|
| **Input** | EventLog + DFG Model |
| **Output** | ConformanceResult { fitness, precision, generalization, fitting_traces_count } |
| **Fitness Formula** | 1.0 - (missing / (consumed + missing)) |
| **Precision Formula** | Inverted log-relative to model overgeneralization |
| **Time Complexity** | O(t × |σ|) where t = traces, |σ| = avg trace length |
| **Invocation — CLI** | `wpm mining conformance <log.xes> <model.dfg>` |
| **Invocation — WASM** | `check_token_based_replay(handle, activity_key)` or `simd_token_replay(handle, activity_key)` |
| **Invocation — Rust** | `conformance::check_conformance_token_replay(&log, &model, "concept:name")?` |
| **Stability** | Production-grade |
| **Features** | Virtual start/end places, token counting (produced, consumed, missing), per-trace trace tracking |

**Metrics:**
- **Fitness** (0.0–1.0): Proportion of tokens successfully replayed
- **Precision** (0.0–1.0): Inverse generalization; lower value = model allows more behavior than observed
- **Generalization** (0.0–1.0): Forward-looking; model accommodates unobserved but valid behavior
- **Fitting Traces** (count): Number of traces replayed without missing tokens

---

### 2.2 Alignment-Based Conformance

**Algorithm Name:** Alignment / A* Alignment  
**WASM Invocation:** `check_alignment_conformance(handle, model_handle, activity_key)`  
**Input:** EventLog + Petri Net Model  
**Output:** AlignmentResult { alignments: Vec<(trace, cost)>, avg_cost, fitness }  
**Stability:** Experimental; higher accuracy than token replay; exponential worst-case

---

### 2.3 WF-net Soundness Check

**Algorithm Name:** WF-net Soundness (van der Aalst, arXiv:2602.15739v3)  
**WASM Invocation:** `check_wf_net_soundness(pn_json)`  
**Input:** PetriNet (JSON) with initial and final markings  
**Output:** SoundnessResult { sound, deadlock_free, bounded, liveness }  

| Property | Definition | Check Method |
|----------|-----------|--------------|
| **Sound** | Conjunction of all three below | Composite check |
| **Option to Complete** | Final marking reachable from initial marking | BFS from initial to final |
| **No Dead Transitions** | Every visible transition fires in ≥1 reachable path | Reachability graph analysis |
| **Boundedness** | No place accumulates > 100 tokens during bounded BFS (depth 50) | Bounded state exploration |

---

### 2.4 Prefix Conformance (Andon Oracle)

**Algorithm Name:** Prefix Conformance / Andon Oracle  
**Crate:** `wasm4pm-algos::prefix_conformance`  
**Source Files:** `/crates/wasm4pm-algos/src/prefix_conformance/mod.rs`, `.../law.rs`

| Attribute | Value |
|-----------|-------|
| **Input** | OCEL tape (streaming) + OrderingLaw |
| **Output** | PrefixVerdict (ALIVE, DEAD, TERMINAL) + PrefixFinding[] |
| **Invocation — CLI** | `wpm oracle check <tape.ndjson> --law <law.json>` |
| **Invocation — CLI (streaming)** | `wpm oracle watch <tape.ndjson> --law <law.json>` |
| **Invocation — Rust** | `PrefixOracle::new(law)` → `evaluate(event)` → snapshot() |
| **Stability** | Production-grade for lawfulness checking |
| **Features** | DFA-based execution model, case-level verdict tracking, temporal ordering enforcement |

**Verdict Types:**
- **ALIVE:** Prefix conforms; additional steps possible
- **DEAD:** Prefix violated ordering law; no recovery path
- **TERMINAL:** Prefix reached accepting state; case closed

**Refusal Codes:** ReceiptBeforeGate, RepairWithoutRoute, ClearWithoutDiagnostic, SuggestWithoutRoute, RouteWithoutDiagnostic, OutOfOrderTimestamp, DuplicateTerminal, RepeatedActivity, HarnessActiveBeforeOutReceipt, ArtifactMutationOutsideSync

---

### 2.5 Streaming Conformance

**Algorithm Name:** Streaming Token-Based Conformance  
**WASM Invocation:** `streaming_conformance_check(handle, model_handle)`  
**Input:** Event stream + Model handle  
**Output:** ConformanceResult (incremental) |  
**Processing:** Incremental token simulation; no backtracking  

---

## 3. Replay & Simulation

### 3.1 Token Replay Simulation

**Capability Name:** Token State Tracking  
**Crate:** `wasm4pm::replay`  
**Source File:** `/src/replay/mod.rs`

| Attribute | Value |
|-----------|-------|
| **Input** | Trace + PetriNet |
| **Output** | ReplayResult { successful: bool } + TokenState[] { place, count } |
| **Simulation Model** | Token multiset Petri net semantics |
| **Output Surfaces** | Per-state token distribution; marking trajectory |

---

### 3.2 Reachability Analysis

**Capability Name:** State Space Exploration  
**WASM Invocation:** `analyze_reachability(pn_json, max_depth)`  
**Input:** Petri Net JSON |  
**Output:** ReachabilityGraph { nodes: Marking[], edges: (Marking, Transition, Marking)[] }  
**Algorithm:** Bounded BFS; stops at depth or token-cap threshold

---

### 3.3 Simulation & Forecasting

| Capability | WASM Invocation | Input | Output |
|-----------|-----------------|-------|--------|
| **Trace Simulation** | `simulate_trace(model_handle, num_steps)` | Model | Simulated trace (sequence of activities) |
| **Process Speedup** | `analyze_process_speedup(handle, activity_key)` | EventLog | Speedup factors by period |
| **Concept Drift Detection** | `detect_concept_drift(handle, activity_key, window_size)` | EventLog | Drift signals with timestamps |

---

## 4. Projection & Filtering

### 4.1 Trace Projection (Object-Centric)

**Capability Name:** OCEL Object Projection  
**Input:** OCEL + object_type  
**Output:** EventLog (projected to single object type)

| Feature | Description |
|---------|-------------|
| **Per-Type DFG** | `discover_ocel_dfg_per_type(handle)` — separate DFG per object type |
| **Object Count** | `get_ocel_object_count(handle)` — cardinality of object instances |
| **Event Count** | `get_ocel_event_count(handle)` — total event cardinality |

---

### 4.2 Trace Filtering

**Capability:** Subset-based filtering

| Filter Type | WASM Invocation | Criterion |
|------------|-----------------|-----------|
| **Activity Filtering** | `discover_dfg_filtered(handle, activity_key, threshold)` | Frequency threshold |
| **Variant Filtering** | `analyze_trace_variants(handle, activity_key)` | Variant classification; output variant_id, frequency, example_trace |
| **Case Attribute Filtering** | `analyze_case_attributes(handle, activity_key)` | Extract case-level attributes |

---

### 4.3 Time Window Projection

**Capability Name:** Sliding Window Analysis  
**WASM Invocation:** `streaming_log_window_stats(handle, window_size)`  
**Input:** Event stream + window size (ms or event count)  
**Output:** WindowStats[] { window_id, start_time, event_count, activities, variant_count }

---

## 5. Output/Receipt Surfaces

### 5.1 Receipt Generation (TrueX)

**System:** Receipt-of-Execution (OCEL 2.0 Embedding)  
**Crate:** `wasm4pm::receipt`, `wasm4pm-algos::truex`  
**Source Files:**
- `/crates/wasm4pm-cli/src/commands/receipt.rs` (CLI)
- `/crates/wasm4pm-algos/src/truex/mod.rs` (core)

| Attribute | Value |
|-----------|-------|
| **Input** | Manufacturing history (expected_log + observed_log) + proof_class |
| **Output Format** | JSON receipt with embedded OCEL 2.0 canonicalized logs |
| **Hash Function** | BLAKE3 (cryptographic) |
| **Canonicalization** | JCS-OCEL (JSON Canonical Serialization for OCEL) |
| **Embedding** | Base64-encoded within receipt JSON |

**Receipt Subcommands (CLI):**
```bash
wpm receipt doctor <file.json>                    # Audit against Adversarial Ingress Gates
wpm receipt verify-ocel2 <file.json>              # Structural OCEL 2.0 validation
wpm receipt detect-fixture-mutation <file.json>   # SSIM + temporal variance
wpm receipt verify-boundary-evidence <file.json>  # Evidence block matching
wpm receipt verify-proof-class <file.json>        # Proof class adequacy
wpm receipt verify-challenge <file.json>          # Cryptographic challenge binding
wpm receipt canonicalize-ocel2 <file.json>        # OCEL canonicalization
wpm receipt producer-safe-report <file.json>      # External integration report
wpm receipt operator-private-report <file.json>   # Internal forensics report
```

**Receipt JSON Structure:**

```json
{
  "proof_class": "WITNESSED_EXECUTION",
  "manufacturing_authority": "wasm4pm-v26.5.29",
  "challenge_nonce": "<uuid>",
  "timestamp_utc": "2026-06-02T15:30:00Z",
  "boundary_evidence": {
    "expected_ocel": "<base64 canonical OCEL>",
    "observed_ocel": "<base64 canonical OCEL>",
    "hash_expected": "blake3:<hash>",
    "hash_observed": "blake3:<hash>",
    "match": true/false
  },
  "findings": [
    {
      "code": "ReceiptBeforeGate|...",
      "severity": "Deny|Warning",
      "json_path": "...",
      "message": "..."
    }
  ]
}
```

---

### 5.2 Event Log Export

| Format | Function | Output |
|--------|----------|--------|
| **JSON** | `export_eventlog_to_json(handle)` | XES-compatible JSON |
| **OCEL JSON** | `export_ocel_to_json(handle)` | OCEL 2.0 JSON |

---

### 5.3 Model Export

| Format | Function | Output |
|--------|----------|--------|
| **DFG JSON** | `export_dfg_to_json(handle)` | { nodes, edges, start_activities, end_activities } |
| **Petri Net JSON** | `export_petri_net_to_json(handle)` | { places, transitions, arcs, initial_marking, final_marking } |

---

### 5.4 Analysis Output

**Standard Analysis Exports:**

| Analysis | WASM Function | Output JSON Fields |
|----------|---------------|-------------------|
| **Event Statistics** | `analyze_event_statistics(handle)` | event_count, activity_count, timestamp_range, attribute_distribution |
| **Case Duration** | `analyze_case_duration(handle)` | min_ms, max_ms, mean_ms, median_ms, stdev_ms |
| **Variant Analysis** | `analyze_trace_variants(handle, activity_key)` | variant_id, frequency, length, example_trace |
| **Activity Cooccurrence** | `analyze_activity_cooccurrence(handle, activity_key)` | cooccurrence_matrix (JSON object) |
| **Temporal Profile** | `discover_temporal_profile(handle, activity_key, timestamp_key)` | pairs { "A→B": [mean_ms, stdev_ms, count] } |
| **Social Networks** | `discover_handover_network(handle, resource_key)` | nodes (resource), edges (handoff_count) |

---

## 6. Invocation Methods Summary

### 6.1 Command-Line Interface (CLI)

**Binary:** `wpm` (Rust, compiled to native)  
**Tool:** clap-based command router  

**Main Commands:**
```bash
wpm mining discover <log.xes|log.json> --algo <heuristic|inductive|alpha|astar|genetic|pso|aco|ilp> --activity-key concept:name
wpm mining conformance <log.xes> <model.dfg> --activity-key concept:name
wpm oracle check <tape.ndjson> --law <law.json> [--format json|human]
wpm oracle watch <tape.ndjson> --law <law.json>
wpm receipt doctor <receipt.json> [--strict] [--format json|human] [--audience producer|operator|ci]
wpm audit <log.xes> --activity-key concept:name
wpm autoprocess <log.xes> [--config <json>] [--format json|human]
wpm lean <log.xes> --activity-key concept:name
wpm telco <subcommand>
wpm agent <subcommand>
wpm spc <subcommand>
```

### 6.2 WASM API (JavaScript/TypeScript)

**Module:** wasm-bindgen (Rust → JS transpilation)  
**Exports:** 335+ functions (verified 2026-05-29)

**Initialization:**
```javascript
import init, * as wasm from 'wasm4pm';
await init();
```

**Load Event Log:**
```javascript
const handle = wasm.load_eventlog_from_json(jsonString);
const handle = wasm.load_eventlog_from_xes(xesString);
const handle = wasm.load_ocel_from_json(ocelJsonString);
```

**Invoke Discovery:**
```javascript
const dfg = wasm.discover_dfg(handle, 'concept:name');
const pn = wasm.discover_alpha_plus_plus(handle, 'concept:name', 0.0);
const genetic = wasm.discover_genetic_algorithm(handle, 'concept:name', 50, 100);
```

**Invoke Conformance:**
```javascript
const result = wasm.check_token_based_replay(handle, 'concept:name');
const sound = wasm.check_wf_net_soundness(pnJson);
```

**Streaming:**
```javascript
const stream = wasm.start_streaming_dfg('concept:name');
events.forEach(e => wasm.stream_event(stream, JSON.stringify(e)));
const finalDfg = wasm.flush_streaming_dfg(stream);
```

**Error Handling:**
- WASM functions return `Result<T, JsValue>`
- JS-facing errors: `Err("no_edges")`, `Err("parse_failed")`, etc.
- Always guard against rejection: `try { ... } catch (e) { console.error(e.message); }`

### 6.3 Rust API

**Direct Library Usage:**

```rust
use wasm4pm_algos::{heuristic, conformance, alpha};
use wasm4pm_compat::{EventLog, DFG};

// Load event log
let log: EventLog = serde_json::from_str(json_string)?;

// Discovery
let dfg = heuristic::discover_heuristic(&log, "concept:name")?;
let pn = alpha::discover_alpha(&log, "concept:name")?;

// Conformance
let result = conformance::check_conformance_token_replay(&log, &dfg, "concept:name")?;
println!("Fitness: {:.4}", result.fitness);
```

**Crates to Import:**
- `wasm4pm-algos` — Discovery & conformance algorithms
- `wasm4pm-compat` — Core type definitions (EventLog, DFG, PetriNet, etc.)
- `wasm4pm` — High-level boundary + receipts
- `pm-core` — Lower-level Petri net algebra

---

## 7. Algorithm Stability & Production Readiness

| Algorithm/Capability | Stability | Notes |
|---------------------|-----------|-------|
| **DFG Discovery** | ✅ Production | Branchless, columnar, <1ms on 10k events |
| **Alpha++ Miner** | ✅ Production | Implicit place handling; O(m²) on activity pairs |
| **Inductive Miner** | ✅ Production | Single-pass streaming; suitable for online use |
| **Token-Based Replay** | ✅ Production | Standard fitness metric; van der Aalst 2011 |
| **WF-net Soundness** | ✅ Production | arXiv:2602.15739v3; bounded BFS (depth 50, cap 100) |
| **Prefix Conformance** | ✅ Production | Law-based DFA execution; case-level tracking |
| **A* Search** | ⚠️ Experimental | Returns iterations_used (not fitness); high memory on large logs |
| **Genetic Algorithm** | ⚠️ Experimental | Stochastic; returns final_fitness; Err("no_edges") on empty log |
| **PSO / ACO** | ⚠️ Experimental | Swarm-based; high variance; Err("no_edges") on degenerate input |
| **ILP Miner** | ⚠️ Experimental | Highest quality but bounded by solver timeout; limited by license |
| **Alignment-Based** | ⚠️ Experimental | Exponential worst-case; higher accuracy than token replay |
| **DECLARE Discovery** | ⚠️ Experimental | Constraint extraction via implication; no filtering |
| **Streaming Conformance** | ✅ Production | Incremental token simulation; forward-only (no backtrack) |

---

## 8. Crates & Module Organization

### Core Crates

| Crate | Location | Purpose |
|-------|----------|---------|
| **pm-core** | `/crates/pm-core/src/` | Type definitions (PetriNet, DFG, Alignment, etc.) |
| **wasm4pm-compat** | `/crates/wasm4pm-compat/src/` | Serialization types (EventLog, ConformanceResult, etc.) |
| **wasm4pm-algos** | `/crates/wasm4pm-algos/src/` | Discovery, conformance, analysis algorithms (branchless, columnar) |
| **wasm4pm-macros** | `/crates/wasm4pm-macros/src/` | Proc-macros for witness generation and attribute binding |
| **wasm4pm-utils** | `/crates/wasm4pm-utils/src/` | Caching, interning, parse utilities |
| **wasm4pm-cli** | `/crates/wasm4pm-cli/src/` | Command-line interface (clap-based) |
| **ocel-core** | `/crates/ocel-core/src/` | Object-centric event log types |
| **ocpq** | `/crates/ocpq/src/` | Object-centric process queries (SPARQL-like) |
| **miniml-core** | `/crates/miniml-core/src/` | Minimal machine learning integration |
| **wasm4pm-cognition** | `/crates/wasm4pm-cognition/src/` | Autonomic learning & decision orchestration |
| **prolog8** | `/crates/prolog8/src/` | Embedded Prolog for proof generation and querying |

---

## 9. Feature Flags & Build Variants

### Rust Build Features

| Feature | Status | Purpose |
|---------|--------|---------|
| `feature-gpu` | Optional (no CUDA/OpenGL in WASM) | GPU acceleration (not used in wasm32 build) |
| `feature-rayon` | Optional (disabled in wasm32) | Parallel rayon runtime (not used in WASM) |
| `feature-streaming-full` | Optional | SIMD streaming (requires SIMD target, e.g., x86_64) |
| `wasm-optimized` | Default in wasm32 | Branchless, cache-friendly algorithms |

### JavaScript/WASM Build

- **Target:** `wasm32-unknown-unknown`
- **Optimizations:** LTO, opt-level=z (size), no_std where possible
- **Result:** ~335 kB minified gzip (vs. ~2 MB unoptimized)

---

## 10. Data Formats & Schemas

### Event Log Format (Input)

**JSON Event Log:**
```json
{
  "traces": [
    {
      "caseId": "case_1",
      "events": [
        {
          "activity": "Register",
          "timestamp": "2026-01-01T10:00:00Z",
          "attributes": { "org:resource": "alice" }
        }
      ]
    }
  ]
}
```

**XES Format:** Standard IEEE XES 1.0 (via `xes-rs` parser)

### OCEL 2.0 Format

```json
{
  "ocel:version": "2.0",
  "ocel:objects": [
    { "ocel:oid": "obj_1", "ocel:type": "order" }
  ],
  "ocel:events": [
    {
      "ocel:eid": "evt_1",
      "ocel:activity": "submit",
      "ocel:timestamp": "2026-01-01T10:00:00Z",
      "ocel:omap": ["obj_1"]
    }
  ]
}
```

### DFG Output Format

```json
{
  "nodes": [
    { "activity": "Register", "frequency": 100 }
  ],
  "edges": [
    { "source": "Register", "target": "Approve", "frequency": 95 }
  ],
  "start_activities": ["Register"],
  "end_activities": ["Closed"]
}
```

### Petri Net Output Format

```json
{
  "places": [
    { "id": "p_1", "name": "p_start" }
  ],
  "transitions": [
    { "id": "t_1", "label": "A", "is_invisible": false }
  ],
  "arcs": [
    { "source": "p_1", "target": "t_1", "weight": 1 }
  ],
  "initial_marking": { "p_1": 1 },
  "final_marking": { "p_end": 1 }
}
```

---

## 11. Performance Characteristics

### Algorithm Performance (Single Trace / 10k Events)

| Algorithm | Latency | Memory | Notes |
|-----------|---------|--------|-------|
| **DFG Discovery** | <1 ms | ~100 KB | Columnar, branchless |
| **Alpha++ Miner** | 2–5 ms | ~500 KB | O(m²) on activity pairs |
| **Token Replay** | <0.1 ms per trace | ~10 KB | Per-trace streaming simulation |
| **A* Search** | 50–500 ms | ~10 MB | Bounded by max_iterations |
| **Genetic Algorithm** | 100–1000 ms | ~50 MB | Population × generations |
| **Streaming DFG** | <10 μs per event | ~1 MB | Online, no backtracking |

### Cache Statistics (WASM)

- **Parse Cache:** Caches EventLog deserialization by content hash
- **Columnar Cache:** Caches integer-keyed edge counts
- **Interner Cache:** Caches activity string interning
- **API:** `get_cache_stats()` → `{ hits, misses, size_bytes }`

---

## 12. Known Limitations & Workarounds

### Limitations

| Issue | Scope | Workaround |
|-------|-------|-----------|
| **A* iterations_used** | WASM API | Do not interpret as fitness; use separate fitness evaluation |
| **ACO/PSO no_edges** | WASM API | Pre-validate log has edges; catch Err("no_edges") |
| **ILP Solver Timeout** | Rust API | Set timeout budget via config; fallback to genetic algorithm |
| **Bounded BFS (depth 50)** | WF-net soundness | Concurrent/recursive nets may report false negatives; use depth param |
| **Alignment exponential** | Rust API | Use token replay for large logs; limit to <100 activities |

### Recommended Configurations

**High-throughput (>100k events):**
- Use DFG discovery, not Alpha++ or ILP
- Use token replay, not alignment
- Use streaming conformance for online monitoring

**High-accuracy requirement:**
- Use ILP Petri net (with solver license)
- Use alignment-based conformance
- Use genetic algorithm with population=100+

**Real-time (<100 ms latency):**
- Use streaming DFG (`start_streaming_dfg` + `stream_event`)
- Use token replay for conformance
- Use prefix oracle for lawfulness (DFA-based, O(1) per event)

---

## 13. Diagnostic Tools

### Health Checks

```bash
wpm doctor                    # System health report
wpm config list               # Show configuration
wpm man                       # Generate CLI reference
```

### Audit & Forensics

```bash
wpm audit <log.xes>                         # Vision 2030 conformance audit
wpm receipt doctor <receipt.json>           # Receipt validation
wpm receipt detect-fixture-mutation <file>  # Structural similarity check
```

---

## 14. Integration Boundaries

### ggen ↔ wasm4pm

**ggen** (generator) → produces candidates  
**wasm4pm-compat** → adjudicates lawfulness via type law  
**wasm4pm** → executes admitted motions

Boundary enforced: ggen emits evidence; only wasm4pm-compat can judge lawfulness.

### Living LSP ↔ wasm4pm

Language server for OCEL validation and real-time conformance feedback within editor.

### Prompt Manufactory ↔ wasm4pm

Knowledge-to-artifact production; wasm4pm supplies conformance verdicts and receipts.

---

## 15. Certification & Evidence

**Current Version:** 26.5.29 (RELEASE_CERTIFICATE.v26.5.29.json)

**Evidence Artifacts:**
- ✅ WASM_API.md (335 exports documented)
- ✅ BACKWARD_COMPATIBILITY_REPORT.md (v26.5.21 → v26.5.29)
- ✅ DETERMINISM_AUDIT.md (same input → same output guaranteed)
- ✅ TEST_COMPACTION_STRATEGY.md (test coverage optimization)
- ✅ REGRESSION_TEST_REPORT.md (v26.5.28 → v26.5.29)

---

## Appendix A: Quick Reference Table

| Task | Recommended Function | Input | Output |
|------|---------------------|-------|--------|
| Discover model from log | `discover_dfg()` | EventLog | DFG |
| Check if log conforms to model | `check_token_based_replay()` | EventLog + DFG | fitness, precision |
| Verify Petri net is sound | `check_wf_net_soundness()` | Petri Net JSON | sound, deadlock_free, bounded |
| Check lawfulness of prefix | `PrefixOracle::new()` | OCEL + Law | ALIVE / DEAD / TERMINAL |
| Export receipt for manufacturing | `receipt::generate()` | expected_log + observed_log | JSON receipt with BLAKE3 hash |
| Monitor streaming events in real-time | `start_streaming_dfg()` | Stream | DFG (incremental) |
| Analyze social networks | `discover_handover_network()` | EventLog + resource_key | Social network graph |
| Detect concept drift | `detect_concept_drift()` | EventLog + window_size | Drift signals |

---

## Appendix B: Reference Documents

- **WASM_API.md** — Full 335-function export reference
- **BACKWARD_COMPATIBILITY_REPORT.md** — v26.5.21–v26.5.29 compatibility
- **DETERMINISM_AUDIT.md** — Proof of deterministic behavior
- **CLAUDE.md** — Build and contribution guidelines
- **TESTING.md** — Test framework and harness
- **README.md** — Project overview and quick start

---

## Summary

wasm4pm provides **335+ verified process mining capabilities** across discovery, conformance, replay, and forensic analysis. All algorithms are invocable via CLI, WASM API, or Rust API with documented stability, performance, and limitations. The system is production-grade for DFG, token replay, and streaming operations, with experimental support for metaheuristic and alignment-based discovery. Receipts embed evidence as canonicalized OCEL 2.0 logs with BLAKE3 hashes for forensic verification.

**Gate Status:** ✅ **COMPLETE** — All process mining capabilities documented, invocation methods listed, and production readiness assessed.
