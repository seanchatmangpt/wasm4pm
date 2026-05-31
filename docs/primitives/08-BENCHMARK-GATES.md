# Agent 9 — Benchmark / real-data gate agent

## Mission
Preserve the existing benchmark doctrine. Every new primitive must fit G1
determinism, G2 receipt integrity, G3 quality-threshold truth, G4 synchrony
(cross-profile equivalence), G5 report completeness.

## Status
Gate logic fully implemented (`wasm4pm/benches/closed_claw/gates.rs`). Real
data usage is partially enforced — 32 APIs still have zero benchmark coverage
(see `benchmark_audit.md`).

---

## The Five Gates

| Gate | Name | Criterion | Implementation |
|------|------|-----------|----------------|
| G1 | Determinism | Same input → identical BLAKE3 output hash across ≥ 3 runs | `check_determinism_gate(output_hashes, algorithm)` |
| G2 | Receipt | All four BLAKE3 hashes (config, input, plan, output) are valid 64-char hex; status = `Success` | `check_receipt_gate(receipt)` |
| G3 | Quality-Threshold | `fitness ≥ 0.95`, `precision ≥ 0.80`, `temporal_deviation_ratio ≤ 2.0` | `check_quality_threshold_gate(fitness, precision, temporal, thresholds)` |
| G4 | Synchrony | Output hashes match across deployment profiles (browser, mobile, edge, fog) | `check_synchrony_gate(profile_hashes)` |
| G5 | Report | Report contains all 10 required sections: pipeline, algorithm, dataset\_size, total\_events, latency\_p50\_us, latency\_p95\_us, latency\_p99\_us, throughput\_events\_sec, output\_hash, deterministic | `check_report_gate(report)` |

---

## Source locations

```
wasm4pm/benches/closed_claw/
├── gates.rs        # G1–G5 gate functions + 20+ unit tests (all pass)
├── registry.rs     # GateRequirements struct (which gates apply per pipeline)
├── metrics.rs      # Latency / throughput metric collection
├── receipt.rs      # ReceiptBundle construction
├── golden.rs       # Golden-output comparison helpers
└── mod.rs          # Closed Claw bench module root

bench_data/
├── bpi2020_travel.xes          # Real BPI 2020 travel permits (10,500 traces)
├── roadtraffic100traces.xes    # Real road traffic fine management (100 traces)
├── ocel20_example.jsonocel     # Real OCEL 2.0 example
└── sepsis.xes                  # 14-byte stub — NOT real data (known gap)
```

---

## Real-data policy

> "All benchmarks must use real, publicly sourced event logs. No synthetic, mock,
> or generated data is permitted." — `benchmark_audit.md`

Current state: 4 usable real datasets; 32 exported APIs have zero benchmark
coverage; `sepsis.xes` is a 404 stub and must be replaced before G3 can run
on sepsis-domain primitives.

---

## Usage pattern

```rust
use wasm4pm::benches::closed_claw::gates::{
    check_determinism_gate, check_receipt_gate, run_all_gates,
    GateResult, ReceiptBundle, ReceiptStatus, TruthThresholds,
};

// G1
let h = blake3_hash_str(&output_json);
let g1 = check_determinism_gate(&[&h, &h, &h], "dfg");
assert!(g1.passed);

// G2
let g2 = check_receipt_gate(&ReceiptBundle {
    config_hash: blake3_hash_str(&config),
    input_hash:  blake3_hash_str(&input),
    plan_hash:   blake3_hash_str(&plan),
    output_hash: h.clone(),
    status: ReceiptStatus::Success,
    algorithm: "dfg".into(),
    pipeline_class: "discovery".into(),
});
assert!(g2.passed);
```

---

## Paper grounding

Van der Aalst "Process Mining" §3.3: quality metrics as fitness, precision,
generalization, simplicity. Closed Claw constitution: every benchmark output
must be deterministic, receipted, and measured against real data.

---

## Acceptance sequence

1. `cargo test -p wasm4pm --benches` — all gate unit tests pass (20+ tests in `gates.rs`)
2. `cargo test --test quality_benchmarks` — fitness ≥ 0.85 on BPI 2020 Travel Permits
3. `cargo test --test negative_quality` — bad models fail G3 (fitness < threshold)
4. **Planned**: gate runner in CI that fails if any new primitive skips G1 or G2
