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

## Dissertation Claims

- **MYCIN ≈ 2 µs** — measured 2.287 µs median on Apple M3 Max. **VERIFIED** (within 15% of claim, well under 5 µs threshold).
- **STRIPS ≈ 10 µs** — measured 6.506 µs median. **VERIFIED** (faster than claim, well under 20 µs threshold).

## Performance Profile

All 13 breeds complete in under 8 µs at the Rust boundary. The unified 120 ns/state target in `performance-runner.ts` refers to WASM state-machine transitions, not full breed execution — these figures are complementary measurements, not conflicts.

Sub-microsecond breeds (dendral, gps, autoinstinct_learning, soar, autoinstinct_vision, autoinstinct_semantics) are architecture-enumeration or simple pattern-match algorithms with O(n) fact iteration.

Multi-microsecond breeds (mycin, cbr, eliza, prolog, strips, autoinstinct_neurosis) perform rule-firing chains, Jaccard similarity, Horn-clause unification, or precondition search — expected higher.

## Bench Source

`crates/wasm4pm-cognition/benches/breed_latency.rs`
