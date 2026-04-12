# GPU Kernel Integration Guide

**Kernel:** LinUCB Contextual Bandit (WGSL / wgpu)
**Perspective:** Resource and Intervention (van der Aalst prediction framework)
**Question:** "Which process mining algorithm should handle the next task?"

---

## Overview

The GPU LinUCB kernel (`wasm4pm/src/gpu/linucb_kernel.wgsl`) accelerates algorithm
selection for the pictl process mining platform. It processes 2048 context feature
vectors per dispatch, selecting the best algorithm from a 40-slot registry using
the LinUCB contextual bandit formula:

```
Q̂_a(x) = w_a·x + b_a + α√(x^T A^{-1} x)
```

The CPU reference implementation (`wasm4pm/src/ml/linucb.rs`) produces bitwise-identical
outputs and serves as the ground truth for parity testing.

---

## Building with GPU Support

```bash
# Build the crate with GPU feature enabled
cargo build --release --features gpu

# Run all GPU conformance tests
cargo test --test gpu_conformance_vectors --features gpu

# Run the GPU + CPU parity test
cargo test --test gpu_conformance_vectors gpu_parity -- --features gpu
```

Without `--features gpu`, the 25 CPU-baseline conformance vectors still run and
pass. The GPU parity test is gated behind `#[cfg(feature = "gpu")]`.

---

## Configuration

Add to `pictl.toml`:

```toml
[execution]
gpu_enabled            = true    # Enable GPU kernel dispatch
linucb_lambda          = 1.0     # Regularization coefficient λ (A = λI init)
linucb_exploration_bonus = 1.414 # Exploration parameter α (√2 default)
```

Environment variable overrides:

```bash
export PICTL_GPU_ENABLED=true
export PICTL_LINUCB_LAMBDA=1.0
export PICTL_LINUCB_EXPLORATION_BONUS=1.414
```

---

## API

### CPU Reference (always available)

```rust
use pictl::ml::LinUCBAgent;

// Construct with defaults (λ=1.0, α=√2, lr=0.1)
let mut agent = LinUCBAgent::new();

// Custom hyperparameters
let mut agent = LinUCBAgent::with_params(1.0, 1.414, 0.1);

// Inference — deterministic, no RNG
let features: [f32; 8] = [0.35, 0.42, 0.08, 0.30, 0.25, 0.60, 0.55, 0.18];
let (action, ucb_score) = agent.select(&features);
// action ∈ [0, 39], maps to algorithm registry slot

// Online update after observing reward
agent.update(&features, action, reward);
```

### GPU Kernel (requires `--features gpu`)

```rust
use pictl::gpu::LinUCBGPU;

// Initialise (async GPU device acquisition)
let mut kernel = LinUCBGPU::new()?;

// Inference — identical outputs to CPU reference
let (action, ucb_score) = kernel.select(&features)?;

// Online update
kernel.update(&features, action as usize, reward)?;
```

### Batch Dispatch (GPU — 2048 states per call)

```rust
// Prepare batch: Vec of 2048 feature vectors
let batch: Vec<[f32; 8]> = ...;

// Dispatch GPU kernel — returns Vec of (action, ucb_score) pairs
let results = kernel.select_batch(&batch)?;
```

---

## Feature Vector Encoding

| Index | Name | Meaning | Range |
|-------|------|---------|-------|
| 0 | `trace_length` | Average trace length | [0, 1] |
| 1 | `elapsed_time` | Normalised elapsed time ratio | [0, 1] |
| 2 | `rework_count` | Average rework loop count | [0, 1] |
| 3 | `unique_activities` | Distinct activities / 100 | [0, 1] |
| 4 | `avg_inter_event_time` | Average time between events | [0, 1] |
| 5 | `log_size_bin` | log(trace_count) / log(10000) | [0, 1] |
| 6 | `activity_entropy` | Shannon entropy of activity dist. | [0, 1] |
| 7 | `variant_ratio` | distinct variants / trace_count | [0, 1] |

All features must be caller-normalized into [0.0, 1.0] before passing to the kernel.

---

## Action Space

40 algorithm slots map to the pictl algorithm registry:

| Slots | Algorithms |
|-------|-----------|
| 0–13 | Discovery algorithms (dfg, heuristic_miner, inductive_miner, ...) |
| 14–19 | ML analysis (ml_classify, ml_cluster, ml_forecast, ...) |
| 20–36 | Extended discovery + conformance |
| 37–39 | Reserved for future algorithms |

---

## Performance Characteristics

| Metric | Target | Hardware |
|--------|--------|----------|
| Latency per batch (2048 states) | ≤ 0.1 ms | RTX 4090 / A100 / H100 |
| Throughput | ≥ 250K states/sec | same |
| VRAM footprint | ≤ 32 MB | all targets |
| CPU fallback latency | < 5 ms | single thread |

On Apple Silicon (M1/M2/M3 via Metal backend), expect 0.3–0.8 ms per batch.
The CPU fallback (`LinUCBAgent`) achieves < 1 ms on modern desktop hardware.

---

## Conformance Testing

The 25 conformance vectors in `wasm4pm/tests/gpu_conformance_vectors.rs` verify:

1. **Structural validity** — action ∈ [0, 39], score is finite
2. **Determinism** — two independent agents produce identical outputs
3. **Boundary coverage** — all-zero, all-one, single-feature activation
4. **Realistic coverage** — BPIC-like feature distributions
5. **Numerical stability** — near-zero and near-one feature values

Run conformance suite:

```bash
cargo test --test gpu_conformance_vectors 2>&1 | grep -E "test .* (ok|FAILED)"
```

Expected: 25 tests pass, 0 fail.

---

## Known Issues

| Advisory | Crate | Status |
|----------|-------|--------|
| RUSTSEC-2026-0097 | rand 0.8 | KNOWN_ISSUE — unsound, not exploitable via our code paths |
| RUSTSEC-2024-0436 | rand 0.8 | KNOWN_ISSUE — same rationale |

Both advisories are `warn`-level in `cargo audit` output. Our usage of `rand` does
not invoke the problematic `rand::rng()` + custom-logger interleaving pattern.
See `GPU_KERNEL_CONFORMANCE_SPEC.yaml` `known_issues` section for full rationale.

---

## Supported Backends

| Backend | Status | Notes |
|---------|--------|-------|
| Metal (macOS / Apple Silicon) | Supported | Primary dev platform |
| Vulkan (Linux / Windows) | Supported | RTX 4090, A100, H100 |
| D3D12 (Windows) | Supported | via wgpu |
| CPU fallback | Always available | `LinUCBAgent` in `wasm4pm/src/ml/linucb.rs` |
| WebGPU (browser) | Planned | WGSL is browser-compatible; wgpu feature pending |

---

## File Locations

```
wasm4pm/src/gpu/
├── linucb_kernel.wgsl   — WGSL compute shader (select + update kernels)
├── wgpu_binding.rs      — Rust wgpu host bindings + CPU fallback
└── mod.rs               — Module exports

wasm4pm/src/ml/
├── linucb.rs            — CPU reference implementation (ground truth)
└── mod.rs               — Module exports

wasm4pm/tests/
└── gpu_conformance_vectors.rs  — 25 conformance vectors + GPU parity test

docs/
├── GPU_KERNEL_CONFORMANCE_SPEC.yaml   — This kernel's formal spec
└── GPU_KERNEL_INTEGRATION_GUIDE.md   — This document
```
