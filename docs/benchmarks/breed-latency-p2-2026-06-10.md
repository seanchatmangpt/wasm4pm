# P2 Tier Breed Latency — 2026-06-10

Criterion medians for `CognitionBreed::run()` at the Rust boundary
(`cargo bench -p wasm4pm-cognition --bench breed_latency -- breed_latency_p2`,
50 samples per breed, representative inputs exercising each algorithm's core
path — see `benches/breed_latency.rs`). Budget: τ ≤ 100 µs (PRD §0.5).

| Breed | Median | Budget | Verdict |
|---|---|---|---|
| asp | 8.92 µs | ≤ 100 µs | PASS |
| description_logic | 8.12 µs | ≤ 100 µs | PASS |
| abductive_lp | 4.63 µs | ≤ 100 µs | PASS |
| abductive_ibe | 2.87 µs | ≤ 100 µs | PASS |
| partial_order_plan | 6.67 µs | ≤ 100 µs | PASS |
| event_calculus | 1.86 µs | ≤ 100 µs | PASS |
| mdp | 4.09 µs | ≤ 100 µs | PASS |
| version_space | 9.70 µs | ≤ 100 µs | PASS |
| belief_merging | 3.88 µs | ≤ 100 µs | PASS |
| qualitative_reason | 4.19 µs | ≤ 100 µs | PASS |
| script_sam | 1.95 µs | ≤ 100 µs | PASS |
| clp | 11.72 µs | ≤ 100 µs | PASS |

All 12 P2 breeds measured under budget (worst case clp at 11.72 µs, 8.5×
headroom). Host: darwin arm64, release profile.
