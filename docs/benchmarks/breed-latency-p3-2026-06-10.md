# Breed Latency — P3 Tier (2026-06-10)

Criterion medians for the 11 P3 cognition breeds, measured at the Rust
boundary (`CognitionBreed::run()`, no WASM serialization) with the
representative inputs in `benches/breed_latency.rs::bench_p3_breeds`
(sample size 50). Gate: τ ≤ 100 µs per the Full Periodic Table PRD.

| Breed | Median τ | Gate (≤100 µs) |
|---|---|---|
| situation_calculus | 2.64 µs | PASS |
| circumscription | 2.17 µs | PASS |
| analogy_sme | 5.62 µs | PASS |
| act_r | 1.85 µs | PASS |
| problog | 3.53 µs | PASS |
| sat_cdcl | 3.84 µs | PASS |
| episodic_memory | 3.30 µs | PASS |
| rl_symbolic | 40.06 µs | PASS |
| ctl_check | 2.98 µs | PASS |
| ilp | 20.43 µs | PASS |
| naive_physics | 5.01 µs | PASS |

Notes:
- `rl_symbolic` runs 50 seeded Q-learning episodes in its bench input; the
  512-episode cap remains well inside budget at native speed.
- Command: `cargo bench --bench breed_latency -- breed_latency_p3`.
