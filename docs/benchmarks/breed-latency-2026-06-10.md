# Breed Latency Benchmarks — 2026-06-10

**Hardware:** Apple M3 Max (arm64, Apple Silicon)
**Tool:** Criterion 0.5 — 50 samples, 3s warmup, release build
**Boundary:** Native Rust (`CognitionBreed::run()`), no WASM serialization overhead

## Results

| Breed | Median Latency | Paper Claim | Threshold | Verdict |
|---|---|---|---|---|
| mycin | 2.287 µs | ≈ 2 µs | ≤ 5 µs | VERIFIED |
| strips | 6.506 µs | ≈ 10 µs | ≤ 20 µs | VERIFIED |
| prolog | 7.932 µs | — | — | MEASURED |
| eliza | 3.761 µs | — | — | MEASURED |
| cbr | 4.706 µs | — | — | MEASURED |
| dendral | 565 ns | — | — | MEASURED |
| gps | 967 ns | — | — | MEASURED |
| soar | 1.147 µs | — | — | MEASURED |
| hearsay | 1.286 µs | — | — | MEASURED |
| autoinstinct_learning | 641 ns | — | — | MEASURED |
| autoinstinct_semantics | 856 ns | — | — | MEASURED |
| autoinstinct_neurosis | 2.802 µs | — | — | MEASURED |
| autoinstinct_vision | 1.118 µs | — | — | MEASURED |
| ltl_monitor | 4.359 µs | — | ≤ 100 µs | MEASURED |
| allen_temporal | 4.964 µs | — | ≤ 100 µs | MEASURED |
| fuzzy_logic | 3.485 µs | — | ≤ 100 µs | MEASURED |
| bayesian_network | 7.017 µs | — | ≤ 100 µs | MEASURED |
| csp_ac3 | 29.278 µs | — | ≤ 100 µs | MEASURED |
| default_logic | 2.227 µs | — | ≤ 100 µs | MEASURED |
| htn_planning | 3.063 µs | — | ≤ 100 µs | MEASURED |
| dempster_shafer | 2.857 µs | — | ≤ 100 µs | MEASURED |
| frames_inheritance | 2.037 µs | — | ≤ 100 µs | MEASURED |
| ebl | 11.132 µs | — | ≤ 100 µs | MEASURED |

### P1 tier note

All 10 P1 breeds measured under the 100 µs global latency budget (Criterion medians, representative paper-grade inputs from `benches/breed_latency.rs::p1_input`). Slowest: csp_ac3 at 29.3 µs (K4-minus-edge with MAC).

## P4 Tier Results (group `breed_latency_p4`)

| Breed | Median Latency | Budget | Verdict |
|---|---|---|---|
| tableaux | 5.867 µs | ≤ 100 µs | VERIFIED |
| construction_grammar | 4.880 µs | ≤ 100 µs | VERIFIED |
| markov_logic | 5.512 µs | ≤ 100 µs | VERIFIED |
| pomdp | 61.427 µs | ≤ 100 µs (global) | VERIFIED — see note |
| contingent_plan | 2.905 µs | ≤ 100 µs | VERIFIED |
| meta_reasoning | 2.582 µs | ≤ 100 µs | VERIFIED |

**POMDP latency note:** the PRD allots POMDP a 50–300 µs budget, in tension with
the global ≤ 100 µs gate. Resolution (per the P4 plan): the global ≤ 100 µs budget
is KEPT; the paper-sanctioned PBVI approximation knobs — belief points ≤ 16,
horizon ≤ 8, refusal when |S|·|A|·|O| > 512 — bound the work structurally.
Measured median on the tiger fixture: 61.4 µs, inside both budgets.

## Dissertation Claims

- **MYCIN ≈ 2 µs** — measured 2.287 µs median on Apple M3 Max. **VERIFIED** (within 15% of claim, well under 5 µs threshold).
- **STRIPS ≈ 10 µs** — measured 6.506 µs median. **VERIFIED** (faster than claim, well under 20 µs threshold).

## Performance Profile

All 13 breeds complete in under 8 µs at the Rust boundary. The unified 120 ns/state target in `performance-runner.ts` refers to WASM state-machine transitions, not full breed execution — these figures are complementary measurements, not conflicts.

Sub-microsecond breeds (dendral, gps, autoinstinct_learning, soar, autoinstinct_vision, autoinstinct_semantics) are architecture-enumeration or simple pattern-match algorithms with O(n) fact iteration.

Multi-microsecond breeds (mycin, cbr, eliza, prolog, strips, autoinstinct_neurosis) perform rule-firing chains, Jaccard similarity, Horn-clause unification, or precondition search — expected higher.

## Bench Source

`crates/wasm4pm-cognition/benches/breed_latency.rs`
